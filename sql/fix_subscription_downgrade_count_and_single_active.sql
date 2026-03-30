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

with ranked_active as (
  select
    id,
    user_id,
    row_number() over (
      partition by user_id
      order by current_period_end desc nulls last, created_at desc
    ) as rn
  from public.user_subscriptions
  where status = 'active'
    and current_period_end > now()
)
update public.user_subscriptions us
set status = 'expired',
    updated_at = now()
from ranked_active ra
where us.id = ra.id
  and ra.rn > 1;
