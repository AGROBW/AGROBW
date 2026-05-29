create table if not exists public.subscription_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid not null references public.user_subscriptions(id) on delete cascade,
  provider text not null default 'stripe',
  provider_subscription_id text null,
  current_plan_id uuid not null references public.plans(id),
  target_plan_id uuid null references public.plans(id),
  current_billing_cycle text null check (current_billing_cycle in ('monthly', 'yearly')),
  target_billing_cycle text null check (target_billing_cycle in ('monthly', 'yearly')),
  change_kind text not null check (change_kind in ('upgrade', 'downgrade', 'cancel')),
  status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled', 'failed')),
  effective_on timestamptz not null,
  requested_at timestamptz not null default now(),
  applied_at timestamptz null,
  cancelled_at timestamptz null,
  failure_reason text null,
  source text not null default 'user_dashboard',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscription_change_requests_user_status
  on public.subscription_change_requests(user_id, status, requested_at desc);

create index if not exists idx_subscription_change_requests_subscription_status
  on public.subscription_change_requests(subscription_id, status, requested_at desc);

create unique index if not exists idx_subscription_change_requests_single_pending
  on public.subscription_change_requests(subscription_id)
  where status = 'pending';

alter table public.subscription_change_requests enable row level security;

drop policy if exists "Users can read own subscription change requests" on public.subscription_change_requests;
create policy "Users can read own subscription change requests"
on public.subscription_change_requests
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read subscription change requests" on public.subscription_change_requests;
create policy "Admins can read subscription change requests"
on public.subscription_change_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (u.is_admin = true or upper(coalesce(u.role, '')) = 'ADMIN')
  )
);

create or replace function public.touch_subscription_change_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_subscription_change_requests_updated_at on public.subscription_change_requests;
create trigger trg_touch_subscription_change_requests_updated_at
before update on public.subscription_change_requests
for each row
execute function public.touch_subscription_change_requests_updated_at();

create or replace function public.get_my_pending_subscription_change()
returns table (
  id uuid,
  subscription_id uuid,
  provider text,
  provider_subscription_id text,
  change_kind text,
  status text,
  effective_on timestamptz,
  requested_at timestamptz,
  current_plan_id uuid,
  current_plan_name text,
  target_plan_id uuid,
  target_plan_name text,
  current_billing_cycle text,
  target_billing_cycle text,
  source text,
  metadata jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    scr.id,
    scr.subscription_id,
    scr.provider,
    scr.provider_subscription_id,
    scr.change_kind,
    scr.status,
    scr.effective_on,
    scr.requested_at,
    scr.current_plan_id,
    current_plan.name as current_plan_name,
    scr.target_plan_id,
    target_plan.name as target_plan_name,
    scr.current_billing_cycle,
    scr.target_billing_cycle,
    scr.source,
    scr.metadata
  from public.subscription_change_requests scr
  join public.plans current_plan on current_plan.id = scr.current_plan_id
  left join public.plans target_plan on target_plan.id = scr.target_plan_id
  where scr.user_id = auth.uid()
    and scr.status = 'pending'
  order by scr.requested_at desc
  limit 1;
$$;

grant execute on function public.get_my_pending_subscription_change() to authenticated;

create or replace function public.request_subscription_change_next_cycle(
  p_change_kind text,
  p_target_plan_id uuid default null,
  p_target_billing_cycle text default null
)
returns public.subscription_change_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription public.user_subscriptions%rowtype;
  v_current_plan record;
  v_target_plan record;
  v_existing_request public.subscription_change_requests%rowtype;
  v_effective_on timestamptz;
  v_target_billing_cycle text;
  v_inferred_kind text;
  v_result public.subscription_change_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_change_kind not in ('upgrade', 'downgrade', 'cancel') then
    raise exception 'Tipo de alteracao invalido.';
  end if;

  select us.*
  into v_subscription
  from public.user_subscriptions us
  where us.user_id = v_user_id
    and us.provider = 'stripe'
    and us.status in ('active', 'trialing', 'past_due')
    and us.current_period_end > now()
  order by us.current_period_end desc, us.updated_at desc
  limit 1;

  if v_subscription.id is null then
    raise exception 'Nenhuma assinatura Stripe elegivel foi encontrada para esta conta.';
  end if;

  select p.id, p.name, p.position, p.is_active, p.is_downgrade_plan
  into v_current_plan
  from public.plans p
  where p.id = v_subscription.plan_id;

  if v_current_plan.id is null then
    raise exception 'Plano atual da assinatura nao encontrado.';
  end if;

  if p_change_kind = 'cancel' then
    p_target_plan_id := null;
    p_target_billing_cycle := null;
    v_inferred_kind := 'cancel';
  else
    if p_target_plan_id is null then
      raise exception 'Informe o plano de destino para esta alteracao.';
    end if;

    select p.id, p.name, p.position, p.is_active, p.is_downgrade_plan
    into v_target_plan
    from public.plans p
    where p.id = p_target_plan_id;

    if v_target_plan.id is null or v_target_plan.is_active is distinct from true then
      raise exception 'Plano de destino nao encontrado ou inativo.';
    end if;

    if v_target_plan.is_downgrade_plan then
      raise exception 'O plano de downgrade interno nao pode ser solicitado manualmente.';
    end if;

    v_target_billing_cycle := coalesce(p_target_billing_cycle, v_subscription.billing_cycle);

    if v_current_plan.id = v_target_plan.id
      and coalesce(v_subscription.billing_cycle, '') = coalesce(v_target_billing_cycle, '') then
      raise exception 'A assinatura ja esta configurada para este mesmo plano e ciclo.';
    end if;

    if v_target_plan.position > v_current_plan.position then
      v_inferred_kind := 'upgrade';
    elsif v_target_plan.position < v_current_plan.position then
      v_inferred_kind := 'downgrade';
    else
      raise exception 'Troca apenas de ciclo ainda nao esta habilitada neste fluxo. Use o portal Stripe.';
    end if;

    if v_inferred_kind <> p_change_kind then
      raise exception 'A classificacao da alteracao nao corresponde aos planos selecionados.';
    end if;
  end if;

  v_effective_on := v_subscription.current_period_end;

  select scr.*
  into v_existing_request
  from public.subscription_change_requests scr
  where scr.subscription_id = v_subscription.id
    and scr.status = 'pending'
  limit 1;

  if v_existing_request.id is not null then
    update public.subscription_change_requests scr
    set
      provider = 'stripe',
      provider_subscription_id = v_subscription.provider_subscription_id,
      current_plan_id = v_subscription.plan_id,
      target_plan_id = p_target_plan_id,
      current_billing_cycle = v_subscription.billing_cycle,
      target_billing_cycle = v_target_billing_cycle,
      change_kind = v_inferred_kind,
      effective_on = v_effective_on,
      source = 'user_dashboard',
      metadata = jsonb_build_object(
        'requested_via', 'request_subscription_change_next_cycle',
        'subscription_status', v_subscription.status
      ),
      failure_reason = null,
      cancelled_at = null,
      applied_at = null
    where scr.id = v_existing_request.id
    returning * into v_result;
  else
    insert into public.subscription_change_requests (
      user_id,
      subscription_id,
      provider,
      provider_subscription_id,
      current_plan_id,
      target_plan_id,
      current_billing_cycle,
      target_billing_cycle,
      change_kind,
      status,
      effective_on,
      source,
      metadata
    ) values (
      v_user_id,
      v_subscription.id,
      'stripe',
      v_subscription.provider_subscription_id,
      v_subscription.plan_id,
      p_target_plan_id,
      v_subscription.billing_cycle,
      v_target_billing_cycle,
      v_inferred_kind,
      'pending',
      v_effective_on,
      'user_dashboard',
      jsonb_build_object(
        'requested_via', 'request_subscription_change_next_cycle',
        'subscription_status', v_subscription.status
      )
    )
    returning * into v_result;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  ) values (
    v_user_id,
    'SYSTEM',
    case
      when v_inferred_kind = 'cancel' then 'Cancelamento agendado para o proximo ciclo'
      when v_inferred_kind = 'upgrade' then 'Upgrade agendado para o proximo ciclo'
      else 'Downgrade agendado para o proximo ciclo'
    end,
    case
      when v_inferred_kind = 'cancel' then 'Recebemos sua solicitacao. A assinatura permanecera ativa ate o fim do periodo atual e nao sera renovada no ciclo seguinte.'
      when v_inferred_kind = 'upgrade' then 'Recebemos sua solicitacao. O novo plano sera aplicado automaticamente no proximo ciclo da assinatura.'
      else 'Recebemos sua solicitacao. O plano sera alterado automaticamente no proximo ciclo da assinatura.'
    end,
    '/minha-conta/financeiro'
  );

  return v_result;
end;
$$;

grant execute on function public.request_subscription_change_next_cycle(text, uuid, text) to authenticated;

create or replace function public.cancel_my_pending_subscription_change()
returns public.subscription_change_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.subscription_change_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select scr.*
  into v_request
  from public.subscription_change_requests scr
  where scr.user_id = v_user_id
    and scr.status = 'pending'
  order by scr.requested_at desc
  limit 1;

  if v_request.id is null then
    raise exception 'Nenhuma alteracao pendente foi encontrada.';
  end if;

  update public.subscription_change_requests scr
  set
    status = 'cancelled',
    cancelled_at = now(),
    failure_reason = null
  where scr.id = v_request.id
  returning * into v_request;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  ) values (
    v_user_id,
    'SYSTEM',
    'Alteracao de plano cancelada',
    'A solicitacao de mudanca agendada para o proximo ciclo foi cancelada com sucesso.',
    '/minha-conta/financeiro'
  );

  return v_request;
end;
$$;

grant execute on function public.cancel_my_pending_subscription_change() to authenticated;
