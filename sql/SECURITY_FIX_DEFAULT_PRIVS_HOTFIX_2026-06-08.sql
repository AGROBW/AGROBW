-- =====================================================================
-- R2 — HOTFIX: restaurar EXECUTE p/ anon das RPCs PÚBLICAS faltantes
-- Data: 2026-06-08
-- =====================================================================
-- O allowlist do R2 (SECURITY_FIX_DEFAULT_PRIVS) ficou incompleto: páginas
-- públicas chamam, como anon, funções de leitura pública que não foram
-- reconcedidas -> quebrou anúncios públicos, contagem de categorias e carrossel
-- da home. Este hotfix reconcede SOMENTE funções de DADO PÚBLICO/telemetria,
-- sem reabrir nada sensível (admin_*, get_my_*, get_dashboard_stats,
-- get_site_analytics_*, ensure_user_current_subscription, etc. permanecem
-- revogadas de anon).
--
-- Verificado no schema: todas abaixo são SECURITY DEFINER SEM guarda de admin
-- (o "is_admin" em get_public_announcement_engagement_signals é o filtro de
-- coluna spv.is_admin_area = false, não autorização). Funcionavam para anon
-- antes do R2.
--
-- NÃO aplicar automaticamente. Transacional + idempotente.
-- =====================================================================

begin;

do $$
declare
  r record;
  allow text[] := array[
    -- ----- públicas FALTANTES (causa da regressão) -----
    'get_server_now',
    'get_public_home_carousel_sponsors',
    'get_top_public_searches',
    'get_public_active_plan_signals',
    'get_public_announcement_engagement_signals',
    'get_public_about_stats',
    'get_public_active_site_sponsors',
    'increment_ad_views',
    -- ----- públicas já previstas (reafirmadas p/ idempotência) -----
    'get_public_category_ranking_settings',
    'get_public_sponsor_landing_stats',
    'get_category_showcase_impression_stats',
    'get_home_showcase_impression_stats',
    'get_checkout_gateway_public_safe',
    'log_public_search',
    'record_site_page_view',
    'touch_site_presence',
    'record_site_sponsor_impression',
    'record_site_sponsor_click',
    'register_click_by_state',
    'register_invite_visit',
    'resolve_public_invite_campaign',
    'is_document_available',
    'calculate_distance_km',
    'submit_contact_message',
    'subscribe_newsletter',
    'record_my_contact_legal_consents',
    'set_default_signup_plan'
  ];
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(allow)
  loop
    execute format('grant execute on function %s to anon', r.oid::regprocedure);
  end loop;
end $$;

commit;

-- =====================================================================
-- VERIFICAÇÃO
-- =====================================================================
-- -- A) as públicas faltantes agora são executáveis por anon:
-- select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.proname in
--   ('get_server_now','get_public_home_carousel_sponsors','get_top_public_searches',
--    'get_public_active_plan_signals','get_public_announcement_engagement_signals',
--    'get_public_about_stats','get_public_active_site_sponsors','increment_ad_views')
-- order by 1;   -- todos anon_exec = true
--
-- -- B) SENSÍVEIS continuam REVOGADAS de anon (deve dar false):
-- select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.proname in
--   ('get_user_stats','get_dashboard_stats','get_admin_security_overview',
--    'admin_list_moderation_queue_announcements','ensure_user_current_subscription',
--    'get_active_subscription','register_admin_login_attempt','get_site_analytics_summary')
-- order by 1;   -- todos anon_exec = false
-- =====================================================================
