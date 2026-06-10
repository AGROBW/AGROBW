-- =====================================================================
-- LOTE 2A — PASSO 3 — Taxonomia (enable RLS + public SELECT + admin write)
-- Tabelas: categories, subcategories, category_groups, category_group_categories
-- Data: 2026-06-10
-- =====================================================================
-- Todas RLS off + grants amplos anon/auth. Leitura pública legítima (catálogo:
-- useAds, usePublicCategoryCatalog, RadarView, AdCreationView etc).
-- Risco: anon DELETE/TRUNCATE/UPDATE -> vandalismo/DoS do catálogo inteiro.
-- Escrita legítima: admin (pages/admin/CategoriesManagement).
-- Correção: ligar RLS, SELECT público, escrita admin-only (is_admin()/aal2).
-- =====================================================================

begin;

-- ---------- categories ----------
alter table public.categories enable row level security;
drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select to public using (true);
drop policy if exists "admin manage categories" on public.categories;
create policy "admin manage categories" on public.categories for all to authenticated
  using (public.is_admin() = true) with check (public.is_admin() = true);

-- ---------- subcategories ----------
alter table public.subcategories enable row level security;
drop policy if exists "public read subcategories" on public.subcategories;
create policy "public read subcategories" on public.subcategories for select to public using (true);
drop policy if exists "admin manage subcategories" on public.subcategories;
create policy "admin manage subcategories" on public.subcategories for all to authenticated
  using (public.is_admin() = true) with check (public.is_admin() = true);

-- ---------- category_groups ----------
alter table public.category_groups enable row level security;
drop policy if exists "public read category_groups" on public.category_groups;
create policy "public read category_groups" on public.category_groups for select to public using (true);
drop policy if exists "admin manage category_groups" on public.category_groups;
create policy "admin manage category_groups" on public.category_groups for all to authenticated
  using (public.is_admin() = true) with check (public.is_admin() = true);

-- ---------- category_group_categories ----------
alter table public.category_group_categories enable row level security;
drop policy if exists "public read category_group_categories" on public.category_group_categories;
create policy "public read category_group_categories" on public.category_group_categories for select to public using (true);
drop policy if exists "admin manage category_group_categories" on public.category_group_categories;
create policy "admin manage category_group_categories" on public.category_group_categories for all to authenticated
  using (public.is_admin() = true) with check (public.is_admin() = true);

commit;

-- =====================================================================
-- VALIDAÇÃO:
--   anon: navegar catálogo (home, busca, RadarView, criação de anúncio) -> OK
--   anon: insert/update/delete/truncate em qualquer das 4 -> NEGADO
--   authenticated comum: write -> NEGADO
--   admin (aal2): CRUD no CategoriesManagement -> OK
--   relrowsecurity=true nas 4
-- ROLLBACK (por tabela): disable row level security + drop das 2 policies.
--   ex.: alter table public.categories disable row level security;
--        drop policy if exists "public read categories" on public.categories;
--        drop policy if exists "admin manage categories" on public.categories;
-- =====================================================================
