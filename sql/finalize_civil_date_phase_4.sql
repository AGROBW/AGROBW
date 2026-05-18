-- Fase 4: finaliza a migração dos campos civis para `date`
-- Mantém `payments.invoice_issued_at` como timestamp técnico,
-- mas torna `invoice_issued_on` o campo civil oficial.

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

update public.payments
set invoice_issued_on = (invoice_issued_at at time zone 'America/Sao_Paulo')::date
where invoice_issued_at is not null
  and invoice_issued_on is null;

update public.payments
set invoice_issued_at = (invoice_issued_on::timestamp at time zone 'America/Sao_Paulo')
where invoice_issued_on is not null
  and invoice_issued_at is null;

create or replace function public.sync_payments_invoice_issued_on()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.invoice_issued_at is not null then
      new.invoice_issued_on := (new.invoice_issued_at at time zone 'America/Sao_Paulo')::date;
    elsif new.invoice_issued_on is not null then
      new.invoice_issued_at := (new.invoice_issued_on::timestamp at time zone 'America/Sao_Paulo');
    else
      new.invoice_issued_at := null;
      new.invoice_issued_on := null;
    end if;
  elsif new.invoice_issued_at is distinct from old.invoice_issued_at then
    new.invoice_issued_on := case
      when new.invoice_issued_at is null then null
      else (new.invoice_issued_at at time zone 'America/Sao_Paulo')::date
    end;
  elsif new.invoice_issued_on is distinct from old.invoice_issued_on then
    new.invoice_issued_at := case
      when new.invoice_issued_on is null then null
      else (new.invoice_issued_on::timestamp at time zone 'America/Sao_Paulo')
    end;
  elsif new.invoice_issued_at is not null then
    new.invoice_issued_on := (new.invoice_issued_at at time zone 'America/Sao_Paulo')::date;
  elsif new.invoice_issued_on is not null then
    new.invoice_issued_at := (new.invoice_issued_on::timestamp at time zone 'America/Sao_Paulo');
  else
    new.invoice_issued_at := null;
    new.invoice_issued_on := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_payments_invoice_issued_on on public.payments;
create trigger trg_sync_payments_invoice_issued_on
before insert or update of invoice_issued_at, invoice_issued_on
on public.payments
for each row
execute function public.sync_payments_invoice_issued_on();

-- ---------------------------------------------------------------------------
-- Site sponsors
-- ---------------------------------------------------------------------------

update public.site_sponsors
set
  starts_on = coalesce(starts_on, (starts_at at time zone 'America/Sao_Paulo')::date),
  ends_on = case
    when ends_on is not null then ends_on
    when ends_at is null then null
    else (ends_at at time zone 'America/Sao_Paulo')::date
  end
where starts_on is null
   or (ends_at is not null and ends_on is null);

alter table public.site_sponsors
  alter column starts_on set not null;

alter table public.site_sponsors
  alter column starts_on set default ((now() at time zone 'America/Sao_Paulo')::date);

create or replace function public.touch_site_sponsors_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.validate_site_sponsor_capacity()
returns trigger
language plpgsql
as $$
declare
  v_active_count integer := 0;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.status = 'active'
     and new.starts_on <= v_today
     and (new.ends_on is null or new.ends_on >= v_today) then
    select count(*)
      into v_active_count
    from public.site_sponsors s
    where s.status = 'active'
      and s.starts_on <= v_today
      and (s.ends_on is null or s.ends_on >= v_today)
      and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if v_active_count >= 6 then
      raise exception 'Limite de 6 patrocinadores ativos atingido.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.get_public_sponsor_landing_stats()
returns table (
  total_slots integer,
  occupied_slots integer,
  available_slots integer,
  active_sponsors integer,
  registered_users integer,
  active_announcements integer,
  active_stores integer,
  generated_leads integer
)
language sql
stable
security definer
set search_path = public
as $$
  with sponsor_counts as (
    select count(*)::integer as active_count
    from public.site_sponsors s
    where s.status = 'active'
      and s.starts_on <= ((now() at time zone 'America/Sao_Paulo')::date)
      and (s.ends_on is null or s.ends_on >= ((now() at time zone 'America/Sao_Paulo')::date))
  ),
  announcement_counts as (
    select count(*)::integer as active_count
    from public.announcements a
    where a.status = 'ACTIVE'
  ),
  user_counts as (
    select count(*)::integer as total_count
    from public.users u
    where u.email is not null
  ),
  store_counts as (
    select count(*)::integer as active_count
    from public.seller_stores st
    where st.is_active = true
      and st.is_store_feature_enabled = true
      and coalesce(st.is_paused_due_to_plan, false) = false
  ),
  lead_counts as (
    select count(*)::integer as total_count
    from public.leads l
  )
  select
    6::integer as total_slots,
    least(sc.active_count, 6)::integer as occupied_slots,
    greatest(6 - sc.active_count, 0)::integer as available_slots,
    sc.active_count::integer as active_sponsors,
    uc.total_count::integer as registered_users,
    ac.active_count::integer as active_announcements,
    stc.active_count::integer as active_stores,
    lc.total_count::integer as generated_leads
  from sponsor_counts sc
  cross join announcement_counts ac
  cross join user_counts uc
  cross join store_counts stc
  cross join lead_counts lc;
$$;

create or replace function public.get_public_active_site_sponsors()
returns table (
  id uuid,
  company_name text,
  segment text,
  logo_url text,
  banner_url text,
  target_type text,
  target_url text,
  slot_position integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.company_name,
    s.segment,
    s.logo_url,
    s.banner_url,
    s.target_type,
    s.target_url,
    s.slot_position
  from public.site_sponsors s
  where s.status = 'active'
    and s.starts_on <= ((now() at time zone 'America/Sao_Paulo')::date)
    and (s.ends_on is null or s.ends_on >= ((now() at time zone 'America/Sao_Paulo')::date))
  order by s.slot_position asc nulls last, s.created_at asc;
$$;

drop index if exists idx_site_sponsors_period;
create index if not exists idx_site_sponsors_period
  on public.site_sponsors(starts_on, ends_on);

alter table public.site_sponsors
  drop column if exists starts_at,
  drop column if exists ends_at;

-- ---------------------------------------------------------------------------
-- Promotion plan codes
-- ---------------------------------------------------------------------------

update public.promotion_plan_codes
set
  starts_on = case
    when starts_on is not null then starts_on
    when starts_at is null then null
    else (starts_at at time zone 'America/Sao_Paulo')::date
  end,
  expires_on = case
    when expires_on is not null then expires_on
    when expires_at is null then null
    else (expires_at at time zone 'America/Sao_Paulo')::date
  end
where (starts_at is not null and starts_on is null)
   or (expires_at is not null and expires_on is null);

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

drop index if exists idx_promotion_plan_codes_status;
create index if not exists idx_promotion_plan_codes_status
  on public.promotion_plan_codes (status, expires_on);

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
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
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

  if v_code_record.starts_on is not null and v_today < v_code_record.starts_on then
    raise exception 'Codigo promocional ainda nao esta disponivel';
  end if;

  if v_code_record.expires_on is not null and v_today > v_code_record.expires_on then
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
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      source,
      promotion_code_id,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      v_code_record.plan_id,
      'active',
      v_period_start,
      v_period_end,
      false,
      'promotion_code',
      v_code_record.id,
      now(),
      now()
    )
    returning id into v_subscription_id;
  else
    update public.user_subscriptions
    set
      plan_id = v_code_record.plan_id,
      status = 'active',
      current_period_start = v_period_start,
      current_period_end = v_period_end,
      cancel_at_period_end = false,
      source = 'promotion_code',
      promotion_code_id = v_code_record.id,
      updated_at = now()
    where id = v_subscription_id;
  end if;

  insert into public.promotion_plan_redemptions (
    code_id,
    user_id,
    plan_id,
    subscription_id,
    status,
    period_start,
    period_end,
    redeemed_at,
    metadata,
    created_at
  )
  values (
    v_code_record.id,
    v_user_id,
    v_code_record.plan_id,
    v_subscription_id,
    'redeemed',
    v_period_start,
    v_period_end,
    now(),
    jsonb_build_object(
      'grant_mode', v_code_record.grant_mode,
      'duration_amount', v_code_record.duration_amount,
      'duration_unit', v_code_record.duration_unit
    ),
    now()
  )
  returning id into v_redemption_id;

  update public.user_subscriptions
  set promotion_redemption_id = v_redemption_id
  where id = v_subscription_id;

  update public.promotion_plan_codes
  set redeemed_count = redeemed_count + 1,
      status = case
        when max_redemptions is not null and redeemed_count + 1 >= max_redemptions then 'expired'
        else status
      end,
      updated_at = now()
  where id = v_code_record.id;

  return jsonb_build_object(
    'success', true,
    'code_id', v_code_record.id,
    'subscription_id', v_subscription_id,
    'redemption_id', v_redemption_id,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'plan_name', v_plan.name
  );
end;
$$;

alter table public.promotion_plan_codes
  drop column if exists starts_at,
  drop column if exists expires_at;
