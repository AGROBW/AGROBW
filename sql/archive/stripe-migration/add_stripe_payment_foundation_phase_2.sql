-- ==================================================
-- Etapa 2 - Fundacao Stripe em paralelo ao Mercado Pago
-- ==================================================
-- Objetivo:
-- - manter Mercado Pago funcionando
-- - preparar configuracao segura de Stripe no admin
-- - adicionar campos genericos para pagamentos e assinaturas
-- - nao ativar checkout Stripe ainda
-- ==================================================

alter table public.payment_settings
  add column if not exists stripe_secret_key text,
  add column if not exists stripe_publishable_key text,
  add column if not exists stripe_webhook_secret text,
  add column if not exists preferred_checkout_provider text not null default 'mercadopago',
  add column if not exists stripe_rollout_mode text not null default 'all_customers';

update public.payment_settings
set preferred_checkout_provider = 'mercadopago'
where preferred_checkout_provider is null
   or trim(preferred_checkout_provider) = '';

update public.payment_settings
set stripe_rollout_mode = 'all_customers'
where stripe_rollout_mode is null
   or trim(stripe_rollout_mode) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_settings_preferred_checkout_provider_check'
  ) then
    alter table public.payment_settings
      add constraint payment_settings_preferred_checkout_provider_check
      check (preferred_checkout_provider in ('mercadopago', 'stripe'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_settings_stripe_rollout_mode_check'
  ) then
    alter table public.payment_settings
      add constraint payment_settings_stripe_rollout_mode_check
      check (stripe_rollout_mode in ('all_customers', 'new_customers'));
  end if;
end $$;

comment on column public.payment_settings.stripe_secret_key is 'Secret Key da Stripe (sensivel)';
comment on column public.payment_settings.stripe_publishable_key is 'Publishable Key da Stripe';
comment on column public.payment_settings.stripe_webhook_secret is 'Webhook Secret da Stripe (sensivel)';
comment on column public.payment_settings.preferred_checkout_provider is 'Provedor planejado para o checkout principal';
comment on column public.payment_settings.stripe_rollout_mode is 'Controla se a Stripe atende toda a base ou apenas contas sem historico pago';

alter table public.payments
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_invoice_id text,
  add column if not exists provider_checkout_session_id text;

create index if not exists idx_payments_provider_customer_id
  on public.payments(provider, provider_customer_id)
  where provider_customer_id is not null;

create index if not exists idx_payments_provider_subscription_id
  on public.payments(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists idx_payments_provider_checkout_session_id
  on public.payments(provider, provider_checkout_session_id)
  where provider_checkout_session_id is not null;

alter table public.user_subscriptions
  add column if not exists provider text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_price_id text,
  add column if not exists provider_checkout_session_id text;

update public.user_subscriptions
set provider = 'mercadopago'
where provider is null
   or trim(provider) = '';

alter table public.user_subscriptions
  alter column provider set default 'mercadopago';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_subscriptions_provider_check'
  ) then
    alter table public.user_subscriptions
      drop constraint user_subscriptions_provider_check;
  end if;

  alter table public.user_subscriptions
    add constraint user_subscriptions_provider_check
    check (provider in ('mercadopago', 'stripe', 'legacy'));
exception
  when duplicate_object then
    null;
end $$;

alter table public.user_subscriptions
  alter column provider set not null;

create index if not exists idx_user_subscriptions_provider
  on public.user_subscriptions(provider);

create index if not exists idx_user_subscriptions_provider_subscription_id
  on public.user_subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists idx_user_subscriptions_provider_customer_id
  on public.user_subscriptions(provider, provider_customer_id)
  where provider_customer_id is not null;

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
  stripe_rollout_mode text,
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
    coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') as stripe_rollout_mode,
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
drop function if exists public.update_payment_settings_admin_safe(text, text, text, text, text, text, text, text, boolean);

create function public.update_payment_settings_admin_safe(
  p_mp_access_token text default null,
  p_mp_public_key text default null,
  p_mp_webhook_secret text default null,
  p_stripe_secret_key text default null,
  p_stripe_publishable_key text default null,
  p_stripe_webhook_secret text default null,
  p_preferred_checkout_provider text default null,
  p_stripe_rollout_mode text default null,
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
  stripe_rollout_mode text,
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

  if p_stripe_rollout_mode is not null
     and trim(p_stripe_rollout_mode) <> ''
     and trim(p_stripe_rollout_mode) not in ('all_customers', 'new_customers') then
    raise exception 'stripe_rollout_mode invalido';
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
    stripe_rollout_mode = case
      when p_stripe_rollout_mode is null or trim(p_stripe_rollout_mode) = '' then stripe_rollout_mode
      else trim(p_stripe_rollout_mode)
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
grant execute on function public.update_payment_settings_admin_safe(text, text, text, text, text, text, text, text, boolean) to authenticated;
