alter table public.seller_stores
add column if not exists cover_position_y integer not null default 50;

update public.seller_stores
set cover_position_y = 50
where cover_position_y is null;

alter table public.seller_stores
drop constraint if exists seller_stores_cover_position_y_check;

alter table public.seller_stores
add constraint seller_stores_cover_position_y_check
check (cover_position_y between 0 and 100);
