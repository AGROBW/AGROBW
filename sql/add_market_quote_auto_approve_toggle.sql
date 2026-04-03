alter table public.market_quote_sources
  add column if not exists auto_approve_enabled boolean not null default false;

comment on column public.market_quote_sources.auto_approve_enabled
  is 'Quando true, a coleta válida desta fonte é aprovada e publicada automaticamente no ticker.';
