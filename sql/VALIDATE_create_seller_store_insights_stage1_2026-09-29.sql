with table_checks as (
  select
    to_regclass('public.seller_store_insight_events') is not null as tabela_criada,
    to_regclass('public.seller_store_insight_retention_runs') is not null as historico_retencao_criado,
    coalesce((
      select classes.relrowsecurity and classes.relforcerowsecurity
      from pg_class classes
      where classes.oid = to_regclass('public.seller_store_insight_events')
    ), false) as rls_forcada
),
retention_table_checks as (
  select coalesce((
    select classes.relrowsecurity and classes.relforcerowsecurity
    from pg_class classes
    where classes.oid = to_regclass('public.seller_store_insight_retention_runs')
  ), false) as historico_retencao_rls_forcada
),
index_checks as (
  select
    coalesce(bool_or(indexname = 'idx_seller_store_insight_events_store_recent'), false) as indice_loja,
    coalesce(bool_or(indexname = 'idx_seller_store_insight_events_store_type_recent'), false) as indice_tipo,
    coalesce(bool_or(
      indexname = 'idx_seller_store_insight_events_five_minute_dedupe'
      and indexdef ilike '%unique%'
      and indexdef ilike '%dedupe_scope%'
    ), false) as deduplicacao_cinco_minutos
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'seller_store_insight_events'
),
function_checks as (
  select
    to_regprocedure('public.get_my_seller_store_insights_availability()') is not null as rpc_disponibilidade,
    to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)') is not null as rpc_evento_publico,
    to_regprocedure('public.record_seller_store_insight_system_event(uuid,text,uuid,uuid,uuid,text,timestamp with time zone)') is not null as rpc_evento_sistema,
    to_regprocedure('public.purge_seller_store_insight_events(integer)') is not null as rpc_retencao
),
definition_checks as (
  select
    pg_get_functiondef(to_regprocedure('public.seller_store_insights_has_active_plan(uuid)')) ilike '%plans.has_seller_store%' as exige_plano_loja,
    pg_get_functiondef(to_regprocedure('public.seller_store_insights_has_active_plan(uuid)')) ilike '%current_period_end > now()%' as exige_plano_vigente,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%auth.uid() = v_store.user_id%' as exclui_proprietario,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%interval ''1 minute''%' as limita_abuso,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%pg_advisory_xact_lock%'
      and pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%>= 60%' as limita_abuso_por_loja,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%/ 300%' as janela_deduplicacao,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%md5(v_store.id::text%' as sessao_anonimizada,
    pg_get_functiondef(to_regprocedure('public.purge_seller_store_insight_events(integer)')) ilike '%180%' as retencao_180_dias
),
privacy_checks as (
  select count(*) = 0 as sem_dados_sensiveis
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'seller_store_insight_events'
    and column_name in (
      'ip_address', 'user_agent', 'referrer', 'metadata', 'email', 'whatsapp', 'actor_user_id'
    )
),
policy_checks as (
  select count(*) = 0 as tabela_sem_policy_browser
  from pg_policies
  where schemaname = 'public'
    and tablename = 'seller_store_insight_events'
),
privilege_checks as (
  select
    not has_table_privilege('anon', 'public.seller_store_insight_events', 'SELECT')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_events', 'SELECT') as cliente_sem_leitura,
    not has_table_privilege('anon', 'public.seller_store_insight_events', 'INSERT')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_events', 'INSERT')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_events', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_events', 'DELETE') as cliente_sem_escrita,
    has_table_privilege('service_role', 'public.seller_store_insight_events', 'SELECT')
      and has_table_privilege('service_role', 'public.seller_store_insight_events', 'INSERT')
      and has_table_privilege('service_role', 'public.seller_store_insight_events', 'DELETE') as service_role_controla_tabela,
    has_function_privilege('anon', 'public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)', 'EXECUTE') as browser_registra_por_rpc,
    has_function_privilege('authenticated', 'public.get_my_seller_store_insights_availability()', 'EXECUTE')
      and not has_function_privilege('anon', 'public.get_my_seller_store_insights_availability()', 'EXECUTE') as disponibilidade_so_autenticado,
    has_function_privilege('service_role', 'public.record_seller_store_insight_system_event(uuid,text,uuid,uuid,uuid,text,timestamp with time zone)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.record_seller_store_insight_system_event(uuid,text,uuid,uuid,uuid,text,timestamp with time zone)', 'EXECUTE') as evento_sistema_so_service_role,
    has_function_privilege('service_role', 'public.purge_seller_store_insight_events(integer)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.purge_seller_store_insight_events(integer)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.purge_seller_store_insight_events(integer)', 'EXECUTE') as retencao_so_service_role,
    has_table_privilege('service_role', 'public.seller_store_insight_retention_runs', 'SELECT')
      and has_table_privilege('service_role', 'public.seller_store_insight_retention_runs', 'INSERT')
      and not has_table_privilege('anon', 'public.seller_store_insight_retention_runs', 'SELECT')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_retention_runs', 'SELECT') as historico_retencao_privado
)
select
  table_checks.tabela_criada,
  table_checks.historico_retencao_criado,
  table_checks.rls_forcada,
  retention_table_checks.historico_retencao_rls_forcada,
  index_checks.indice_loja,
  index_checks.indice_tipo,
  index_checks.deduplicacao_cinco_minutos,
  function_checks.rpc_disponibilidade,
  function_checks.rpc_evento_publico,
  function_checks.rpc_evento_sistema,
  function_checks.rpc_retencao,
  definition_checks.exige_plano_loja,
  definition_checks.exige_plano_vigente,
  definition_checks.exclui_proprietario,
  definition_checks.limita_abuso,
  definition_checks.limita_abuso_por_loja,
  definition_checks.janela_deduplicacao,
  definition_checks.sessao_anonimizada,
  definition_checks.retencao_180_dias,
  privacy_checks.sem_dados_sensiveis,
  policy_checks.tabela_sem_policy_browser,
  privilege_checks.cliente_sem_leitura,
  privilege_checks.cliente_sem_escrita,
  privilege_checks.service_role_controla_tabela,
  privilege_checks.browser_registra_por_rpc,
  privilege_checks.disponibilidade_so_autenticado,
  privilege_checks.evento_sistema_so_service_role,
  privilege_checks.retencao_so_service_role,
  privilege_checks.historico_retencao_privado
from table_checks
cross join retention_table_checks
cross join index_checks
cross join function_checks
cross join definition_checks
cross join privacy_checks
cross join policy_checks
cross join privilege_checks;
