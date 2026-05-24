-- Etapa 8 - retirada operacional final do Mercado Pago
-- Objetivo:
-- - consolidar Stripe como gateway operacional unico
-- - preservar apenas o historico legado do Mercado Pago
-- - remover o caminho runtime de checkout antigo

begin;

update public.payment_settings
set
  mp_access_token = null,
  mp_public_key = null,
  mp_webhook_secret = null,
  preferred_checkout_provider = 'stripe',
  stripe_rollout_mode = 'all_customers',
  mercadopago_runtime_fallback_enabled = false,
  updated_at = now()
where id = '00000000-0000-0000-0000-000000000005';

alter table public.payment_settings
  alter column preferred_checkout_provider set default 'stripe';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'payment_settings_preferred_checkout_provider_check'
      and conrelid = 'public.payment_settings'::regclass
  ) then
    alter table public.payment_settings
      drop constraint payment_settings_preferred_checkout_provider_check;
  end if;

  alter table public.payment_settings
    add constraint payment_settings_preferred_checkout_provider_check
    check (preferred_checkout_provider in ('stripe'));
end;
$$;

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
  mercadopago_runtime_fallback_enabled boolean,
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
    false as mp_access_token_configured,
    null::text as mp_public_key,
    false as mp_webhook_secret_configured,
    coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false) as stripe_secret_key_configured,
    ps.stripe_publishable_key,
    coalesce(nullif(trim(ps.stripe_webhook_secret), '') is not null, false) as stripe_webhook_secret_configured,
    'stripe'::text as preferred_checkout_provider,
    'all_customers'::text as stripe_rollout_mode,
    false as mercadopago_runtime_fallback_enabled,
    ps.is_production,
    ps.last_updated_by,
    ps.created_at,
    ps.updated_at
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
end;
$$;

drop function if exists public.update_payment_settings_admin_safe(text, text, text, text, text, text, text, text, boolean, boolean);

create function public.update_payment_settings_admin_safe(
  p_mp_access_token text default null,
  p_mp_public_key text default null,
  p_mp_webhook_secret text default null,
  p_stripe_secret_key text default null,
  p_stripe_publishable_key text default null,
  p_stripe_webhook_secret text default null,
  p_preferred_checkout_provider text default null,
  p_stripe_rollout_mode text default null,
  p_mercadopago_runtime_fallback_enabled boolean default null,
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
  mercadopago_runtime_fallback_enabled boolean,
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

  update public.payment_settings
  set
    mp_access_token = null,
    mp_public_key = null,
    mp_webhook_secret = null,
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
    preferred_checkout_provider = 'stripe',
    stripe_rollout_mode = 'all_customers',
    mercadopago_runtime_fallback_enabled = false,
    is_production = coalesce(p_is_production, is_production),
    last_updated_by = v_user_id,
    updated_at = now()
  where id = '00000000-0000-0000-0000-000000000005';

  return query
  select *
  from public.get_payment_settings_admin_safe();
end;
$$;

drop function if exists public.get_checkout_gateway_public_safe();

create function public.get_checkout_gateway_public_safe()
returns table (
  preferred_checkout_provider text,
  mercado_pago_enabled boolean,
  stripe_enabled boolean,
  stripe_rollout_mode text,
  stripe_checkout_allowed_for_current_user boolean,
  stripe_checkout_reason text,
  is_production boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthenticated';
  end if;

  return query
  select
    'stripe'::text as preferred_checkout_provider,
    false as mercado_pago_enabled,
    coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false)
      and coalesce(nullif(trim(ps.stripe_publishable_key), '') is not null, false) as stripe_enabled,
    'all_customers'::text as stripe_rollout_mode,
    coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false)
      and coalesce(nullif(trim(ps.stripe_publishable_key), '') is not null, false) as stripe_checkout_allowed_for_current_user,
    case
      when not (
        coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false)
        and coalesce(nullif(trim(ps.stripe_publishable_key), '') is not null, false)
      ) then 'stripe_not_configured'
      else 'all_customers'
    end as stripe_checkout_reason,
    ps.is_production
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005'
  limit 1;
end;
$$;

drop function if exists public.get_mp_credentials();

grant execute on function public.get_payment_settings_admin_safe() to authenticated;
grant execute on function public.update_payment_settings_admin_safe(text, text, text, text, text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.get_checkout_gateway_public_safe() to authenticated;

commit;
