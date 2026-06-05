begin;

alter table if exists public.plans
  add column if not exists billing_model text not null default 'one_time';

update public.plans
set billing_model = 'one_time'
where billing_model is null
   or billing_model not in ('one_time', 'recurring');

alter table if exists public.plans
  drop constraint if exists plans_billing_model_check;

alter table if exists public.plans
  add constraint plans_billing_model_check
  check (billing_model in ('one_time', 'recurring'));

create index if not exists idx_plans_billing_model
  on public.plans(billing_model);

alter table if exists public.user_subscriptions
  add column if not exists billing_model text not null default 'one_time';

update public.user_subscriptions
set billing_model = case
  when provider_subscription_id is not null then 'recurring'
  else 'one_time'
end
where billing_model is null
   or billing_model not in ('one_time', 'recurring');

alter table if exists public.user_subscriptions
  drop constraint if exists user_subscriptions_billing_model_check;

alter table if exists public.user_subscriptions
  add constraint user_subscriptions_billing_model_check
  check (billing_model in ('one_time', 'recurring'));

create index if not exists idx_user_subscriptions_billing_model
  on public.user_subscriptions(billing_model);

alter table if exists public.payments
  add column if not exists billing_model text;

update public.payments
set billing_model = case
  when provider_subscription_id is not null then 'recurring'
  else 'one_time'
end
where billing_model is null
   or billing_model not in ('one_time', 'recurring');

alter table if exists public.payments
  drop constraint if exists payments_billing_model_check;

alter table if exists public.payments
  add constraint payments_billing_model_check
  check (billing_model in ('one_time', 'recurring'));

create index if not exists idx_payments_billing_model
  on public.payments(billing_model);

notify pgrst, 'reload schema';

commit;
