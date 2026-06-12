-- =====================================================================
-- LOTE 1 (views owner-rights expostas) — security_invoker=on + revoke anon
-- Data: 2026-06-10
-- =====================================================================
-- Views owner-rights (security_invoker=false) que IGNORAM a RLS das bases e expõem
-- analytics admin/negócio/IP/PII por usuário a anon/authenticated. Bases têm RLS on,
-- então ligar security_invoker faz a view HERDAR a RLS-base:
--   - bases admin-only (admin_audit_logs, security_events, site_popup_events,
--     subscription_history): não-admin/anon passam a ver [].
--   - bases por-usuário (users/user_subscriptions): cada um vê só o próprio.
-- Mesma técnica já validada em v_recent_admin_actions / chats_full (Lote 1 anterior).
-- ALTER VIEW SET NÃO reescreve a projeção (mínimo, sem risco). revoke anon = higiene.
-- v_radar_stats NÃO entra (já tem security_invoker=on — confirmado no vivo).
-- Consumidores legítimos preservados: AuditLogs.tsx (admin), useSitePopups (admin),
--   dashboards admin (authenticated+RLS).
-- =====================================================================

begin;

-- analytics admin / segurança
alter view public.v_security_stats          set (security_invoker = on);
alter view public.v_admin_action_stats      set (security_invoker = on);
alter view public.site_popup_metrics        set (security_invoker = on);

-- uso por usuário (PII)
alter view public.v_user_usage              set (security_invoker = on);

-- financeiro / negócio
alter view public.v_mrr_monthly             set (security_invoker = on);
alter view public.v_revenue_by_plan         set (security_invoker = on);
alter view public.v_cac_monthly             set (security_invoker = on);
alter view public.v_churn_monthly           set (security_invoker = on);
alter view public.v_customer_churn_30d      set (security_invoker = on);
alter view public.v_free_to_paid_conversion set (security_invoker = on);
alter view public.v_lead_conversion_rate    set (security_invoker = on);
alter view public.v_paid_conversion_30d     set (security_invoker = on);
alter view public.v_registration_conversion_30d set (security_invoker = on);

-- higiene: remover SELECT de anon nestas (nenhuma tem consumidor anônimo legítimo)
revoke select on public.v_security_stats          from anon;
revoke select on public.v_admin_action_stats      from anon;
revoke select on public.site_popup_metrics        from anon;
revoke select on public.v_user_usage              from anon;
revoke select on public.v_mrr_monthly             from anon;
revoke select on public.v_revenue_by_plan         from anon;
revoke select on public.v_cac_monthly             from anon;
revoke select on public.v_churn_monthly           from anon;
revoke select on public.v_customer_churn_30d      from anon;
revoke select on public.v_free_to_paid_conversion from anon;
revoke select on public.v_lead_conversion_rate    from anon;
revoke select on public.v_paid_conversion_30d     from anon;
revoke select on public.v_registration_conversion_30d from anon;

commit;

-- =====================================================================
-- VALIDAÇÃO:
--   anon: select em qualquer das views -> negado / [].
--   authenticated NÃO-admin: analytics admin/financeiro -> [] (RLS-base admin-only);
--     v_user_usage -> só a própria linha.
--   admin (aal2): AuditLogs (v_admin_action_stats) e dashboards financeiros -> dados completos.
--   admin: painel de popups (site_popup_metrics) -> métricas corretas.
--   reloptions confirma security_invoker=on:
--     select relname, reloptions from pg_class
--     where relname in ('v_security_stats','v_user_usage','v_mrr_monthly', ...);
-- ROLLBACK (por view): alter view public.<v> set (security_invoker = off);
--   grant select on public.<v> to anon;   -- se necessário
-- =====================================================================
