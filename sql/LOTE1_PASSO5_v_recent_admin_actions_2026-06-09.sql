-- =====================================================================
-- LOTE 1 — PASSO 5 (ordem) — v_recent_admin_actions
-- security_invoker + revogar anon
-- Data: 2026-06-09
-- =====================================================================
-- View de auditoria admin, lida pelo painel (pages/admin/AuditLogs.tsx) como
-- authenticated. Hoje é owner-rights -> qualquer authenticated leria ações admin.
-- Base admin_audit_logs já tem SELECT admin-only -> ligar security_invoker faz a
-- RLS-base valer (admin vê tudo; não-admin vê []). authenticated mantém grant.
-- ALTER VIEW SET security_invoker NÃO reescreve a projeção (mínimo, sem risco).
-- =====================================================================

alter view public.v_recent_admin_actions set (security_invoker = true);
revoke all on table public.v_recent_admin_actions from anon;

-- VALIDAÇÃO:
--   admin no painel AuditLogs: lista normal (não vazia)
--   authenticated comum: select * from public.v_recent_admin_actions; -> [] (sem erro)
--   anon: NEGADO
--   reloptions confirma security_invoker=true:
--     select c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
--     where n.nspname='public' and c.relname='v_recent_admin_actions';
--
-- ROLLBACK:
--   alter view public.v_recent_admin_actions set (security_invoker = false);
--   grant select on public.v_recent_admin_actions to anon;  -- se necessário
-- =====================================================================
