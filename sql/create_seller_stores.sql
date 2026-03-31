create table if not exists public.seller_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  slug text not null unique,
  store_name text not null,
  description text,
  logo_url text,
  cover_url text,
  whatsapp text,
  email text,
  instagram_url text,
  website_url text,
  city text,
  state text,
  is_active boolean not null default true,
  is_verified boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_seller_stores_slug on public.seller_stores(slug);
create index if not exists idx_seller_stores_user_id on public.seller_stores(user_id);
create index if not exists idx_seller_stores_active on public.seller_stores(is_active);

drop trigger if exists trg_seller_stores_updated_at on public.seller_stores;
create trigger trg_seller_stores_updated_at
before update on public.seller_stores
for each row
execute function public.update_updated_at_column();

alter table public.seller_stores enable row level security;

drop policy if exists "seller_stores_public_read_active" on public.seller_stores;
create policy "seller_stores_public_read_active"
on public.seller_stores
for select
using (is_active = true);

drop policy if exists "seller_stores_owner_read" on public.seller_stores;
create policy "seller_stores_owner_read"
on public.seller_stores
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "seller_stores_owner_insert" on public.seller_stores;
create policy "seller_stores_owner_insert"
on public.seller_stores
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "seller_stores_owner_update" on public.seller_stores;
create policy "seller_stores_owner_update"
on public.seller_stores
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "seller_stores_owner_delete" on public.seller_stores;
create policy "seller_stores_owner_delete"
on public.seller_stores
for delete
to authenticated
using (auth.uid() = user_id);
