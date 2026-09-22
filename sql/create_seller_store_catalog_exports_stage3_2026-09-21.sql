begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.seller_store_catalog_exports') is null then
    raise exception 'seller_store_catalog_exports nao existe; aplique a etapa 1 primeiro';
  end if;
end;
$$;

alter table public.seller_store_catalog_exports
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists storage_deleted_at timestamptz;

alter table public.seller_store_catalog_exports
  drop constraint if exists seller_store_catalog_exports_price_mode_check;
alter table public.seller_store_catalog_exports
  add constraint seller_store_catalog_exports_price_mode_check
  check (price_mode in ('show', 'hide', 'consult'));

drop index if exists public.idx_seller_store_catalog_exports_claim;
create index idx_seller_store_catalog_exports_claim
  on public.seller_store_catalog_exports (next_attempt_at, created_at)
  where status = 'queued';

create index if not exists idx_seller_store_catalog_exports_storage_cleanup
  on public.seller_store_catalog_exports (expires_at)
  where storage_path is not null and storage_deleted_at is null;

create or replace function public.claim_seller_store_catalog_exports(
  p_limit integer,
  p_worker_id uuid
)
returns setof public.seller_store_catalog_exports
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_worker_id is null then
    raise exception 'Worker obrigatorio' using errcode = '22023';
  end if;

  update public.seller_store_catalog_exports exports
  set
    status = 'failed',
    completed_at = now(),
    error_code = 'CATALOG_EXPORT_EXPIRED',
    error_message = 'A solicitacao expirou antes da geracao.',
    locked_at = null,
    locked_by = null
  where exports.status = 'queued'
    and exports.expires_at <= now();

  update public.seller_store_catalog_exports exports
  set
    status = case when exports.attempts >= exports.max_attempts then 'failed' else 'queued' end,
    next_attempt_at = now(),
    completed_at = case when exports.attempts >= exports.max_attempts then now() else null end,
    error_code = 'CATALOG_EXPORT_LEASE_EXPIRED',
    error_message = 'A geracao anterior excedeu o tempo de reserva.',
    locked_at = null,
    locked_by = null
  where exports.status = 'processing'
    and exports.locked_at < now() - interval '10 minutes';

  return query
  with candidates as (
    select exports.id
    from public.seller_store_catalog_exports exports
    where exports.status = 'queued'
      and exports.next_attempt_at <= now()
      and exports.expires_at > now()
      and exports.attempts < exports.max_attempts
    order by exports.next_attempt_at, exports.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 1), 1), 2)
  )
  update public.seller_store_catalog_exports exports
  set
    status = 'processing',
    attempts = exports.attempts + 1,
    locked_at = now(),
    locked_by = p_worker_id,
    started_at = coalesce(exports.started_at, now()),
    completed_at = null,
    error_code = null,
    error_message = null
  from candidates
  where exports.id = candidates.id
  returning exports.*;
end;
$$;

create or replace function public.release_seller_store_catalog_exports(
  p_worker_id uuid,
  p_export_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_released integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_worker_id is null or coalesce(cardinality(p_export_ids), 0) = 0 then
    return 0;
  end if;

  update public.seller_store_catalog_exports exports
  set
    status = 'queued',
    attempts = greatest(exports.attempts - 1, 0),
    next_attempt_at = now(),
    locked_at = null,
    locked_by = null
  where exports.id = any(p_export_ids)
    and exports.status = 'processing'
    and exports.locked_by = p_worker_id;

  get diagnostics v_released = row_count;
  return v_released;
end;
$$;

create or replace function public.complete_seller_store_catalog_export(
  p_export_id uuid,
  p_worker_id uuid,
  p_storage_path text,
  p_file_size_bytes bigint,
  p_page_count integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_file_size_bytes not between 1 and 31457280 or p_page_count not between 1 and 500 then
    raise exception 'Metadados do PDF invalidos' using errcode = '22023';
  end if;

  update public.seller_store_catalog_exports exports
  set
    status = 'ready',
    storage_path = p_storage_path,
    file_size_bytes = p_file_size_bytes,
    page_count = p_page_count,
    completed_at = now(),
    storage_deleted_at = null,
    error_code = null,
    error_message = null,
    locked_at = null,
    locked_by = null
  where exports.id = p_export_id
    and exports.status = 'processing'
    and exports.locked_by = p_worker_id
    and p_storage_path = exports.user_id::text || '/' || exports.id::text || '.pdf';

  return found;
end;
$$;

create or replace function public.fail_seller_store_catalog_export(
  p_export_id uuid,
  p_worker_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default true
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_export public.seller_store_catalog_exports%rowtype;
  v_next_status text;
  v_delay_seconds integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select * into v_export
  from public.seller_store_catalog_exports exports
  where exports.id = p_export_id
    and exports.status = 'processing'
    and exports.locked_by = p_worker_id
  for update;

  if not found then
    return null;
  end if;

  v_next_status := case
    when coalesce(p_retryable, true)
      and v_export.attempts < v_export.max_attempts
      and v_export.expires_at > now()
      then 'queued'
    else 'failed'
  end;
  v_delay_seconds := least(1800, (30 * power(2, greatest(v_export.attempts - 1, 0)))::integer);

  update public.seller_store_catalog_exports exports
  set
    status = v_next_status,
    next_attempt_at = case when v_next_status = 'queued'
      then now() + make_interval(secs => v_delay_seconds)
      else exports.next_attempt_at
    end,
    completed_at = case when v_next_status = 'failed' then now() else null end,
    error_code = left(coalesce(nullif(trim(p_error_code), ''), 'CATALOG_EXPORT_UNKNOWN_ERROR'), 80),
    error_message = left(coalesce(nullif(trim(p_error_message), ''), 'Falha desconhecida na geracao.'), 500),
    locked_at = null,
    locked_by = null
  where exports.id = v_export.id;

  return v_next_status;
end;
$$;

create or replace function public.expire_seller_store_catalog_exports(p_limit integer default 100)
returns table (id uuid, storage_path text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  update public.seller_store_catalog_exports exports
  set status = 'expired'
  where exports.status = 'ready'
    and exports.expires_at <= now();

  return query
  select exports.id, exports.storage_path
  from public.seller_store_catalog_exports exports
  where exports.status = 'expired'
    and exports.storage_path is not null
    and exports.storage_deleted_at is null
  order by exports.expires_at
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.mark_seller_store_catalog_storage_deleted(p_export_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_updated integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_export_ids), 0) = 0 then
    return 0;
  end if;

  update public.seller_store_catalog_exports exports
  set storage_deleted_at = now()
  where exports.id = any(p_export_ids)
    and exports.status = 'expired'
    and exports.storage_path is not null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.list_orphaned_seller_store_catalog_objects(p_limit integer default 100)
returns table (storage_path text)
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select objects.name
  from storage.objects objects
  where objects.bucket_id = 'seller-store-catalogs'
    and not exists (
      select 1
      from public.seller_store_catalog_exports exports
      where exports.storage_path = objects.name
        or (
          exports.status in ('queued', 'processing')
          and objects.name = exports.user_id::text || '/' || exports.id::text || '.pdf'
        )
    )
  order by objects.name
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.claim_seller_store_catalog_exports(integer, uuid) from public, anon, authenticated;
revoke all on function public.release_seller_store_catalog_exports(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.complete_seller_store_catalog_export(uuid, uuid, text, bigint, integer) from public, anon, authenticated;
revoke all on function public.fail_seller_store_catalog_export(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.expire_seller_store_catalog_exports(integer) from public, anon, authenticated;
revoke all on function public.mark_seller_store_catalog_storage_deleted(uuid[]) from public, anon, authenticated;
revoke all on function public.list_orphaned_seller_store_catalog_objects(integer) from public, anon, authenticated;

grant execute on function public.claim_seller_store_catalog_exports(integer, uuid) to service_role;
grant execute on function public.release_seller_store_catalog_exports(uuid, uuid[]) to service_role;
grant execute on function public.complete_seller_store_catalog_export(uuid, uuid, text, bigint, integer) to service_role;
grant execute on function public.fail_seller_store_catalog_export(uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.expire_seller_store_catalog_exports(integer) to service_role;
grant execute on function public.mark_seller_store_catalog_storage_deleted(uuid[]) to service_role;
grant execute on function public.list_orphaned_seller_store_catalog_objects(integer) to service_role;

commit;
