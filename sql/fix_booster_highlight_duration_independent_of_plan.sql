alter table public.highlight_boosters
  add column if not exists category_highlight_days integer not null default 30;

alter table public.highlight_boosters
  add column if not exists home_highlight_days integer not null default 15;

update public.highlight_boosters
set
  category_highlight_days = coalesce(nullif(category_highlight_days, 0), 30),
  home_highlight_days = coalesce(nullif(home_highlight_days, 0), 15)
where true;

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
  v_has_subscription boolean := false;
  v_has_plan boolean := false;
  v_last_highlight record;
  v_highlights_used int := 0;
  v_highlights_limit int := 0;
  v_category_highlight_days int := 7;
  v_home_highlight_days int := 7;
  v_booster_category_highlight_days int := 30;
  v_booster_home_highlight_days int := 15;
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
      and applied_at between v_subscription_record.current_period_start and v_subscription_record.current_period_end;
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

  if v_highlights_limit <= 0 or v_highlights_used >= v_highlights_limit then
    if v_booster_remaining <= 0 then
      if v_highlights_limit <= 0 then
        return jsonb_build_object(
          'success', false,
          'error', format(
            'Seu plano atual nao inclui destaques de %s e voce nao possui booster disponivel.',
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

    select
      coalesce(hb.category_highlight_days, 30),
      coalesce(hb.home_highlight_days, 15)
    into v_booster_category_highlight_days, v_booster_home_highlight_days
    from public.user_highlight_booster_purchases ubp
    join public.highlight_boosters hb on hb.id = ubp.booster_id
    where ubp.id = v_booster_purchase_id;
  end if;

  if p_highlight_type = 'category' then
    v_expires_at := now() + (
      case
        when v_credit_source = 'booster' then v_booster_category_highlight_days
        else v_category_highlight_days
      end || ' days'
    )::interval;

    update public.announcements
    set
      highlight_category = true,
      highlight_category_until = v_expires_at,
      updated_at = now()
    where id = p_announcement_id;
  else
    v_expires_at := now() + (
      case
        when v_credit_source = 'booster' then v_booster_home_highlight_days
        else v_home_highlight_days
      end || ' days'
    )::interval;

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
    case when v_has_subscription then v_subscription_record.current_period_start else now() end,
    case when v_has_subscription then v_subscription_record.current_period_end else now() end,
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

with repaired_history as (
  update public.announcement_highlights_history h
  set expires_at = h.applied_at + (
    case
      when h.highlight_type = 'category' then coalesce(hb.category_highlight_days, 30)
      else coalesce(hb.home_highlight_days, 15)
    end || ' days'
  )::interval
  from public.user_highlight_booster_purchases ubp
  join public.highlight_boosters hb on hb.id = ubp.booster_id
  where h.credit_source = 'booster'
    and h.booster_purchase_id = ubp.id
    and h.expires_at <= h.applied_at
  returning h.announcement_id
)
update public.announcements a
set
  highlight_category = coalesce(state.category_expires_at is not null, false),
  highlight_category_until = state.category_expires_at,
  highlight_home = coalesce(state.home_expires_at is not null, false),
  highlight_home_until = state.home_expires_at,
  updated_at = now()
from (
  select
    rh.announcement_id,
    max(case when h.highlight_type = 'category' and h.expires_at > now() then h.expires_at end) as category_expires_at,
    max(case when h.highlight_type = 'home' and h.expires_at > now() then h.expires_at end) as home_expires_at
  from repaired_history rh
  join public.announcement_highlights_history h on h.announcement_id = rh.announcement_id
  group by rh.announcement_id
) state
where a.id = state.announcement_id;
