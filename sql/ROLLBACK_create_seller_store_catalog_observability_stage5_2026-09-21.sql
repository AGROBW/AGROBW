begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.seller_store_catalog_worker_runs') is not null
    and exists (select 1 from public.seller_store_catalog_worker_runs) then
    raise exception 'Rollback recusado: existem execucoes registradas do worker de catalogos';
  end if;
end;
$$;

drop function if exists public.list_seller_store_catalog_worker_runs_admin(integer);
drop function if exists public.update_seller_store_catalog_runtime_admin(boolean, integer, integer);
drop function if exists public.get_seller_store_catalog_health_admin();
drop function if exists public.get_seller_store_catalog_availability();
drop function if exists public.finish_seller_store_catalog_worker_run(uuid, boolean, jsonb, text, integer);
drop function if exists public.begin_seller_store_catalog_worker_run(uuid, integer);

drop table if exists public.seller_store_catalog_worker_runs;
drop table if exists public.seller_store_catalog_runtime_settings;

commit;
