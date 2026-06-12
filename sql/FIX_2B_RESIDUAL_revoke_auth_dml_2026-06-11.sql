-- =====================================================================
-- 2B-RESIDUAL (item 7) — revogar DML de authenticated em tabelas service/RPC-only
-- Data: 2026-06-11 | Defesa-em-profundidade (RLS já protege; nenhuma escrita
-- direta do cliente). Mantém SELECT (há leitura direta legítima em algumas).
-- =====================================================================
-- VERIFICADO: todos os writers dessas tabelas são SECURITY DEFINER (rodam como
-- owner -> ignoram o grant de authenticated) OU edge/service_role. Nenhum writer
-- INVOKER dispara durante ação direta do usuário. Logo revogar INSERT/UPDATE/DELETE
-- de authenticated NÃO quebra os fluxos legítimos (RPCs/triggers definer + webhooks).
-- Writers confirmados (DEFINER): register_announcement_similarity_cooldown,
--   apply_announcement_highlight, register_highlight_booster_purchase,
--   redeem_promotion_plan_code, ensure_user_current_subscription, assign_start_agro_plan,
--   delete_announcement_with_relations, expire_elapsed_announcements, admin_* highlight,
--   log_admin_action (admin_audit_logs), CI RPCs (commercial_intelligence_*).
-- (anon incluído por idempotência/defesa; já tratado no 2B Fase 2A/2B.)
-- =====================================================================

begin;

-- Grupo A — auditoria (escrita só via RPC definer log_admin_action; SELECT mantido p/ v_recent_admin_actions security_invoker)
revoke insert, update, delete on public.admin_audit_logs from anon, authenticated;

-- Grupo B — internals de anúncio (triggers/RPCs definer + edge)
revoke insert, update, delete on public.announcement_highlights_history   from anon, authenticated;
revoke insert, update, delete on public.announcement_metrics              from anon, authenticated;
revoke insert, update, delete on public.announcement_similarity_cooldowns from anon, authenticated;

-- Grupo C — commercial intelligence (escrita só via RPCs definer)
revoke insert, update, delete on public.commercial_intelligence_contact_shares        from anon, authenticated;
revoke insert, update, delete on public.commercial_intelligence_conversation_messages from anon, authenticated;
revoke insert, update, delete on public.commercial_intelligence_conversations         from anon, authenticated;
revoke insert, update, delete on public.commercial_intelligence_interest_responses    from anon, authenticated;
revoke insert, update, delete on public.commercial_intelligence_outreach_campaigns    from anon, authenticated;
revoke insert, update, delete on public.commercial_intelligence_outreach_deliveries   from anon, authenticated;
revoke insert, update, delete on public.commercial_intelligence_requests              from anon, authenticated;

-- Grupo D — financeiro/créditos (RPC definer + checkout/webhook service_role)
revoke insert, update, delete on public.promotion_plan_redemptions        from anon, authenticated;
revoke insert, update, delete on public.user_subscriptions                from anon, authenticated;
revoke insert, update, delete on public.user_highlight_booster_purchases  from anon, authenticated;

commit;

-- =====================================================================
-- VALIDAÇÃO (por grupo) — fluxos legítimos devem seguir OK (definer/service):
--   A: painel AuditLogs lista (v_recent_admin_actions security_invoker lê base) ->
--      authenticated SELECT preservado; log_admin_action (definer) continua inserindo.
--   B: criar/editar anúncio dispara cooldown/metrics via triggers definer -> OK;
--      aplicar/expirar destaque (apply/admin) -> OK; excluir anúncio (definer) -> OK.
--   C: gerar relatório / outreach / conversas / contact share via RPCs -> OK;
--      leitura direta de requests/outreach_campaigns no painel -> OK (SELECT mantido).
--   D: checkout + webhook-asaas (service_role) ativam assinatura/creditam booster -> OK;
--      resgate de código promocional via redeem_promotion_plan_code -> OK;
--      admin_update_user_plan_period (definer) -> OK.
--   ABUSO: usuário comum tenta PATCH/POST/DELETE direto em qualquer dessas tabelas
--      via PostgREST -> NEGADO (sem grant; antes era gateado só por RLS).
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema='public' and grantee in ('anon','authenticated')
--     and privilege_type in ('INSERT','UPDATE','DELETE')
--     and table_name in (<as 14 tabelas>);  -> esperado 0 linhas.
-- ROLLBACK: grant insert, update, delete on public.<tabela> to authenticated; (por tabela)
-- =====================================================================
