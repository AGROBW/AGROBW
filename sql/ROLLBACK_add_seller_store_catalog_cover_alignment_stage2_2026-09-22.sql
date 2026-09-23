begin;

do $$
begin
  if exists (
    select 1
    from public.seller_store_catalog_exports
    where status in ('queued', 'processing')
  ) then
    raise exception 'Rollback recusado: existem catalogos em processamento ou na fila.';
  end if;
end;
$$;

drop function if exists public.request_seller_store_catalog_export_v2(uuid[], text, text, text, text);
drop function if exists public.list_my_seller_store_catalog_exports_v2(integer);

alter table public.seller_store_catalog_exports
  drop column if exists cover_alignment;

commit;
