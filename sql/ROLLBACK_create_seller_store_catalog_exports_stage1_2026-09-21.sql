begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.seller_store_catalog_exports') is not null
    and exists (select 1 from public.seller_store_catalog_exports limit 1) then
    raise exception 'Rollback recusado: existem exportacoes de catalogo. Preserve os dados ou remova-os de forma explicita.';
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'seller-store-catalogs'
    limit 1
  ) then
    raise exception 'Rollback recusado: o bucket seller-store-catalogs possui arquivos.';
  end if;
end;
$$;

drop policy if exists seller_store_catalogs_owner_read on storage.objects;
drop policy if exists seller_store_catalogs_admin_read on storage.objects;

delete from storage.buckets
where id = 'seller-store-catalogs'
  and not exists (
    select 1 from storage.objects where bucket_id = 'seller-store-catalogs'
  );

drop function if exists public.cancel_seller_store_catalog_export(uuid);
drop function if exists public.list_my_seller_store_catalog_exports(integer);
drop function if exists public.request_seller_store_catalog_export(uuid[], text, text, text);

drop trigger if exists trg_touch_seller_store_catalog_export
  on public.seller_store_catalog_exports;
drop function if exists public.touch_seller_store_catalog_export();
drop table if exists public.seller_store_catalog_exports;

commit;
