create or replace function public.get_public_active_plan_signals(
  p_user_ids uuid[]
)
returns table (
  user_id uuid,
  plan_id uuid,
  plan_name text,
  plan_position integer,
  monthly_price numeric,
  current_period_end timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (us.user_id)
    us.user_id,
    us.plan_id,
    p.name as plan_name,
    coalesce(p.position, 9999) as plan_position,
    coalesce(p.monthly_price, 0) as monthly_price,
    us.current_period_end
  from public.user_subscriptions us
  join public.plans p
    on p.id = us.plan_id
  where p_user_ids is not null
    and cardinality(p_user_ids) > 0
    and us.user_id = any(p_user_ids)
    and us.status = 'active'
    and us.current_period_end > now()
  order by
    us.user_id,
    coalesce(p.monthly_price, 0) desc,
    coalesce(p.position, 9999) asc,
    us.current_period_end desc;
$$;

grant execute on function public.get_public_active_plan_signals(uuid[]) to anon, authenticated;
