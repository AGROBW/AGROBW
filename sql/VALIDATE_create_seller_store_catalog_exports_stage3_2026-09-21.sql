with function_definitions as (
  select
    pg_get_functiondef(to_regprocedure('public.claim_seller_store_catalog_exports(integer,uuid)')) as claim_definition,
    pg_get_functiondef(to_regprocedure('public.fail_seller_store_catalog_export(uuid,uuid,text,text,boolean)')) as fail_definition,
    pg_get_functiondef(to_regprocedure('public.complete_seller_store_catalog_export(uuid,uuid,text,bigint,integer)')) as complete_definition,
    pg_get_functiondef(to_regprocedure('public.expire_seller_store_catalog_exports(integer)')) as expire_definition,
    pg_get_functiondef(to_regprocedure('public.list_orphaned_seller_store_catalog_objects(integer)')) as orphan_definition
),
column_checks as (
  select
    count(*) filter (where column_name = 'next_attempt_at' and is_nullable = 'NO') = 1 as proxima_tentativa_criada,
    count(*) filter (where column_name = 'storage_deleted_at') = 1 as limpeza_registrada
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'seller_store_catalog_exports'
),
index_checks as (
  select
    count(*) filter (where indexname = 'idx_seller_store_catalog_exports_claim' and indexdef ilike '%next_attempt_at%') = 1 as indice_fila_atualizado,
    count(*) filter (where indexname = 'idx_seller_store_catalog_exports_storage_cleanup') = 1 as indice_limpeza_criado
  from pg_indexes
  where schemaname = 'public'
),
privilege_checks as (
  select
    has_function_privilege('service_role', 'public.claim_seller_store_catalog_exports(integer,uuid)', 'EXECUTE') as worker_reserva,
    has_function_privilege('service_role', 'public.complete_seller_store_catalog_export(uuid,uuid,text,bigint,integer)', 'EXECUTE') as worker_conclui,
    has_function_privilege('service_role', 'public.fail_seller_store_catalog_export(uuid,uuid,text,text,boolean)', 'EXECUTE') as worker_reagenda,
    has_function_privilege('service_role', 'public.list_orphaned_seller_store_catalog_objects(integer)', 'EXECUTE') as worker_lista_orfaos,
    not has_function_privilege('authenticated', 'public.claim_seller_store_catalog_exports(integer,uuid)', 'EXECUTE') as cliente_sem_claim
)
select
  column_checks.proxima_tentativa_criada,
  column_checks.limpeza_registrada,
  index_checks.indice_fila_atualizado,
  index_checks.indice_limpeza_criado,
  to_regprocedure('public.claim_seller_store_catalog_exports(integer,uuid)') is not null as rpc_claim,
  to_regprocedure('public.release_seller_store_catalog_exports(uuid,uuid[])') is not null as rpc_release,
  to_regprocedure('public.complete_seller_store_catalog_export(uuid,uuid,text,bigint,integer)') is not null as rpc_complete,
  to_regprocedure('public.fail_seller_store_catalog_export(uuid,uuid,text,text,boolean)') is not null as rpc_fail,
  to_regprocedure('public.expire_seller_store_catalog_exports(integer)') is not null as rpc_expire,
  to_regprocedure('public.mark_seller_store_catalog_storage_deleted(uuid[])') is not null as rpc_mark_deleted,
  to_regprocedure('public.list_orphaned_seller_store_catalog_objects(integer)') is not null as rpc_list_orphans,
  function_definitions.claim_definition ilike '%for update skip locked%' as claim_atomico,
  function_definitions.claim_definition ilike '%interval ''10 minutes''%' as lease_recuperavel,
  function_definitions.claim_definition ilike '%limit least(greatest(coalesce(p_limit, 1), 1), 2)%' as lote_limitado,
  function_definitions.fail_definition ilike '%exports.id = v_export.id%' as retry_mesmo_evento,
  function_definitions.fail_definition ilike '%power(2,%' as backoff_exponencial,
  function_definitions.complete_definition ilike '%p_storage_path = exports.user_id::text || ''/'' || exports.id::text || ''.pdf''%' as caminho_deterministico,
  function_definitions.expire_definition ilike '%status = ''expired''%' as expiracao_privada,
  function_definitions.orphan_definition ilike '%status in (''queued'', ''processing'')%' as preserva_upload_em_andamento,
  privilege_checks.worker_reserva,
  privilege_checks.worker_conclui,
  privilege_checks.worker_reagenda,
  privilege_checks.worker_lista_orfaos,
  privilege_checks.cliente_sem_claim,
  pg_get_constraintdef((
    select oid from pg_constraint
    where conrelid = 'public.seller_store_catalog_exports'::regclass
      and conname = 'seller_store_catalog_exports_price_mode_check'
  )) ilike '%hide%' as modo_ocultar_preco
from function_definitions, column_checks, index_checks, privilege_checks;
