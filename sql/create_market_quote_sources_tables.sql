create table if not exists public.market_quote_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_url text not null,
  provider_label text,
  is_active boolean not null default true,
  refresh_interval_minutes integer not null default 60,
  last_validation_at timestamptz,
  last_sync_at timestamptz,
  last_status text,
  last_error text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_quote_source_previews (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.market_quote_sources (id) on delete cascade,
  status text not null default 'pending',
  extracted_quotes jsonb not null default '[]'::jsonb,
  raw_payload jsonb,
  previewed_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_market_quote_sources_active
  on public.market_quote_sources (is_active, updated_at desc);

create index if not exists idx_market_quote_source_previews_source
  on public.market_quote_source_previews (source_id, previewed_at desc);

create or replace function public.set_market_quote_sources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_market_quote_sources_updated_at on public.market_quote_sources;
create trigger trg_market_quote_sources_updated_at
before update on public.market_quote_sources
for each row
execute function public.set_market_quote_sources_updated_at();

alter table public.market_quote_sources enable row level security;
alter table public.market_quote_source_previews enable row level security;

drop policy if exists "market_quote_sources_admin_only" on public.market_quote_sources;
create policy "market_quote_sources_admin_only"
on public.market_quote_sources
for all
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_admin = true
  )
);

drop policy if exists "market_quote_source_previews_admin_only" on public.market_quote_source_previews;
create policy "market_quote_source_previews_admin_only"
on public.market_quote_source_previews
for all
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_admin = true
  )
);
