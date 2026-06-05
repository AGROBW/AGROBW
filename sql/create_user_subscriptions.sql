-- =====================================================
-- Tabela de Assinaturas de Usuarios (ASAAS + LEGACY)
-- =====================================================

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_id uuid null references public.plans(id) on delete set null,
  billing_model text not null default 'one_time'
    check (billing_model in ('one_time', 'recurring')),
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'trialing', 'past_due', 'canceled', 'cancelled', 'expired')),
  provider text not null default 'asaas'
    check (provider in ('asaas', 'legacy')),
  amount_paid numeric(10,2) not null default 0,
  currency text not null default 'BRL',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  category_highlights_carryover integer not null default 0,
  home_highlights_carryover integer not null default 0,
  cancel_at_period_end boolean not null default false,
  trial_end_date timestamptz null,
  provider_customer_id text,
  provider_subscription_id text,
  provider_price_id text,
  provider_checkout_session_id text,
  source text null,
  promotion_code_id uuid null references public.promotion_plan_codes(id) on delete set null,
  promotion_redemption_id uuid null references public.promotion_plan_redemptions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions
  add column if not exists billing_model text not null default 'one_time';

alter table public.user_subscriptions
  add column if not exists current_period_start timestamptz not null default now();

alter table public.user_subscriptions
  add column if not exists current_period_end timestamptz;

alter table public.user_subscriptions
  add column if not exists category_highlights_carryover integer not null default 0;

alter table public.user_subscriptions
  add column if not exists home_highlights_carryover integer not null default 0;

alter table public.user_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

alter table public.user_subscriptions
  add column if not exists trial_end_date timestamptz null;

alter table public.user_subscriptions
  add column if not exists source text null;

alter table public.user_subscriptions
  add column if not exists promotion_code_id uuid null references public.promotion_plan_codes(id) on delete set null;

alter table public.user_subscriptions
  add column if not exists promotion_redemption_id uuid null references public.promotion_plan_redemptions(id) on delete set null;

create index if not exists idx_user_subscriptions_user_id on public.user_subscriptions(user_id);
create index if not exists idx_user_subscriptions_plan_id on public.user_subscriptions(plan_id);
create index if not exists idx_user_subscriptions_billing_model on public.user_subscriptions(billing_model);
create index if not exists idx_user_subscriptions_status on public.user_subscriptions(status);
create index if not exists idx_user_subscriptions_provider on public.user_subscriptions(provider);
create index if not exists idx_user_subscriptions_period_end on public.user_subscriptions(current_period_end desc);
create index if not exists idx_user_subscriptions_provider_subscription_id on public.user_subscriptions(provider_subscription_id);
create index if not exists idx_user_subscriptions_provider_customer_id on public.user_subscriptions(provider_customer_id);

create unique index if not exists idx_user_subscriptions_one_active_per_user
  on public.user_subscriptions (user_id)
  where status = 'active';

alter table public.user_subscriptions enable row level security;

drop policy if exists "Users can view own subscriptions" on public.user_subscriptions;
create policy "Users can view own subscriptions"
on public.user_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can view all subscriptions" on public.user_subscriptions;
create policy "Admins can view all subscriptions"
on public.user_subscriptions
for select
to authenticated
using (public.is_admin() = true);

drop policy if exists "Only admins can create subscriptions" on public.user_subscriptions;
create policy "Only admins can create subscriptions"
on public.user_subscriptions
for insert
to authenticated
with check (public.is_admin() = true);

drop policy if exists "Admins can update subscriptions" on public.user_subscriptions;
create policy "Admins can update subscriptions"
on public.user_subscriptions
for update
to authenticated
using (public.is_admin() = true)
with check (public.is_admin() = true);

drop policy if exists "Admins can delete subscriptions" on public.user_subscriptions;
create policy "Admins can delete subscriptions"
on public.user_subscriptions
for delete
to authenticated
using (public.is_admin() = true);

create or replace function public.update_user_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_update_user_subscriptions_updated_at on public.user_subscriptions;
create trigger trigger_update_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row
execute function public.update_user_subscriptions_updated_at();

create or replace function public.cancel_subscription(p_subscription_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.user_subscriptions
  where id = p_subscription_id;

  if auth.uid() != v_user_id and not public.is_admin() then
    raise exception 'Unauthorized to cancel this subscription';
  end if;

  update public.user_subscriptions
  set
    status = 'cancelled',
    cancel_at_period_end = true,
    current_period_end = least(coalesce(current_period_end, now()), now()),
    updated_at = now()
  where id = p_subscription_id;

  return true;
end;
$$;

grant execute on function public.cancel_subscription(uuid) to authenticated;

create or replace function public.has_active_subscription(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_active boolean;
begin
  select exists (
    select 1
    from public.user_subscriptions
    where user_id = p_user_id
      and status in ('active', 'trialing', 'past_due')
      and current_period_end > now()
  )
  into v_has_active;

  return v_has_active;
end;
$$;

grant execute on function public.has_active_subscription(uuid) to authenticated, anon;

create or replace function public.get_active_subscription(p_user_id uuid)
returns table (
  id uuid,
  plan_id uuid,
  plan_name text,
  billing_cycle text,
  status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  amount_paid numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    s.id,
    s.plan_id,
    p.name as plan_name,
    s.billing_cycle,
    s.status,
    s.current_period_start,
    s.current_period_end,
    s.amount_paid
  from public.user_subscriptions s
  left join public.plans p on p.id = s.plan_id
  where s.user_id = p_user_id
    and s.status in ('active', 'trialing', 'past_due')
    and s.current_period_end > now()
  order by s.current_period_end desc
  limit 1;
end;
$$;

grant execute on function public.get_active_subscription(uuid) to authenticated, anon;

create or replace function public.expire_old_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_count integer;
begin
  with expired_rows as (
    update public.user_subscriptions
    set
      status = 'expired',
      updated_at = now()
    where status in ('active', 'trialing', 'past_due')
      and current_period_end < now()
    returning id
  )
  select count(*) into v_expired_count from expired_rows;

  return v_expired_count;
end;
$$;

grant execute on function public.expire_old_subscriptions() to authenticated;
