-- =====================================================================
-- SECURITY FIX — R2 (B-01): Default privileges + revoke anon + allowlist
-- Data: 2026-06-08
-- =====================================================================
-- Causa raiz: ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon ->
-- TODA função em public nasce executável por anon (250 funções), incluindo
-- admin/PII/IDOR. Aqui:
--   1) paramos a herança (futuro);
--   2) revogamos EXECUTE de anon/public em TODAS as funções existentes;
--   3) reconcedemos a anon SOMENTE o allowlist público (uso real sem login).
-- `authenticated` e `service_role` permanecem (defesa por guarda interna).
-- Fase 2 (futura, opcional): repetir o padrão tighten p/ authenticated.
--
-- NÃO aplicar automaticamente. Transacional. Faça SMOKE TEST das páginas públicas
-- após aplicar (cadastro, contato, listagem, vitrine, sponsor landing).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Parar a herança (objetos FUTUROS não saem mais abertos a anon/public)
-- ---------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------
-- 2. Revogar EXECUTE de anon e public em TODAS as funções existentes
--    (mantém authenticated e service_role)
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;

-- ---------------------------------------------------------------------
-- 3. Reconceder a anon SOMENTE o allowlist público (derivado do uso real
--    do frontend sem sessão). Concede em todos os overloads de cada nome.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  allow text[] := array[
    -- formulários/ações públicas
    'submit_contact_message',
    'subscribe_newsletter',
    'record_my_contact_legal_consents',
    -- signup (executado por anon durante cadastro)
    'set_default_signup_plan',
    -- analytics/telemetria pública
    'record_site_page_view',
    'touch_site_presence',
    'record_site_sponsor_impression',
    'record_site_sponsor_click',
    'register_click_by_state',
    'log_public_search',
    -- leitura pública / vitrine / convites
    'get_public_category_ranking_settings',
    'get_public_sponsor_landing_stats',
    'get_category_showcase_impression_stats',
    'get_home_showcase_impression_stats',
    'get_checkout_gateway_public_safe',
    'register_invite_visit',
    'resolve_public_invite_campaign',
    'is_document_available',
    -- leitura pública adicional (home/categorias/vitrine/about) — fix regressão 2026-06-08
    'get_server_now',
    'get_public_home_carousel_sponsors',
    'get_top_public_searches',
    'get_public_active_plan_signals',
    'get_public_announcement_engagement_signals',
    'get_public_about_stats',
    'get_public_active_site_sponsors',
    'increment_ad_views',
    'get_announcement_report_snapshot',
    -- utilitário puro
    'calculate_distance_km'
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
-- -- A) Quantas funções anon ainda executa? (esperado: só o allowlist)
-- select count(*) as anon_exec_funcs
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and has_function_privilege('anon', p.oid, 'EXECUTE');
--
-- -- B) Listar quais (conferir = allowlist):
-- select p.proname
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and has_function_privilege('anon', p.oid, 'EXECUTE')
-- order by 1;
--
-- -- C) Default privileges não concede mais a anon:
-- select defaclrole::regrole, defaclacl
-- from pg_default_acl where defaclnamespace='public'::regnamespace and defaclobjtype='f';
--
-- SMOKE TEST (anon, no app): cadastro, contato, newsletter, listagem de anúncios,
--   vitrine/loja, sponsor landing, analytics de visita. Admin (autenticado) intacto.
-- ROLLBACK: re-grant pontual `grant execute on function public.<fn>(<args>) to anon;`
--   ou re-aplicar o GRANT default se precisar reverter amplamente.
-- =====================================================================
