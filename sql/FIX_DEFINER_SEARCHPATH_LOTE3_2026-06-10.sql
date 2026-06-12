-- =====================================================================
-- LOTE 3 (hardening) — SET search_path nas definers com authz já correta/pública
-- Data: 2026-06-10 | NÃO reescreve corpo (ALTER FUNCTION SET search_path).
-- =====================================================================
-- Estas funções têm authz adequada (auth.uid()/owner/admin) ou são públicas por
-- design (contadores/telemetria). Falta apenas fixar search_path (anti-hijack) —
-- dívida de hardening, não vuln ativa. ALTER FUNCTION é mínimo e idempotente.
-- =====================================================================

begin;

-- authz já correta (escopo próprio / owner|admin)
alter function public.get_dashboard_stats()                 set search_path = public;
alter function public.get_dashboard_stats(uuid)             set search_path = public;
alter function public.cancel_subscription(uuid)             set search_path = public;
alter function public.log_checkout_attempt(uuid, text, numeric) set search_path = public;
alter function public.reset_unread_count()                  set search_path = public;  -- trigger
alter function public.has_active_subscription(uuid)         set search_path = public;

-- públicas por design (contador/telemetria) — sem authz por intenção
alter function public.increment_ad_views(uuid)             set search_path = public;
alter function public.register_click_by_state(uuid, character varying) set search_path = public;

-- IDOR teórico de baixa sensibilidade (retorna só is_seller + first_ad_at)
alter function public.get_user_stats(uuid)                 set search_path = public;
-- OPCIONAL (não incluso): guarda owner/admin em get_user_stats, se quiser fechar o
-- IDOR teórico:
--   if auth.uid() is not null and auth.uid() <> user_uuid and not public.is_admin()
--   then raise exception 'Unauthorized'; end if;   (exige CREATE OR REPLACE do corpo)

commit;

-- =====================================================================
-- VALIDAÇÃO:
--   Todas continuam funcionando nos fluxos atuais (dashboard, cancelamento,
--   checkout log, contador de views, clique por estado, etc.).
--   proconfig mostra search_path=public em cada uma:
--     select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.proname in
--      ('get_dashboard_stats','cancel_subscription','log_checkout_attempt',
--       'reset_unread_count','has_active_subscription','increment_ad_views',
--       'register_click_by_state','get_user_stats');
-- ROLLBACK (por função): alter function public.<nome>(<args>) reset search_path;
-- =====================================================================
