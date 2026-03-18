create table if not exists public.mp_processed_payments (
  payment_id text primary key,
  provider text not null default 'mercadopago',
  user_id uuid,
  plan_id uuid,
  webhook_log_id uuid references public.webhook_logs(id) on delete set null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_mp_processed_payments_user_id
  on public.mp_processed_payments(user_id);

create index if not exists idx_mp_processed_payments_plan_id
  on public.mp_processed_payments(plan_id);
