-- =====================================================
-- HIERARQUIA DE CATEGORIAS - BASE NAO DESTRUTIVA
-- =====================================================
-- Objetivo:
-- 1. Introduzir grupos de categoria oficiais sem quebrar os anuncios atuais
-- 2. Mapear as categorias atuais nesses grupos
-- 3. Preparar anuncios e alertas para futura migracao completa
-- =====================================================

create table if not exists public.category_groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.category_group_categories (
  group_id uuid not null references public.category_groups(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (group_id, category_id)
);

alter table public.announcements
  add column if not exists category_group_id uuid references public.category_groups(id) on delete set null;

alter table public.opportunity_alerts
  add column if not exists category_group_id uuid references public.category_groups(id) on delete set null;

create index if not exists idx_announcements_category_group_id
  on public.announcements(category_group_id);

create index if not exists idx_opportunity_alerts_category_group_id
  on public.opportunity_alerts(category_group_id);

insert into public.category_groups (name, slug, sort_order)
values
  ('Animais', 'animais', 1),
  ('Maquinas', 'maquinas', 2),
  ('Insumos', 'insumos', 3),
  ('Imoveis Rurais', 'imoveis', 4),
  ('Servicos', 'servicos', 5),
  ('Sementes', 'sementes', 6)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    updated_at = now();

with mappings as (
  select 'animais'::text as group_slug, 'animais'::text as category_slug, 1 as sort_order
  union all select 'maquinas', 'maquinas-equipamentos', 1
  union all select 'maquinas', 'tratores-agricolas', 2
  union all select 'maquinas', 'colheitadeiras-colhedoras', 3
  union all select 'maquinas', 'implementos', 4
  union all select 'maquinas', 'pecas', 5
  union all select 'maquinas', 'maquinas-pesadas', 6
  union all select 'insumos', 'fertilizantes-agricolas', 1
  union all select 'insumos', 'alimentos-para-nutricao-animal', 2
  union all select 'insumos', 'alimentos-em-geral', 3
  union all select 'imoveis', 'imoveis-rurais', 1
  union all select 'imoveis', 'fazendas', 2
  union all select 'servicos', 'armazenagem-de-produtos', 1
  union all select 'sementes', 'arvores-adultas-mudas', 1
  union all select 'sementes', 'alimentos-em-geral', 2
)
insert into public.category_group_categories (group_id, category_id, sort_order)
select
  cg.id,
  c.id,
  mappings.sort_order
from mappings
join public.category_groups cg
  on cg.slug = mappings.group_slug
join public.categories c
  on c.slug = mappings.category_slug
on conflict (group_id, category_id) do update
set sort_order = excluded.sort_order;

update public.announcements a
set category_group_id = cgc.group_id
from public.category_group_categories cgc
where a.category_id = cgc.category_id
  and a.category_group_id is distinct from cgc.group_id;

update public.opportunity_alerts oa
set category_group_id = cgc.group_id
from public.category_group_categories cgc
where oa.category_id = cgc.category_id
  and oa.category_group_id is distinct from cgc.group_id;

create or replace view public.category_group_resolved as
select
  cg.id as group_id,
  cg.name as group_name,
  cg.slug as group_slug,
  cg.sort_order as group_sort_order,
  c.id as category_id,
  c.name as category_name,
  c.slug as category_slug,
  cgc.sort_order as category_sort_order
from public.category_groups cg
left join public.category_group_categories cgc
  on cgc.group_id = cg.id
left join public.categories c
  on c.id = cgc.category_id;

comment on table public.category_groups is
  'Categorias principais oficiais do produto, usadas para agrupar categorias legadas e preparar a hierarquia futura.';

comment on table public.category_group_categories is
  'Mapa entre grupos principais e categorias atuais do banco, permitindo migracao gradual sem quebrar anuncios existentes.';

comment on column public.announcements.category_group_id is
  'Grupo principal do anuncio, preenchido a partir da categoria atual para suportar filtros e migracao futura.';

comment on column public.opportunity_alerts.category_group_id is
  'Grupo principal do alerta de oportunidade, preenchido a partir da categoria atual para suportar a futura hierarquia oficial.';
