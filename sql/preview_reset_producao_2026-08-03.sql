-- AGRO BW - Ensaio da limpeza para entrada em producao
-- IMPORTANTE: este arquivo termina em ROLLBACK e nao persiste alteracoes.

begin;

-- Trava de seguranca: os dois administradores precisam existir no Auth e no perfil.
do $safety$
declare
  v_public_admins integer;
  v_auth_admins integer;
begin
  select count(*) into v_public_admins
  from public.users
  where id in (
    '484ae0c7-c477-49bb-8123-2d63ee7b14e9'::uuid,
    '41b56078-2897-48d5-96c9-d1f65d61e3bf'::uuid
  )
    and lower(coalesce(role, '')) = 'admin'
    and is_admin is true;

  select count(*) into v_auth_admins
  from auth.users
  where id in (
    '484ae0c7-c477-49bb-8123-2d63ee7b14e9'::uuid,
    '41b56078-2897-48d5-96c9-d1f65d61e3bf'::uuid
  );

  if v_public_admins <> 2 or v_auth_admins <> 2 then
    raise exception
      'TRAVA DE SEGURANCA: esperados 2 admins; public=%, auth=%',
      v_public_admins,
      v_auth_admins;
  end if;
end
$safety$;

-- Lista explicita de dados operacionais/testes. Nenhuma tabela preservada entra aqui.
create temporary table cleanup_target_tables (
  table_name text primary key
) on commit drop;

insert into cleanup_target_tables (table_name) values
  ('admin_audit_logs'),
  ('admin_mfa_login_tickets'),
  ('announcement_clicks_by_state'),
  ('announcement_contacts'),
  ('announcement_edit_requests'),
  ('announcement_highlights_history'),
  ('announcement_metrics'),
  ('announcement_reports'),
  ('announcement_similarity_cooldowns'),
  ('announcement_technical_details'),
  ('announcements'),
  ('category_showcase_impressions'),
  ('chats'),
  ('commercial_intelligence_contact_shares'),
  ('commercial_intelligence_conversation_messages'),
  ('commercial_intelligence_conversations'),
  ('commercial_intelligence_interest_responses'),
  ('commercial_intelligence_outreach_campaigns'),
  ('commercial_intelligence_outreach_deliveries'),
  ('commercial_intelligence_requests'),
  ('commercial_lead_preferences'),
  ('contact_form_email_jobs'),
  ('contact_messages'),
  ('contact_notification_email_dispatch_logs'),
  ('contact_notification_email_jobs'),
  ('favorites'),
  ('fiscal_document_jobs'),
  ('home_showcase_impressions'),
  ('invite_visits'),
  ('invoices'),
  ('lead_conversions'),
  ('leads'),
  ('market_quotes_temp'),
  ('marketing_costs'),
  ('messages'),
  ('news_generation_jobs'),
  ('news_social_publications'),
  ('newsletter_campaign_email_dispatch_logs'),
  ('newsletter_campaign_email_jobs'),
  ('newsletter_campaigns'),
  ('newsletter_subscriptions'),
  ('notifications'),
  ('opportunities'),
  ('opportunity_alerts'),
  ('opportunity_matches'),
  ('payments'),
  ('plan_alert_email_dispatch_logs'),
  ('plan_alert_email_jobs'),
  ('price_drop_notifications'),
  ('promotion_plan_redemptions'),
  ('quotations'),
  ('radar_match_email_dispatch_logs'),
  ('radar_match_email_jobs'),
  ('rate_limit_counters'),
  ('search_events'),
  ('security_events'),
  ('seller_public_profiles'),
  ('seller_store_campaign_requests'),
  ('seller_store_contacts'),
  ('seller_stores'),
  ('site_page_views'),
  ('site_popup_events'),
  ('site_popup_user_states'),
  ('site_presence'),
  ('site_sponsor_clicks'),
  ('site_sponsor_impressions'),
  ('sponsor_interest_leads'),
  ('sponsor_metric_email_dispatch_logs'),
  ('sponsor_metric_email_jobs'),
  ('subscription_history'),
  ('support_ticket_messages'),
  ('support_tickets'),
  ('user_highlight_booster_purchases'),
  ('user_legal_consents'),
  ('user_subscriptions'),
  ('webhook_logs'),
  ('webhook_request_registry'),
  ('website_visits'),
  ('whatsapp_notification_jobs');

-- Monta um unico TRUNCATE apenas com tabelas que existem no banco vivo.
-- Sem CASCADE: qualquer dependencia esquecida interrompe o ensaio com seguranca.
do $truncate$
declare
  v_tables text;
begin
  select string_agg(format('%I.%I', 'public', c.table_name), ', ' order by c.table_name)
    into v_tables
  from cleanup_target_tables c
  where to_regclass(format('%I.%I', 'public', c.table_name)) is not null;

  if v_tables is null then
    raise exception 'Nenhuma tabela operacional encontrada';
  end if;

  execute 'truncate table ' || v_tables || ' restart identity';
end
$truncate$;

-- Remove todos os perfis que nao sejam os dois administradores.
delete from public.users
where id not in (
  '484ae0c7-c477-49bb-8123-2d63ee7b14e9'::uuid,
  '41b56078-2897-48d5-96c9-d1f65d61e3bf'::uuid
);

-- users.invite_campaign_id impede TRUNCATE de invite_campaigns. Depois de remover
-- os usuarios comuns, soltamos esse vinculo apenas nos admins e limpamos campanhas.
update public.users
set invite_campaign_id = null
where id in (
  '484ae0c7-c477-49bb-8123-2d63ee7b14e9'::uuid,
  '41b56078-2897-48d5-96c9-d1f65d61e3bf'::uuid
)
  and invite_campaign_id is not null;

delete from public.invite_campaigns;

-- Remove as contas do Auth por ultimo; dependencias internas usam ON DELETE CASCADE.
delete from auth.users
where id not in (
  '484ae0c7-c477-49bb-8123-2d63ee7b14e9'::uuid,
  '41b56078-2897-48d5-96c9-d1f65d61e3bf'::uuid
);

-- Resultado esperado dentro do ensaio: somente os dois administradores e zero dados operacionais.
select
  (select count(*) from auth.users) as auth_users_restantes,
  (select count(*) from public.users) as public_users_restantes,
  (select count(*) from public.announcements) as anuncios_restantes,
  (select count(*) from public.user_subscriptions) as assinaturas_restantes,
  (select count(*) from public.payments) as pagamentos_restantes,
  (select count(*) from public.chats) as chats_restantes,
  (select count(*) from public.messages) as mensagens_restantes;

select id, email, name, role, is_admin
from public.users
order by email;

-- Ensaio: desfaz obrigatoriamente todas as operacoes acima.
rollback;
