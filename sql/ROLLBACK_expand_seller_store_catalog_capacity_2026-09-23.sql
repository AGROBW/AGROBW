begin;

set local lock_timeout = '5s';

do $$
declare
  v_function_definition text;
begin
  if exists (
    select 1
    from public.seller_store_catalog_exports exports
    where cardinality(exports.announcement_ids) > 100
  ) then
    raise exception 'ROLLBACK_REFUSED_CATALOGS_ABOVE_100' using errcode = '55000';
  end if;

  select pg_get_functiondef(
    'public.request_seller_store_catalog_export(uuid[],text,text,text)'::regprocedure
  ) into v_function_definition;
  if v_function_definition ilike '%v_requested_count > 200%' then
    v_function_definition := replace(
      v_function_definition,
      'v_requested_count > 200',
      'v_requested_count > 100'
    );
    execute v_function_definition;
  end if;
end;
$$;

alter table public.seller_store_catalog_exports
  drop constraint if exists seller_store_catalog_exports_announcements;

alter table public.seller_store_catalog_exports
  add constraint seller_store_catalog_exports_announcements
  check (
    cardinality(announcement_ids) between 1 and 100
    and jsonb_typeof(announcement_snapshot) = 'array'
    and jsonb_array_length(announcement_snapshot) = cardinality(announcement_ids)
  );

commit;
