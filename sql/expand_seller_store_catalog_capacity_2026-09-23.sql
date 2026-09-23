begin;

set local lock_timeout = '5s';

do $$
declare
  v_function_definition text;
begin
  if to_regclass('public.seller_store_catalog_exports') is null then
    raise exception 'CATALOG_EXPORTS_TABLE_REQUIRED' using errcode = '42P01';
  end if;
  if to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)') is null then
    raise exception 'CATALOG_EXPORT_REQUEST_FUNCTION_REQUIRED' using errcode = '42883';
  end if;

  select pg_get_functiondef(
    'public.request_seller_store_catalog_export(uuid[],text,text,text)'::regprocedure
  ) into v_function_definition;

  if v_function_definition not ilike '%v_requested_count > 200%' then
    if v_function_definition not ilike '%v_requested_count > 100%' then
      raise exception 'CATALOG_EXPORT_LIMIT_CONTRACT_UNEXPECTED' using errcode = '55000';
    end if;
    v_function_definition := replace(
      v_function_definition,
      'v_requested_count > 100',
      'v_requested_count > 200'
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
    cardinality(announcement_ids) between 1 and 200
    and jsonb_typeof(announcement_snapshot) = 'array'
    and jsonb_array_length(announcement_snapshot) = cardinality(announcement_ids)
  );

comment on constraint seller_store_catalog_exports_announcements
  on public.seller_store_catalog_exports is
  'Mantem entre 1 e 200 anuncios e exige correspondencia exata entre ids e snapshot.';

commit;
