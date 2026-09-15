begin;

set local lock_timeout = '5s';

lock table public.leads in share row exclusive mode;

do $$
begin
  if exists (
    select 1 from public.whatsapp_gateway_jobs
    where event_type = 'seller_new_lead'
      and status in ('pending', 'retry', 'processing')
  ) and to_regclass('public.whatsapp_notification_jobs') is null then
    raise exception 'Rollback recusado: existem leads pendentes e a fila legada Meta nao esta disponivel';
  end if;

  if to_regprocedure('public.move_pending_whatsapp_seller_jobs_to_legacy()') is not null then
    execute 'select public.move_pending_whatsapp_seller_jobs_to_legacy()';
  end if;

  if exists (
    select 1 from public.whatsapp_gateway_jobs
    where event_type = 'seller_new_lead'
      and status in ('pending', 'retry', 'processing')
  ) then
    raise exception 'Rollback recusado: nem todos os leads pendentes foram migrados para a Meta';
  end if;
end;
$$;

drop trigger if exists trg_whatsapp_gateway_disabled_fallback on public.whatsapp_gateway_settings;
drop function if exists public.handle_whatsapp_gateway_disabled();
drop function if exists public.move_pending_whatsapp_seller_jobs_to_legacy();
drop function if exists public.purge_terminal_whatsapp_gateway_jobs();
drop index if exists public.idx_whatsapp_gateway_jobs_terminal_retention;

drop trigger if exists trg_audit_whatsapp_gateway_settings on public.whatsapp_gateway_settings;
drop trigger if exists trg_audit_whatsapp_gateway_templates on public.whatsapp_gateway_templates;
drop trigger if exists trg_audit_whatsapp_gateway_job_retry on public.whatsapp_gateway_jobs;
drop function if exists public.audit_whatsapp_gateway_admin_change();

drop trigger if exists trg_route_whatsapp_lead_notification on public.leads;
drop trigger if exists on_lead_queue_whatsapp on public.leads;
drop function if exists public.route_whatsapp_lead_notification();

do $$
begin
  if to_regprocedure('public.queue_whatsapp_lead_job()') is not null then
    execute 'create trigger on_lead_queue_whatsapp after insert on public.leads '
      || 'for each row execute function public.queue_whatsapp_lead_job()';
  end if;
end;
$$;

drop function if exists public.retry_whatsapp_gateway_job_admin_safe(uuid);
drop function if exists public.get_recent_whatsapp_gateway_jobs_admin_safe(integer);

delete from public.whatsapp_gateway_jobs
where event_type in ('seller_new_lead', 'marketing_announcement_campaign');
delete from public.whatsapp_gateway_templates
where event_type in ('seller_new_lead', 'marketing_announcement_campaign');

alter table public.whatsapp_gateway_templates
  drop constraint if exists whatsapp_gateway_templates_marketing_disabled;

alter table public.whatsapp_gateway_jobs
  drop constraint if exists whatsapp_gateway_jobs_link;
alter table public.whatsapp_gateway_jobs
  add constraint whatsapp_gateway_jobs_link
  check (link_path is null or link_path ~ '^/admin/[A-Za-z0-9/_-]*$');

commit;
