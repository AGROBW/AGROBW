select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'seller_store_catalog_exports'
      and column_name = 'cover_alignment'
      and is_nullable = 'NO'
      and column_default like '%center%'
  ) as alinhamento_criado,
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.seller_store_catalog_exports'::regclass
      and conname = 'seller_store_catalog_exports_cover_alignment_check'
  ) as alinhamento_validado,
  to_regprocedure('public.request_seller_store_catalog_export_v2(uuid[],text,text,text,text)') is not null
    as rpc_v2_criada,
  to_regprocedure('public.list_my_seller_store_catalog_exports_v2(integer)') is not null
    as historico_v2_criado,
  has_function_privilege(
    'authenticated',
    'public.request_seller_store_catalog_export_v2(uuid[],text,text,text,text)',
    'EXECUTE'
  ) as usuario_pode_solicitar,
  has_function_privilege(
    'authenticated',
    'public.list_my_seller_store_catalog_exports_v2(integer)',
    'EXECUTE'
  ) as usuario_pode_listar_historico,
  not has_function_privilege(
    'anon',
    'public.request_seller_store_catalog_export_v2(uuid[],text,text,text,text)',
    'EXECUTE'
  ) as anon_sem_solicitacao,
  not has_function_privilege(
    'anon',
    'public.list_my_seller_store_catalog_exports_v2(integer)',
    'EXECUTE'
  ) as anon_sem_historico,
  pg_get_functiondef(
    'public.request_seller_store_catalog_export_v2(uuid[],text,text,text,text)'::regprocedure
  ) like '%CATALOG_EXPORT_INVALID_COVER_ALIGNMENT%'
    as rejeita_alinhamento_invalido,
  pg_get_functiondef(
    'public.request_seller_store_catalog_export_v2(uuid[],text,text,text,text)'::regprocedure
  ) like '%pg_advisory_xact_lock%'
    as serializa_solicitacoes,
  pg_get_functiondef(
    'public.request_seller_store_catalog_export_v2(uuid[],text,text,text,text)'::regprocedure
  ) like '%for update%'
    as atualizacao_atomica,
  pg_get_functiondef(
    'public.request_seller_store_catalog_export_v2(uuid[],text,text,text,text)'::regprocedure
  ) like '%CATALOG_EXPORT_ALREADY_PROCESSING%'
    as preserva_job_em_processamento,
  pg_get_functiondef(
    'public.request_seller_store_catalog_export_v2(uuid[],text,text,text,text)'::regprocedure
  ) like '%CATALOG_EXPORT_ALIGNMENT_CONFLICT%'
    as rejeita_mudanca_silenciosa,
  pg_get_function_result(
    'public.list_my_seller_store_catalog_exports_v2(integer)'::regprocedure
  ) like '%cover_alignment text%'
    as historico_expoe_alinhamento;
