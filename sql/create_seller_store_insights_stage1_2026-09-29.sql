begin;

do $$
begin
  if to_regclass('public.seller_stores') is null
     or to_regclass('public.user_subscriptions') is null
     or to_regclass('public.plans') is null
     or to_regclass('public.announcements') is null
     or to_regclass('public.seller_store_catalog_exports') is null then
    raise exception 'SELLER_STORE_INSIGHTS_PREREQUISITES_MISSING';
  end if;
end;
$$;

create table if not exists public.seller_store_insight_events (
  id uuid primary key default gen_random_uuid(),
  event_key uuid not null unique,
  store_id uuid not null references public.seller_stores(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  catalog_export_id uuid references public.seller_store_catalog_exports(id) on delete cascade,
  event_type text not null,
  source_channel text not null default 'direct',
  session_hash text not null,
  dedupe_bucket timestamptz not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint seller_store_insight_events_type_check check (
    event_type in (
      'announcement_open',
      'contact_whatsapp',
      'contact_platform',
      'website_click',
      'store_share',
      'catalog_generated',
      'catalog_download',
      'catalog_qr_open'
    )
  ),
  constraint seller_store_insight_events_source_check check (
    source_channel in (
      'direct',
      'internal',
      'google',
      'whatsapp',
      'social',
      'catalog_pdf',
      'other'
    )
  ),
  constraint seller_store_insight_events_session_hash_check check (
    session_hash ~ '^[0-9a-f]{32}$'
  )
);

comment on table public.seller_store_insight_events is
  'Private, deduplicated engagement events for Seller Store Insights. Store visits remain sourced from site_page_views.';
comment on column public.seller_store_insight_events.session_hash is
  'Store-scoped hash of the analytics session. The raw session identifier is never stored here.';
comment on column public.seller_store_insight_events.dedupe_bucket is
  'Five-minute UTC bucket used to suppress equivalent browser events.';

create index if not exists idx_seller_store_insight_events_store_recent
  on public.seller_store_insight_events (store_id, occurred_at desc);
create index if not exists idx_seller_store_insight_events_store_type_recent
  on public.seller_store_insight_events (store_id, event_type, occurred_at desc);
create index if not exists idx_seller_store_insight_events_announcement_recent
  on public.seller_store_insight_events (announcement_id, occurred_at desc)
  where announcement_id is not null;
create index if not exists idx_seller_store_insight_events_catalog_recent
  on public.seller_store_insight_events (catalog_export_id, occurred_at desc)
  where catalog_export_id is not null;
create index if not exists idx_seller_store_insight_events_session_recent
  on public.seller_store_insight_events (session_hash, created_at desc);
create unique index if not exists idx_seller_store_insight_events_five_minute_dedupe
  on public.seller_store_insight_events (
    store_id,
    event_type,
    session_hash,
    coalesce(announcement_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(catalog_export_id, '00000000-0000-0000-0000-000000000000'::uuid),
    dedupe_bucket
  );

alter table public.seller_store_insight_events enable row level security;
alter table public.seller_store_insight_events force row level security;

revoke all on table public.seller_store_insight_events from public, anon, authenticated;
grant select, insert, delete on table public.seller_store_insight_events to service_role;

create or replace function public.seller_store_insights_has_active_plan(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select p_user_id is not null and exists (
    select 1
    from public.user_subscriptions subscriptions
    join public.plans plans on plans.id = subscriptions.plan_id
    where subscriptions.user_id = p_user_id
      and subscriptions.status = 'active'
      and subscriptions.current_period_end > now()
      and coalesce(plans.has_seller_store, false) = true
  );
$$;

revoke all on function public.seller_store_insights_has_active_plan(uuid)
  from public, anon, authenticated;

create or replace function public.get_my_seller_store_insights_availability()
returns table (
  available boolean,
  store_id uuid,
  reason text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_store public.seller_stores%rowtype;
  v_has_active_plan boolean := false;
begin
  if v_user_id is null then
    raise exception 'SELLER_STORE_INSIGHTS_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select stores.*
  into v_store
  from public.seller_stores stores
  where stores.user_id = v_user_id
  limit 1;

  if not found then
    return query select false, null::uuid, 'STORE_NOT_FOUND'::text;
    return;
  end if;

  v_has_active_plan := public.seller_store_insights_has_active_plan(v_user_id);

  if not v_has_active_plan then
    return query select false, v_store.id, 'PLAN_REQUIRED'::text;
    return;
  end if;

  if not coalesce(v_store.is_store_feature_enabled, false)
     or coalesce(v_store.is_paused_due_to_plan, false) then
    return query select false, v_store.id, 'STORE_FEATURE_PAUSED'::text;
    return;
  end if;

  return query select true, v_store.id, 'AVAILABLE'::text;
end;
$$;

revoke all on function public.get_my_seller_store_insights_availability()
  from public, anon, authenticated;
grant execute on function public.get_my_seller_store_insights_availability()
  to authenticated;

create or replace function public.record_seller_store_insight_event(
  p_store_slug text,
  p_event_type text,
  p_session_id text,
  p_event_key uuid,
  p_announcement_id uuid default null,
  p_catalog_export_id uuid default null,
  p_source_channel text default 'direct'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_store public.seller_stores%rowtype;
  v_now timestamptz := now();
  v_session_hash text;
  v_source_channel text;
  v_dedupe_bucket timestamptz;
  v_inserted integer := 0;
begin
  if coalesce(trim(p_store_slug), '') = ''
     or coalesce(trim(p_session_id), '') = ''
     or p_event_key is null then
    return false;
  end if;

  if p_event_type is null or p_event_type not in (
    'announcement_open',
    'contact_whatsapp',
    'contact_platform',
    'website_click',
    'store_share',
    'catalog_qr_open'
  ) then
    return false;
  end if;

  select stores.*
  into v_store
  from public.seller_stores stores
  where stores.slug = left(trim(p_store_slug), 160)
    and stores.is_active = true
    and stores.is_store_feature_enabled = true
    and coalesce(stores.is_paused_due_to_plan, false) = false
    and public.seller_store_insights_has_active_plan(stores.user_id)
  limit 1;

  if not found or auth.uid() = v_store.user_id then
    return false;
  end if;

  if p_event_type in ('announcement_open', 'contact_platform', 'catalog_qr_open')
     and p_announcement_id is null then
    return false;
  end if;

  if p_announcement_id is not null and not exists (
    select 1
    from public.announcements announcements
    where announcements.id = p_announcement_id
      and announcements.user_id = v_store.user_id
      and announcements.status = 'ACTIVE'
  ) then
    return false;
  end if;

  if p_event_type = 'catalog_qr_open' then
    if p_catalog_export_id is null or not exists (
      select 1
      from public.seller_store_catalog_exports exports
      where exports.id = p_catalog_export_id
        and exports.store_id = v_store.id
        and p_announcement_id = any(exports.announcement_ids)
    ) then
      return false;
    end if;
    v_source_channel := 'catalog_pdf';
  elsif p_catalog_export_id is not null then
    return false;
  else
    v_source_channel := case
      when p_source_channel in (
        'direct', 'internal', 'google', 'whatsapp', 'social', 'catalog_pdf', 'other'
      ) then p_source_channel
      else 'other'
    end;
  end if;

  v_session_hash := md5(v_store.id::text || ':' || left(p_session_id, 160));
  v_dedupe_bucket := to_timestamp(
    floor(extract(epoch from v_now) / 300) * 300
  );

  if (
    select count(*)
    from public.seller_store_insight_events events
    where events.store_id = v_store.id
      and events.session_hash = v_session_hash
      and events.created_at >= v_now - interval '1 minute'
  ) >= 30 then
    return false;
  end if;

  insert into public.seller_store_insight_events (
    event_key,
    store_id,
    announcement_id,
    catalog_export_id,
    event_type,
    source_channel,
    session_hash,
    dedupe_bucket,
    occurred_at
  ) values (
    p_event_key,
    v_store.id,
    p_announcement_id,
    p_catalog_export_id,
    p_event_type,
    v_source_channel,
    v_session_hash,
    v_dedupe_bucket,
    v_now
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.record_seller_store_insight_event(
  text, text, text, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_seller_store_insight_event(
  text, text, text, uuid, uuid, uuid, text
) to anon, authenticated;

create or replace function public.record_seller_store_insight_system_event(
  p_store_id uuid,
  p_event_type text,
  p_event_key uuid,
  p_catalog_export_id uuid,
  p_announcement_id uuid default null,
  p_source_channel text default 'internal',
  p_occurred_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_store public.seller_stores%rowtype;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_inserted integer := 0;
begin
  if p_store_id is null
     or p_event_key is null
     or p_catalog_export_id is null
     or p_event_type is null
     or p_event_type not in ('catalog_generated', 'catalog_download') then
    return false;
  end if;

  select stores.*
  into v_store
  from public.seller_stores stores
  where stores.id = p_store_id
  limit 1;

  if not found or not exists (
    select 1
    from public.seller_store_catalog_exports exports
    where exports.id = p_catalog_export_id
      and exports.store_id = p_store_id
  ) then
    return false;
  end if;

  if p_announcement_id is not null and not exists (
    select 1
    from public.announcements announcements
    where announcements.id = p_announcement_id
      and announcements.user_id = v_store.user_id
  ) then
    return false;
  end if;

  insert into public.seller_store_insight_events (
    event_key,
    store_id,
    announcement_id,
    catalog_export_id,
    event_type,
    source_channel,
    session_hash,
    dedupe_bucket,
    occurred_at
  ) values (
    p_event_key,
    p_store_id,
    p_announcement_id,
    p_catalog_export_id,
    p_event_type,
    case
      when p_source_channel in ('internal', 'catalog_pdf', 'other') then p_source_channel
      else 'internal'
    end,
    md5(p_store_id::text || ':system:' || p_event_type || ':' || p_catalog_export_id::text),
    to_timestamp(floor(extract(epoch from v_occurred_at) / 300) * 300),
    v_occurred_at
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.record_seller_store_insight_system_event(
  uuid, text, uuid, uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_seller_store_insight_system_event(
  uuid, text, uuid, uuid, uuid, text, timestamptz
) to service_role;

create or replace function public.purge_seller_store_insight_events(
  p_retention_days integer default 180
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_deleted bigint := 0;
  v_retention_days integer := least(greatest(coalesce(p_retention_days, 180), 30), 730);
begin
  delete from public.seller_store_insight_events events
  where events.created_at < now() - make_interval(days => v_retention_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_seller_store_insight_events(integer)
  from public, anon, authenticated;
grant execute on function public.purge_seller_store_insight_events(integer)
  to service_role;

commit;
