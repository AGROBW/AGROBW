begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.whatsapp_gateway_jobs') is null
    or to_regclass('public.whatsapp_gateway_enqueue_failures') is null
    or to_regprocedure('public.enqueue_whatsapp_gateway_event(text,text,text,uuid,jsonb,text,text,uuid)') is null
    or to_regprocedure('public.try_enqueue_whatsapp_gateway_event(text,text,text,uuid,jsonb,text,text,uuid)') is null then
    raise exception 'Aplique primeiro create_whatsapp_central_stage3_2026-09-14.sql';
  end if;
  if to_regclass('public.leads') is null then
    raise exception 'public.leads nao existe';
  end if;
  if to_regclass('public.admin_audit_logs') is null then
    raise exception 'public.admin_audit_logs nao existe';
  end if;
end;
$$;

alter table public.whatsapp_gateway_jobs
  drop constraint if exists whatsapp_gateway_jobs_link;
alter table public.whatsapp_gateway_jobs
  add constraint whatsapp_gateway_jobs_link
  check (link_path is null or link_path ~ '^/(admin|minha-conta)/[A-Za-z0-9/_-]*$');

insert into public.whatsapp_gateway_templates (
  event_type, label, body_template, allowed_placeholders, is_enabled
)
values
  (
    'seller_new_lead',
    'Novo interessado para o anunciante',
    E'*Novo interessado no seu anuncio*\n{{buyer}} demonstrou interesse em: {{title}}',
    array['buyer', 'title'],
    true
  ),
  (
    'marketing_announcement_campaign',
    'Campanha indisponivel ate existir consentimento WhatsApp',
    E'*{{title}}*\n{{summary}}',
    array['title', 'summary'],
    false
  )
on conflict (event_type) do nothing;

update public.whatsapp_gateway_templates
set
  label = case
    when event_type = 'marketing_announcement_campaign'
      then 'Campanha indisponivel ate existir consentimento WhatsApp'
    else label
  end,
  allowed_placeholders = case event_type
    when 'seller_new_lead' then array['buyer', 'title']
    when 'marketing_announcement_campaign' then array['title', 'summary']
    else allowed_placeholders
  end,
  is_enabled = case
    when event_type = 'marketing_announcement_campaign' then false
    else is_enabled
  end
where event_type in ('seller_new_lead', 'marketing_announcement_campaign');

alter table public.whatsapp_gateway_templates
  drop constraint if exists whatsapp_gateway_templates_marketing_disabled;
alter table public.whatsapp_gateway_templates
  add constraint whatsapp_gateway_templates_marketing_disabled
  check (event_type <> 'marketing_announcement_campaign' or not is_enabled);

create index if not exists idx_whatsapp_gateway_jobs_terminal_retention
  on public.whatsapp_gateway_jobs (created_at)
  where status in ('sent', 'skipped', 'dead_letter');

create or replace function public.route_whatsapp_lead_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_job_id uuid;
  v_recipient_name text;
  v_recipient_phone text;
  v_announcement_title text;
  v_announcement_image_url text;
  v_legacy_status text := 'pending';
  v_legacy_error text := null;
  v_fallback_error_code text;
  v_contact_locked boolean := new.contact_expires_at is not null
    and new.contact_expires_at <= now();
begin
  select announcements.title, nullif(trim(announcements.images[1]), '')
  into v_announcement_title, v_announcement_image_url
  from public.announcements announcements
  where announcements.id = new.announcement_id;

  if v_announcement_image_url !~* '^https://dockpbyzrvgewgdoaibn\.supabase\.co/storage/v1/object/public/ads-images/.+\.(jpe?g|png|webp)$' then
    v_announcement_image_url := null;
  end if;

  v_job_id := public.try_enqueue_whatsapp_gateway_event(
    'seller_new_lead',
    new.id::text,
    'leads',
    new.id,
    jsonb_strip_nulls(jsonb_build_object(
      'buyer', case
        when v_contact_locked then 'Um novo interessado'
        else left(coalesce(nullif(trim(new.buyer_name), ''), 'Um comprador'), 120)
      end,
      'title', left(coalesce(nullif(trim(v_announcement_title), ''), 'seu anuncio'), 300),
      'image_url', v_announcement_image_url,
      'action_url', 'https://agrobw.com.br/minha-conta/mensagens?chat=' || new.chat_id::text,
      'gateway_contract_version', '2026-09-18',
      'message_type', 'transactional_card'
    )),
    '/minha-conta/mensagens',
    'user',
    new.seller_id
  );

  if v_job_id is not null then
    return new;
  end if;

  -- Mantem a integracao oficial como fallback ate a Central estar ativa.
  if to_regclass('public.whatsapp_notification_jobs') is not null
    and to_regprocedure('public.normalize_br_whatsapp_phone(text)') is not null then
    begin
      select
        coalesce(nullif(trim(users.name), ''), 'Vendedor'),
        public.normalize_br_whatsapp_phone(users.phone)
      into v_recipient_name, v_recipient_phone
      from public.users users
      where users.id = new.seller_id;

      if v_recipient_phone is null then
        v_legacy_status := 'skipped';
        v_legacy_error := 'Vendedor sem telefone valido para WhatsApp';
      end if;

      insert into public.whatsapp_notification_jobs (
        lead_id,
        recipient_user_id,
        recipient_phone,
        recipient_name,
        buyer_name,
        announcement_title,
        status,
        last_error
      ) values (
        new.id,
        new.seller_id,
        v_recipient_phone,
        v_recipient_name,
        case
          when v_contact_locked then 'Contato bloqueado'
          else coalesce(nullif(trim(new.buyer_name), ''), split_part(coalesce(new.buyer_email, ''), '@', 1), 'Comprador')
        end,
        coalesce(nullif(trim(v_announcement_title), ''), 'seu anuncio'),
        v_legacy_status,
        v_legacy_error
      ) on conflict (lead_id) do nothing;
    exception when others then
      v_fallback_error_code := sqlstate;
      begin
        insert into public.whatsapp_gateway_enqueue_failures (
          event_type, source_table, source_id, error_code
        ) values (
          'seller_new_lead_fallback', 'leads', new.id, left(v_fallback_error_code, 80)
        );
      exception when others then
        null;
      end;
      raise warning 'Falha isolada no fallback legado de WhatsApp para lead %: %', new.id, v_fallback_error_code;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists on_lead_queue_whatsapp on public.leads;
drop trigger if exists trg_route_whatsapp_lead_notification on public.leads;
create trigger trg_route_whatsapp_lead_notification
after insert on public.leads
for each row execute function public.route_whatsapp_lead_notification();

create or replace function public.get_recent_whatsapp_gateway_jobs_admin_safe(
  p_limit integer default 25
)
returns table (
  id uuid,
  event_type text,
  event_label text,
  status text,
  attempts integer,
  max_attempts integer,
  last_http_status integer,
  last_error_code text,
  created_at timestamptz,
  sent_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select
    jobs.id,
    jobs.event_type,
    templates.label,
    jobs.status,
    jobs.attempts,
    jobs.max_attempts,
    jobs.last_http_status,
    jobs.last_error_code,
    jobs.created_at,
    jobs.sent_at
  from public.whatsapp_gateway_jobs jobs
  join public.whatsapp_gateway_templates templates on templates.event_type = jobs.event_type
  order by jobs.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$$;

create or replace function public.retry_whatsapp_gateway_job_admin_safe(
  p_job_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_job_id is null then
    raise exception 'Job obrigatorio' using errcode = '22023';
  end if;

  update public.whatsapp_gateway_jobs jobs
  set
    status = 'pending',
    attempts = 0,
    available_at = now(),
    locked_at = null,
    locked_by = null,
    last_http_status = null,
    last_error_code = null
  where jobs.id = p_job_id
    and jobs.status in ('retry', 'dead_letter');

  return found;
end;
$$;

create or replace function public.move_pending_whatsapp_seller_jobs_to_legacy()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_moved integer := 0;
begin
  if to_regclass('public.whatsapp_notification_jobs') is null
    or to_regprocedure('public.normalize_br_whatsapp_phone(text)') is null then
    return 0;
  end if;

  insert into public.whatsapp_notification_jobs (
    lead_id,
    recipient_user_id,
    recipient_phone,
    recipient_name,
    buyer_name,
    announcement_title,
    status,
    last_error
  )
  select
    leads.id,
    leads.seller_id,
    public.normalize_br_whatsapp_phone(users.phone),
    coalesce(nullif(trim(users.name), ''), 'Vendedor'),
    case
      when leads.contact_expires_at is not null and leads.contact_expires_at <= now()
        then 'Contato bloqueado'
      else coalesce(nullif(trim(leads.buyer_name), ''), 'Comprador')
    end,
    coalesce(nullif(trim(announcements.title), ''), 'seu anuncio'),
    case when public.normalize_br_whatsapp_phone(users.phone) is null then 'skipped' else 'pending' end,
    case when public.normalize_br_whatsapp_phone(users.phone) is null
      then 'Vendedor sem telefone valido para WhatsApp' else null end
  from public.whatsapp_gateway_jobs jobs
  join public.leads leads on leads.id = jobs.source_id
  join public.users users on users.id = leads.seller_id
  left join public.announcements announcements on announcements.id = leads.announcement_id
  where jobs.event_type = 'seller_new_lead'
    and (
      jobs.status in ('pending', 'retry')
      or (jobs.status = 'processing' and jobs.locked_at < now() - interval '10 minutes')
    )
  on conflict (lead_id) do nothing;

  update public.whatsapp_gateway_jobs jobs
  set
    status = 'skipped',
    last_error_code = 'ORPHANED_SOURCE',
    locked_at = null,
    locked_by = null
  where jobs.event_type = 'seller_new_lead'
    and (
      jobs.status in ('pending', 'retry')
      or (jobs.status = 'processing' and jobs.locked_at < now() - interval '10 minutes')
    )
    and not exists (
      select 1 from public.leads leads where leads.id = jobs.source_id
    );

  update public.whatsapp_gateway_jobs jobs
  set
    status = 'skipped',
    last_error_code = 'FALLBACK_TO_META',
    locked_at = null,
    locked_by = null
  where jobs.event_type = 'seller_new_lead'
    and (
      jobs.status in ('pending', 'retry')
      or (jobs.status = 'processing' and jobs.locked_at < now() - interval '10 minutes')
    )
    and exists (
      select 1
      from public.whatsapp_notification_jobs legacy
      where legacy.lead_id = jobs.source_id
    );

  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

create or replace function public.handle_whatsapp_gateway_disabled()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if old.is_enabled and not new.is_enabled then
    begin
      perform public.move_pending_whatsapp_seller_jobs_to_legacy();
    exception when others then
      raise warning 'Falha isolada ao migrar jobs para o fallback Meta: %', sqlstate;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_gateway_disabled_fallback on public.whatsapp_gateway_settings;
create trigger trg_whatsapp_gateway_disabled_fallback
after update of is_enabled on public.whatsapp_gateway_settings
for each row execute function public.handle_whatsapp_gateway_disabled();

create or replace function public.purge_terminal_whatsapp_gateway_jobs()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_deleted_jobs integer;
  v_deleted_failures integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  update public.whatsapp_gateway_jobs jobs
  set
    status = 'skipped',
    last_error_code = 'ADMIN_EVENT_EXPIRED',
    locked_at = null,
    locked_by = null
  where jobs.event_type like 'admin_%'
    and (
      jobs.status in ('pending', 'retry')
      or (jobs.status = 'processing' and jobs.locked_at < now() - interval '10 minutes')
    )
    and jobs.created_at < now() - interval '24 hours';

  delete from public.whatsapp_gateway_jobs jobs
  where jobs.status in ('sent', 'skipped', 'dead_letter')
    and jobs.created_at < now() - interval '60 days';
  get diagnostics v_deleted_jobs = row_count;

  delete from public.whatsapp_gateway_enqueue_failures failures
  where failures.occurred_at < now() - interval '60 days';
  get diagnostics v_deleted_failures = row_count;

  return v_deleted_jobs + v_deleted_failures;
end;
$$;

create or replace function public.audit_whatsapp_gateway_admin_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_admin_email text;
  v_admin_name text;
  v_action text;
  v_resource_type text;
  v_resource_id uuid;
  v_new_value jsonb;
begin
  if auth.uid() is null then
    return new;
  end if;

  select users.email, users.name
  into v_admin_email, v_admin_name
  from public.users users
  where users.id = auth.uid();

  if tg_table_name = 'whatsapp_gateway_settings' then
    v_action := 'UPDATE_WHATSAPP_GATEWAY';
    v_resource_type := 'integration_settings';
    v_resource_id := new.id;
    v_new_value := jsonb_build_object(
      'base_url', new.base_url,
      'send_path', new.send_path,
      'health_path', new.health_path,
      'auth_type', new.auth_type,
      'credential_changed', old.auth_secret is distinct from new.auth_secret,
      'recipient_changed', old.default_recipient_phone is distinct from new.default_recipient_phone,
      'is_enabled', new.is_enabled
    );
  elsif tg_table_name = 'whatsapp_gateway_templates' then
    v_action := 'UPDATE_WHATSAPP_TEMPLATE';
    v_resource_type := 'whatsapp_gateway_template';
    v_resource_id := null;
    v_new_value := jsonb_build_object(
      'event_type', new.event_type,
      'body_changed', old.body_template is distinct from new.body_template,
      'is_enabled', new.is_enabled
    );
  else
    v_action := 'RETRY_WHATSAPP_GATEWAY_JOB';
    v_resource_type := 'whatsapp_gateway_job';
    v_resource_id := new.id;
    v_new_value := jsonb_build_object('previous_status', old.status, 'status', new.status);
  end if;

  insert into public.admin_audit_logs (
    admin_id,
    admin_email,
    admin_name,
    action,
    resource_type,
    resource_id,
    new_value,
    reason
  ) values (
    auth.uid(),
    coalesce(v_admin_email, 'email-indisponivel'),
    coalesce(v_admin_name, v_admin_email, 'Administrador'),
    v_action,
    v_resource_type,
    v_resource_id,
    v_new_value,
    'Alteracao administrativa da Central WhatsApp'
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_whatsapp_gateway_settings on public.whatsapp_gateway_settings;
create trigger trg_audit_whatsapp_gateway_settings
after update on public.whatsapp_gateway_settings
for each row execute function public.audit_whatsapp_gateway_admin_change();

drop trigger if exists trg_audit_whatsapp_gateway_templates on public.whatsapp_gateway_templates;
create trigger trg_audit_whatsapp_gateway_templates
after update on public.whatsapp_gateway_templates
for each row execute function public.audit_whatsapp_gateway_admin_change();

drop trigger if exists trg_audit_whatsapp_gateway_job_retry on public.whatsapp_gateway_jobs;
create trigger trg_audit_whatsapp_gateway_job_retry
after update on public.whatsapp_gateway_jobs
for each row
when (
  old.status in ('retry', 'dead_letter')
  and new.status = 'pending'
  and new.attempts = 0
)
execute function public.audit_whatsapp_gateway_admin_change();

revoke all on function public.route_whatsapp_lead_notification() from public, anon, authenticated;
revoke all on function public.get_recent_whatsapp_gateway_jobs_admin_safe(integer) from public, anon, authenticated;
revoke all on function public.retry_whatsapp_gateway_job_admin_safe(uuid) from public, anon, authenticated;
revoke all on function public.move_pending_whatsapp_seller_jobs_to_legacy() from public, anon, authenticated;
revoke all on function public.handle_whatsapp_gateway_disabled() from public, anon, authenticated;
revoke all on function public.purge_terminal_whatsapp_gateway_jobs() from public, anon, authenticated;
revoke all on function public.audit_whatsapp_gateway_admin_change() from public, anon, authenticated;

grant execute on function public.get_recent_whatsapp_gateway_jobs_admin_safe(integer) to authenticated;
grant execute on function public.retry_whatsapp_gateway_job_admin_safe(uuid) to authenticated;
grant execute on function public.move_pending_whatsapp_seller_jobs_to_legacy() to service_role;
grant execute on function public.purge_terminal_whatsapp_gateway_jobs() to service_role;

commit;
