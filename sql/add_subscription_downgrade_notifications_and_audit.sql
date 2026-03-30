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
