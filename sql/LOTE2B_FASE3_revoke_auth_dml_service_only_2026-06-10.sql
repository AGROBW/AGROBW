-- =====================================================================
-- LOTE 2B — FASE 3 — revogar DML de AUTHENTICATED em tabelas SERVICE-ONLY
-- Data: 2026-06-10 | RISCO MÉDIO-BAIXO (conservador). Só tabelas SEM nenhuma
-- escrita pelo cliente (mapeado por grep): populadas por edge/service_role/trigger.
-- =====================================================================
-- NÃO inclui tabelas escritas por admin/usuário no cliente (essas a RLS já gateia):
--   PRESERVADAS p/ ex.: plan_alert_email_jobs e sponsor_metric_email_jobs (admin
--   insere via ModerationQueue/SponsorsManagement), payments (admin update),
--   webhook_logs (admin delete), admin_audit_logs (logAction), e todas as de
--   dono/admin já mapeadas.
-- Candidatas (alta confiança, sem write no cliente -> service_role/edge/trigger):
-- =====================================================================

begin;

revoke insert, update, delete on public.contact_form_email_jobs                  from authenticated;
revoke insert, update, delete on public.contact_notification_email_jobs          from authenticated;
revoke insert, update, delete on public.contact_notification_email_dispatch_logs from authenticated;
revoke insert, update, delete on public.newsletter_campaign_email_jobs           from authenticated;
revoke insert, update, delete on public.newsletter_campaign_email_dispatch_logs  from authenticated;
revoke insert, update, delete on public.radar_match_email_jobs                    from authenticated;
revoke insert, update, delete on public.radar_match_email_dispatch_logs           from authenticated;
revoke insert, update, delete on public.plan_alert_email_dispatch_logs            from authenticated;
revoke insert, update, delete on public.sponsor_metric_email_dispatch_logs        from authenticated;
revoke insert, update, delete on public.fiscal_document_jobs                      from authenticated;
revoke insert, update, delete on public.news_generation_jobs                      from authenticated;
revoke insert, update, delete on public.price_drop_notifications                  from authenticated;
revoke insert, update, delete on public.rate_limit_counters                       from authenticated;
revoke insert, update, delete on public.webhook_request_registry                  from authenticated;
revoke insert, update, delete on public.subscription_history                      from authenticated;
revoke insert, update, delete on public.invoices                                  from authenticated;

commit;

-- =====================================================================
-- DEFERIDAS p/ confirmação posterior (NÃO incluídas — risco/financeiro/dúvida):
--   user_subscriptions, user_highlight_booster_purchases  (financeiro; escrita por
--     edge/RPC definer — confirmar que admin não faz update direto antes de revogar)
--   promotion_plan_redemptions  (resgate via RPC redeem_promotion_plan_code definer
--     — provável revogável, confirmar)
--   announcement_metrics, announcement_highlights_history,
--   announcement_similarity_cooldowns  (trigger/service — provável revogável)
--   commercial_intelligence_* (conversations/messages/etc — confirmar se há chat
--     escrito pelo cliente antes de revogar)
--   admin_audit_logs  (logAction — confirmar se insere direto ou via RPC)
--
-- VALIDAÇÃO (Fase 3):
--   - Pipelines de e-mail (contato, newsletter, radar, plano), emissão fiscal,
--     geração de notícias, price-drop, rate limit, webhooks, histórico de
--     assinatura e faturas -> continuam funcionando (rodam por service_role/edge).
--   - Nenhuma tela do cliente escreve nessas tabelas (confirmado por grep) -> sem regressão.
--   - select table_name from information_schema.role_table_grants
--     where table_schema='public' and grantee='authenticated'
--       and table_name in (<lista acima>) and privilege_type in ('INSERT','UPDATE','DELETE');
--     -> esperado 0 linhas.
-- ROLLBACK (por tabela): grant insert, update, delete on public.<tabela> to authenticated;
-- =====================================================================
