-- Tabela para armazenar a imagem de capa de cada grupo principal de categorias
create table if not exists public.category_group_images (
  slug        text primary key,
  image_url   text not null,
  updated_at  timestamptz not null default now()
);

-- Insere os 6 slugs com valores vazios (serão substituídos pelo admin)
insert into public.category_group_images (slug, image_url)
values
  ('animais',  ''),
  ('maquinas', ''),
  ('insumos',  ''),
  ('imoveis',  ''),
  ('servicos', ''),
  ('sementes', '')
on conflict (slug) do nothing;

-- RLS
alter table public.category_group_images enable row level security;

drop policy if exists "Admins can manage category_group_images" on public.category_group_images;
create policy "Admins can manage category_group_images"
on public.category_group_images
for all
to authenticated
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid() and users.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = auth.uid() and users.is_admin = true
  )
);

drop policy if exists "Public can read category_group_images" on public.category_group_images;
create policy "Public can read category_group_images"
on public.category_group_images
for select
to anon, authenticated
using (true);
