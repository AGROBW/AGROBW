alter table public.market_quote_sources
add column if not exists commodity_target text;

update public.market_quote_sources
set commodity_target = coalesce(commodity_target, 'soja')
where commodity_target is null;

alter table public.market_quote_sources
alter column commodity_target set not null;

alter table public.market_quote_sources
drop constraint if exists market_quote_sources_commodity_target_check;

alter table public.market_quote_sources
add constraint market_quote_sources_commodity_target_check
check (commodity_target in ('soja', 'milho', 'boi', 'cafe'));
