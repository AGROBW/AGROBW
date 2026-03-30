alter table public.plans
  add column if not exists show_in_public_pricing boolean not null default true,
  add column if not exists is_default_signup_plan boolean not null default false,
  add column if not exists is_downgrade_plan boolean not null default false;

create index if not exists idx_plans_public_pricing on public.plans(show_in_public_pricing);
create index if not exists idx_plans_default_signup on public.plans(is_default_signup_plan);
create index if not exists idx_plans_downgrade on public.plans(is_downgrade_plan);

do $$
begin
  if not exists (
    select 1
    from public.plans
    where is_default_signup_plan = true
  ) then
    update public.plans
    set is_default_signup_plan = true
    where id in (
      select p.id
      from public.plans p
      where p.name in ('Start', 'Start Agro')
      order by p.position asc, p.created_at asc
      limit 1
    );
  end if;

  update public.plans
  set show_in_public_pricing = false,
      is_downgrade_plan = true
  where name in ('Básico', 'Basico');
end;
$$;

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
    now() + (
      coalesce(start_plan_validity_days, 30) || ' days'
    )::interval,
    false,
    case
      when start_lead_days is not null
        then now() + (start_lead_days || ' days')::interval
      else null
    end
  );

  return new;
end;
$$;

drop trigger if exists trg_assign_start_plan on public.users;
create trigger trg_assign_start_plan
after insert on public.users
for each row execute procedure public.assign_start_agro_plan();

create or replace function public.ensure_user_current_subscription(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_subscription_id uuid;
  v_downgrade_plan record;
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
    p.id,
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
begin
  for v_user in
    select distinct us.user_id
    from public.user_subscriptions us
    where us.current_period_end <= now()
  loop
    if public.ensure_user_current_subscription(v_user.user_id) is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;
