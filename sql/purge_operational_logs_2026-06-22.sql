-- =====================================================================
-- PURGA DE LOGS/JOBS OPERACIONAIS — Lote 2 (conservador, manual)
-- Data: 2026-06-22
-- DRY-RUN por padrão (não deleta nada). apply=true só sob decisão manual.
-- NÃO automatizar enquanto não houver backup/PITR.
-- Toca SOMENTE logs/jobs operacionais de baixo valor. NUNCA toca em:
--   user_legal_consents, payments, leads/chats/messages,
--   seller_store_campaign_requests, admin_audit_logs (auditoria).
-- Idempotente; cada tabela é guardada por to_regclass (não quebra se faltar).
-- =====================================================================

create or replace function public.purge_operational_logs(p_apply boolean default false)
returns table (table_name text, affected bigint, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count bigint;
begin
  -- Bloqueia usuário autenticado comum; permite admin (via app) e execução
  -- sem JWT (SQL editor/postgres ou service_role) — uso operacional manual.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Acesso administrativo necessario.';
  end if;

  for r in
    select * from (values
      -- (tabela, predicado de elegibilidade — janelas conservadoras)
      ('webhook_logs',                    'received_at < now() - interval ''90 days'''),
      ('security_events',                 'created_at < now() - interval ''180 days'''),
      ('site_page_views',                 'created_at < now() - interval ''180 days'''),
      ('notifications',                   'is_read = true and created_at < now() - interval ''90 days'''),
      ('whatsapp_notification_jobs',      'status in (''sent'',''skipped'',''failed'') and created_at < now() - interval ''60 days'''),
      ('contact_notification_email_jobs', 'status in (''sent'',''skipped'',''failed'') and queued_at < now() - interval ''60 days'''),
      ('contact_form_email_jobs',         'status in (''sent'',''skipped'',''failed'') and queued_at < now() - interval ''60 days'''),
      ('newsletter_campaign_email_jobs',  'status in (''sent'',''skipped'',''failed'') and queued_at < now() - interval ''60 days'''),
      ('plan_alert_email_jobs',           'status in (''sent'',''skipped'',''failed'') and queued_at < now() - interval ''60 days'''),
      ('radar_match_email_jobs',          'status in (''sent'',''skipped'',''failed'') and queued_at < now() - interval ''60 days'''),
      ('sponsor_metric_email_jobs',       'status in (''sent'',''skipped'',''failed'') and queued_at < now() - interval ''60 days'''),
      ('contact_notification_email_dispatch_logs', 'started_at < now() - interval ''90 days'''),
      ('newsletter_campaign_email_dispatch_logs',  'started_at < now() - interval ''90 days'''),
      ('plan_alert_email_dispatch_logs',           'started_at < now() - interval ''90 days'''),
      ('radar_match_email_dispatch_logs',          'started_at < now() - interval ''90 days'''),
      ('sponsor_metric_email_dispatch_logs',       'started_at < now() - interval ''90 days''')
    ) as s(tbl, pred)
  loop
    -- Pula tabelas que não existem neste ambiente.
    if to_regclass('public.' || r.tbl) is null then
      continue;
    end if;

    if p_apply then
      execute format('delete from public.%I where %s', r.tbl, r.pred);
      get diagnostics v_count = row_count;
    else
      execute format('select count(*) from public.%I where %s', r.tbl, r.pred) into v_count;
    end if;

    table_name := r.tbl;
    affected := v_count;
    applied := p_apply;
    return next;
  end loop;
end;
$$;

revoke all on function public.purge_operational_logs(boolean) from public, anon;
grant execute on function public.purge_operational_logs(boolean) to authenticated; -- guardada por is_admin() interno

-- =====================================================================
-- USO
-- Dry-run (NÃO deleta — só conta o elegível por tabela):
--   select * from public.purge_operational_logs();            -- ou (false)
-- Aplicar de fato (DECISÃO MANUAL, irreversível sem backup):
--   select * from public.purge_operational_logs(true);
-- Conferir depois (deve cair):
--   select count(*) from public.plan_alert_email_jobs;
-- =====================================================================
