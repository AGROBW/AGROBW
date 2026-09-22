begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.seller_stores') is null then
    raise exception 'seller_stores nao existe';
  end if;
  if to_regclass('public.announcements') is null then
    raise exception 'announcements nao existe';
  end if;
  if to_regclass('public.user_subscriptions') is null or to_regclass('public.plans') is null then
    raise exception 'estrutura de planos nao existe';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() nao existe';
  end if;
end;
$$;

create table if not exists public.seller_store_catalog_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  store_id uuid not null references public.seller_stores(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'ready', 'failed', 'cancelled', 'expired')),
  layout_key text not null default 'premium-v1'
    check (layout_key in ('premium-v1')),
  price_mode text not null default 'show'
    check (price_mode in ('show', 'hide', 'consult')),
  catalog_title text not null
    check (char_length(trim(catalog_title)) between 3 and 120),
  catalog_subtitle text
    check (catalog_subtitle is null or char_length(trim(catalog_subtitle)) between 3 and 240),
  announcement_ids uuid[] not null,
  store_snapshot jsonb not null,
  announcement_snapshot jsonb not null,
  snapshot_hash text not null
    check (snapshot_hash ~ '^[0-9a-f]{32}$'),
  generation_version text not null default 'seller-store-catalog-v1'
    check (generation_version = 'seller-store-catalog-v1'),
  storage_path text,
  file_size_bytes bigint
    check (file_size_bytes is null or file_size_bytes between 1 and 31457280),
  page_count integer
    check (page_count is null or page_count between 1 and 500),
  attempts integer not null default 0
    check (attempts between 0 and 5),
  max_attempts integer not null default 3
    check (max_attempts between 1 and 5),
  locked_at timestamptz,
  locked_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  error_code text
    check (error_code is null or char_length(error_code) between 1 and 80),
  error_message text
    check (error_message is null or char_length(error_message) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_store_catalog_exports_announcements
    check (
      cardinality(announcement_ids) between 1 and 100
      and jsonb_typeof(announcement_snapshot) = 'array'
      and jsonb_array_length(announcement_snapshot) = cardinality(announcement_ids)
    ),
  constraint seller_store_catalog_exports_store_snapshot
    check (jsonb_typeof(store_snapshot) = 'object'),
  constraint seller_store_catalog_exports_storage_path
    check (
      storage_path is null
      or storage_path = user_id::text || '/' || id::text || '.pdf'
    ),
  constraint seller_store_catalog_exports_ready_contract
    check (
      status <> 'ready'
      or (
        storage_path is not null
        and file_size_bytes is not null
        and page_count is not null
        and completed_at is not null
      )
    ),
  constraint seller_store_catalog_exports_processing_contract
    check (status <> 'processing' or started_at is not null),
  constraint seller_store_catalog_exports_failed_contract
    check (status <> 'failed' or (error_code is not null and completed_at is not null)),
  constraint seller_store_catalog_exports_expiry
    check (expires_at > created_at)
);

create index if not exists idx_seller_store_catalog_exports_owner_recent
  on public.seller_store_catalog_exports (user_id, created_at desc);
create index if not exists idx_seller_store_catalog_exports_claim
  on public.seller_store_catalog_exports (created_at)
  where status = 'queued';
create index if not exists idx_seller_store_catalog_exports_expiry
  on public.seller_store_catalog_exports (expires_at)
  where status in ('ready', 'failed', 'cancelled');
create unique index if not exists idx_seller_store_catalog_exports_open_snapshot
  on public.seller_store_catalog_exports (user_id, snapshot_hash)
  where status in ('queued', 'processing');

comment on table public.seller_store_catalog_exports is
  'Fila e historico privado de catalogos PDF da Loja Parceira.';
comment on column public.seller_store_catalog_exports.store_snapshot is
  'Snapshot sem e-mail ou telefone direto; contato permanece dentro da AGRO BW.';
comment on column public.seller_store_catalog_exports.announcement_snapshot is
  'Snapshot imutavel dos anuncios ativos selecionados no momento da solicitacao.';
comment on column public.seller_store_catalog_exports.snapshot_hash is
  'Hash de deduplicacao operacional; nao possui finalidade criptografica.';

create or replace function public.touch_seller_store_catalog_export()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_seller_store_catalog_export
  on public.seller_store_catalog_exports;
create trigger trg_touch_seller_store_catalog_export
before update on public.seller_store_catalog_exports
for each row execute function public.touch_seller_store_catalog_export();

alter table public.seller_store_catalog_exports enable row level security;
alter table public.seller_store_catalog_exports force row level security;

drop policy if exists seller_store_catalog_exports_owner_read
  on public.seller_store_catalog_exports;
create policy seller_store_catalog_exports_owner_read
on public.seller_store_catalog_exports
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists seller_store_catalog_exports_admin_read
  on public.seller_store_catalog_exports;
create policy seller_store_catalog_exports_admin_read
on public.seller_store_catalog_exports
for select
to authenticated
using (public.is_admin() = true);

revoke all on table public.seller_store_catalog_exports from public, anon, authenticated;
grant select, insert, update, delete on table public.seller_store_catalog_exports to service_role;

create or replace function public.request_seller_store_catalog_export(
  p_announcement_ids uuid[],
  p_catalog_title text default null,
  p_catalog_subtitle text default null,
  p_price_mode text default 'show'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_store public.seller_stores%rowtype;
  v_store_snapshot jsonb;
  v_announcement_snapshot jsonb;
  v_snapshot_hash text;
  v_export_id uuid;
  v_title text;
  v_subtitle text;
  v_requested_count integer;
  v_distinct_count integer;
  v_eligible_count integer;
  v_runtime_enabled boolean;
begin
  if v_user_id is null then
    raise exception 'CATALOG_EXPORT_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if to_regclass('public.seller_store_catalog_runtime_settings') is not null then
    execute 'select processing_enabled from public.seller_store_catalog_runtime_settings where singleton = true'
      into v_runtime_enabled;
    if not coalesce(v_runtime_enabled, false) then
      raise exception 'CATALOG_EXPORT_RUNTIME_DISABLED' using errcode = '55000';
    end if;
  end if;

  -- Serializa solicitacoes do mesmo usuario para tornar atomicos os limites e a deduplicacao.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  v_requested_count := coalesce(cardinality(p_announcement_ids), 0);
  if v_requested_count < 1 or v_requested_count > 100 then
    raise exception 'CATALOG_EXPORT_ANNOUNCEMENT_LIMIT' using errcode = '22023';
  end if;

  select count(distinct selected.id)::integer
  into v_distinct_count
  from unnest(p_announcement_ids) selected(id);
  if v_distinct_count <> v_requested_count then
    raise exception 'CATALOG_EXPORT_DUPLICATE_ANNOUNCEMENT' using errcode = '22023';
  end if;

  if p_price_mode not in ('show', 'hide', 'consult') then
    raise exception 'CATALOG_EXPORT_INVALID_PRICE_MODE' using errcode = '22023';
  end if;

  select stores.*
  into v_store
  from public.seller_stores stores
  where stores.user_id = v_user_id
    and stores.is_active = true
    and stores.is_store_feature_enabled = true
    and coalesce(stores.is_paused_due_to_plan, false) = false
    and exists (
      select 1
      from public.user_subscriptions subscriptions
      join public.plans plans on plans.id = subscriptions.plan_id
      where subscriptions.user_id = v_user_id
        and subscriptions.status = 'active'
        and subscriptions.current_period_end > now()
        and coalesce(plans.has_seller_store, false) = true
    )
  for share;

  if not found then
    raise exception 'CATALOG_EXPORT_STORE_PLAN_REQUIRED' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_eligible_count
  from public.announcements announcements
  where announcements.id = any(p_announcement_ids)
    and announcements.user_id = v_user_id
    and announcements.status = 'ACTIVE';

  if v_eligible_count <> v_requested_count then
    raise exception 'CATALOG_EXPORT_ANNOUNCEMENT_NOT_ELIGIBLE' using errcode = '42501';
  end if;

  v_title := coalesce(nullif(trim(p_catalog_title), ''), v_store.store_name || ' | Catalogo');
  v_subtitle := nullif(trim(p_catalog_subtitle), '');
  if char_length(v_title) not between 3 and 120 then
    raise exception 'CATALOG_EXPORT_INVALID_TITLE' using errcode = '22023';
  end if;
  if v_subtitle is not null and char_length(v_subtitle) not between 3 and 240 then
    raise exception 'CATALOG_EXPORT_INVALID_SUBTITLE' using errcode = '22023';
  end if;

  v_store_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'id', v_store.id,
    'slug', v_store.slug,
    'store_name', v_store.store_name,
    'description', v_store.description,
    'logo_url', v_store.logo_url,
    'cover_url', v_store.cover_url,
    'cover_mobile_url', v_store.cover_mobile_url,
    'city', v_store.city,
    'state', v_store.state,
    'is_verified', v_store.is_verified,
    'public_url', 'https://agrobw.com.br/loja/' || v_store.slug,
    'platform_name', 'AGRO BW'
  ));

  select jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', announcements.id,
      'slug', announcements.slug,
      'title', announcements.title,
      'description', announcements.description,
      'price', coalesce(announcements.unit_price, announcements.price),
      'price_negotiable', announcements.price_negotiable,
      'product_condition', announcements.product_condition,
      'availability', announcements.availability,
      'accepts_trade', announcements.accepts_trade,
      'city', announcements.city,
      'state', announcements.state,
      'category_id', announcements.category_id,
      'sub_category_id', announcements.sub_category_id,
      'sub_category_label', announcements.sub_category_label,
      'images', to_jsonb(announcements.images[1:3]),
      'public_url', 'https://agrobw.com.br/anuncio/' || coalesce(nullif(announcements.slug, ''), announcements.id::text),
      'store_display_order', announcements.store_display_order,
      'updated_at', announcements.updated_at
    ))
    order by selected.ordinality
  )
  into v_announcement_snapshot
  from unnest(p_announcement_ids) with ordinality selected(id, ordinality)
  join public.announcements announcements on announcements.id = selected.id
  where announcements.user_id = v_user_id
    and announcements.status = 'ACTIVE';

  v_snapshot_hash := md5(
    v_store_snapshot::text
    || v_announcement_snapshot::text
    || p_price_mode
    || v_title
    || coalesce(v_subtitle, '')
  );

  select exports.id
  into v_export_id
  from public.seller_store_catalog_exports exports
  where exports.user_id = v_user_id
    and exports.snapshot_hash = v_snapshot_hash
    and exports.status in ('queued', 'processing')
  order by exports.created_at desc
  limit 1;

  if v_export_id is not null then
    return v_export_id;
  end if;

  if (
    select count(*)
    from public.seller_store_catalog_exports exports
    where exports.user_id = v_user_id
      and exports.status in ('queued', 'processing')
  ) >= 2 then
    raise exception 'CATALOG_EXPORT_CONCURRENCY_LIMIT' using errcode = '55000';
  end if;

  if (
    select count(*)
    from public.seller_store_catalog_exports exports
    where exports.user_id = v_user_id
      and exports.created_at >= now() - interval '24 hours'
  ) >= 20 then
    raise exception 'CATALOG_EXPORT_DAILY_LIMIT' using errcode = '54000';
  end if;

  insert into public.seller_store_catalog_exports (
    user_id,
    store_id,
    catalog_title,
    catalog_subtitle,
    price_mode,
    announcement_ids,
    store_snapshot,
    announcement_snapshot,
    snapshot_hash
  ) values (
    v_user_id,
    v_store.id,
    v_title,
    v_subtitle,
    p_price_mode,
    p_announcement_ids,
    v_store_snapshot,
    v_announcement_snapshot,
    v_snapshot_hash
  )
  on conflict do nothing
  returning id into v_export_id;

  if v_export_id is null then
    select exports.id
    into v_export_id
    from public.seller_store_catalog_exports exports
    where exports.user_id = v_user_id
      and exports.snapshot_hash = v_snapshot_hash
      and exports.status in ('queued', 'processing')
    order by exports.created_at desc
    limit 1;
  end if;

  if v_export_id is null then
    raise exception 'CATALOG_EXPORT_CREATE_FAILED' using errcode = '55000';
  end if;

  return v_export_id;
end;
$$;

create or replace function public.list_my_seller_store_catalog_exports(p_limit integer default 12)
returns table (
  id uuid,
  status text,
  price_mode text,
  catalog_title text,
  catalog_subtitle text,
  announcement_ids uuid[],
  file_size_bytes bigint,
  page_count integer,
  attempts integer,
  max_attempts integer,
  created_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'CATALOG_EXPORT_AUTH_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    exports.id,
    exports.status,
    exports.price_mode,
    exports.catalog_title,
    exports.catalog_subtitle,
    exports.announcement_ids,
    exports.file_size_bytes,
    exports.page_count,
    exports.attempts,
    exports.max_attempts,
    exports.created_at,
    exports.completed_at,
    exports.expires_at,
    exports.error_code
  from public.seller_store_catalog_exports exports
  where exports.user_id = v_user_id
  order by exports.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
end;
$$;

create or replace function public.cancel_seller_store_catalog_export(p_export_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'CATALOG_EXPORT_AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.seller_store_catalog_exports exports
  set
    status = 'cancelled',
    completed_at = now(),
    locked_at = null,
    locked_by = null
  where exports.id = p_export_id
    and exports.user_id = v_user_id
    and exports.status = 'queued';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.request_seller_store_catalog_export(uuid[], text, text, text)
  from public, anon, authenticated;
revoke all on function public.cancel_seller_store_catalog_export(uuid)
  from public, anon, authenticated;
revoke all on function public.list_my_seller_store_catalog_exports(integer)
  from public, anon, authenticated;
grant execute on function public.request_seller_store_catalog_export(uuid[], text, text, text)
  to authenticated;
grant execute on function public.cancel_seller_store_catalog_export(uuid)
  to authenticated;
grant execute on function public.list_my_seller_store_catalog_exports(integer)
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'seller-store-catalogs',
  'seller-store-catalogs',
  false,
  31457280,
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 31457280,
  allowed_mime_types = array['application/pdf'];

drop policy if exists seller_store_catalogs_owner_read on storage.objects;
drop policy if exists seller_store_catalogs_admin_read on storage.objects;

-- Downloads are authorized by the owner-bound Edge Function. Keeping browser
-- policies off this private bucket also prevents cross-bucket policy failures.

commit;
