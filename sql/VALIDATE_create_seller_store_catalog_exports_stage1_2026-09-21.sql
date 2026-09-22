with table_checks as (
  select
    to_regclass('public.seller_store_catalog_exports') is not null as tabela_criada,
    coalesce((
      select c.relrowsecurity and c.relforcerowsecurity
      from pg_class c
      where c.oid = to_regclass('public.seller_store_catalog_exports')
    ), false) as rls_forcada
),
bucket_checks as (
  select coalesce((
    select
      buckets.public = false
      and buckets.file_size_limit = 31457280
      and buckets.allowed_mime_types = array['application/pdf']::text[]
    from storage.buckets buckets
    where buckets.id = 'seller-store-catalogs'
  ), false) as bucket_privado
),
index_checks as (
  select
    bool_or(indexname = 'idx_seller_store_catalog_exports_owner_recent') as indice_historico,
    bool_or(indexname = 'idx_seller_store_catalog_exports_claim') as indice_fila,
    bool_or(indexname = 'idx_seller_store_catalog_exports_open_snapshot' and indexdef ilike '%unique%') as deduplicacao_aberta
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'seller_store_catalog_exports'
),
function_checks as (
  select
    to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)') is not null as rpc_solicitacao,
    to_regprocedure('public.cancel_seller_store_catalog_export(uuid)') is not null as rpc_cancelamento,
    to_regprocedure('public.list_my_seller_store_catalog_exports(integer)') is not null as rpc_historico_seguro
),
definition_checks as (
  select
    pg_get_functiondef(to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)')) ilike '%plans.has_seller_store%' as exige_plano_loja,
    pg_get_functiondef(to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)')) ilike '%v_requested_count > 100%' as limite_anuncios,
    pg_get_functiondef(to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)')) ilike '%status = ''ACTIVE''%' as somente_ativos,
    pg_get_functiondef(to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)')) ilike '%interval ''24 hours''%' as limite_diario,
    pg_get_functiondef(to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)')) ilike '%pg_advisory_xact_lock%' as limites_serializados,
    pg_get_functiondef(to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)')) ilike '%CATALOG_EXPORT_RUNTIME_DISABLED%' as respeita_pausa_operacional,
    pg_get_functiondef(to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)')) ilike '%''public_url'', ''https://agrobw.com.br/loja/''%' as dominio_canonico,
    pg_get_functiondef(to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)')) not ilike '%v_store.email%' as snapshot_sem_email,
    pg_get_functiondef(to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)')) not ilike '%v_store.whatsapp%' as snapshot_sem_whatsapp
),
policy_checks as (
  select
    count(*) filter (where tablename = 'seller_store_catalog_exports' and cmd = 'SELECT') >= 2 as leitura_tabela_controlada,
    count(*) filter (where tablename = 'objects' and policyname ilike 'seller_store_catalogs%') = 0 as bucket_sem_acesso_direto,
    count(*) filter (where tablename = 'objects' and policyname ilike 'seller_store_catalogs%' and cmd in ('INSERT', 'UPDATE', 'DELETE')) = 0 as cliente_sem_escrita_bucket
  from pg_policies
  where schemaname in ('public', 'storage')
),
privilege_checks as (
  select
    not has_table_privilege('anon', 'public.seller_store_catalog_exports', 'SELECT') as anon_sem_leitura,
    not has_table_privilege('authenticated', 'public.seller_store_catalog_exports', 'SELECT') as autenticado_sem_leitura_direta,
    not has_table_privilege('authenticated', 'public.seller_store_catalog_exports', 'INSERT')
      and not has_table_privilege('authenticated', 'public.seller_store_catalog_exports', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.seller_store_catalog_exports', 'DELETE') as autenticado_sem_escrita,
    has_table_privilege('service_role', 'public.seller_store_catalog_exports', 'INSERT')
      and has_table_privilege('service_role', 'public.seller_store_catalog_exports', 'UPDATE') as worker_com_escrita,
    has_function_privilege('authenticated', 'public.request_seller_store_catalog_export(uuid[],text,text,text)', 'EXECUTE') as autenticado_solicita,
    has_function_privilege('authenticated', 'public.list_my_seller_store_catalog_exports(integer)', 'EXECUTE') as autenticado_lista_proprio_historico,
    not has_function_privilege('anon', 'public.request_seller_store_catalog_export(uuid[],text,text,text)', 'EXECUTE') as anon_sem_solicitacao
)
select
  table_checks.tabela_criada,
  table_checks.rls_forcada,
  bucket_checks.bucket_privado,
  index_checks.indice_historico,
  index_checks.indice_fila,
  index_checks.deduplicacao_aberta,
  function_checks.rpc_solicitacao,
  function_checks.rpc_cancelamento,
  function_checks.rpc_historico_seguro,
  definition_checks.exige_plano_loja,
  definition_checks.limite_anuncios,
  definition_checks.somente_ativos,
  definition_checks.limite_diario,
  definition_checks.limites_serializados,
  definition_checks.respeita_pausa_operacional,
  definition_checks.dominio_canonico,
  definition_checks.snapshot_sem_email,
  definition_checks.snapshot_sem_whatsapp,
  policy_checks.leitura_tabela_controlada,
  policy_checks.bucket_sem_acesso_direto,
  policy_checks.cliente_sem_escrita_bucket,
  privilege_checks.anon_sem_leitura,
  privilege_checks.autenticado_sem_leitura_direta,
  privilege_checks.autenticado_sem_escrita,
  privilege_checks.worker_com_escrita,
  privilege_checks.autenticado_solicita,
  privilege_checks.autenticado_lista_proprio_historico,
  privilege_checks.anon_sem_solicitacao
from table_checks
cross join bucket_checks
cross join index_checks
cross join function_checks
cross join definition_checks
cross join policy_checks
cross join privilege_checks;
