-- ======================================================
-- BWAGRO - user_subscriptions, função e view de uso
-- ======================================================
-- Execute no SQL Editor do Supabase Dashboard

-- 1) Tabela user_subscriptions
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status text not null check (status in ('active','trialing','past_due','canceled','expired')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  trial_end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_subscriptions_user_id on public.user_subscriptions(user_id);
create index if not exists idx_user_subscriptions_plan_id on public.user_subscriptions(plan_id);
create index if not exists idx_user_subscriptions_status on public.user_subscriptions(status);

-- Trigger para updated_at
create or replace function public.set_updated_at_user_subscriptions()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_subscriptions_updated_at on public.user_subscriptions;
create trigger trg_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row execute procedure public.set_updated_at_user_subscriptions();

-- 2) Função check_user_plan_active
create or replace function public.check_user_plan_active(user_uuid uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  is_active boolean := false;
begin
  select exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = user_uuid
      and us.status = 'active'
      and now() < us.current_period_end
  ) into is_active;

  return is_active;
end;
$$;

-- 3) View v_user_usage
create or replace view public.v_user_usage as
with latest_sub as (
  select distinct on (user_id)
    us.user_id,
    us.plan_id,
    us.status,
    us.current_period_start,
    us.current_period_end
  from public.user_subscriptions us
  order by us.user_id, us.current_period_end desc
)
select
  u.id as user_id,
  p.id as plan_id,
  p.name as plan_name,
  p.max_ads,
  p.lead_contact_limit_days,
  (select count(*) from public.ads a where a.user_id = u.id) as ads_count,
  greatest(p.max_ads - (select count(*) from public.ads a where a.user_id = u.id), 0) as ads_remaining,
  greatest(
    p.lead_contact_limit_days - (extract(day from (now() - ls.current_period_start))::int),
    0
  ) as lead_days_remaining,
  greatest(extract(day from (ls.current_period_end - now()))::int, 0) as period_days_remaining
from public.users u
join latest_sub ls on ls.user_id = u.id
join public.plans p on p.id = ls.plan_id;

-- 4) Trigger para atribuir Start Agro ao criar usuário
create or replace function public.assign_start_agro_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  start_plan_id uuid;
  start_lead_days int;
begin
  select id, lead_contact_limit_days
    into start_plan_id, start_lead_days
  from public.plans
  where name = 'Start'
  limit 1;

  if start_plan_id is null then
    return new;
  end if;

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    trial_end_date
  ) values (
    new.id,
    start_plan_id,
    'active',
    now(),
    now() + interval '30 days',
    false,
    case when start_lead_days is not null then now() + (start_lead_days || ' days')::interval else null end
  );

  return new;
end;
$$;

drop trigger if exists trg_assign_start_plan on public.users;
create trigger trg_assign_start_plan
after insert on public.users
for each row execute procedure public.assign_start_agro_plan();

-- RLS (opcional)
alter table public.user_subscriptions enable row level security;

drop policy if exists "User subscriptions read" on public.user_subscriptions;
create policy "User subscriptions read" on public.user_subscriptions
for select using (auth.uid() = user_id);
