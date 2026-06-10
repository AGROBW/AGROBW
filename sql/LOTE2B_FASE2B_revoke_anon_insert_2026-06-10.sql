-- =====================================================================
-- LOTE 2B — FASE 2B — revogar INSERT de ANON, preservando telemetria/forms públicos
-- Data: 2026-06-10 | RISCO BAIXO. Padrão: revoke geral + re-grant das exceções.
-- =====================================================================
-- Estratégia segura: revogar INSERT de anon em TODAS as tabelas e RE-CONCEDER
-- apenas nas exceções de escrita anônima legítima (não dá p/ esquecer nenhuma).
-- Exceções confirmadas/conservadoras (telemetria + forms públicos que inserem em
-- contexto anônimo via cliente ou RPC invoker):
--   site_popup_events, home_showcase_impressions, category_showcase_impressions,
--   site_sponsor_clicks, site_sponsor_impressions, website_visits,
--   sponsor_interest_leads (form público SponsorLandingView),
--   announcement_clicks_by_state, lead_conversions, invite_visits  (rastreio/telemetria),
--   contact_messages, newsletter_subscriptions (forms públicos),
--   announcement_reports (denúncia pública de anúncio).
-- (Mantidas por precaução; são tabelas de baixa sensibilidade com RLS já ativa.
--  Se confirmar que alguma NÃO recebe insert anônimo, remova-a do re-grant.)
-- =====================================================================

begin;

revoke insert on all tables in schema public from anon;
alter default privileges in schema public revoke insert on tables from anon;

-- re-grant das exceções (escrita anônima legítima)
grant insert on public.site_popup_events             to anon;
grant insert on public.home_showcase_impressions     to anon;
grant insert on public.category_showcase_impressions to anon;
grant insert on public.site_sponsor_clicks           to anon;
grant insert on public.site_sponsor_impressions      to anon;
grant insert on public.website_visits                to anon;
grant insert on public.sponsor_interest_leads        to anon;
grant insert on public.announcement_clicks_by_state  to anon;
grant insert on public.lead_conversions              to anon;
grant insert on public.invite_visits                 to anon;
grant insert on public.contact_messages              to anon;
grant insert on public.newsletter_subscriptions      to anon;
grant insert on public.announcement_reports          to anon;

commit;

-- =====================================================================
-- VALIDAÇÃO:
--   anon: tabelas exceção continuam aceitando INSERT (telemetria/forms) -> OK
--   anon: INSERT em qualquer tabela FORA da lista -> NEGADO
--   Smoke test anônimo: abrir popup (evento grava), impressões de showcase,
--     clique em patrocinador, form de patrocínio/contato/newsletter, denúncia de
--     anúncio (se houver fluxo anônimo) -> todos gravam normalmente.
--   select table_name from information_schema.role_table_grants
--   where table_schema='public' and grantee='anon' and privilege_type='INSERT'
--   order by table_name;  -> só a lista de exceções.
-- ROLLBACK: grant insert on all tables in schema public to anon;
-- =====================================================================
