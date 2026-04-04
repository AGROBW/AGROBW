alter table public.categories
  add column if not exists parent_group_slug text,
  add column if not exists icon_name text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_categories_parent_group_slug
  on public.categories(parent_group_slug, sort_order, name);

create table if not exists public.category_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create index if not exists idx_category_subcategories_category_id
  on public.category_subcategories(category_id);

create index if not exists idx_category_subcategories_sort_order
  on public.category_subcategories(category_id, sort_order, name);

alter table public.category_subcategories enable row level security;

drop policy if exists "Admins can manage category_subcategories" on public.category_subcategories;
create policy "Admins can manage category_subcategories"
on public.category_subcategories
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

drop policy if exists "Authenticated users can view category_subcategories" on public.category_subcategories;
create policy "Authenticated users can view category_subcategories"
on public.category_subcategories
for select
to authenticated, anon
using (is_active = true);
