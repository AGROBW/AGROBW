with table_checks as (
  select
    to_regclass('public.seller_store_catalog_runtime_settings') is not null as configuracao_criada,
    to_regclass('public.seller_store_catalog_worker_runs') is not null as execucoes_criadas,
    coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid = to_regclass('public.seller_store_catalog_runtime_settings')), false) as configuracao_rls_forcada,
    coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid = to_regclass('public.seller_store_catalog_worker_runs')), false) as execucoes_rls_forcada
),
default_checks as (
  select coalesce((
    select not processing_enabled
      and max_batch_size = 1
      and failure_threshold = 3
      and consecutive_failures = 0
    from public.seller_store_catalog_runtime_settings
    where singleton = true
  ), false) as nasce_desativado
),
function_checks as (
  select
    to_regprocedure('public.begin_seller_store_catalog_worker_run(uuid,integer)') is not null as rpc_inicio,
    to_regprocedure('public.finish_seller_store_catalog_worker_run(uuid,boolean,jsonb,text,integer)') is not null as rpc_fim,
    to_regprocedure('public.get_seller_store_catalog_health_admin()') is not null as rpc_saude,
    to_regprocedure('public.update_seller_store_catalog_runtime_admin(boolean,integer,integer)') is not null as rpc_configuracao,
    to_regprocedure('public.list_seller_store_catalog_worker_runs_admin(integer)') is not null as rpc_historico,
    to_regprocedure('public.get_seller_store_catalog_availability()') is not null as rpc_disponibilidade
),
definition_checks as (
  select
    pg_get_functiondef(to_regprocedure('public.begin_seller_store_catalog_worker_run(uuid,integer)')) ilike '%CATALOG_WORKER_STALE_RUN%' as detecta_execucao_orfa,
    pg_get_functiondef(to_regprocedure('public.begin_seller_store_catalog_worker_run(uuid,integer)')) ilike '%interval ''90 days''%' as historico_com_retencao,
    pg_get_functiondef(to_regprocedure('public.begin_seller_store_catalog_worker_run(uuid,integer)')) ilike '%for update%' as configuracao_atomica,
    pg_get_functiondef(to_regprocedure('public.finish_seller_store_catalog_worker_run(uuid,boolean,jsonb,text,integer)')) ilike '%CATALOG_WORKER_CIRCUIT_BREAKER%' as circuit_breaker,
    pg_get_functiondef(to_regprocedure('public.finish_seller_store_catalog_worker_run(uuid,boolean,jsonb,text,integer)')) ilike '%octet_length%' as resumo_limitado,
    pg_get_functiondef(to_regprocedure('public.get_seller_store_catalog_health_admin()')) ilike '%public.is_admin()%' as saude_so_admin,
    pg_get_functiondef(to_regprocedure('public.update_seller_store_catalog_runtime_admin(boolean,integer,integer)')) ilike '%public.is_admin()%' as configuracao_so_admin,
    pg_get_functiondef(to_regprocedure('public.update_seller_store_catalog_runtime_admin(boolean,integer,integer)')) ilike '%Pause o processamento antes de alterar lote%' as ajuste_exige_pausa,
    pg_get_functiondef(to_regprocedure('public.list_seller_store_catalog_worker_runs_admin(integer)')) ilike '%public.is_admin()%' as historico_so_admin
),
privilege_checks as (
  select
    not has_table_privilege('anon', 'public.seller_store_catalog_runtime_settings', 'SELECT')
      and not has_table_privilege('authenticated', 'public.seller_store_catalog_runtime_settings', 'SELECT') as cliente_sem_configuracao,
    not has_table_privilege('anon', 'public.seller_store_catalog_worker_runs', 'SELECT')
      and not has_table_privilege('authenticated', 'public.seller_store_catalog_worker_runs', 'SELECT') as cliente_sem_execucoes,
    has_function_privilege('service_role', 'public.begin_seller_store_catalog_worker_run(uuid,integer)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.begin_seller_store_catalog_worker_run(uuid,integer)', 'EXECUTE') as inicio_so_worker,
    has_function_privilege('service_role', 'public.finish_seller_store_catalog_worker_run(uuid,boolean,jsonb,text,integer)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.finish_seller_store_catalog_worker_run(uuid,boolean,jsonb,text,integer)', 'EXECUTE') as fim_so_worker,
    has_function_privilege('authenticated', 'public.get_seller_store_catalog_health_admin()', 'EXECUTE') as admin_consulta_saude,
    has_function_privilege('authenticated', 'public.get_seller_store_catalog_availability()', 'EXECUTE') as usuario_consulta_disponibilidade
)
select
  table_checks.configuracao_criada,
  table_checks.execucoes_criadas,
  table_checks.configuracao_rls_forcada,
  table_checks.execucoes_rls_forcada,
  default_checks.nasce_desativado,
  function_checks.rpc_inicio,
  function_checks.rpc_fim,
  function_checks.rpc_saude,
  function_checks.rpc_configuracao,
  function_checks.rpc_historico,
  function_checks.rpc_disponibilidade,
  definition_checks.detecta_execucao_orfa,
  definition_checks.historico_com_retencao,
  definition_checks.configuracao_atomica,
  definition_checks.circuit_breaker,
  definition_checks.resumo_limitado,
  definition_checks.saude_so_admin,
  definition_checks.configuracao_so_admin,
  definition_checks.ajuste_exige_pausa,
  definition_checks.historico_so_admin,
  privilege_checks.cliente_sem_configuracao,
  privilege_checks.cliente_sem_execucoes,
  privilege_checks.inicio_so_worker,
  privilege_checks.fim_so_worker,
  privilege_checks.admin_consulta_saude,
  privilege_checks.usuario_consulta_disponibilidade
from table_checks
cross join default_checks
cross join function_checks
cross join definition_checks
cross join privilege_checks;
