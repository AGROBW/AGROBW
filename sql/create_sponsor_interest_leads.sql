create table if not exists public.sponsor_interest_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text null,
  segment text not null,
  message text null,
  preferred_channel text not null default 'whatsapp'
    check (preferred_channel in ('whatsapp', 'email')),
  source text not null default 'sponsor_landing',
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'closed', 'archived')),
  notes text null,
  contacted_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_sponsor_interest_leads_created_at
  on public.sponsor_interest_leads(created_at desc);

create index if not exists idx_sponsor_interest_leads_status
  on public.sponsor_interest_leads(status);

create or replace function public.touch_sponsor_interest_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_sponsor_interest_leads_updated_at on public.sponsor_interest_leads;
create trigger trg_touch_sponsor_interest_leads_updated_at
before update on public.sponsor_interest_leads
for each row
execute function public.touch_sponsor_interest_leads_updated_at();

alter table public.sponsor_interest_leads enable row level security;

drop policy if exists "Public can insert sponsor interest leads" on public.sponsor_interest_leads;
create policy "Public can insert sponsor interest leads"
on public.sponsor_interest_leads
for insert
to anon, authenticated
with check (
  company_name is not null
  and contact_name is not null
  and email is not null
  and segment is not null
  and source = 'sponsor_landing'
);

drop policy if exists "Admins can read sponsor interest leads" on public.sponsor_interest_leads;
create policy "Admins can read sponsor interest leads"
on public.sponsor_interest_leads
for select
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (
        coalesce(users.is_admin, false) = true
        or users.role = 'admin'
      )
  )
);

drop policy if exists "Admins can update sponsor interest leads" on public.sponsor_interest_leads;
create policy "Admins can update sponsor interest leads"
on public.sponsor_interest_leads
for update
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (
        coalesce(users.is_admin, false) = true
        or users.role = 'admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and (
        coalesce(users.is_admin, false) = true
        or users.role = 'admin'
      )
  )
);
