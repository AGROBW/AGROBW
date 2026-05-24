create table if not exists public.highlight_boosters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  monthly_price numeric(10,2) not null default 0,
  stripe_price_id text null,
  category_credits integer not null default 0,
  home_credits integer not null default 0,
  category_highlight_days integer not null default 30,
  home_highlight_days integer not null default 15,
  max_purchases_per_30_days integer not null default 2,
  button_text text not null default 'Comprar booster',
  is_active boolean not null default true,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_highlight_booster_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  booster_id uuid not null references public.highlight_boosters(id) on delete restrict,
  payment_id uuid null references public.payments(id) on delete set null,
  provider_payment_id text null,
  status text not null default 'credited' check (status in ('credited', 'cancelled', 'refunded')),
  booster_name text not null,
  amount numeric(10,2) not null default 0,
  category_credits_total integer not null default 0,
  category_credits_remaining integer not null default 0,
  home_credits_total integer not null default 0,
  home_credits_remaining integer not null default 0,
  credited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_highlight_boosters_active
  on public.highlight_boosters(is_active, position);

create index if not exists idx_booster_purchases_user_id
  on public.user_highlight_booster_purchases(user_id, created_at desc);

create index if not exists idx_booster_purchases_status
  on public.user_highlight_booster_purchases(status);

alter table public.payments
  add column if not exists booster_id uuid null references public.highlight_boosters(id) on delete set null;

create index if not exists idx_payments_booster_id
  on public.payments(booster_id);

alter table public.highlight_boosters enable row level security;
alter table public.user_highlight_booster_purchases enable row level security;

drop policy if exists "Anyone can view active highlight boosters" on public.highlight_boosters;
create policy "Anyone can view active highlight boosters"
  on public.highlight_boosters
  for select
  using (is_active = true or auth.uid() is not null);

drop policy if exists "Admins can manage highlight boosters" on public.highlight_boosters;
create policy "Admins can manage highlight boosters"
  on public.highlight_boosters
  for all
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

drop policy if exists "Users can view their own booster purchases" on public.user_highlight_booster_purchases;
create policy "Users can view their own booster purchases"
  on public.user_highlight_booster_purchases
  for select
  using (auth.uid() = user_id);

drop policy if exists "Admins can view all booster purchases" on public.user_highlight_booster_purchases;
create policy "Admins can view all booster purchases"
  on public.user_highlight_booster_purchases
  for select
  to authenticated
  using (public.is_admin() = true);

alter table public.announcement_highlights_history
  add column if not exists credit_source text not null default 'plan'
    check (credit_source in ('plan', 'booster'));

alter table public.announcement_highlights_history
  add column if not exists booster_purchase_id uuid null references public.user_highlight_booster_purchases(id) on delete set null;

create index if not exists idx_announcement_highlights_history_credit_source
  on public.announcement_highlights_history(credit_source);

create or replace function public.register_highlight_booster_purchase(
  p_user_id uuid,
  p_booster_id uuid,
  p_payment_id uuid default null,
  p_provider_payment_id text default null,
  p_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_purchases_count integer := 0;
  v_booster record;
  v_purchase_id uuid;
begin
  select *
  into v_booster
  from public.highlight_boosters
  where id = p_booster_id
    and is_active = true
  limit 1;

  if v_booster is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Booster nao encontrado ou inativo'
    );
  end if;

  select count(*)
  into v_recent_purchases_count
  from public.user_highlight_booster_purchases
  where user_id = p_user_id
    and booster_id = p_booster_id
    and status = 'credited'
    and created_at >= (now() - interval '30 days');

  if v_recent_purchases_count >= coalesce(v_booster.max_purchases_per_30_days, 2) then
    return jsonb_build_object(
      'success', false,
      'error', format('Limite de %s booster(s) a cada 30 dias atingido.', coalesce(v_booster.max_purchases_per_30_days, 2))
    );
  end if;

  insert into public.user_highlight_booster_purchases (
    user_id,
    booster_id,
    payment_id,
    provider_payment_id,
    status,
    booster_name,
    amount,
    category_credits_total,
    category_credits_remaining,
    home_credits_total,
    home_credits_remaining
  ) values (
    p_user_id,
    p_booster_id,
    p_payment_id,
    p_provider_payment_id,
    'credited',
    v_booster.name,
    coalesce(p_amount, v_booster.monthly_price, 0),
    coalesce(v_booster.category_credits, 0),
    coalesce(v_booster.category_credits, 0),
    coalesce(v_booster.home_credits, 0),
    coalesce(v_booster.home_credits, 0)
  )
  returning id into v_purchase_id;

  return jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'booster_name', v_booster.name,
    'category_credits', coalesce(v_booster.category_credits, 0),
    'home_credits', coalesce(v_booster.home_credits, 0)
  );
end;
$$;

create or replace function public.get_my_highlight_booster_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_category_remaining integer := 0;
  v_home_remaining integer := 0;
  v_recent_purchases integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Usuario nao autenticado'
    );
  end if;

  select
    coalesce(sum(category_credits_remaining), 0),
    coalesce(sum(home_credits_remaining), 0)
  into v_category_remaining, v_home_remaining
  from public.user_highlight_booster_purchases
  where user_id = v_user_id
    and status = 'credited';

  select count(*)
  into v_recent_purchases
  from public.user_highlight_booster_purchases
  where user_id = v_user_id
    and status = 'credited'
    and created_at >= (now() - interval '30 days');

  return jsonb_build_object(
    'success', true,
    'category_remaining', v_category_remaining,
    'home_remaining', v_home_remaining,
    'purchases_last_30_days', v_recent_purchases
  );
end;
$$;

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
  v_announcement_record record;
  v_subscription_record record;
  v_plan_record record;
  v_has_subscription boolean := false;
  v_has_plan boolean := false;
  v_last_highlight record;
  v_highlights_used int;
  v_highlights_limit int;
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

  select *
  into v_announcement_record
  from public.announcements
  where id = p_announcement_id
    and user_id = v_user_id
  limit 1;

  if v_announcement_record is null then
    return jsonb_build_object('success', false, 'error', 'Anuncio nao encontrado ou nao pertence ao usuario');
  end if;

  if p_highlight_type not in ('category', 'home') then
    return jsonb_build_object('success', false, 'error', 'Tipo de destaque invalido. Use "category" ou "home"');
  end if;

  if p_highlight_type = 'category'
     and coalesce(v_announcement_record.highlight_home, false)
     and (v_announcement_record.highlight_home_until is null or v_announcement_record.highlight_home_until > now()) then
    return jsonb_build_object(
      'success', false,
      'error', 'Este anuncio ja possui destaque na home ativo. Aguarde o termino ou remova o destaque atual para usar destaque em categoria.'
    );
  end if;

  if p_highlight_type = 'home'
     and coalesce(v_announcement_record.highlight_category, false)
     and (v_announcement_record.highlight_category_until is null or v_announcement_record.highlight_category_until > now()) then
    return jsonb_build_object(
      'success', false,
      'error', 'Este anuncio ja possui destaque em categoria ativo. Aguarde o termino ou remova o destaque atual para usar destaque na home.'
    );
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

insert into public.highlight_boosters (
  name,
  description,
  monthly_price,
  category_credits,
  home_credits,
  category_highlight_days,
  home_highlight_days,
  max_purchases_per_30_days,
  button_text,
  is_active,
  position
)
select
  'Impulso Safra Premium',
  'Pacote exclusivo com 5 destaques em categoria e 5 destaques na home para campanhas pontuais de maior alcance.',
  249.00,
  5,
  5,
  30,
  15,
  2,
  'Comprar booster',
  true,
  1
where not exists (
  select 1
  from public.highlight_boosters
  where name = 'Impulso Safra Premium'
);
