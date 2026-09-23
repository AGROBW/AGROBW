select
  pg_get_constraintdef(
    (
      select constraints.oid
      from pg_constraint constraints
      where constraints.conrelid = 'public.seller_store_catalog_exports'::regclass
        and constraints.conname = 'seller_store_catalog_exports_announcements'
    ),
    true
  ) ilike '%between 1 and 200%' as limite_tabela_200,
  pg_get_functiondef(
    'public.request_seller_store_catalog_export(uuid[],text,text,text)'::regprocedure
  ) ilike '%v_requested_count > 200%' as limite_rpc_200,
  to_regprocedure(
    'public.request_seller_store_catalog_export_v2(uuid[],text,text,text,text)'
  ) is not null as rpc_v2_preservada;
