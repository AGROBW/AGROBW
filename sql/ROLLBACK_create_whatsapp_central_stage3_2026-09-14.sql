begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.route_whatsapp_lead_notification()') is not null
    or to_regprocedure('public.get_recent_whatsapp_gateway_jobs_admin_safe(integer)') is not null then
    raise exception 'Rollback recusado: remova primeiro a etapa 4 da Central WhatsApp';
  end if;
end;
$$;

drop trigger if exists trg_queue_whatsapp_admin_announcement on public.announcements;
drop trigger if exists trg_queue_whatsapp_admin_edit_request on public.announcement_edit_requests;
drop trigger if exists trg_queue_whatsapp_admin_support_message on public.support_ticket_messages;
drop trigger if exists trg_queue_whatsapp_admin_store_campaign on public.seller_store_campaign_requests;
drop trigger if exists trg_prepare_whatsapp_gateway_job_contract on public.whatsapp_gateway_jobs;

drop function if exists public.queue_whatsapp_admin_announcement_event();
drop function if exists public.queue_whatsapp_admin_edit_request_event();
drop function if exists public.queue_whatsapp_admin_support_event();
drop function if exists public.queue_whatsapp_admin_store_campaign_event();
drop function if exists public.prepare_whatsapp_gateway_job_contract();

drop function if exists public.get_whatsapp_gateway_queue_summary_admin_safe();
drop function if exists public.update_whatsapp_gateway_template_admin_safe(text, text, boolean);
drop function if exists public.get_whatsapp_gateway_templates_admin_safe();
drop function if exists public.try_enqueue_whatsapp_gateway_event(text, text, text, uuid, jsonb, text, text, uuid);
drop function if exists public.fail_whatsapp_gateway_job(uuid, uuid, text, integer, boolean);
drop function if exists public.complete_whatsapp_gateway_job(uuid, uuid, integer, text);
drop function if exists public.claim_whatsapp_gateway_jobs(integer, uuid);
drop function if exists public.release_whatsapp_gateway_jobs(uuid, uuid[]);
drop function if exists public.enqueue_whatsapp_gateway_event(text, text, text, uuid, jsonb, text, text, uuid);
drop function if exists public.render_whatsapp_gateway_template(text, jsonb);

drop trigger if exists trigger_touch_whatsapp_gateway_jobs on public.whatsapp_gateway_jobs;
drop trigger if exists trigger_touch_whatsapp_gateway_templates on public.whatsapp_gateway_templates;
drop table if exists public.whatsapp_gateway_jobs;
drop table if exists public.whatsapp_announcement_moderation_state;
drop table if exists public.whatsapp_gateway_templates;
drop table if exists public.whatsapp_gateway_enqueue_failures;
drop function if exists public.touch_whatsapp_gateway_queue_updated_at();

commit;
