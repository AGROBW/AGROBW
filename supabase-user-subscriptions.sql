-- ======================================================
-- BWAGRO - user_subscriptions, função e view de uso
-- ======================================================
-- Execute no SQL Editor do Supabase Dashboard

create or replace function public.resolve_plan_validity_days(
  p_billing_cycle text,
  p_monthly_days integer,
  p_yearly_days integer
)
returns integer
language sql
immutable
as $$
  select case
    when lower(coalesce(p_billing_cycle, 'monthly')) = 'yearly' then coalesce(p_yearly_days, 365)
    else coalesce(p_monthly_days, 30)
  end;
$$;

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
create or replace function public.ensure_user_current_subscription(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_subscription_id uuid;
  v_downgrade_plan record;
  v_previous_subscription record;
  v_user_profile record;
  v_period_days integer;
begin
  if p_user_id is null then
    return null;
  end if;

  update public.user_subscriptions
  set status = 'expired',
      updated_at = now()
  where user_id = p_user_id
    and status = 'active'
    and current_period_end <= now();

  update public.user_subscriptions
  set status = 'expired',
      updated_at = now()
  where id in (
    select id
    from (
      select
        us.id,
        row_number() over (
          order by
            us.current_period_end desc nulls last,
            us.created_at desc
        ) as rn
      from public.user_subscriptions us
      where us.user_id = p_user_id
        and us.status = 'active'
        and us.current_period_end > now()
    ) ranked
    where ranked.rn > 1
  );

  select us.id
  into v_active_subscription_id
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and us.status = 'active'
    and us.current_period_end > now()
  order by us.current_period_end desc
  limit 1;

  if v_active_subscription_id is not null then
    return v_active_subscription_id;
  end if;

  select
    us.id,
    us.plan_id,
    p.name as plan_name,
    us.current_period_end
  into v_previous_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = p_user_id
  order by us.current_period_end desc nulls last, us.created_at desc
  limit 1;

  select
    p.id,
    p.name,
    p.plan_validity_days_monthly,
    p.plan_validity_days_yearly
  into v_downgrade_plan
  from public.plans p
  where p.is_active = true
    and p.is_downgrade_plan = true
  order by p.position asc, p.created_at asc
  limit 1;

  if v_downgrade_plan.id is null then
    return null;
  end if;

  v_period_days := public.resolve_plan_validity_days(
    'monthly',
    v_downgrade_plan.plan_validity_days_monthly,
    v_downgrade_plan.plan_validity_days_yearly
  );

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    trial_end_date
  ) values (
    p_user_id,
    v_downgrade_plan.id,
    'active',
    now(),
    now() + (coalesce(v_period_days, 30) || ' days')::interval,
    false,
    null
  )
  returning id into v_active_subscription_id;

  select
    u.email,
    coalesce(u.name, u.email, 'Sistema') as name
  into v_user_profile
  from public.users u
  where u.id = p_user_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  ) values (
    p_user_id,
    'SYSTEM',
    'Plano ajustado automaticamente',
    format(
      'Sua assinatura anterior expirou e sua conta foi movida para o plano %s. As mensagens enviadas continuam liberadas, mas os contatos recebidos seguem as regras do novo plano.',
      coalesce(v_downgrade_plan.name, 'Básico')
    ),
    '/#/minha-conta/meu-plano'
  );

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
    metadata
  ) values (
    p_user_id,
    coalesce(v_user_profile.email, 'sistema@bwagro.local'),
    coalesce(v_user_profile.name, 'Sistema'),
    'SUBSCRIPTION_AUTO_DOWNGRADED',
    'SUBSCRIPTION',
    v_active_subscription_id,
    jsonb_build_object(
      'previous_plan_id', v_previous_subscription.plan_id,
      'previous_plan_name', v_previous_subscription.plan_name,
      'previous_period_end', v_previous_subscription.current_period_end
    ),
    jsonb_build_object(
      'new_plan_id', v_downgrade_plan.id,
      'new_plan_name', v_downgrade_plan.name
    ),
    'Downgrade automático por expiração da assinatura',
    jsonb_build_object(
      'trigger', 'ensure_user_current_subscription'
    )
  );

  return v_active_subscription_id;
end;
$$;

create or replace function public.check_user_plan_active(user_uuid uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  is_active boolean := false;
begin
  perform public.ensure_user_current_subscription(user_uuid);

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

create or replace function public.downgrade_expired_subscriptions_to_basic()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_count integer := 0;
  v_had_active_subscription boolean;
  v_new_subscription_id uuid;
begin
  for v_user in
    select distinct us.user_id
    from public.user_subscriptions us
    where us.current_period_end <= now()
  loop
    select exists (
      select 1
      from public.user_subscriptions us
      where us.user_id = v_user.user_id
        and us.status = 'active'
        and us.current_period_end > now()
    )
    into v_had_active_subscription;

    v_new_subscription_id := public.ensure_user_current_subscription(v_user.user_id);

    if not v_had_active_subscription and v_new_subscription_id is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
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
  public.resolve_lead_contact_limit_days(
    ls.current_period_start,
    ls.current_period_end,
    p.lead_contact_limit_days_monthly,
    p.lead_contact_limit_days_yearly,
    p.lead_contact_limit_days
  ) as lead_contact_limit_days,
  (select count(*) from public.announcements a where a.user_id = u.id) as ads_count,
  greatest(p.max_ads - (select count(*) from public.announcements a where a.user_id = u.id), 0) as ads_remaining,
  greatest(
    public.resolve_lead_contact_limit_days(
      ls.current_period_start,
      ls.current_period_end,
      p.lead_contact_limit_days_monthly,
      p.lead_contact_limit_days_yearly,
      p.lead_contact_limit_days
    ) - (extract(day from (now() - ls.current_period_start))::int),
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
  start_plan_validity_days int;
begin
  select
    id,
    coalesce(lead_contact_limit_days_monthly, lead_contact_limit_days),
    public.resolve_plan_validity_days('monthly', plan_validity_days_monthly, plan_validity_days_yearly)
    into start_plan_id, start_lead_days, start_plan_validity_days
  from public.plans
  where is_active = true
    and (
      is_default_signup_plan = true
      or name in ('Start', 'Start Agro')
    )
  order by is_default_signup_plan desc, position asc
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
    now() + (coalesce(start_plan_validity_days, 30) || ' days')::interval,
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
