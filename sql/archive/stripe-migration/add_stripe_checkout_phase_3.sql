-- ==================================================
-- Etapa 3 - Checkout Stripe e portal do cliente
-- ==================================================
-- Objetivo:
-- - mapear planos para price_ids da Stripe
-- - expor configuracao publica segura do gateway preferido
-- - nao remover o fluxo atual do Mercado Pago
-- ==================================================

alter table public.plans
  add column if not exists stripe_monthly_price_id text,
  add column if not exists stripe_yearly_price_id text;

comment on column public.plans.stripe_monthly_price_id is 'Price ID mensal da Stripe para este plano';
comment on column public.plans.stripe_yearly_price_id is 'Price ID anual da Stripe para este plano';

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

  return query
  select
    coalesce(nullif(trim(ps.preferred_checkout_provider), ''), 'mercadopago') as preferred_checkout_provider,
    coalesce(nullif(trim(ps.mp_access_token), '') is not null, false)
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
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers' then not v_has_paid_history
      else false
    end as stripe_checkout_allowed_for_current_user,
    case
      when not (
        coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false)
        and coalesce(nullif(trim(ps.stripe_publishable_key), '') is not null, false)
      ) then 'stripe_not_configured'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'all_customers' then 'all_customers'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers' and v_has_paid_history then 'existing_paid_customer'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers' and not v_has_paid_history then 'eligible_new_customer'
      else 'unknown'
    end as stripe_checkout_reason,
    ps.is_production
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005'
  limit 1;
end;
$$;

grant execute on function public.get_checkout_gateway_public_safe() to authenticated;
