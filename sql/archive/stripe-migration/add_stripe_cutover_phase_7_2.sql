-- Etapa 7.2 - corte operacional controlado do legado
-- Objetivo:
-- - manter o legado do Mercado Pago apenas como contingencia tecnica
-- - permitir desligar o fallback operacional sem remover ainda o historico

begin;

alter table public.payment_settings
  add column if not exists mercadopago_runtime_fallback_enabled boolean not null default true;

comment on column public.payment_settings.mercadopago_runtime_fallback_enabled is
  'Quando false, novos checkouts nao podem mais cair no fallback operacional do Mercado Pago.';

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
    coalesce(nullif(trim(ps.mp_access_token), '') is not null, false) as mp_access_token_configured,
    ps.mp_public_key,
    coalesce(nullif(trim(ps.mp_webhook_secret), '') is not null, false) as mp_webhook_secret_configured,
    coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false) as stripe_secret_key_configured,
    ps.stripe_publishable_key,
    coalesce(nullif(trim(ps.stripe_webhook_secret), '') is not null, false) as stripe_webhook_secret_configured,
    coalesce(nullif(trim(ps.preferred_checkout_provider), ''), 'mercadopago') as preferred_checkout_provider,
    coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') as stripe_rollout_mode,
    coalesce(ps.mercadopago_runtime_fallback_enabled, true) as mercadopago_runtime_fallback_enabled,
    ps.is_production,
    ps.last_updated_by,
    ps.created_at,
    ps.updated_at
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
end;
$$;

drop function if exists public.update_payment_settings_admin_safe(text, text, text, text, text, text, text, text, boolean);
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
    mercadopago_runtime_fallback_enabled = coalesce(p_mercadopago_runtime_fallback_enabled, mercadopago_runtime_fallback_enabled),
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
  v_has_paid_history boolean := false;
  v_has_manual_override boolean := false;
begin
  if v_user_id is null then
    raise exception 'Unauthenticated';
  end if;

  select exists (
    select 1
    from public.payments p
    where p.user_id = v_user_id
      and p.status = 'approved'
      and coalesce(p.amount, 0) > 0
  )
  or exists (
    select 1
    from public.user_subscriptions us
    join public.plans pl on pl.id = us.plan_id
    where us.user_id = v_user_id
      and (
        coalesce(us.amount_paid, 0) > 0
        or coalesce(pl.monthly_price, 0) > 0
      )
  )
  into v_has_paid_history;

  select exists (
    select 1
    from public.stripe_rollout_overrides sro
    where sro.user_id = v_user_id
  )
  into v_has_manual_override;

  return query
  select
    coalesce(nullif(trim(ps.preferred_checkout_provider), ''), 'mercadopago') as preferred_checkout_provider,
    coalesce(ps.mercadopago_runtime_fallback_enabled, true)
      and coalesce(nullif(trim(ps.mp_access_token), '') is not null, false)
      and coalesce(nullif(trim(ps.mp_public_key), '') is not null, false) as mercado_pago_enabled,
    coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false)
      and coalesce(nullif(trim(ps.stripe_publishable_key), '') is not null, false) as stripe_enabled,
    coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') as stripe_rollout_mode,
    case
      when not (
        coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false)
        and coalesce(nullif(trim(ps.stripe_publishable_key), '') is not null, false)
      ) then false
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'all_customers' then true
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers'
        and (not v_has_paid_history or v_has_manual_override) then true
      else false
    end as stripe_checkout_allowed_for_current_user,
    case
      when not (
        coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false)
        and coalesce(nullif(trim(ps.stripe_publishable_key), '') is not null, false)
      ) then 'stripe_not_configured'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'all_customers' then 'all_customers'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers'
        and v_has_paid_history and v_has_manual_override then 'manual_override_legacy_customer'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers'
        and v_has_paid_history and not v_has_manual_override then 'existing_paid_customer'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers'
        and not v_has_paid_history then 'eligible_new_customer'
      else 'unknown'
    end as stripe_checkout_reason,
    ps.is_production
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005'
  limit 1;
end;
$$;

grant execute on function public.get_payment_settings_admin_safe() to authenticated;
grant execute on function public.update_payment_settings_admin_safe(text, text, text, text, text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.get_checkout_gateway_public_safe() to authenticated;

commit;
