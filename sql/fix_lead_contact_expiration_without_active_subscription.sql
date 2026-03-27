create or replace function public.calculate_lead_contact_expires_at(
  p_seller_id uuid,
  p_announcement_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_announcement_created_at timestamptz;
  v_limit_days integer;
begin
  select a.created_at
    into v_announcement_created_at
  from public.announcements a
  where a.id = p_announcement_id
  limit 1;

  if v_announcement_created_at is null then
    return null;
  end if;

  select public.resolve_lead_contact_limit_days(
           us.current_period_start,
           us.current_period_end,
           p.lead_contact_limit_days_monthly,
           p.lead_contact_limit_days_yearly,
           p.lead_contact_limit_days
         )
    into v_limit_days
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = p_seller_id
  order by
    case
      when us.status = 'active' and now() between us.current_period_start and us.current_period_end then 0
      else 1
    end,
    us.current_period_end desc nulls last,
    us.created_at desc nulls last
  limit 1;

  if v_limit_days is null then
    return null;
  end if;

  if v_limit_days <= 0 then
    return v_announcement_created_at;
  end if;

  return v_announcement_created_at + make_interval(days => v_limit_days);
end;
$$;

update public.leads l
set contact_expires_at = public.calculate_lead_contact_expires_at(l.seller_id, l.announcement_id);
