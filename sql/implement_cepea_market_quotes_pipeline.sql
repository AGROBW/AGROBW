alter table public.market_quote_sources
add column if not exists provider text not null default 'cepea';

alter table public.market_quote_sources
add column if not exists cepea_indicator_id integer;

alter table public.market_quote_sources
add column if not exists generated_url text;

alter table public.market_quote_sources
drop constraint if exists market_quote_sources_provider_check;

alter table public.market_quote_sources
add constraint market_quote_sources_provider_check
check (provider in ('cepea', 'custom'));

update public.market_quote_sources
set
  provider = coalesce(provider, 'cepea'),
  cepea_indicator_id = case
    when commodity_target = 'boi' then 2
    when commodity_target = 'cafe' then 23
    when commodity_target = 'milho' then 77
    when commodity_target = 'soja' then 12
    else cepea_indicator_id
  end,
  generated_url = case
    when coalesce(provider, 'cepea') = 'cepea'
      then 'https://www.cepea.org.br/br/widgetproduto.js.php?output=html&id_indicador[]=' ||
        case
          when commodity_target = 'boi' then '2'
          when commodity_target = 'cafe' then '23'
          when commodity_target = 'milho' then '77'
          when commodity_target = 'soja' then '12'
          else ''
        end
    else generated_url
  end
where commodity_target is not null;

create table if not exists public.market_quotes_temp (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.market_quote_sources (id) on delete cascade,
  commodity text not null,
  produto text not null,
  preco numeric(14,4) not null,
  unidade text not null default 'R$',
  data_referencia date not null,
  fonte text not null,
  status text not null default 'pending',
  raw_payload jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.users (id) on delete set null,
  constraint market_quotes_temp_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint market_quotes_temp_commodity_check check (commodity in ('soja', 'milho', 'boi', 'cafe'))
);

create unique index if not exists idx_market_quotes_temp_unique_pending
  on public.market_quotes_temp (source_id, commodity, data_referencia, preco);

create index if not exists idx_market_quotes_temp_source_created
  on public.market_quotes_temp (source_id, created_at desc);

alter table public.market_quotes_temp enable row level security;

drop policy if exists "market_quotes_temp_admin_only" on public.market_quotes_temp;
create policy "market_quotes_temp_admin_only"
on public.market_quotes_temp
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

alter table public.market_quotes
add column if not exists commodity text;

alter table public.market_quotes
add column if not exists product_name text;

alter table public.market_quotes
add column if not exists source_id uuid references public.market_quote_sources (id) on delete set null;

alter table public.market_quotes
add column if not exists reference_date date;

alter table public.market_quotes
add column if not exists source_label text;

update public.market_quotes
set
  commodity = case
    when code = 'cepea-soja' then 'soja'
    when code = 'cepea-milho' then 'milho'
    when code = 'cepea-boi' then 'boi'
    when code = 'cepea-cafe' then 'cafe'
    else commodity
  end,
  product_name = coalesce(product_name, name),
  source_label = coalesce(source_label, source),
  reference_date = coalesce(reference_date, current_date)
where code like 'cepea-%';
