alter table public.plans
  add column if not exists show_footer_card boolean not null default true;

update public.plans
set show_footer_card = true
where show_footer_card is null;
