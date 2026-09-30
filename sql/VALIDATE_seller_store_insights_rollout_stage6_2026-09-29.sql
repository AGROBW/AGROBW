with object_checks as (
  select
    to_regclass('public.seller_store_insight_events') is not null as tabela_eventos,
    to_regclass('public.seller_store_insight_retention_runs') is not null as historico_retencao,
    to_regclass('public.seller_store_insight_rate_limit_windows') is not null as observabilidade_limite,
    to_regclass('public.site_page_views') is not null as tabela_visitas,
    to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)') is not null as rpc_browser,
    to_regprocedure('public.record_seller_store_insight_system_event(uuid,text,uuid,uuid,uuid,text,timestamp with time zone)') is not null as rpc_sistema,
    to_regprocedure('public.get_my_seller_store_insights(integer,integer)') is not null as rpc_agregacao,
    to_regprocedure('public.purge_seller_store_insight_events(integer)') is not null as rpc_retencao
),
security_checks as (
  select
    coalesce((
      select classes.relrowsecurity and classes.relforcerowsecurity
      from pg_class classes
      where classes.oid = to_regclass('public.seller_store_insight_events')
    ), false) as rls_forcada,
    not has_table_privilege('anon', 'public.seller_store_insight_events', 'SELECT')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_events', 'SELECT') as eventos_privados,
    not has_table_privilege('anon', 'public.seller_store_insight_events', 'INSERT')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_events', 'INSERT')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_events', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_events', 'DELETE') as cliente_sem_escrita_direta,
    has_function_privilege('anon', 'public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)', 'EXECUTE') as browser_so_por_rpc,
    has_function_privilege('service_role', 'public.record_seller_store_insight_system_event(uuid,text,uuid,uuid,uuid,text,timestamp with time zone)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.record_seller_store_insight_system_event(uuid,text,uuid,uuid,uuid,text,timestamp with time zone)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.record_seller_store_insight_system_event(uuid,text,uuid,uuid,uuid,text,timestamp with time zone)', 'EXECUTE') as evento_sistema_protegido,
    has_function_privilege('authenticated', 'public.get_my_seller_store_insights(integer,integer)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.get_my_seller_store_insights(integer,integer)', 'EXECUTE') as painel_so_autenticado,
    has_function_privilege('service_role', 'public.purge_seller_store_insight_events(integer)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.purge_seller_store_insight_events(integer)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.purge_seller_store_insight_events(integer)', 'EXECUTE') as retencao_so_service_role,
    not has_table_privilege('anon', 'public.seller_store_insight_retention_runs', 'SELECT')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_retention_runs', 'SELECT') as historico_retencao_privado,
    has_table_privilege('service_role', 'public.seller_store_insight_rate_limit_windows', 'SELECT')
      and not has_table_privilege('anon', 'public.seller_store_insight_rate_limit_windows', 'SELECT')
      and not has_table_privilege('authenticated', 'public.seller_store_insight_rate_limit_windows', 'SELECT') as observabilidade_limite_privada
),
contract_checks as (
  select
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%p_period_days not in (7, 30, 90)%' as periodos_fixos,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%seller_store_insights_has_active_plan%' as exige_plano_loja,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%America/Sao_Paulo%' as fuso_civil,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%count(distinct views.session_id)%' as visitas_unicas,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%topAnnouncements%' as ranking_anuncios,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%catalog_qr_open%' as qr_validado,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%pg_advisory_xact_lock%'
      and pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%>= 60%' as limite_global_loja,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%dedupe_scope%'
      and pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%seller_store_insight_rate_limit_windows%' as escrita_browser_completa,
    exists (
      select 1
      from pg_indexes indexes
      where indexes.schemaname = 'public'
        and indexes.tablename = 'seller_store_insight_events'
        and indexes.indexname = 'idx_seller_store_insight_events_store_created'
        and indexes.indexdef ilike '%store_id%created_at%'
    ) as indice_limite_global,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%current_converted_visitors%' as conversao_intersecta_visitantes,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_system_event(uuid,text,uuid,uuid,uuid,text,timestamp with time zone)')) ilike '%catalog_generated%'
      and pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_system_event(uuid,text,uuid,uuid,uuid,text,timestamp with time zone)')) ilike '%catalog_download%' as eventos_catalogo_protegidos
),
schema_checks as (
  select
    coalesce(bool_or(
      constraints.conname = 'seller_store_insight_events_type_check'
      and pg_get_constraintdef(constraints.oid) ilike '%store_visit_attribution%'
      and pg_get_constraintdef(constraints.oid) ilike '%catalog_qr_open%'
      and pg_get_constraintdef(constraints.oid) ilike '%catalog_generated%'
      and pg_get_constraintdef(constraints.oid) ilike '%catalog_download%'
    ), false) as tipos_completos,
    exists (
      select 1
      from information_schema.columns columns
      where columns.table_schema = 'public'
        and columns.table_name = 'seller_store_insight_events'
        and columns.column_name = 'dedupe_scope'
        and columns.is_nullable = 'NO'
    ) as escopo_deduplicacao_imutavel
  from pg_constraint constraints
  where constraints.conrelid = to_regclass('public.seller_store_insight_events')
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
data_checks as (
  select
    count(*) filter (where events.created_at < now() - interval '180 days') = 0 as retencao_em_dia,
    count(*) filter (
      where events.event_type = 'catalog_qr_open'
        and (events.catalog_export_id is null or events.announcement_id is null)
    ) = 0 as qr_sem_referencia_invalida,
    count(*) filter (
      where events.event_type in ('catalog_generated', 'catalog_download')
        and events.catalog_export_id is null
    ) = 0 as catalogo_sem_referencia_invalida,
    count(*) filter (
      where events.event_type in ('store_visit_attribution', 'website_click', 'store_share')
        and events.announcement_id is not null
    ) = 0 as associacoes_evento_validas,
    count(*) filter (where events.occurred_at >= now() - interval '24 hours') as eventos_24h,
    count(*) filter (
      where events.event_type = 'contact_platform'
        and events.occurred_at >= now() - interval '24 hours'
    ) as contatos_24h,
    count(*) filter (
      where events.event_type = 'catalog_generated'
        and events.occurred_at >= now() - interval '24 hours'
    ) as catalogos_gerados_24h,
    count(*) filter (
      where events.event_type = 'catalog_download'
        and events.occurred_at >= now() - interval '24 hours'
    ) as downloads_24h,
    count(*) filter (
      where events.event_type = 'catalog_qr_open'
        and events.occurred_at >= now() - interval '24 hours'
    ) as qr_abertos_24h,
    max(events.occurred_at) as ultimo_evento
  from public.seller_store_insight_events events
),
retention_checks as (
  select
    coalesce(max(runs.completed_at) >= now() - interval '26 hours', false) as retencao_executada_recentemente,
    max(runs.completed_at) as ultima_retencao,
    coalesce((array_agg(runs.deleted_count order by runs.completed_at desc))[1], 0) as ultima_retencao_excluiu
  from public.seller_store_insight_retention_runs runs
)
select
  object_checks.tabela_eventos
    and object_checks.historico_retencao
    and object_checks.observabilidade_limite
    and object_checks.tabela_visitas
    and object_checks.rpc_browser
    and object_checks.rpc_sistema
    and object_checks.rpc_agregacao
    and object_checks.rpc_retencao as estrutura_completa,
  security_checks.rls_forcada,
  security_checks.eventos_privados,
  security_checks.cliente_sem_escrita_direta,
  security_checks.browser_so_por_rpc,
  security_checks.evento_sistema_protegido,
  security_checks.painel_so_autenticado,
  security_checks.retencao_so_service_role,
  security_checks.historico_retencao_privado,
  security_checks.observabilidade_limite_privada,
  contract_checks.periodos_fixos,
  contract_checks.exige_plano_loja,
  contract_checks.fuso_civil,
  contract_checks.visitas_unicas,
  contract_checks.ranking_anuncios,
  contract_checks.qr_validado,
  contract_checks.limite_global_loja,
  contract_checks.escrita_browser_completa,
  contract_checks.indice_limite_global,
  contract_checks.conversao_intersecta_visitantes,
  contract_checks.eventos_catalogo_protegidos,
  schema_checks.tipos_completos,
  schema_checks.escopo_deduplicacao_imutavel,
  privacy_checks.sem_dados_sensiveis,
  data_checks.retencao_em_dia,
  data_checks.qr_sem_referencia_invalida,
  data_checks.catalogo_sem_referencia_invalida,
  data_checks.associacoes_evento_validas,
  retention_checks.retencao_executada_recentemente,
  (
    object_checks.tabela_eventos
    and object_checks.historico_retencao
    and object_checks.observabilidade_limite
    and object_checks.tabela_visitas
    and object_checks.rpc_browser
    and object_checks.rpc_sistema
    and object_checks.rpc_agregacao
    and object_checks.rpc_retencao
    and security_checks.rls_forcada
    and security_checks.eventos_privados
    and security_checks.cliente_sem_escrita_direta
    and security_checks.evento_sistema_protegido
    and security_checks.painel_so_autenticado
    and security_checks.retencao_so_service_role
    and security_checks.historico_retencao_privado
    and security_checks.observabilidade_limite_privada
    and contract_checks.periodos_fixos
    and contract_checks.exige_plano_loja
    and contract_checks.fuso_civil
    and contract_checks.visitas_unicas
    and contract_checks.ranking_anuncios
    and contract_checks.qr_validado
    and contract_checks.limite_global_loja
    and contract_checks.escrita_browser_completa
    and contract_checks.indice_limite_global
    and contract_checks.conversao_intersecta_visitantes
    and contract_checks.eventos_catalogo_protegidos
    and schema_checks.tipos_completos
    and schema_checks.escopo_deduplicacao_imutavel
    and privacy_checks.sem_dados_sensiveis
    and data_checks.retencao_em_dia
    and data_checks.qr_sem_referencia_invalida
    and data_checks.catalogo_sem_referencia_invalida
    and data_checks.associacoes_evento_validas
    and retention_checks.retencao_executada_recentemente
  ) as pronto_para_operar,
  data_checks.eventos_24h,
  data_checks.contatos_24h,
  data_checks.catalogos_gerados_24h,
  data_checks.downloads_24h,
  data_checks.qr_abertos_24h,
  data_checks.ultimo_evento,
  retention_checks.ultima_retencao,
  retention_checks.ultima_retencao_excluiu,
  (
    select count(*)
    from public.seller_store_insight_rate_limit_windows windows
    where windows.window_started_at >= now() - interval '24 hours'
  ) as janelas_saturadas_24h
from object_checks
cross join security_checks
cross join contract_checks
cross join schema_checks
cross join privacy_checks
cross join data_checks
cross join retention_checks;
