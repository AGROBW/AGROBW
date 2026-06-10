-- =====================================================================
-- LOTE 2A — PASSO 4 — announcement_technical_details
-- enable RLS + public SELECT + escrita OWNER-scoped (+ admin)
-- Data: 2026-06-10
-- =====================================================================
-- RLS off + grants amplos. Leitura pública legítima (specs no detalhe do anúncio,
-- via embed em SINGLE_AD_SELECT e subquery em view). Escrita legítima: o DONO do
-- anúncio (pages/AdCreationView). Admin (ModerationQueue) só LÊ.
-- Risco atual: anon edita/apaga specs de qualquer anúncio.
-- Vínculo de dono: announcement_technical_details.announcement_id -> announcements.user_id.
-- Correção: ligar RLS, SELECT público, escrita só do dono (ou admin).
-- =====================================================================

begin;

alter table public.announcement_technical_details enable row level security;

-- leitura pública (detalhe do anúncio)
drop policy if exists "public read announcement_technical_details" on public.announcement_technical_details;
create policy "public read announcement_technical_details"
  on public.announcement_technical_details for select to public using (true);

-- escrita: dono do anúncio OU admin
drop policy if exists "owner manage announcement_technical_details" on public.announcement_technical_details;
create policy "owner manage announcement_technical_details"
  on public.announcement_technical_details for all to authenticated
  using (
    public.is_admin() = true
    or exists (
      select 1 from public.announcements an
      where an.id = announcement_technical_details.announcement_id
        and an.user_id = auth.uid()
    )
  )
  with check (
    public.is_admin() = true
    or exists (
      select 1 from public.announcements an
      where an.id = announcement_technical_details.announcement_id
        and an.user_id = auth.uid()
    )
  );

commit;

-- =====================================================================
-- VALIDAÇÃO:
--   anon: detalhe do anúncio mostra specs (SELECT público) -> OK
--   dono: criar/editar anúncio com specs (AdCreationView) -> OK
--   usuário A: insert/update/delete de specs de anúncio de B -> NEGADO
--   admin (ModerationQueue): lê specs -> OK; pode gerenciar se necessário -> OK
--   anon: write -> NEGADO
--   relrowsecurity=true
-- ROLLBACK:
--   alter table public.announcement_technical_details disable row level security;
--   drop policy if exists "public read announcement_technical_details" on public.announcement_technical_details;
--   drop policy if exists "owner manage announcement_technical_details" on public.announcement_technical_details;
-- =====================================================================
