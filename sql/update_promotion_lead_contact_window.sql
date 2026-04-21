-- ============================================================================
-- AGRO BW - Janela de contato proporcional para assinaturas promocionais
-- - Cupom de plano usa o limite mensal de contato multiplicado pelo período.
-- - O resultado nunca passa da validade do próprio cupom/plano promocional.
-- ============================================================================

create or replace function public.resolve_lead_contact_limit_days(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_monthly_limit integer,
  p_yearly_limit integer,
  p_legacy_limit integer default null,
  p_is_promotion boolean default false
)
returns integer
language plpgsql
immutable
as $$
declare
  v_total_days numeric;
  v_monthly_limit integer;
begin
  if p_period_start is null or p_period_end is null then
    return coalesce(p_monthly_limit, p_yearly_limit, p_legacy_limit);
  end if;

  v_total_days := extract(epoch from (p_period_end - p_period_start)) / 86400.0;

  if p_is_promotion then
    v_monthly_limit := coalesce(p_monthly_limit, p_legacy_limit, p_yearly_limit);

    if v_monthly_limit is null then
      return null;
    end if;

    return least(
      ceil(v_total_days)::integer,
      greatest(v_monthly_limit, ceil(v_monthly_limit * (v_total_days / 30.0))::integer)
    );
  end if;

  if v_total_days > 45 then
    return coalesce(p_yearly_limit, p_legacy_limit, p_monthly_limit);
  end if;

  return coalesce(p_monthly_limit, p_legacy_limit, p_yearly_limit);
end;
$$;

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
  v_subscription record;
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

  select
    us.current_period_start,
    us.current_period_end,
    us.source,
    us.promotion_code_id,
    p.lead_contact_limit_days_monthly,
    p.lead_contact_limit_days_yearly,
    p.lead_contact_limit_days
    into v_subscription
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

  if v_subscription is null then
    return null;
  end if;

  v_limit_days := public.resolve_lead_contact_limit_days(
    v_subscription.current_period_start,
    v_subscription.current_period_end,
    v_subscription.lead_contact_limit_days_monthly,
    v_subscription.lead_contact_limit_days_yearly,
    v_subscription.lead_contact_limit_days,
    v_subscription.source = 'promotion' or v_subscription.promotion_code_id is not null
  );

  if v_limit_days is null then
    return null;
  end if;

  if v_limit_days <= 0 then
    return v_announcement_created_at;
  end if;

  return least(
    v_announcement_created_at + make_interval(days => v_limit_days),
    v_subscription.current_period_end
  );
end;
$$;

update public.leads l
set contact_expires_at = public.calculate_lead_contact_expires_at(l.seller_id, l.announcement_id);

grant execute on function public.resolve_lead_contact_limit_days(timestamptz, timestamptz, integer, integer, integer, boolean) to authenticated, service_role;
grant execute on function public.calculate_lead_contact_expires_at(uuid, uuid) to authenticated, service_role;
