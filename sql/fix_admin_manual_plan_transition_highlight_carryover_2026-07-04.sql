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
  v_previous_subscription record;
  v_previous_subscription_id uuid;
  v_previous_plan_id uuid;
  v_previous_plan record;
  v_usage_window record;
  v_new_subscription_id uuid;
  v_billing_cycle text := coalesce(nullif(p_billing_cycle, ''), 'monthly');
  v_amount_paid numeric(10,2) := 0;
  v_category_plan_limit integer := 0;
  v_home_plan_limit integer := 0;
  v_category_carryover_limit integer := 0;
  v_home_carryover_limit integer := 0;
  v_category_plan_used integer := 0;
  v_home_plan_used integer := 0;
  v_category_carryover_used integer := 0;
  v_home_carryover_used integer := 0;
  v_category_remaining integer := 0;
  v_home_remaining integer := 0;
  v_previous_subscription_activation_start timestamptz := null;
  v_previous_plan_usage_start timestamptz := null;
  v_previous_carryover_usage_start timestamptz := null;
  v_category_carryover_expires_at timestamptz := null;
  v_home_carryover_expires_at timestamptz := null;
  v_category_plan_unlock_at timestamptz := null;
  v_home_plan_unlock_at timestamptz := null;
  has_current_period_end boolean;
  has_cancel_at_period_end boolean;
  has_updated_at boolean;
  has_billing_cycle boolean;
  has_amount_paid boolean;
  has_currency boolean;
  has_current_period_start boolean;
  has_trial_end_date boolean;
  has_created_at boolean;
  has_category_carryover_expires_at boolean;
  has_category_plan_unlock_at boolean;
  has_home_carryover_expires_at boolean;
  has_home_plan_unlock_at boolean;
  update_set_clause text := 'status = ''expired''';
  insert_columns text := 'user_id, plan_id, status';
  insert_values text := '$1, $2, ''active''';
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

  v_amount_paid := case
    when v_billing_cycle = 'yearly'
      then coalesce(v_plan.yearly_price, coalesce(v_plan.monthly_price, 0) * 12, 0)
    else coalesce(v_plan.monthly_price, 0)
  end;

  select us.*
    into v_previous_subscription
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and us.status = 'active'
  order by
    coalesce(us.current_period_end, us.created_at) desc nulls last,
    us.created_at desc
  limit 1;

  if found then
    v_previous_subscription_id := v_previous_subscription.id;
    v_previous_plan_id := v_previous_subscription.plan_id;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'current_period_end'
  ) into has_current_period_end;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'cancel_at_period_end'
  ) into has_cancel_at_period_end;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'updated_at'
  ) into has_updated_at;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'billing_cycle'
  ) into has_billing_cycle;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'amount_paid'
  ) into has_amount_paid;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'currency'
  ) into has_currency;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'current_period_start'
  ) into has_current_period_start;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'trial_end_date'
  ) into has_trial_end_date;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'created_at'
  ) into has_created_at;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'category_highlights_carryover_expires_at'
  ) into has_category_carryover_expires_at;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'category_highlights_plan_unlock_at'
  ) into has_category_plan_unlock_at;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'home_highlights_carryover_expires_at'
  ) into has_home_carryover_expires_at;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'home_highlights_plan_unlock_at'
  ) into has_home_plan_unlock_at;

  if v_previous_subscription_id is not null
     and v_previous_plan_id is not null
     and coalesce(v_previous_subscription.current_period_end, now()) > now() then
    select *
      into v_previous_plan
    from public.plans
    where id = v_previous_plan_id;

    if v_previous_plan.id is not null then
      select *
        into v_usage_window
      from public.calculate_subscription_usage_window(
        v_previous_subscription.current_period_start,
        v_previous_subscription.current_period_end,
        now()
      );

      v_previous_subscription_activation_start := greatest(
        coalesce(v_previous_subscription.created_at, v_previous_subscription.current_period_start),
        v_previous_subscription.current_period_start
      );

      v_previous_plan_usage_start := greatest(
        coalesce(v_usage_window.usage_period_start, v_previous_subscription.current_period_start),
        v_previous_subscription_activation_start
      );

      v_previous_carryover_usage_start := v_previous_subscription_activation_start;

      v_category_plan_limit := case
        when not has_category_plan_unlock_at
          or v_previous_subscription.category_highlights_plan_unlock_at is null
          or v_previous_subscription.category_highlights_plan_unlock_at <= now()
          then coalesce(v_previous_plan.category_highlights_count, 0)
        else 0
      end;

      v_home_plan_limit := case
        when not has_home_plan_unlock_at
          or v_previous_subscription.home_highlights_plan_unlock_at is null
          or v_previous_subscription.home_highlights_plan_unlock_at <= now()
          then coalesce(v_previous_plan.home_highlight_count, 0)
        else 0
      end;

      v_category_carryover_limit := case
        when not has_category_carryover_expires_at
          then coalesce(v_previous_subscription.category_highlights_carryover, 0)
        when v_previous_subscription.category_highlights_carryover_expires_at is not null
          and v_previous_subscription.category_highlights_carryover_expires_at > now()
          then coalesce(v_previous_subscription.category_highlights_carryover, 0)
        else 0
      end;

      v_home_carryover_limit := case
        when not has_home_carryover_expires_at
          then coalesce(v_previous_subscription.home_highlights_carryover, 0)
        when v_previous_subscription.home_highlights_carryover_expires_at is not null
          and v_previous_subscription.home_highlights_carryover_expires_at > now()
          then coalesce(v_previous_subscription.home_highlights_carryover, 0)
        else 0
      end;

      if v_category_plan_limit > 0 then
        select count(*)
          into v_category_plan_used
        from public.announcement_highlights_history
        where user_id = p_user_id
          and highlight_type = 'category'
          and credit_source = 'plan'
          and applied_at between v_previous_plan_usage_start and v_usage_window.usage_period_end;
      end if;

      if v_home_plan_limit > 0 then
        select count(*)
          into v_home_plan_used
        from public.announcement_highlights_history
        where user_id = p_user_id
          and highlight_type = 'home'
          and credit_source = 'plan'
          and applied_at between v_previous_plan_usage_start and v_usage_window.usage_period_end;
      end if;

      if v_category_carryover_limit > 0 then
        select count(*)
          into v_category_carryover_used
        from public.announcement_highlights_history
        where user_id = p_user_id
          and highlight_type = 'category'
          and credit_source = 'plan_carryover'
          and applied_at between v_previous_carryover_usage_start and v_previous_subscription.current_period_end;
      end if;

      if v_home_carryover_limit > 0 then
        select count(*)
          into v_home_carryover_used
        from public.announcement_highlights_history
        where user_id = p_user_id
          and highlight_type = 'home'
          and credit_source = 'plan_carryover'
          and applied_at between v_previous_carryover_usage_start and v_previous_subscription.current_period_end;
      end if;

      v_category_remaining :=
        greatest(v_category_plan_limit - v_category_plan_used, 0) +
        greatest(v_category_carryover_limit - v_category_carryover_used, 0);
      v_home_remaining :=
        greatest(v_home_plan_limit - v_home_plan_used, 0) +
        greatest(v_home_carryover_limit - v_home_carryover_used, 0);

      if v_category_remaining > 0 then
        v_category_carryover_expires_at := v_usage_window.usage_period_end;
      end if;

      if v_home_remaining > 0 then
        v_home_carryover_expires_at := v_usage_window.usage_period_end;
      end if;

      if coalesce(v_plan.category_highlights_count, 0) < coalesce(v_previous_plan.category_highlights_count, 0) then
        v_category_plan_unlock_at := v_usage_window.usage_period_end;
      end if;

      if coalesce(v_plan.home_highlight_count, 0) < coalesce(v_previous_plan.home_highlight_count, 0) then
        v_home_plan_unlock_at := v_usage_window.usage_period_end;
      end if;
    end if;
  end if;

  if has_current_period_end then
    update_set_clause := update_set_clause || ', current_period_end = least(coalesce(current_period_end, now()), now())';
  end if;

  if has_cancel_at_period_end then
    update_set_clause := update_set_clause || ', cancel_at_period_end = true';
  end if;

  if has_updated_at then
    update_set_clause := update_set_clause || ', updated_at = now()';
  end if;

  execute format(
    'update public.user_subscriptions set %s where user_id = $1 and status = ''active''',
    update_set_clause
  )
  using p_user_id;

  if has_billing_cycle then
    insert_columns := insert_columns || ', billing_cycle';
    insert_values := insert_values || ', $3';
  end if;

  if has_amount_paid then
    insert_columns := insert_columns || ', amount_paid';
    insert_values := insert_values || ', $4';
  end if;

  if has_currency then
    insert_columns := insert_columns || ', currency';
    insert_values := insert_values || ', ''BRL''';
  end if;

  if has_current_period_start then
    insert_columns := insert_columns || ', current_period_start';
    insert_values := insert_values || ', $5';
  end if;

  if has_current_period_end then
    insert_columns := insert_columns || ', current_period_end';
    insert_values := insert_values || ', $6';
  end if;

  if has_cancel_at_period_end then
    insert_columns := insert_columns || ', cancel_at_period_end';
    insert_values := insert_values || ', false';
  end if;

  if has_trial_end_date then
    insert_columns := insert_columns || ', trial_end_date';
    if v_amount_paid > 0 then
      insert_values := insert_values || ', null';
    else
      insert_values := insert_values || ', $6';
    end if;
  end if;

  if has_category_carryover_expires_at then
    insert_columns := insert_columns || ', category_highlights_carryover_expires_at';
    insert_values := insert_values || ', $7';
  end if;

  if has_category_plan_unlock_at then
    insert_columns := insert_columns || ', category_highlights_plan_unlock_at';
    insert_values := insert_values || ', $8';
  end if;

  if has_home_carryover_expires_at then
    insert_columns := insert_columns || ', home_highlights_carryover_expires_at';
    insert_values := insert_values || ', $9';
  end if;

  if has_home_plan_unlock_at then
    insert_columns := insert_columns || ', home_highlights_plan_unlock_at';
    insert_values := insert_values || ', $10';
  end if;

  if has_created_at then
    insert_columns := insert_columns || ', created_at';
    insert_values := insert_values || ', now()';
  end if;

  if has_updated_at then
    insert_columns := insert_columns || ', updated_at';
    insert_values := insert_values || ', now()';
  end if;

  execute format(
    'insert into public.user_subscriptions (%s, category_highlights_carryover, home_highlights_carryover) values (%s, $11, $12) returning id',
    insert_columns,
    insert_values
  )
  into v_new_subscription_id
  using
    p_user_id,
    p_plan_id,
    v_billing_cycle,
    v_amount_paid,
    p_period_start,
    p_period_end,
    v_category_carryover_expires_at,
    v_category_plan_unlock_at,
    v_home_carryover_expires_at,
    v_home_plan_unlock_at,
    v_category_remaining,
    v_home_remaining;

  return jsonb_build_object(
    'success', true,
    'subscription_id', v_new_subscription_id,
    'previous_subscription_id', v_previous_subscription_id,
    'previous_plan_id', v_previous_plan_id,
    'new_plan_id', p_plan_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'category_highlights_carryover', v_category_remaining,
    'home_highlights_carryover', v_home_remaining,
    'category_highlights_carryover_expires_at', v_category_carryover_expires_at,
    'home_highlights_carryover_expires_at', v_home_carryover_expires_at,
    'category_highlights_plan_unlock_at', v_category_plan_unlock_at,
    'home_highlights_plan_unlock_at', v_home_plan_unlock_at
  );
end;
$$;

grant execute on function public.admin_update_user_plan_period(uuid, uuid, timestamptz, timestamptz, text) to authenticated;
