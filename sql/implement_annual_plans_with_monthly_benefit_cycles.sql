create or replace function public.calculate_subscription_usage_window(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_reference timestamptz default now()
)
returns table (
  usage_period_start timestamptz,
  usage_period_end timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_days numeric;
begin
  v_total_days := extract(epoch from (p_period_end - p_period_start)) / 86400;

  if v_total_days <= 45 then
    usage_period_start := p_period_start;
    usage_period_end := p_period_end;
    return next;
    return;
  end if;

  usage_period_start := p_period_start;
  usage_period_end := least(p_period_start + interval '1 month', p_period_end);

  while p_reference >= usage_period_end and usage_period_end < p_period_end loop
    usage_period_start := usage_period_end;
    usage_period_end := least(usage_period_end + interval '1 month', p_period_end);
  end loop;

  return next;
end;
$$;

grant execute on function public.calculate_subscription_usage_window(timestamptz, timestamptz, timestamptz) to anon, authenticated;

drop function if exists public.apply_announcement_highlight(uuid, text);

create or replace function public.apply_announcement_highlight(
  p_announcement_id uuid,
  p_highlight_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_subscription_record record;
  v_plan_record record;
  v_usage_window record;
  v_has_subscription boolean := false;
  v_has_plan boolean := false;
  v_last_highlight record;
  v_highlights_used int;
  v_highlights_limit int;
  v_category_highlight_days int := 7;
  v_home_highlight_days int := 7;
  v_booster_remaining int := 0;
  v_expires_at timestamptz;
  v_credit_source text := 'plan';
  v_booster_purchase_id uuid := null;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Usuario nao autenticado');
  end if;

  if not exists (
    select 1
    from public.announcements
    where id = p_announcement_id
      and user_id = v_user_id
  ) then
    return jsonb_build_object('success', false, 'error', 'Anuncio nao encontrado ou nao pertence ao usuario');
  end if;

  if p_highlight_type not in ('category', 'home') then
    return jsonb_build_object('success', false, 'error', 'Tipo de destaque invalido. Use "category" ou "home"');
  end if;

  select *
  into v_subscription_record
  from public.user_subscriptions
  where user_id = v_user_id
    and status = 'active'
    and now() between current_period_start and current_period_end
  order by current_period_end desc
  limit 1;

  v_has_subscription := found;

  if v_has_subscription then
    select *
    into v_plan_record
    from public.plans
    where id = v_subscription_record.plan_id;

    v_has_plan := found;

    if v_has_plan then
      v_category_highlight_days := coalesce(v_plan_record.category_highlight_days, 7);
      v_home_highlight_days := coalesce(v_plan_record.home_highlight_days, 7);
    end if;

    select *
    into v_usage_window
    from public.calculate_subscription_usage_window(
      v_subscription_record.current_period_start,
      v_subscription_record.current_period_end,
      now()
    );
  end if;

  if p_highlight_type = 'category' then
    v_highlights_limit := case
      when v_has_subscription and v_has_plan
        then coalesce(v_plan_record.category_highlights_count, 0)
      else 0
    end;
  else
    v_highlights_limit := case
      when v_has_subscription and v_has_plan
        then coalesce(v_plan_record.home_highlight_count, 0)
      else 0
    end;
  end if;

  if v_has_subscription then
    select count(*)
    into v_highlights_used
    from public.announcement_highlights_history
    where user_id = v_user_id
      and highlight_type = p_highlight_type
      and credit_source = 'plan'
      and applied_at between v_usage_window.usage_period_start and v_usage_window.usage_period_end;
  else
    v_highlights_used := 0;
  end if;

  select
    coalesce(sum(
      case
        when p_highlight_type = 'category' then category_credits_remaining
        else home_credits_remaining
      end
    ), 0)
  into v_booster_remaining
  from public.user_highlight_booster_purchases
  where user_id = v_user_id
    and status = 'credited';

  select *
  into v_last_highlight
  from public.announcement_highlights_history
  where announcement_id = p_announcement_id
    and highlight_type = p_highlight_type
    and applied_at > (now() - interval '15 days')
  order by applied_at desc
  limit 1;

  if v_last_highlight is not null then
    return jsonb_build_object(
      'success', false,
      'error', 'Este anuncio ja foi destacado nos ultimos 15 dias. Aguarde o periodo minimo.',
      'last_highlight_date', v_last_highlight.applied_at,
      'available_after', v_last_highlight.applied_at + interval '15 days'
    );
  end if;

  if v_highlights_used >= v_highlights_limit then
    if v_booster_remaining <= 0 then
      if v_highlights_limit <= 0 then
        return jsonb_build_object(
          'success', false,
          'error', format(
            'Seu plano atual nao inclui destaques de %s e voce nao possui creditos extras disponiveis.',
            case when p_highlight_type = 'category' then 'categoria' else 'home' end
          )
        );
      end if;

      return jsonb_build_object(
        'success', false,
        'error', format(
          'Voce ja usou todos os %s creditos de destaque de %s deste ciclo e nao possui booster disponivel.',
          v_highlights_limit,
          case when p_highlight_type = 'category' then 'categoria' else 'home' end
        ),
        'used', v_highlights_used,
        'limit', v_highlights_limit
      );
    end if;

    v_credit_source := 'booster';

    if p_highlight_type = 'category' then
      update public.user_highlight_booster_purchases
      set
        category_credits_remaining = category_credits_remaining - 1,
        updated_at = now()
      where id = (
        select id
        from public.user_highlight_booster_purchases
        where user_id = v_user_id
          and status = 'credited'
          and category_credits_remaining > 0
        order by created_at asc
        limit 1
      )
      returning id into v_booster_purchase_id;
    else
      update public.user_highlight_booster_purchases
      set
        home_credits_remaining = home_credits_remaining - 1,
        updated_at = now()
      where id = (
        select id
        from public.user_highlight_booster_purchases
        where user_id = v_user_id
          and status = 'credited'
          and home_credits_remaining > 0
        order by created_at asc
        limit 1
      )
      returning id into v_booster_purchase_id;
    end if;

    if v_booster_purchase_id is null then
      return jsonb_build_object('success', false, 'error', 'Nao foi possivel consumir o saldo extra do booster.');
    end if;
  end if;

  if p_highlight_type = 'category' then
    v_expires_at := now() + (v_category_highlight_days || ' days')::interval;
    update public.announcements
    set
      highlight_category = true,
      highlight_category_until = v_expires_at,
      updated_at = now()
    where id = p_announcement_id;
  else
    v_expires_at := now() + (v_home_highlight_days || ' days')::interval;
    update public.announcements
    set
      highlight_home = true,
      highlight_home_until = v_expires_at,
      updated_at = now()
    where id = p_announcement_id;
  end if;

  insert into public.announcement_highlights_history (
    announcement_id,
    user_id,
    highlight_type,
    applied_at,
    expires_at,
    subscription_period_start,
    subscription_period_end,
    credit_source,
    booster_purchase_id
  ) values (
    p_announcement_id,
    v_user_id,
    p_highlight_type,
    now(),
    v_expires_at,
    case when v_has_subscription then v_usage_window.usage_period_start else now() end,
    case when v_has_subscription then v_usage_window.usage_period_end else now() end,
    v_credit_source,
    v_booster_purchase_id
  );

  select
    coalesce(sum(
      case
        when p_highlight_type = 'category' then category_credits_remaining
        else home_credits_remaining
      end
    ), 0)
  into v_booster_remaining
  from public.user_highlight_booster_purchases
  where user_id = v_user_id
    and status = 'credited';

  return jsonb_build_object(
    'success', true,
    'message', format(
      'Destaque de %s aplicado com sucesso!',
      case when p_highlight_type = 'category' then 'categoria' else 'home' end
    ),
    'expires_at', v_expires_at,
    'used', case when v_credit_source = 'plan' then v_highlights_used + 1 else v_highlights_used end,
    'limit', v_highlights_limit,
    'remaining', greatest(v_highlights_limit - (case when v_credit_source = 'plan' then v_highlights_used + 1 else v_highlights_used end), 0),
    'credit_source', v_credit_source,
    'booster_remaining', v_booster_remaining
  );
exception
  when others then
    return jsonb_build_object(
      'success', false,
      'error', format('Erro ao aplicar destaque: %s', sqlerrm)
    );
end;
$$;

create or replace function public.reactivate_expired_announcement(p_announcement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_announcement record;
  active_subscription record;
  usage_window record;
  current_active_ads integer := 0;
begin
  if current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Usuario nao autenticado');
  end if;

  select *
    into target_announcement
  from public.announcements
  where id = p_announcement_id
    and user_id = current_user_id
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Anuncio nao encontrado');
  end if;

  if target_announcement.status <> 'EXPIRED' then
    return jsonb_build_object('success', false, 'error', 'Apenas anuncios vencidos podem ser republicados');
  end if;

  select
    us.*,
    p.max_ads,
    p.name as plan_name
    into active_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = current_user_id
    and us.status = 'active'
    and us.current_period_end >= now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Nao existe assinatura ativa para republicar este anuncio');
  end if;

  select *
    into usage_window
  from public.calculate_subscription_usage_window(
    active_subscription.current_period_start,
    active_subscription.current_period_end,
    now()
  );

  select count(*)
    into current_active_ads
  from public.announcements a
  where a.user_id = current_user_id
    and a.status = 'ACTIVE'
    and a.created_at >= usage_window.usage_period_start
    and a.created_at <= usage_window.usage_period_end;

  if active_subscription.max_ads is not null and current_active_ads >= active_subscription.max_ads then
    return jsonb_build_object(
      'success', false,
      'error', format(
        'Voce atingiu o limite de anuncios do plano %s neste ciclo. Republicar consome um novo credito.',
        coalesce(active_subscription.plan_name, 'atual')
      )
    );
  end if;

  update public.announcements
  set
    status = 'ACTIVE',
    created_at = now(),
    updated_at = now(),
    expires_at = public.calculate_announcement_expires_at(current_user_id, now()),
    expired_at = null,
    deletion_scheduled_at = null,
    pre_expiration_notified_at = null,
    expiration_notified_at = null,
    highlight_category = false,
    highlight_category_until = null,
    highlight_home = false,
    highlight_home_until = null
  where id = p_announcement_id;

  insert into public.notifications (user_id, type, title, content, link)
  values (
    current_user_id,
    'SYSTEM',
    'Anuncio republicado',
    'Seu anuncio foi republicado com sucesso e consumiu um novo credito do ciclo atual.',
    '/#/minha-conta/anuncios'
  );

  return jsonb_build_object('success', true, 'message', 'Anuncio republicado com sucesso');
end;
$$;

grant execute on function public.reactivate_expired_announcement(uuid) to authenticated;
