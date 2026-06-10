-- =====================================================================
-- LOTE 2A — PASSO 2 — layout_settings + banners (enable RLS + public SELECT + admin write)
-- Data: 2026-06-10
-- =====================================================================
-- Ambas RLS off + grants amplos anon/auth. Leitura é pública legítima (render do
-- site/home). Risco: anon UPDATE/DELETE/TRUNCATE -> deface do layout/banners e
-- troca de whatsapp_url/commercial_whatsapp_number (redirecionar contato!).
-- Consumidores: useLayoutSettings (público + admin write), server read;
--               useBanners/bannerService (público), admin write.
-- Correção: ligar RLS, SELECT público, escrita admin-only (is_admin()/aal2).
-- =====================================================================

begin;

-- ---------- layout_settings ----------
alter table public.layout_settings enable row level security;

drop policy if exists "public read layout_settings" on public.layout_settings;
create policy "public read layout_settings"
  on public.layout_settings for select to public using (true);

drop policy if exists "admin manage layout_settings" on public.layout_settings;
create policy "admin manage layout_settings"
  on public.layout_settings for all to authenticated
  using (public.is_admin() = true) with check (public.is_admin() = true);

-- ---------- banners ----------
alter table public.banners enable row level security;

drop policy if exists "public read banners" on public.banners;
create policy "public read banners"
  on public.banners for select to public using (true);

drop policy if exists "admin manage banners" on public.banners;
create policy "admin manage banners"
  on public.banners for all to authenticated
  using (public.is_admin() = true) with check (public.is_admin() = true);

commit;

-- =====================================================================
-- VALIDAÇÃO:
--   anon: select layout_settings/banners -> OK (home/layout renderiza)
--   anon: update/delete/truncate -> NEGADO
--   authenticated comum: update/delete -> NEGADO
--   admin (aal2): editar layout e banners no painel -> OK
--   relrowsecurity=true nas duas
-- ROLLBACK:
--   alter table public.layout_settings disable row level security;
--   drop policy if exists "public read layout_settings" on public.layout_settings;
--   drop policy if exists "admin manage layout_settings" on public.layout_settings;
--   alter table public.banners disable row level security;
--   drop policy if exists "public read banners" on public.banners;
--   drop policy if exists "admin manage banners" on public.banners;
-- =====================================================================
