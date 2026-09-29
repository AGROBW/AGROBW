with object_checks as (
  select
    to_regclass('public.seller_store_insight_events') is not null as tabela_eventos,
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
      and not has_function_privilege('anon', 'public.get_my_seller_store_insights(integer,integer)', 'EXECUTE') as painel_so_autenticado
),
contract_checks as (
  select
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%p_period_days not in (7, 30, 90)%' as periodos_fixos,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%seller_store_insights_has_active_plan%' as exige_plano_loja,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%America/Sao_Paulo%' as fuso_civil,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%count(distinct views.session_id)%' as visitas_unicas,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%topAnnouncements%' as ranking_anuncios,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%catalog_qr_open%' as qr_validado,
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
    ), false) as tipos_completos
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
    count(*) filter (where events.occurred_at < now() - interval '180 days') = 0 as retencao_em_dia,
    count(*) filter (
      where events.event_type = 'catalog_qr_open'
        and (events.catalog_export_id is null or events.announcement_id is null)
    ) = 0 as qr_sem_referencia_invalida,
    count(*) filter (
      where events.event_type in ('catalog_generated', 'catalog_download')
        and events.catalog_export_id is null
    ) = 0 as catalogo_sem_referencia_invalida,
    count(*) filter (where events.occurred_at >= now() - interval '24 hours') as eventos_24h,
    count(*) filter (
      where events.event_type in ('contact_whatsapp', 'contact_platform')
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
)
select
  object_checks.tabela_eventos
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
  contract_checks.periodos_fixos,
  contract_checks.exige_plano_loja,
  contract_checks.fuso_civil,
  contract_checks.visitas_unicas,
  contract_checks.ranking_anuncios,
  contract_checks.qr_validado,
  contract_checks.eventos_catalogo_protegidos,
  schema_checks.tipos_completos,
  privacy_checks.sem_dados_sensiveis,
  data_checks.retencao_em_dia,
  data_checks.qr_sem_referencia_invalida,
  data_checks.catalogo_sem_referencia_invalida,
  data_checks.eventos_24h,
  data_checks.contatos_24h,
  data_checks.catalogos_gerados_24h,
  data_checks.downloads_24h,
  data_checks.qr_abertos_24h,
  data_checks.ultimo_evento
from object_checks
cross join security_checks
cross join contract_checks
cross join schema_checks
cross join privacy_checks
cross join data_checks;
