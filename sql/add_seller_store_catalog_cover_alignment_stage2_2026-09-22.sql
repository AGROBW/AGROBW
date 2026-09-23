begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.seller_store_catalog_exports') is null then
    raise exception 'CATALOG_EXPORTS_TABLE_REQUIRED' using errcode = '42P01';
  end if;
end;
$$;

alter table public.seller_store_catalog_exports
  add column if not exists cover_alignment text not null default 'center';

alter table public.seller_store_catalog_exports
  drop constraint if exists seller_store_catalog_exports_cover_alignment_check;

alter table public.seller_store_catalog_exports
  add constraint seller_store_catalog_exports_cover_alignment_check
  check (cover_alignment in ('left', 'center', 'right'));

comment on column public.seller_store_catalog_exports.cover_alignment is
  'Alinhamento horizontal escolhido para a imagem principal no template de capa do catalogo.';

create or replace function public.request_seller_store_catalog_export_v2(
  p_announcement_ids uuid[],
  p_catalog_title text default null,
  p_catalog_subtitle text default null,
  p_price_mode text default 'show',
  p_cover_alignment text default 'center'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_open_export_ids uuid[] := array[]::uuid[];
  v_export_id uuid;
  v_status text;
  v_current_alignment text;
  v_was_existing boolean;
begin
  if v_user_id is null then
    raise exception 'CATALOG_EXPORT_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_cover_alignment is null or p_cover_alignment not in ('left', 'center', 'right') then
    raise exception 'CATALOG_EXPORT_INVALID_COVER_ALIGNMENT' using errcode = '22023';
  end if;

  -- Lock before observing the queue so a concurrent request cannot be mistaken
  -- for the row created by this transaction. The V1 lock is reentrant here.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select coalesce(array_agg(exports.id), array[]::uuid[])
  into v_open_export_ids
  from public.seller_store_catalog_exports exports
  where exports.user_id = v_user_id
    and exports.status in ('queued', 'processing');

  -- V1 remains the source of truth for eligibility, limits, snapshots, and
  -- content deduplication.
  v_export_id := public.request_seller_store_catalog_export(
    p_announcement_ids,
    p_catalog_title,
    p_catalog_subtitle,
    p_price_mode
  );

  select exports.status, exports.cover_alignment
  into v_status, v_current_alignment
  from public.seller_store_catalog_exports exports
  where exports.id = v_export_id
    and exports.user_id = v_user_id
  for update;

  if not found then
    raise exception 'CATALOG_EXPORT_CREATE_FAILED' using errcode = '55000';
  end if;

  v_was_existing := v_export_id = any(v_open_export_ids);
  if v_was_existing and v_current_alignment <> p_cover_alignment then
    if v_status = 'processing' then
      raise exception 'CATALOG_EXPORT_ALREADY_PROCESSING' using errcode = '55000';
    end if;
    raise exception 'CATALOG_EXPORT_ALIGNMENT_CONFLICT' using errcode = '55000';
  end if;

  if not v_was_existing and v_status = 'queued' then
    update public.seller_store_catalog_exports exports
    set cover_alignment = p_cover_alignment
    where exports.id = v_export_id;
  end if;

  return v_export_id;
end;
$$;

create or replace function public.list_my_seller_store_catalog_exports_v2(p_limit integer default 12)
returns table (
  id uuid,
  status text,
  price_mode text,
  cover_alignment text,
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
    exports.cover_alignment,
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

revoke all on function public.request_seller_store_catalog_export_v2(uuid[], text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.list_my_seller_store_catalog_exports_v2(integer)
  from public, anon, authenticated;
grant execute on function public.request_seller_store_catalog_export_v2(uuid[], text, text, text, text)
  to authenticated;
grant execute on function public.list_my_seller_store_catalog_exports_v2(integer)
  to authenticated;

commit;
