create or replace function public.admin_update_user_plan_period(
  p_user_id uuid,
  p_plan_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_billing_cycle text default 'monthly'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_plan public.plans%rowtype;
  v_previous_subscription_id uuid;
  v_previous_plan_id uuid;
  v_new_subscription_id uuid;
  v_billing_cycle text := coalesce(nullif(p_billing_cycle, ''), 'monthly');
begin
  if v_admin_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select coalesce(u.is_admin, false) or u.role = 'admin'
    into v_is_admin
  from public.users u
  where u.id = v_admin_id;

  if not coalesce(v_is_admin, false) then
    raise exception 'Apenas administradores podem alterar periodo de plano';
  end if;

  if p_user_id is null or p_plan_id is null then
    raise exception 'Usuario e plano sao obrigatorios';
  end if;

  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'Periodo do plano invalido';
  end if;

  if v_billing_cycle not in ('monthly', 'yearly') then
    v_billing_cycle := 'monthly';
  end if;

  select *
    into v_plan
  from public.plans
  where id = p_plan_id
    and coalesce(is_active, true) = true;

  if v_plan.id is null then
    raise exception 'Plano selecionado nao foi encontrado ou esta inativo';
  end if;

  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'Usuario selecionado nao foi encontrado';
  end if;

  select us.id, us.plan_id
    into v_previous_subscription_id, v_previous_plan_id
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and us.status = 'active'
  order by us.current_period_end desc nulls last, us.created_at desc
  limit 1;

  update public.user_subscriptions
  set
    status = 'expired',
    expires_at = least(coalesce(expires_at, now()), now()),
    current_period_end = least(coalesce(current_period_end, now()), now()),
    cancel_at_period_end = true,
    updated_at = now()
  where user_id = p_user_id
    and status = 'active';

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    billing_cycle,
    amount_paid,
    currency,
    starts_at,
    expires_at,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    trial_end_date
  ) values (
    p_user_id,
    p_plan_id,
    'active',
    v_billing_cycle,
    coalesce(v_plan.monthly_price, 0),
    'BRL',
    p_period_start,
    p_period_end,
    p_period_start,
    p_period_end,
    false,
    case when coalesce(v_plan.monthly_price, 0) > 0 then null else p_period_end end
  )
  returning id into v_new_subscription_id;

  return jsonb_build_object(
    'success', true,
    'subscription_id', v_new_subscription_id,
    'previous_subscription_id', v_previous_subscription_id,
    'previous_plan_id', v_previous_plan_id,
    'new_plan_id', p_plan_id,
    'period_start', p_period_start,
    'period_end', p_period_end
  );
end;
$$;

grant execute on function public.admin_update_user_plan_period(uuid, uuid, timestamptz, timestamptz, text) to authenticated;
