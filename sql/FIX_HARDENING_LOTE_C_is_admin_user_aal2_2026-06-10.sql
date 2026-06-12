-- =====================================================================
-- LOTE C (hardening aal2) — alinhar is_admin_user() ao padrão public.is_admin()
-- Data: 2026-06-10
-- =====================================================================
-- PROBLEMA: is_admin() e site_analytics_is_admin() exigem aal2 (MFA); is_admin_user()
-- NÃO exige (só is_admin=true OR role='admin'). Callers vivos de is_admin_user()
-- (confirmado por pg_policies): policies ADMIN de 5 tabelas de patrocinador
--   site_sponsors, site_sponsor_impressions, site_sponsor_clicks,
--   sponsor_metric_email_jobs, sponsor_metric_email_dispatch_logs
-- -> admin podia operar essas tabelas SEM MFA. O caminho público (anon INSERT de
--    impressões/cliques) usa policies SEPARADAS e NÃO depende de is_admin_user().
--
-- FIX MÍNIMO: redefinir is_admin_user() como ALIAS de public.is_admin() -> herda
-- aal2 automaticamente e vira fonte única (sem duplicar regra). Assinatura/retorno
-- preservados; nenhuma policy precisa mudar.
--
-- ⚠️ Validar corpo vivo antes (dump 2026-06-07):
--   select pg_get_functiondef('public.is_admin_user()'::regprocedure);
-- =====================================================================

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin()
$$;

-- =====================================================================
-- VALIDAÇÃO:
--   admin COM MFA (aal2): SponsorsManagement -> ler/criar/editar/excluir patrocinador,
--     ler cliques/impressões, gerenciar jobs de métrica -> OK.
--   admin SEM aal2 (aal1): essas operações -> NEGADAS (antes eram permitidas).
--   authenticated não-admin: negado (igual antes).
--   anon: telemetria (INSERT impressões/cliques) -> INALTERADA (policies separadas).
--   exibição PÚBLICA de patrocinadores ativos (RPC/política pública) -> INALTERADA
--     (não usa is_admin_user()). Conferir SiteSponsorShowcase no smoke.
-- ROLLBACK: re-aplicar a versão anterior de is_admin_user() (sem aal2) — capturar
--   antes com pg_get_functiondef.
-- =====================================================================
