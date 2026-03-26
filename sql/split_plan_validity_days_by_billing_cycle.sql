alter table public.plans
  add column if not exists plan_validity_days_monthly integer,
  add column if not exists plan_validity_days_yearly integer;

update public.plans
set
  plan_validity_days_monthly = coalesce(plan_validity_days_monthly, 30),
  plan_validity_days_yearly = coalesce(plan_validity_days_yearly, 365);

create or replace function public.resolve_plan_validity_days(
  p_billing_cycle text,
  p_monthly_days integer,
  p_yearly_days integer
)
returns integer
language sql
immutable
as $$
  select case
    when lower(coalesce(p_billing_cycle, 'monthly')) = 'yearly' then coalesce(p_yearly_days, 365)
    else coalesce(p_monthly_days, 30)
  end;
$$;
