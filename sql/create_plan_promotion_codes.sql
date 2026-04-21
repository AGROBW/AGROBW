create table if not exists public.promotion_plan_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  plan_id uuid not null references public.plans(id) on delete restrict,
  duration_amount integer not null default 1 check (duration_amount > 0),
  duration_unit text not null default 'months' check (duration_unit in ('days', 'months', 'years')),
  max_redemptions integer,
  max_redemptions_per_user integer not null default 1 check (max_redemptions_per_user > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'expired')),
  grant_mode text not null default 'replace_active' check (grant_mode in ('replace_active', 'extend_same_plan')),
  redeemed_count integer not null default 0,
  internal_notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_promotion_plan_codes_code_upper
  on public.promotion_plan_codes (upper(code));

create index if not exists idx_promotion_plan_codes_status
  on public.promotion_plan_codes (status, expires_at);

create table if not exists public.promotion_plan_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.promotion_plan_codes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  subscription_id uuid references public.user_subscriptions(id) on delete set null,
  status text not null default 'redeemed' check (status in ('redeemed', 'cancelled')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  redeemed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop index if exists public.idx_promotion_plan_redemptions_code_user_redeemed;

create index if not exists idx_promotion_plan_redemptions_code_user_status
  on public.promotion_plan_redemptions (code_id, user_id, status);

create index if not exists idx_promotion_plan_redemptions_user
  on public.promotion_plan_redemptions (user_id, redeemed_at desc);

create index if not exists idx_promotion_plan_redemptions_code
  on public.promotion_plan_redemptions (code_id, redeemed_at desc);

alter table public.user_subscriptions
  add column if not exists source text,
  add column if not exists promotion_code_id uuid references public.promotion_plan_codes(id) on delete set null,
  add column if not exists promotion_redemption_id uuid references public.promotion_plan_redemptions(id) on delete set null;

alter table public.user_subscriptions
  drop constraint if exists unique_active_subscription;

create index if not exists idx_user_subscriptions_promotion_code
  on public.user_subscriptions (promotion_code_id);

with ranked_active_subscriptions as (
  select
    id,
    row_number() over (
      partition by user_id
      order by current_period_end desc nulls last, created_at desc
    ) as row_number
  from public.user_subscriptions
  where status = 'active'
)
update public.user_subscriptions subscriptions
set
  status = 'expired',
  current_period_end = least(coalesce(subscriptions.current_period_end, now()), now()),
  cancel_at_period_end = true,
  updated_at = now()
from ranked_active_subscriptions ranked
where subscriptions.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists idx_user_subscriptions_one_active_per_user
  on public.user_subscriptions (user_id)
  where status = 'active';

create or replace function public.touch_promotion_plan_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.code = upper(trim(new.code));
  return new;
end;
$$;

drop trigger if exists trg_touch_promotion_plan_codes_updated_at on public.promotion_plan_codes;
create trigger trg_touch_promotion_plan_codes_updated_at
before insert or update on public.promotion_plan_codes
for each row
execute function public.touch_promotion_plan_codes_updated_at();

alter table public.promotion_plan_codes enable row level security;
alter table public.promotion_plan_redemptions enable row level security;

drop policy if exists "Admins can manage promotion plan codes" on public.promotion_plan_codes;
create policy "Admins can manage promotion plan codes"
on public.promotion_plan_codes
for all
to authenticated
using (public.is_admin() = true)
with check (public.is_admin() = true);

drop policy if exists "Admins can view promotion plan redemptions" on public.promotion_plan_redemptions;
create policy "Admins can view promotion plan redemptions"
on public.promotion_plan_redemptions
for select
to authenticated
using (public.is_admin() = true);

drop policy if exists "Users can view own promotion plan redemptions" on public.promotion_plan_redemptions;
create policy "Users can view own promotion plan redemptions"
on public.promotion_plan_redemptions
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.redeem_promotion_plan_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_code_record public.promotion_plan_codes%rowtype;
  v_plan public.plans%rowtype;
  v_user_redemptions integer := 0;
  v_current_subscription public.user_subscriptions%rowtype;
  v_subscription_id uuid;
  v_redemption_id uuid;
  v_period_start timestamptz := now();
  v_period_end timestamptz;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if v_code = '' then
    raise exception 'Informe um codigo promocional';
  end if;

  select *
    into v_code_record
  from public.promotion_plan_codes
  where upper(code) = v_code
  for update;

  if v_code_record.id is null then
    raise exception 'Codigo promocional nao encontrado';
  end if;

  if v_code_record.status <> 'active' then
    raise exception 'Codigo promocional indisponivel';
  end if;

  if v_code_record.starts_at is not null and now() < v_code_record.starts_at then
    raise exception 'Codigo promocional ainda nao esta disponivel';
  end if;

  if v_code_record.expires_at is not null and now() > v_code_record.expires_at then
    update public.promotion_plan_codes
    set status = 'expired'
    where id = v_code_record.id;

    raise exception 'Codigo promocional expirado';
  end if;

  if v_code_record.max_redemptions is not null
    and v_code_record.redeemed_count >= v_code_record.max_redemptions then
    raise exception 'Limite de resgates atingido';
  end if;

  select count(*)
    into v_user_redemptions
  from public.promotion_plan_redemptions
  where code_id = v_code_record.id
    and user_id = v_user_id
    and status = 'redeemed';

  if v_user_redemptions >= v_code_record.max_redemptions_per_user then
    raise exception 'Voce ja resgatou este codigo';
  end if;

  select *
    into v_plan
  from public.plans
  where id = v_code_record.plan_id
    and coalesce(is_active, true) = true;

  if v_plan.id is null then
    raise exception 'Plano promocional indisponivel';
  end if;

  select *
    into v_current_subscription
  from public.user_subscriptions
  where user_id = v_user_id
    and status = 'active'
  order by current_period_end desc nulls last, created_at desc
  limit 1
  for update;

  if v_code_record.grant_mode = 'extend_same_plan'
    and v_current_subscription.id is not null
    and v_current_subscription.plan_id = v_code_record.plan_id
    and coalesce(v_current_subscription.current_period_end, now()) > now()
  then
    v_subscription_id := v_current_subscription.id;
    v_period_start := coalesce(v_current_subscription.current_period_end, now());
  elsif v_current_subscription.id is not null then
    v_subscription_id := v_current_subscription.id;
    v_period_start := now();
  else
    update public.user_subscriptions
    set
      status = 'expired',
      current_period_end = least(coalesce(current_period_end, now()), now()),
      cancel_at_period_end = true,
      updated_at = now()
    where user_id = v_user_id
      and status = 'active';
  end if;

  if v_code_record.duration_unit = 'days' then
    v_period_end := v_period_start + make_interval(days => v_code_record.duration_amount);
  elsif v_code_record.duration_unit = 'years' then
    v_period_end := v_period_start + make_interval(years => v_code_record.duration_amount);
  else
    v_period_end := v_period_start + make_interval(months => v_code_record.duration_amount);
  end if;

  if v_subscription_id is null then
    insert into public.user_subscriptions (
      user_id,
      plan_id,
      status,
      billing_cycle,
      amount_paid,
      currency,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      trial_end_date,
      source,
      promotion_code_id
    ) values (
      v_user_id,
      v_code_record.plan_id,
      'active',
      case when v_code_record.duration_unit = 'years' then 'yearly' else 'monthly' end,
      0,
      'BRL',
      v_period_start,
      v_period_end,
      false,
      v_period_end,
      'promotion',
      v_code_record.id
    )
    returning id into v_subscription_id;
  else
    update public.user_subscriptions
    set
      plan_id = v_code_record.plan_id,
      status = 'active',
      billing_cycle = case when v_code_record.duration_unit = 'years' then 'yearly' else 'monthly' end,
      amount_paid = 0,
      currency = 'BRL',
      current_period_start = v_period_start,
      current_period_end = v_period_end,
      cancel_at_period_end = false,
      trial_end_date = v_period_end,
      source = 'promotion',
      promotion_code_id = v_code_record.id,
      updated_at = now()
    where id = v_subscription_id;
  end if;

  insert into public.promotion_plan_redemptions (
    code_id,
    user_id,
    plan_id,
    subscription_id,
    period_start,
    period_end,
    metadata
  ) values (
    v_code_record.id,
    v_user_id,
    v_code_record.plan_id,
    v_subscription_id,
    v_period_start,
    v_period_end,
    jsonb_build_object('grant_mode', v_code_record.grant_mode)
  )
  returning id into v_redemption_id;

  update public.user_subscriptions
  set promotion_redemption_id = v_redemption_id
  where id = v_subscription_id;

  update public.promotion_plan_codes
  set redeemed_count = redeemed_count + 1
  where id = v_code_record.id;

  return jsonb_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'subscription_id', v_subscription_id,
    'plan_id', v_code_record.plan_id,
    'plan_name', v_plan.name,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
exception
  when others then
    return jsonb_build_object(
      'success', false,
      'error', sqlerrm,
      'code', sqlstate
    );
end;
$$;

grant execute on function public.redeem_promotion_plan_code(text) to authenticated;
