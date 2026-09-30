with function_checks as (
  select
    to_regprocedure('public.get_my_seller_store_insights(integer,integer)') is not null as rpc_agregacao,
    to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)') is not null as rpc_evento_atualizada
),
definition_checks as (
  select
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%p_period_days not in (7, 30, 90)%' as periodos_limitados,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%seller_store_insights_has_active_plan%' as exige_plano_loja,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%stores.user_id = v_user_id%' as isola_proprietario,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%America/Sao_Paulo%' as fuso_civil,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%count(distinct views.session_id)%' as visitas_unicas,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%views.user_id is distinct from v_user_id%' as exclui_visita_proprietario,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%store_visit_attribution%' as origem_normalizada,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%previousStart%' as compara_periodo_anterior,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%topAnnouncements%' as ranking_anuncios,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%generate_series%' as serie_diaria,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%store_visit_attribution%' as registra_origem_visita,
    pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%pg_advisory_xact_lock%'
      and pg_get_functiondef(to_regprocedure('public.record_seller_store_insight_event(text,text,text,uuid,uuid,uuid,text)')) ilike '%>= 60%' as limite_global_loja,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%current_converted_visitors%' as conversao_intersecta_visitantes,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%announcement_open'', ''catalog_qr_open%' as qr_conta_como_abertura,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%contact_whatsapp'', ''contact_platform%' as contatos_corretos,
    pg_get_functiondef(to_regprocedure('public.get_my_seller_store_insights(integer,integer)')) ilike '%having count(*) filter%' as ranking_sem_interacao_vazia
),
constraint_checks as (
  select coalesce(bool_or(
    constraints.conname = 'seller_store_insight_events_type_check'
    and pg_get_constraintdef(constraints.oid) ilike '%store_visit_attribution%'
  ), false) as tipo_origem_criado
  from pg_constraint constraints
  where constraints.conrelid = to_regclass('public.seller_store_insight_events')
),
index_checks as (
  select coalesce(bool_or(
    indexes.indexname = 'idx_site_page_views_storefront_entity_created'
    and indexes.indexdef ilike '%entity_key%created_at%session_id%'
  ), false) as indice_visitas_loja
  from pg_indexes indexes
  where indexes.schemaname = 'public'
    and indexes.tablename = 'site_page_views'
),
privilege_checks as (
  select
    has_function_privilege('authenticated', 'public.get_my_seller_store_insights(integer,integer)', 'EXECUTE') as autenticado_consulta,
    not has_function_privilege('anon', 'public.get_my_seller_store_insights(integer,integer)', 'EXECUTE') as anon_sem_consulta,
    not has_table_privilege('authenticated', 'public.seller_store_insight_events', 'SELECT') as eventos_continuam_privados
)
select
  function_checks.rpc_agregacao,
  function_checks.rpc_evento_atualizada,
  constraint_checks.tipo_origem_criado,
  index_checks.indice_visitas_loja,
  definition_checks.periodos_limitados,
  definition_checks.exige_plano_loja,
  definition_checks.isola_proprietario,
  definition_checks.fuso_civil,
  definition_checks.visitas_unicas,
  definition_checks.exclui_visita_proprietario,
  definition_checks.origem_normalizada,
  definition_checks.compara_periodo_anterior,
  definition_checks.ranking_anuncios,
  definition_checks.serie_diaria,
  definition_checks.registra_origem_visita,
  definition_checks.limite_global_loja,
  definition_checks.conversao_intersecta_visitantes,
  definition_checks.qr_conta_como_abertura,
  definition_checks.contatos_corretos,
  definition_checks.ranking_sem_interacao_vazia,
  privilege_checks.autenticado_consulta,
  privilege_checks.anon_sem_consulta,
  privilege_checks.eventos_continuam_privados
from function_checks
cross join definition_checks
cross join constraint_checks
cross join index_checks
cross join privilege_checks;
