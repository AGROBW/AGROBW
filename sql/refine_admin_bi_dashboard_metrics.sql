-- Refinamento do Dashboard BI Admin
-- Objetivo:
-- - alinhar o dashboard com indicadores mais estrategicos e acionaveis
-- - padronizar aquisicao/conversao/plataforma em janela de 30 dias

begin;

create or replace view public.v_registration_conversion_30d as
with recent_signups as (
  select count(*)::bigint as new_users_30d
  from public.users
  where created_at >= now() - interval '30 days'
),
recent_visitors as (
  select coalesce(sum(unique_visitors), 0)::bigint as unique_visitors_30d
  from public.website_visits
  where visit_date >= (current_date - interval '29 days')::date
)
select
  rs.new_users_30d,
  rv.unique_visitors_30d,
  round(
    rs.new_users_30d * 100.0 / nullif(rv.unique_visitors_30d, 0),
    2
  ) as registration_rate_percentage
from recent_signups rs
cross join recent_visitors rv;

comment on view public.v_registration_conversion_30d is
  'Taxa de cadastro dos ultimos 30 dias (usuarios cadastrados / visitantes unicos)';

create or replace view public.v_paid_conversion_30d as
with recent_signups as (
  select count(*)::bigint as new_users_30d
  from public.users
  where created_at >= now() - interval '30 days'
),
recent_paid_customers as (
  select count(distinct sh.user_id)::bigint as new_paid_customers_30d
  from public.subscription_history sh
  where sh.event_type in ('created', 'trial_converted')
    and coalesce(sh.plan_monthly_price, 0) > 0
    and sh.created_at >= now() - interval '30 days'
)
select
  rs.new_users_30d,
  rpc.new_paid_customers_30d,
  round(
    rpc.new_paid_customers_30d * 100.0 / nullif(rs.new_users_30d, 0),
    2
  ) as conversion_rate_percentage
from recent_signups rs
cross join recent_paid_customers rpc;

comment on view public.v_paid_conversion_30d is
  'Taxa de conversao de usuario para cliente pago nos ultimos 30 dias';

create or replace view public.v_customer_churn_30d as
with params as (
  select now() - interval '30 days' as period_start
),
starting_base as (
  select count(distinct sh.user_id)::bigint as active_customers_at_period_start
  from public.subscription_history sh
  cross join params p
  where coalesce(sh.plan_monthly_price, 0) > 0
    and sh.period_start <= p.period_start
    and sh.period_end >= p.period_start
    and sh.status in ('active', 'trialing', 'past_due')
),
churned_customers as (
  select count(distinct sh.user_id)::bigint as churned_customers_30d
  from public.subscription_history sh
  cross join params p
  where sh.event_type in ('canceled', 'expired')
    and coalesce(sh.plan_monthly_price, 0) > 0
    and sh.created_at >= p.period_start
)
select
  sb.active_customers_at_period_start,
  cc.churned_customers_30d,
  round(
    cc.churned_customers_30d * 100.0 / nullif(sb.active_customers_at_period_start, 0),
    2
  ) as customer_churn_percentage
from starting_base sb
cross join churned_customers cc;

comment on view public.v_customer_churn_30d is
  'Taxa de churn de clientes dos ultimos 30 dias (clientes perdidos / base paga no inicio do periodo)';

commit;
