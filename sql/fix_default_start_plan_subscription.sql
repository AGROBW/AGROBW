-- Corrige a atribuicao automatica do plano gratuito padrao e repara usuarios sem assinatura ativa.

create or replace function public.assign_start_agro_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  start_plan_id uuid;
  start_lead_days int;
begin
  select id, lead_contact_limit_days
    into start_plan_id, start_lead_days
  from public.plans
  where name = 'Start'
  limit 1;

  if start_plan_id is null then
    return new;
  end if;

  insert into public.user_subscriptions (
    user_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    trial_end_date
  ) values (
    new.id,
    start_plan_id,
    'active',
    now(),
    now() + interval '30 days',
    false,
    case when start_lead_days is not null then now() + (start_lead_days || ' days')::interval else null end
  );

  return new;
end;
$$;

drop trigger if exists trg_assign_start_plan on public.users;
create trigger trg_assign_start_plan
after insert on public.users
for each row execute procedure public.assign_start_agro_plan();

insert into public.user_subscriptions (
  user_id,
  plan_id,
  status,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  trial_end_date
)
select
  u.id,
  p.id,
  'active',
  now(),
  now() + interval '30 days',
  false,
  case when p.lead_contact_limit_days is not null then now() + (p.lead_contact_limit_days || ' days')::interval else null end
from public.users u
cross join lateral (
  select id, lead_contact_limit_days
  from public.plans
  where name = 'Start'
  limit 1
) p
where not exists (
  select 1
  from public.user_subscriptions us
  where us.user_id = u.id
    and us.status in ('active', 'trialing', 'past_due')
);
