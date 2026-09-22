begin;

set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from public.seller_store_catalog_exports) then
    raise exception 'Rollback recusado: existem exportacoes de catalogo. Remova-as de forma controlada primeiro.';
  end if;
end;
$$;

drop function if exists public.mark_seller_store_catalog_storage_deleted(uuid[]);
drop function if exists public.list_orphaned_seller_store_catalog_objects(integer);
drop function if exists public.expire_seller_store_catalog_exports(integer);
drop function if exists public.fail_seller_store_catalog_export(uuid, uuid, text, text, boolean);
drop function if exists public.complete_seller_store_catalog_export(uuid, uuid, text, bigint, integer);
drop function if exists public.release_seller_store_catalog_exports(uuid, uuid[]);
drop function if exists public.claim_seller_store_catalog_exports(integer, uuid);

drop index if exists public.idx_seller_store_catalog_exports_storage_cleanup;
drop index if exists public.idx_seller_store_catalog_exports_claim;
create index idx_seller_store_catalog_exports_claim
  on public.seller_store_catalog_exports (created_at)
  where status = 'queued';

alter table public.seller_store_catalog_exports
  drop constraint if exists seller_store_catalog_exports_price_mode_check;
alter table public.seller_store_catalog_exports
  add constraint seller_store_catalog_exports_price_mode_check
  check (price_mode in ('show', 'consult'));

alter table public.seller_store_catalog_exports
  drop column if exists storage_deleted_at,
  drop column if exists next_attempt_at;

commit;
