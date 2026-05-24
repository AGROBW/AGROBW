-- ==================================================
-- Etapa 4 - Webhook Stripe e sincronizacao real
-- ==================================================
-- Objetivo:
-- - validar e deduplicar eventos Stripe
-- - sincronizar assinaturas Stripe com user_subscriptions
-- - registrar pagamentos Stripe em payments
-- - manter Mercado Pago convivendo em paralelo
-- ==================================================

alter table public.payment_settings
  add column if not exists stripe_webhook_secret text;

alter table public.payments
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_invoice_id text,
  add column if not exists provider_checkout_session_id text;

alter table public.user_subscriptions
  add column if not exists provider text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_price_id text,
  add column if not exists provider_checkout_session_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean,
  add column if not exists trial_end_date timestamptz,
  add column if not exists amount_paid numeric(10, 2),
  add column if not exists currency text;

update public.user_subscriptions
set provider = coalesce(nullif(trim(provider), ''), 'mercadopago')
where provider is null
   or trim(provider) = '';

alter table public.user_subscriptions
  alter column provider set default 'mercadopago';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_subscriptions_status_check'
  ) then
    alter table public.user_subscriptions
      drop constraint user_subscriptions_status_check;
  end if;

  alter table public.user_subscriptions
    add constraint user_subscriptions_status_check
    check (status in ('pending', 'active', 'trialing', 'past_due', 'canceled', 'cancelled', 'expired'));
exception
  when duplicate_object then
    null;
end $$;

create index if not exists idx_payments_provider_invoice_id
  on public.payments(provider, provider_invoice_id)
  where provider_invoice_id is not null;

create index if not exists idx_user_subscriptions_provider_checkout_session_id
  on public.user_subscriptions(provider, provider_checkout_session_id)
  where provider_checkout_session_id is not null;

create index if not exists idx_user_subscriptions_provider_price_id
  on public.user_subscriptions(provider, provider_price_id)
  where provider_price_id is not null;

create table if not exists public.webhook_request_registry (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  request_id text not null,
  signature_ts_ms bigint,
  event_type text,
  payment_id text,
  webhook_log_id uuid references public.webhook_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists idx_webhook_request_registry_provider_request
  on public.webhook_request_registry(provider, request_id);

create index if not exists idx_webhook_request_registry_created_at
  on public.webhook_request_registry(created_at desc);

alter table public.webhook_request_registry enable row level security;

drop policy if exists "Admins can view webhook request registry" on public.webhook_request_registry;
create policy "Admins can view webhook request registry"
  on public.webhook_request_registry
  for select
  to authenticated
  using (public.is_admin() = true);

drop policy if exists "Admins can delete webhook request registry" on public.webhook_request_registry;
create policy "Admins can delete webhook request registry"
  on public.webhook_request_registry
  for delete
  to authenticated
  using (public.is_admin() = true);
