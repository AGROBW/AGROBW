create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid references public.user_subscriptions(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  provider text not null default 'mercadopago',
  provider_payment_id text not null unique,
  provider_preference_id text,
  external_reference text,
  billing_cycle text check (billing_cycle in ('monthly', 'yearly')),
  description text,
  amount numeric(12,2) not null,
  currency text not null default 'BRL',
  status text not null check (
    status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'in_process', 'charged_back')
  ),
  status_detail text,
  payment_method text,
  receipt_url text,
  invoice_number text,
  invoice_pdf_url text,
  invoice_storage_path text,
  invoice_status text not null default 'pending' check (
    invoice_status in ('pending', 'available', 'failed', 'not_applicable')
  ),
  invoice_issued_at timestamptz,
  invoice_notes text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments
  add column if not exists invoice_storage_path text;

alter table public.payments
  add column if not exists invoice_issued_at timestamptz;

alter table public.payments
  add column if not exists invoice_notes text;

create index if not exists idx_payments_user_id_created_at
  on public.payments(user_id, created_at desc);

create index if not exists idx_payments_status
  on public.payments(status);

create index if not exists idx_payments_plan_id
  on public.payments(plan_id);

alter table public.payments enable row level security;

drop policy if exists "Users can read own payments" on public.payments;
create policy "Users can read own payments"
  on public.payments
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can read payments" on public.payments;
create policy "Admins can read payments"
  on public.payments
  for select
  to authenticated
  using (public.is_admin() = true);

drop policy if exists "Admins can update payments" on public.payments;
create policy "Admins can update payments"
  on public.payments
  for update
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

insert into public.payments (
  user_id,
  provider,
  provider_payment_id,
  description,
  amount,
  currency,
  status,
  invoice_status,
  paid_at,
  created_at,
  updated_at,
  metadata
)
select
  invoices.user_id,
  'legacy',
  'legacy-' || invoices.id::text,
  invoices.plan_name,
  invoices.amount,
  'BRL',
  case
    when invoices.status = 'PAID' then 'approved'
    when invoices.status = 'OVERDUE' then 'rejected'
    else 'pending'
  end,
  case
    when invoices.pdf_url is not null and invoices.pdf_url <> '' then 'available'
    else 'pending'
  end,
  invoices.paid_at,
  invoices.created_at,
  coalesce(invoices.paid_at, invoices.created_at),
  jsonb_build_object(
    'source', 'legacy_invoices_migration',
    'invoice_id', invoices.id,
    'pdf_url', invoices.pdf_url,
    'due_date', invoices.due_date,
    'plan_name', invoices.plan_name
  )
from public.invoices
where not exists (
  select 1
  from public.payments
  where provider_payment_id = 'legacy-' || invoices.id::text
);
