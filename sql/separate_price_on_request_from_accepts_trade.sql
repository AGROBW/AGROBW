alter table public.announcements
  add column if not exists price_negotiable boolean not null default false;

update public.announcements
set price_negotiable = coalesce(price_negotiable, false) or coalesce(accepts_trade, false)
where coalesce(price_negotiable, false) = false
  and coalesce(accepts_trade, false) = true;
