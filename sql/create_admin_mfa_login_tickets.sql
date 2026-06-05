begin;

create table if not exists public.admin_mfa_login_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  user_agent text null,
  ip_address text null
);

create index if not exists idx_admin_mfa_login_tickets_user_id
  on public.admin_mfa_login_tickets(user_id);

create index if not exists idx_admin_mfa_login_tickets_expires_at
  on public.admin_mfa_login_tickets(expires_at);

alter table public.admin_mfa_login_tickets enable row level security;

commit;
