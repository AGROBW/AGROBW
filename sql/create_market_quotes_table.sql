create table if not exists public.market_quotes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text,
  price numeric(14,4),
  change_percent numeric(8,2) not null default 0,
  source text,
  is_active boolean not null default true,
  is_placeholder boolean not null default false,
  placeholder_text text,
  sort_order integer not null default 0,
  last_update timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_quotes_price_or_placeholder_check check (
    (is_placeholder = true and placeholder_text is not null)
    or (is_placeholder = false and price is not null)
  )
);

create index if not exists idx_market_quotes_active_sort
  on public.market_quotes (is_active, sort_order, name);

create or replace function public.set_market_quotes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_market_quotes_updated_at on public.market_quotes;
create trigger trg_market_quotes_updated_at
before update on public.market_quotes
for each row
execute function public.set_market_quotes_updated_at();

alter table public.market_quotes enable row level security;

drop policy if exists "market_quotes_public_read" on public.market_quotes;
create policy "market_quotes_public_read"
on public.market_quotes
for select
using (is_active = true);

drop policy if exists "market_quotes_admin_manage" on public.market_quotes;
create policy "market_quotes_admin_manage"
on public.market_quotes
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

insert into public.market_quotes (
  code,
  name,
  unit,
  source,
  is_active,
  is_placeholder,
  placeholder_text,
  sort_order,
  last_update
)
values
  (
    'cepea-soja',
    'Soja (CEPEA)',
    'Indicador físico',
    'CEPEA',
    true,
    true,
    'Fonte em implantação',
    10,
    now()
  ),
  (
    'cepea-milho',
    'Milho (CEPEA)',
    'Indicador físico',
    'CEPEA',
    true,
    true,
    'Fonte em implantação',
    20,
    now()
  ),
  (
    'cepea-boi',
    'Boi Gordo (CEPEA)',
    'Indicador físico',
    'CEPEA',
    true,
    true,
    'Fonte em implantação',
    30,
    now()
  ),
  (
    'cepea-cafe',
    'Café Arábica (CEPEA)',
    'Indicador físico',
    'CEPEA',
    true,
    true,
    'Fonte em implantação',
    40,
    now()
  )
on conflict (code) do update
set
  name = excluded.name,
  unit = excluded.unit,
  source = excluded.source,
  is_active = excluded.is_active,
  is_placeholder = excluded.is_placeholder,
  placeholder_text = excluded.placeholder_text,
  sort_order = excluded.sort_order,
  last_update = excluded.last_update;
