-- =====================================================================
-- LOTE 2B — Diagnóstico READ-ONLY: limpeza global de grants amplos
-- Data: 2026-06-10 | NÃO altera nada. Gera inventário + statements de revoke.
-- Estratégia em 3 fases por risco:
--   Fase 1 (ZERO risco): revogar TRUNCATE/REFERENCES/TRIGGER de anon+authenticated
--     -> PostgREST/supabase-js NUNCA usam esses privilégios. Sempre seguro.
--   Fase 2 (baixo): revogar INSERT/UPDATE/DELETE de ANON, exceto flows públicos
--     legítimos (telemetria/forms anônimos).
--   Fase 3 (médio): revogar DML de AUTHENTICATED só em tabelas que o CLIENTE
--     nunca escreve (cruzar com o conjunto-preserva abaixo).
-- =====================================================================

-- =====================================================================
-- BLOCO 1 — Inventário TRUNCATE/REFERENCES/TRIGGER (Fase 1, zero risco)
-- =====================================================================
select table_name, grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as privs_perigosos
from information_schema.role_table_grants g
where table_schema='public' and grantee in ('anon','authenticated')
  and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
  and exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relname=g.table_name and c.relkind='r')
group by table_name, grantee
order by table_name, grantee;
-- PROPOSTA Fase 1 (statement único, idempotente — revogar grant inexistente não dá erro):
--   revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
-- VALIDAÇÃO: nenhum fluxo do app usa esses privilégios -> zero regressão esperada.

-- =====================================================================
-- BLOCO 2 — Inventário DML de ANON (Fase 2) + gerador de revoke
-- =====================================================================
select table_name,
       string_agg(privilege_type, ', ' order by privilege_type) as anon_dml
from information_schema.role_table_grants g
where table_schema='public' and grantee='anon'
  and privilege_type in ('INSERT','UPDATE','DELETE')
  and exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relname=g.table_name and c.relkind='r')
group by table_name
order by table_name;
-- EXCEÇÕES A PRESERVAR (escrita anônima legítima — NÃO revogar anon INSERT nelas):
--   site_popup_events            (telemetria popup; já é só INSERT)
--   home_showcase_impressions    (telemetria home)
--   category_showcase_impressions(telemetria listagem)
--   site_sponsor_clicks          (telemetria patrocinador)
--   site_sponsor_impressions     (telemetria patrocinador)
--   website_visits               (telemetria visita)
--   sponsor_interest_leads       (form público SponsorLandingView)
--   contact_messages             (form de contato público)  [CONFIRMAR fluxo]
--   newsletter_subscriptions     (inscrição pública)         [CONFIRMAR fluxo]
--   invite_visits / lead_conversions (rastreio de convite)   [CONFIRMAR fluxo]
--   announcement_reports         (denúncia de anúncio)       [CONFIRMAR se anon]
--   chats / leads / messages     (ContactSellerModal)        [CONFIRMAR se exige login]
-- => Para TODAS as demais tabelas do resultado, revogar:
--      revoke insert, update, delete on public.<tabela> from anon;
--    (UPDATE/DELETE de anon não tem caso de uso legítimo em NENHUMA — nem nas exceções,
--     que são só INSERT.)

-- =====================================================================
-- BLOCO 3 — Inventário DML de AUTHENTICATED (Fase 3) + conjunto-preserva
-- =====================================================================
select table_name,
       string_agg(privilege_type, ', ' order by privilege_type) as auth_dml
from information_schema.role_table_grants g
where table_schema='public' and grantee='authenticated'
  and privilege_type in ('INSERT','UPDATE','DELETE')
  and exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relname=g.table_name and c.relkind='r')
group by table_name
order by table_name;
-- CONJUNTO-PRESERVA (tabelas que o CLIENTE escreve como authenticated — mapeado por
-- grep de .insert/.update/.upsert/.delete em src|components|pages|services).
-- NÃO revogar DML de authenticated nestas (RLS já gateia a admin/dono):
--   users, announcements, announcement_contacts, announcement_edit_requests,
--   announcement_technical_details, chats, leads, messages, favorites,
--   opportunity_alerts, opportunity_matches, commercial_lead_preferences,
--   seller_stores, seller_store_contacts, support_tickets, support_ticket_messages,
--   notifications, site_popups, site_popup_events, site_popup_user_states,
--   home_showcase_impressions, category_showcase_impressions,
--   -- ADMIN (authenticated + RLS is_admin) — também preservar:
--   categories, category_subcategories, category_group_images, marketing_costs,
--   category_ranking_settings, newsletter_campaigns, contact_messages,
--   invite_campaigns, site_sponsors, sponsor_interest_leads, sponsor_metric_email_jobs,
--   sponsor_testimonials, news_sources, news_settings, news_social_settings,
--   news_social_publications, news_ingestions, news_articles, news_article_sources,
--   plan_alert_email_jobs, payments, promotion_plan_codes, publication_moderation_rules,
--   about_page_content, contact_page_content, privacy_page_content, terms_page_content,
--   fiscal_settings, home_banners, growth_conversion_settings, highlight_settings,
--   highlight_boosters, layout_settings, market_quote_sources, market_quotes,
--   market_quotes_temp, institutional_pages, plans, renewal_notification_settings,
--   support_settings, webhook_logs.
-- => CANDIDATAS A REVOGAR auth DML = (resultado deste bloco) MENOS (conjunto-preserva).
--    São tabelas escritas só por service_role/edge/trigger (jobs de e-mail, dispatch
--    logs, fiscal_document_jobs, *_email_jobs, rate_limit_counters, webhook_request_registry,
--    subscription_history, lead_conversions, etc.). Eu confirmo a lista final ao receber
--    o resultado, cruzando com o conjunto-preserva.

-- =====================================================================
-- BLOCO 4 — Contexto: RLS on por tabela (deve estar quase tudo on pós-2A)
-- =====================================================================
select c.relname as tabela, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind='r' and n.nspname='public'
order by c.relrowsecurity asc, c.relname;
-- LEITURA: se alguma RLS-off escapou do 2A, sinalizar (revoke de DML não substitui RLS).

-- =====================================================================
-- O QUE ME DEVOLVER: BLOCO 2 e BLOCO 3 (obrigatórios — geram as listas finais),
-- BLOCO 1 (confirmar abrangência) e BLOCO 4 (contexto).
-- Com isso eu fecho: (a) statement Fase 1 (já pronto acima), (b) lista exata de
-- revokes anon DML (Fase 2, preservando exceções), (c) lista exata de revokes
-- auth DML (Fase 3 = resultado - conjunto-preserva). Tudo p/ sua revisão, sem aplicar.
-- =====================================================================
