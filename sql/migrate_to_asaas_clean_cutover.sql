begin;

alter table if exists public.payment_settings
  add column if not exists asaas_api_key text,
  add column if not exists asaas_webhook_token text,
  add column if not exists is_production boolean not null default false;

alter table if exists public.payment_settings
  drop column if exists stripe_secret_key,
  drop column if exists stripe_publishable_key,
  drop column if exists stripe_webhook_secret,
  drop column if exists stripe_rollout_mode;

do $$
declare
  v_constraint_name text;
begin
  begin
    select conname
    into v_constraint_name
    from pg_constraint
    where conrelid = 'public.payment_settings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%preferred_checkout_provider%';

    if v_constraint_name is not null then
      execute format('alter table public.payment_settings drop constraint %I', v_constraint_name);
    end if;
  exception when undefined_table then
    null;
  end;
end
$$;

alter table if exists public.payment_settings
  drop constraint if exists payment_settings_preferred_checkout_provider_check;

alter table if exists public.payment_settings
  alter column preferred_checkout_provider set default 'asaas';

update public.payment_settings
set preferred_checkout_provider = 'asaas'
where preferred_checkout_provider is distinct from 'asaas';

alter table if exists public.payment_settings
  add constraint payment_settings_preferred_checkout_provider_check
  check (preferred_checkout_provider in ('asaas'));

drop table if exists public.stripe_rollout_overrides cascade;
drop table if exists public.subscription_change_requests cascade;

drop function if exists public.get_stripe_rollout_summary_admin_safe();
drop function if exists public.list_stripe_rollout_overrides_admin_safe();
drop function if exists public.search_users_for_stripe_rollout_admin_safe(text);
drop function if exists public.upsert_stripe_rollout_override_admin_safe(uuid, text);
drop function if exists public.delete_stripe_rollout_override_admin_safe(uuid);
drop function if exists public.get_my_pending_subscription_change();
drop function if exists public.request_subscription_change_next_cycle(text, uuid, text);
drop function if exists public.cancel_my_pending_subscription_change();

alter table if exists public.plans
  drop column if exists stripe_monthly_price_id,
  drop column if exists stripe_yearly_price_id;

alter table if exists public.highlight_boosters
  drop column if exists stripe_price_id;

alter table if exists public.plans
  add column if not exists billing_model text not null default 'one_time';

update public.plans
set billing_model = 'one_time'
where billing_model is null
   or billing_model not in ('one_time', 'recurring');

alter table if exists public.plans
  drop constraint if exists plans_billing_model_check;

alter table if exists public.plans
  add constraint plans_billing_model_check
  check (billing_model in ('one_time', 'recurring'));

alter table if exists public.user_subscriptions
  add column if not exists billing_model text not null default 'one_time';

update public.user_subscriptions
set billing_model = case
  when provider_subscription_id is not null then 'recurring'
  else 'one_time'
end
where billing_model is null
   or billing_model not in ('one_time', 'recurring');

alter table if exists public.user_subscriptions
  drop constraint if exists user_subscriptions_billing_model_check;

alter table if exists public.user_subscriptions
  add constraint user_subscriptions_billing_model_check
  check (billing_model in ('one_time', 'recurring'));

alter table if exists public.payments
  add column if not exists billing_model text;

update public.payments
set billing_model = case
  when provider_subscription_id is not null then 'recurring'
  else 'one_time'
end
where billing_model is null
   or billing_model not in ('one_time', 'recurring');

alter table if exists public.payments
  drop constraint if exists payments_billing_model_check;

alter table if exists public.payments
  add constraint payments_billing_model_check
  check (billing_model in ('one_time', 'recurring'));

delete from public.webhook_logs where provider = 'stripe';
delete from public.payments where provider = 'stripe';
delete from public.user_subscriptions where provider = 'stripe';

alter table if exists public.payments
  alter column provider set default 'asaas';

update public.user_subscriptions
set provider = 'legacy'
where provider is null
   or provider not in ('asaas', 'legacy');

update public.payments
set provider = 'legacy'
where provider is null
   or provider not in ('asaas', 'legacy');

do $$
declare
  v_constraint_name text;
begin
  begin
    select conname
    into v_constraint_name
    from pg_constraint
    where conrelid = 'public.user_subscriptions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider%';

    if v_constraint_name is not null then
      execute format('alter table public.user_subscriptions drop constraint %I', v_constraint_name);
    end if;
  exception when undefined_table then
    null;
  end;

  begin
    select conname
    into v_constraint_name
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider%';

    if v_constraint_name is not null then
      execute format('alter table public.payments drop constraint %I', v_constraint_name);
    end if;
  exception when undefined_table then
    null;
  end;
end
$$;

alter table if exists public.user_subscriptions
  drop constraint if exists user_subscriptions_provider_check;

alter table if exists public.user_subscriptions
  alter column provider set default 'asaas';

alter table if exists public.user_subscriptions
  add constraint user_subscriptions_provider_check
  check (provider in ('asaas', 'legacy'));

alter table if exists public.payments
  drop constraint if exists payments_provider_check;

alter table if exists public.payments
  add constraint payments_provider_check
  check (provider in ('asaas', 'legacy'));

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
    coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false),
    coalesce(nullif(trim(ps.asaas_webhook_token), '') is not null, false),
    'asaas'::text,
    ps.is_production,
    ps.last_updated_by,
    ps.created_at,
    ps.updated_at
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
end;
$$;

grant execute on function public.get_payment_settings_admin_safe() to authenticated;

drop function if exists public.update_payment_settings_admin_safe(text, text, text, boolean);
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
    coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false),
    coalesce(nullif(trim(ps.asaas_webhook_token), '') is not null, false),
    'asaas'::text,
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
    'asaas'::text,
    coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false),
    case
      when not coalesce(nullif(trim(ps.asaas_api_key), '') is not null, false) then 'asaas_not_configured'
      else 'ok'
    end,
    ps.is_production
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005';
$$;

grant execute on function public.get_checkout_gateway_public_safe() to authenticated, anon;

notify pgrst, 'reload schema';

commit;
