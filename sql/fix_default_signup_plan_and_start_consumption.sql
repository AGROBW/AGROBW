alter table public.users
  add column if not exists start_plan_consumed_at timestamptz;

alter table public.plans
  add column if not exists is_default_signup_plan boolean not null default false;

with ranked_signup_candidates as (
  select
    p.id,
    row_number() over (
      order by
        case
          when lower(trim(coalesce(p.name, ''))) in ('start', 'start agro', 'safra') then 0
          else 1
        end,
        case when coalesce(p.monthly_price, 0) <= 0 and coalesce(p.yearly_price, 0) <= 0 then 0 else 1 end,
        coalesce(p.position, 999999),
        p.created_at
    ) as rn
  from public.plans p
  where coalesce(p.is_active, true) = true
    and coalesce(p.is_downgrade_plan, false) = false
)
update public.plans p
set is_default_signup_plan = true
from ranked_signup_candidates c
where p.id = c.id
  and c.rn = 1
  and not exists (
    select 1
    from public.plans existing_default
    where existing_default.is_default_signup_plan = true
  );

with signup_history as (
  select
    us.user_id,
    min(coalesce(us.created_at, us.current_period_start, us.current_period_end, now())) as first_signup_at
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where p.is_default_signup_plan = true
     or lower(trim(coalesce(p.name, ''))) in ('start', 'start agro', 'safra')
  group by us.user_id
)
update public.users u
set start_plan_consumed_at = coalesce(u.start_plan_consumed_at, s.first_signup_at)
from signup_history s
where u.id = s.user_id
  and u.start_plan_consumed_at is null;

with downgrade_history as (
  select
    downgrade.user_id,
    min(
      coalesce(
        previous_subscription.created_at,
        previous_subscription.current_period_start,
        previous_subscription.current_period_end,
        downgrade.created_at,
        downgrade.current_period_start,
        downgrade.current_period_end,
        now()
      )
    ) as consumed_at
  from public.user_subscriptions downgrade
  join public.plans downgrade_plan on downgrade_plan.id = downgrade.plan_id
  left join public.user_subscriptions previous_subscription
    on previous_subscription.user_id = downgrade.user_id
   and previous_subscription.id <> downgrade.id
   and coalesce(
         previous_subscription.created_at,
         previous_subscription.current_period_start,
         previous_subscription.current_period_end,
         now()
       ) <= coalesce(
         downgrade.created_at,
         downgrade.current_period_start,
         downgrade.current_period_end,
         now()
       )
  where downgrade_plan.is_downgrade_plan = true
  group by downgrade.user_id
)
update public.users u
set start_plan_consumed_at = coalesce(u.start_plan_consumed_at, d.consumed_at)
from downgrade_history d
where u.id = d.user_id
  and u.start_plan_consumed_at is null;
