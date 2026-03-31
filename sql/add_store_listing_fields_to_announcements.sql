alter table public.announcements
  add column if not exists product_condition text,
  add column if not exists availability text,
  add column if not exists accepts_trade boolean not null default false,
  add column if not exists has_warranty boolean not null default false,
  add column if not exists warranty_details text,
  add column if not exists has_invoice boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'announcements_product_condition_check'
  ) then
    alter table public.announcements
      add constraint announcements_product_condition_check
      check (
        product_condition is null
        or product_condition in ('novo', 'seminovo', 'usado')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'announcements_availability_check'
  ) then
    alter table public.announcements
      add constraint announcements_availability_check
      check (
        availability is null
        or availability in ('pronta_entrega', 'sob_encomenda', 'consultar_estoque')
      );
  end if;
end $$;
