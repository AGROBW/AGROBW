-- ==================================================
-- TABELAS PARA INTEGRACOES DE PAGAMENTO (ASAAS-ONLY)
-- ==================================================

create table if not exists public.payment_settings (
  id uuid primary key default gen_random_uuid(),
  asaas_api_key text,
  asaas_webhook_token text,
  preferred_checkout_provider text not null default 'asaas'
    check (preferred_checkout_provider in ('asaas')),
  is_production boolean not null default false,
  last_updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_settings_singleton check (id = '00000000-0000-0000-0000-000000000005')
);

comment on table public.payment_settings is 'Configuracoes do gateway de pagamento (Asaas only).';
comment on column public.payment_settings.asaas_api_key is 'API key do Asaas (sensivel).';
comment on column public.payment_settings.asaas_webhook_token is 'Token validado no header asaas-access-token.';
comment on column public.payment_settings.preferred_checkout_provider is 'Gateway unico de checkout da plataforma.';
comment on column public.payment_settings.is_production is 'false = sandbox, true = producao.';

create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  provider varchar(50) not null default 'asaas',
  event_type varchar(100),
  payload jsonb not null,
  status_code int,
  processed boolean not null default false,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_webhook_logs_provider on public.webhook_logs(provider);
create index if not exists idx_webhook_logs_received_at on public.webhook_logs(received_at desc);
create index if not exists idx_webhook_logs_processed on public.webhook_logs(processed);

comment on table public.webhook_logs is 'Logs de webhooks recebidos do Asaas e de provedores legados.';
comment on column public.webhook_logs.provider is 'Provedor emissor do webhook.';

create or replace function public.update_payment_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_update_payment_settings_updated_at on public.payment_settings;
create trigger trigger_update_payment_settings_updated_at
before update on public.payment_settings
for each row
execute function public.update_payment_settings_updated_at();

alter table public.payment_settings enable row level security;
alter table public.webhook_logs enable row level security;

drop policy if exists "Admins can view webhook logs" on public.webhook_logs;
drop policy if exists "Admins can delete webhook logs" on public.webhook_logs;

create policy "Admins can view webhook logs"
on public.webhook_logs
for select
to authenticated
using (public.is_admin() = true);

create policy "Admins can delete webhook logs"
on public.webhook_logs
for delete
to authenticated
using (public.is_admin() = true);

insert into public.payment_settings (
  id,
  asaas_api_key,
  asaas_webhook_token,
  preferred_checkout_provider,
  is_production
) values (
  '00000000-0000-0000-0000-000000000005',
  null,
  null,
  'asaas',
  false
)
on conflict (id) do nothing;

drop function if exists public.get_payment_settings_admin_safe();
create or replace function public.get_payment_settings_admin_safe()
returns table (
  id uuid,
  asaas_api_key_configured boolean,
  asaas_webhook_token_configured boolean,
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
    coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false) as asaas_api_key_configured,
    coalesce(nullif(trim(ps.asaas_webhook_token), '') is not null, false) as asaas_webhook_token_configured,
    'asaas'::text as preferred_checkout_provider,
    ps.is_production,
    ps.last_updated_by,
    ps.created_at,
    ps.updated_at
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
end;
$$;

grant execute on function public.get_payment_settings_admin_safe() to authenticated;

drop function if exists public.update_payment_settings_admin_safe(text, text, boolean);
create or replace function public.update_payment_settings_admin_safe(
  p_asaas_api_key text default null,
  p_asaas_webhook_token text default null,
  p_is_production boolean default null
)
returns table (
  id uuid,
  asaas_api_key_configured boolean,
  asaas_webhook_token_configured boolean,
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

  update public.payment_settings ps
  set
    asaas_api_key = case
      when p_asaas_api_key is null or trim(p_asaas_api_key) = '' then ps.asaas_api_key
      else trim(p_asaas_api_key)
    end,
    asaas_webhook_token = case
      when p_asaas_webhook_token is null or trim(p_asaas_webhook_token) = '' then ps.asaas_webhook_token
      else trim(p_asaas_webhook_token)
    end,
    preferred_checkout_provider = 'asaas',
    is_production = coalesce(p_is_production, ps.is_production),
    last_updated_by = v_user_id,
    updated_at = now()
  where ps.id = '00000000-0000-0000-0000-000000000005';

  return query
  select
    ps.id,
    coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false) as asaas_api_key_configured,
    coalesce(nullif(trim(ps.asaas_webhook_token), '') is not null, false) as asaas_webhook_token_configured,
    'asaas'::text as preferred_checkout_provider,
    ps.is_production,
    ps.last_updated_by,
    ps.created_at,
    ps.updated_at
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
end;
$$;

grant execute on function public.update_payment_settings_admin_safe(text, text, boolean) to authenticated;

drop function if exists public.get_checkout_gateway_public_safe();
create or replace function public.get_checkout_gateway_public_safe()
returns table (
  preferred_checkout_provider text,
  asaas_enabled boolean,
  checkout_reason text,
  is_production boolean
)
language sql
security definer
set search_path = public
as $$
  select
    'asaas'::text as preferred_checkout_provider,
    coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false) as asaas_enabled,
    case
      when not coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false) then 'asaas_not_configured'
      else 'ok'
    end as checkout_reason,
    ps.is_production
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
$$;

grant execute on function public.get_checkout_gateway_public_safe() to authenticated, anon;
