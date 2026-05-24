-- ==================================================
-- Sprint 1 - Hardening de seguranca para go-live
-- ==================================================

-- --------------------------------------------------
-- 1. Deduplicacao e protecao de replay para webhooks
-- --------------------------------------------------

create table if not exists public.webhook_request_registry (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  request_id text not null,
  signature_ts_ms bigint,
  event_type text,
  payment_id text,
  webhook_log_id uuid references public.webhook_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists idx_webhook_request_registry_provider_request
  on public.webhook_request_registry(provider, request_id);

create index if not exists idx_webhook_request_registry_created_at
  on public.webhook_request_registry(created_at desc);

alter table public.webhook_request_registry enable row level security;

drop policy if exists "Admins can view webhook request registry" on public.webhook_request_registry;
create policy "Admins can view webhook request registry"
  on public.webhook_request_registry
  for select
  to authenticated
  using (public.is_admin() = true);

drop policy if exists "Admins can delete webhook request registry" on public.webhook_request_registry;
create policy "Admins can delete webhook request registry"
  on public.webhook_request_registry
  for delete
  to authenticated
  using (public.is_admin() = true);

-- --------------------------------------------------
-- 2. Endurecer policies criticas
-- --------------------------------------------------

-- payment_settings: acesso direto via tabela desabilitado para o frontend;
-- leitura/edicao passam pelas RPCs seguras abaixo.
drop policy if exists "Admins can view payment settings" on public.payment_settings;
drop policy if exists "Admins can update payment settings" on public.payment_settings;
drop policy if exists "Admins can insert payment settings" on public.payment_settings;

-- user_subscriptions: escrita somente admin/service role
drop policy if exists "Service can insert subscriptions" on public.user_subscriptions;
drop policy if exists "Service can update subscriptions" on public.user_subscriptions;
drop policy if exists "Only admins can create subscriptions" on public.user_subscriptions;
drop policy if exists "Admins can update subscriptions" on public.user_subscriptions;
drop policy if exists "Only admins can delete subscriptions" on public.user_subscriptions;

create policy "Only admins can create subscriptions"
  on public.user_subscriptions
  for insert
  to authenticated
  with check (public.is_admin() = true);

create policy "Admins can update subscriptions"
  on public.user_subscriptions
  for update
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

create policy "Only admins can delete subscriptions"
  on public.user_subscriptions
  for delete
  to authenticated
  using (public.is_admin() = true);

-- notifications: inserts diretos apenas para admin
drop policy if exists "Sistema pode criar notificações" on public.notifications;
drop policy if exists "System can create notifications" on public.notifications;
drop policy if exists "Admins can insert notifications" on public.notifications;

create policy "Admins can insert notifications"
  on public.notifications
  for insert
  to authenticated
  with check (public.is_admin() = true);

-- webhook_logs: inserts apenas via service_role (RLS bypass), sem insert client-side
drop policy if exists "Service can insert webhook logs" on public.webhook_logs;

-- admin_audit_logs: insert restrito a admin autenticado; service_role segue com bypass
drop policy if exists "System can insert audit logs" on public.admin_audit_logs;
drop policy if exists "Admins can insert audit logs" on public.admin_audit_logs;

create policy "Admins can insert audit logs"
  on public.admin_audit_logs
  for insert
  to authenticated
  with check (public.is_admin() = true);

-- --------------------------------------------------
-- 3. Funcoes seguras para payment_settings no admin
-- --------------------------------------------------

drop function if exists public.get_payment_settings_admin_safe();

create function public.get_payment_settings_admin_safe()
returns table (
  id uuid,
  mp_access_token_configured boolean,
  mp_public_key text,
  mp_webhook_secret_configured boolean,
  stripe_secret_key_configured boolean,
  stripe_publishable_key text,
  stripe_webhook_secret_configured boolean,
  preferred_checkout_provider text,
  is_production boolean,
  last_updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    ps.id,
    coalesce(nullif(trim(ps.mp_access_token), '') is not null, false) as mp_access_token_configured,
    ps.mp_public_key,
    coalesce(nullif(trim(ps.mp_webhook_secret), '') is not null, false) as mp_webhook_secret_configured,
    coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false) as stripe_secret_key_configured,
    ps.stripe_publishable_key,
    coalesce(nullif(trim(ps.stripe_webhook_secret), '') is not null, false) as stripe_webhook_secret_configured,
    coalesce(nullif(trim(ps.preferred_checkout_provider), ''), 'mercadopago') as preferred_checkout_provider,
    ps.is_production,
    ps.last_updated_by,
    ps.created_at,
    ps.updated_at
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
end;
$$;

drop function if exists public.update_payment_settings_admin_safe(text, text, text, boolean);
drop function if exists public.update_payment_settings_admin_safe(text, text, text, text, text, text, text, boolean);

create function public.update_payment_settings_admin_safe(
  p_mp_access_token text default null,
  p_mp_public_key text default null,
  p_mp_webhook_secret text default null,
  p_stripe_secret_key text default null,
  p_stripe_publishable_key text default null,
  p_stripe_webhook_secret text default null,
  p_preferred_checkout_provider text default null,
  p_is_production boolean default null
)
returns table (
  id uuid,
  mp_access_token_configured boolean,
  mp_public_key text,
  mp_webhook_secret_configured boolean,
  stripe_secret_key_configured boolean,
  stripe_publishable_key text,
  stripe_webhook_secret_configured boolean,
  preferred_checkout_provider text,
  is_production boolean,
  last_updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_preferred_checkout_provider is not null
     and trim(p_preferred_checkout_provider) <> ''
     and trim(p_preferred_checkout_provider) not in ('mercadopago', 'stripe') then
    raise exception 'preferred_checkout_provider invalido';
  end if;

  update public.payment_settings
  set
    mp_access_token = case
      when p_mp_access_token is null or trim(p_mp_access_token) = '' then mp_access_token
      else trim(p_mp_access_token)
    end,
    mp_public_key = case
      when p_mp_public_key is null then mp_public_key
      else nullif(trim(p_mp_public_key), '')
    end,
    mp_webhook_secret = case
      when p_mp_webhook_secret is null or trim(p_mp_webhook_secret) = '' then mp_webhook_secret
      else trim(p_mp_webhook_secret)
    end,
    stripe_secret_key = case
      when p_stripe_secret_key is null or trim(p_stripe_secret_key) = '' then stripe_secret_key
      else trim(p_stripe_secret_key)
    end,
    stripe_publishable_key = case
      when p_stripe_publishable_key is null then stripe_publishable_key
      else nullif(trim(p_stripe_publishable_key), '')
    end,
    stripe_webhook_secret = case
      when p_stripe_webhook_secret is null or trim(p_stripe_webhook_secret) = '' then stripe_webhook_secret
      else trim(p_stripe_webhook_secret)
    end,
    preferred_checkout_provider = case
      when p_preferred_checkout_provider is null or trim(p_preferred_checkout_provider) = '' then preferred_checkout_provider
      else trim(p_preferred_checkout_provider)
    end,
    is_production = coalesce(p_is_production, is_production),
    last_updated_by = v_user_id,
    updated_at = now()
  where id = '00000000-0000-0000-0000-000000000005';

  return query
  select *
  from public.get_payment_settings_admin_safe();
end;
$$;

grant execute on function public.get_payment_settings_admin_safe() to authenticated;
grant execute on function public.update_payment_settings_admin_safe(text, text, text, text, text, text, text, boolean) to authenticated;

-- --------------------------------------------------
-- 4. Corrigir auditoria administrativa
-- --------------------------------------------------

create or replace function public.log_admin_action(
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_reason text default null,
  p_ip_address text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_email text;
  v_admin_name text;
  v_admin_role public.user_role;
  v_log_id uuid;
begin
  if v_admin_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  select u.email, u.name, u.role
    into v_admin_email, v_admin_name, v_admin_role
  from public.users u
  where u.id = v_admin_id;

  if not found then
    raise exception 'Usuário não encontrado';
  end if;

  if v_admin_role <> 'admin' then
    raise exception 'Apenas administradores podem registrar auditoria';
  end if;

  insert into public.admin_audit_logs (
    admin_id,
    admin_email,
    admin_name,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value,
    reason,
    ip_address,
    user_agent,
    metadata,
    created_at
  ) values (
    v_admin_id,
    v_admin_email,
    coalesce(v_admin_name, v_admin_email, 'Administrador'),
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_value,
    p_new_value,
    p_reason,
    nullif(trim(coalesce(p_ip_address, '')), '')::inet,
    p_user_agent,
    jsonb_build_object(
      'timestamp', now(),
      'request_info', jsonb_build_object(
        'ip', p_ip_address,
        'user_agent', p_user_agent
      )
    ),
    now()
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;
