-- ==================================================
-- Etapa 7 - Migracao operacional controlada
-- ==================================================
-- Objetivo:
-- - manter Stripe para novos clientes
-- - liberar contas legadas especificas de forma segura
-- - dar visibilidade operacional no admin
-- ==================================================

create table if not exists public.stripe_rollout_overrides (
  user_id uuid primary key references public.users(id) on delete cascade,
  reason text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stripe_rollout_overrides is
  'Allowlist operacional para liberar checkout Stripe a contas legadas especificas';
comment on column public.stripe_rollout_overrides.reason is
  'Observacao interna sobre a liberacao manual da conta legada';

create or replace function public.update_stripe_rollout_overrides_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_update_stripe_rollout_overrides_updated_at on public.stripe_rollout_overrides;
create trigger trigger_update_stripe_rollout_overrides_updated_at
before update on public.stripe_rollout_overrides
for each row
execute function public.update_stripe_rollout_overrides_updated_at();

create index if not exists idx_stripe_rollout_overrides_created_at
  on public.stripe_rollout_overrides(created_at desc);

alter table public.stripe_rollout_overrides enable row level security;

drop policy if exists "Admins can view stripe rollout overrides" on public.stripe_rollout_overrides;
drop policy if exists "Admins can insert stripe rollout overrides" on public.stripe_rollout_overrides;
drop policy if exists "Admins can update stripe rollout overrides" on public.stripe_rollout_overrides;
drop policy if exists "Admins can delete stripe rollout overrides" on public.stripe_rollout_overrides;

create policy "Admins can view stripe rollout overrides"
on public.stripe_rollout_overrides
for select
to authenticated
using (public.is_admin() = true);

create policy "Admins can insert stripe rollout overrides"
on public.stripe_rollout_overrides
for insert
to authenticated
with check (public.is_admin() = true);

create policy "Admins can update stripe rollout overrides"
on public.stripe_rollout_overrides
for update
to authenticated
using (public.is_admin() = true)
with check (public.is_admin() = true);

create policy "Admins can delete stripe rollout overrides"
on public.stripe_rollout_overrides
for delete
to authenticated
using (public.is_admin() = true);

drop function if exists public.get_checkout_gateway_public_safe();

create function public.get_checkout_gateway_public_safe()
returns table (
  preferred_checkout_provider text,
  mercado_pago_enabled boolean,
  stripe_enabled boolean,
  stripe_rollout_mode text,
  stripe_checkout_allowed_for_current_user boolean,
  stripe_checkout_reason text,
  is_production boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_has_paid_history boolean := false;
  v_has_manual_override boolean := false;
begin
  if v_user_id is null then
    raise exception 'Unauthenticated';
  end if;

  select exists (
    select 1
    from public.payments p
    where p.user_id = v_user_id
      and p.status = 'approved'
      and coalesce(p.amount, 0) > 0
  )
  or exists (
    select 1
    from public.user_subscriptions us
    join public.plans pl on pl.id = us.plan_id
    where us.user_id = v_user_id
      and (
        coalesce(us.amount_paid, 0) > 0
        or coalesce(pl.monthly_price, 0) > 0
      )
  )
  into v_has_paid_history;

  select exists (
    select 1
    from public.stripe_rollout_overrides sro
    where sro.user_id = v_user_id
  )
  into v_has_manual_override;

  return query
  select
    coalesce(nullif(trim(ps.preferred_checkout_provider), ''), 'mercadopago') as preferred_checkout_provider,
    coalesce(nullif(trim(ps.mp_access_token), '') is not null, false)
      and coalesce(nullif(trim(ps.mp_public_key), '') is not null, false) as mercado_pago_enabled,
    coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false)
      and coalesce(nullif(trim(ps.stripe_publishable_key), '') is not null, false) as stripe_enabled,
    coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') as stripe_rollout_mode,
    case
      when not (
        coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false)
        and coalesce(nullif(trim(ps.stripe_publishable_key), '') is not null, false)
      ) then false
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'all_customers' then true
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers'
        and (not v_has_paid_history or v_has_manual_override) then true
      else false
    end as stripe_checkout_allowed_for_current_user,
    case
      when not (
        coalesce(nullif(trim(ps.stripe_secret_key), '') is not null, false)
        and coalesce(nullif(trim(ps.stripe_publishable_key), '') is not null, false)
      ) then 'stripe_not_configured'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'all_customers' then 'all_customers'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers'
        and v_has_paid_history and v_has_manual_override then 'manual_override_legacy_customer'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers'
        and v_has_paid_history and not v_has_manual_override then 'existing_paid_customer'
      when coalesce(nullif(trim(ps.stripe_rollout_mode), ''), 'all_customers') = 'new_customers'
        and not v_has_paid_history then 'eligible_new_customer'
      else 'unknown'
    end as stripe_checkout_reason,
    ps.is_production
  from public.payment_settings ps
  where ps.id = '00000000-0000-0000-0000-000000000005'
  limit 1;
end;
$$;

drop function if exists public.get_stripe_rollout_summary_admin_safe();

create function public.get_stripe_rollout_summary_admin_safe()
returns table (
  legacy_paid_customers bigint,
  manual_override_count bigint,
  stripe_subscription_count bigint,
  mercadopago_subscription_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
  with paid_users as (
    select distinct p.user_id
    from public.payments p
    where p.status = 'approved'
      and coalesce(p.amount, 0) > 0
    union
    select distinct us.user_id
    from public.user_subscriptions us
    join public.plans pl on pl.id = us.plan_id
    where coalesce(us.amount_paid, 0) > 0
       or coalesce(pl.monthly_price, 0) > 0
  )
  select
    (select count(*) from paid_users),
    (select count(*) from public.stripe_rollout_overrides),
    (
      select count(*)
      from public.user_subscriptions us
      where us.provider = 'stripe'
        and us.status in ('active', 'trialing')
    ),
    (
      select count(*)
      from public.user_subscriptions us
      where us.provider = 'mercadopago'
        and us.status in ('active', 'trialing')
    );
end;
$$;

drop function if exists public.list_stripe_rollout_overrides_admin_safe();

create function public.list_stripe_rollout_overrides_admin_safe()
returns table (
  user_id uuid,
  user_name text,
  user_email text,
  reason text,
  has_paid_history boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
  with paid_users as (
    select distinct p.user_id
    from public.payments p
    where p.status = 'approved'
      and coalesce(p.amount, 0) > 0
    union
    select distinct us.user_id
    from public.user_subscriptions us
    join public.plans pl on pl.id = us.plan_id
    where coalesce(us.amount_paid, 0) > 0
       or coalesce(pl.monthly_price, 0) > 0
  )
  select
    sro.user_id,
    coalesce(u.name, 'Usuario sem nome') as user_name,
    coalesce(u.email, '') as user_email,
    sro.reason,
    exists (select 1 from paid_users pu where pu.user_id = sro.user_id) as has_paid_history,
    sro.created_at,
    sro.updated_at
  from public.stripe_rollout_overrides sro
  join public.users u on u.id = sro.user_id
  order by sro.created_at desc;
end;
$$;

drop function if exists public.search_users_for_stripe_rollout_admin_safe(text);

create function public.search_users_for_stripe_rollout_admin_safe(
  p_query text
)
returns table (
  user_id uuid,
  user_name text,
  user_email text,
  has_paid_history boolean,
  already_allowlisted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  if length(v_query) < 2 then
    return;
  end if;

  return query
  with paid_users as (
    select distinct p.user_id
    from public.payments p
    where p.status = 'approved'
      and coalesce(p.amount, 0) > 0
    union
    select distinct us.user_id
    from public.user_subscriptions us
    join public.plans pl on pl.id = us.plan_id
    where coalesce(us.amount_paid, 0) > 0
       or coalesce(pl.monthly_price, 0) > 0
  )
  select
    u.id as user_id,
    coalesce(u.name, 'Usuario sem nome') as user_name,
    coalesce(u.email, '') as user_email,
    exists (select 1 from paid_users pu where pu.user_id = u.id) as has_paid_history,
    exists (
      select 1
      from public.stripe_rollout_overrides sro
      where sro.user_id = u.id
    ) as already_allowlisted
  from public.users u
  where lower(coalesce(u.name, '')) like '%' || v_query || '%'
     or lower(coalesce(u.email, '')) like '%' || v_query || '%'
  order by
    exists (select 1 from paid_users pu where pu.user_id = u.id) desc,
    u.created_at desc
  limit 8;
end;
$$;

drop function if exists public.upsert_stripe_rollout_override_admin_safe(uuid, text);

create function public.upsert_stripe_rollout_override_admin_safe(
  p_user_id uuid,
  p_reason text default null
)
returns table (
  user_id uuid,
  user_name text,
  user_email text,
  reason text,
  has_paid_history boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_user_id is null then
    raise exception 'user_id obrigatorio';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_user_id
  ) then
    raise exception 'Usuario nao encontrado';
  end if;

  insert into public.stripe_rollout_overrides (
    user_id,
    reason,
    created_by
  ) values (
    p_user_id,
    nullif(trim(coalesce(p_reason, '')), ''),
    v_admin_id
  )
  on conflict (user_id) do update
  set
    reason = excluded.reason,
    created_by = v_admin_id,
    updated_at = now();

  return query
  select *
  from public.list_stripe_rollout_overrides_admin_safe()
  where list_stripe_rollout_overrides_admin_safe.user_id = p_user_id;
end;
$$;

drop function if exists public.delete_stripe_rollout_override_admin_safe(uuid);

create function public.delete_stripe_rollout_override_admin_safe(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  delete from public.stripe_rollout_overrides
  where user_id = p_user_id;

  return found;
end;
$$;

grant execute on function public.get_checkout_gateway_public_safe() to authenticated;
grant execute on function public.get_stripe_rollout_summary_admin_safe() to authenticated;
grant execute on function public.list_stripe_rollout_overrides_admin_safe() to authenticated;
grant execute on function public.search_users_for_stripe_rollout_admin_safe(text) to authenticated;
grant execute on function public.upsert_stripe_rollout_override_admin_safe(uuid, text) to authenticated;
grant execute on function public.delete_stripe_rollout_override_admin_safe(uuid) to authenticated;
