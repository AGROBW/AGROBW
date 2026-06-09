-- =====================================================================
-- SECURITY FIX — R3 (A-01): Contato do vendedor OWNER-ONLY (tabela privada)
-- Data: 2026-06-08
-- Estratégia: EXPAND -> SWITCH (app) -> CONTRACT. Este arquivo é a FASE EXPAND:
--   cria as tabelas privadas + RLS owner/admin + copia os dados.
--   NÃO remove as colunas-base ainda (announcements.whatsapp / seller_stores.email)
--   -> seguro de aplicar sem quebrar o app. As colunas-base só saem na FASE
--   CONTRACT (arquivo separado), depois que o app estiver lendo/gravando do privado.
--
-- Resultado: o contato sensível passa a viver em tabela com RLS por dono/admin.
-- anon não lê (sem policy p/ anon); outro usuário logado não lê (não é dono);
-- dono e admin (aal2) leem. seller_stores.whatsapp (telefone público/SEO) NÃO é
-- tocado.
-- NÃO aplicar automaticamente. Transacional + idempotente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Tabela privada de contato do ANÚNCIO (whatsapp do vendedor)
-- ---------------------------------------------------------------------
create table if not exists public.announcement_contacts (
  announcement_id uuid primary key
    references public.announcements(id) on delete cascade,
  whatsapp text,
  updated_at timestamptz not null default now()
);

alter table public.announcement_contacts enable row level security;

-- Least privilege: sem acesso a anon; authenticated gateado por RLS.
revoke all on table public.announcement_contacts from anon, public;
grant select, insert, update, delete on table public.announcement_contacts to authenticated;
-- service_role já bypassa RLS.

-- RLS: dono do anúncio OU admin (aal2)
drop policy if exists "announcement_contacts_owner_rw" on public.announcement_contacts;
create policy "announcement_contacts_owner_rw" on public.announcement_contacts
  for all to authenticated
  using (
    public.is_admin() = true
    or exists (
      select 1 from public.announcements a
      where a.id = announcement_contacts.announcement_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    public.is_admin() = true
    or exists (
      select 1 from public.announcements a
      where a.id = announcement_contacts.announcement_id
        and a.user_id = auth.uid()
    )
  );

-- Copiar os valores existentes (idempotente)
insert into public.announcement_contacts (announcement_id, whatsapp)
select a.id, a.whatsapp
from public.announcements a
where a.whatsapp is not null
on conflict (announcement_id) do update set whatsapp = excluded.whatsapp;

-- ---------------------------------------------------------------------
-- 2. Tabela privada de contato da LOJA (email da loja)
--    (whatsapp da loja continua público — telefone/SEO — não move)
-- ---------------------------------------------------------------------
create table if not exists public.seller_store_contacts (
  store_id uuid primary key
    references public.seller_stores(id) on delete cascade,
  email text,
  updated_at timestamptz not null default now()
);

alter table public.seller_store_contacts enable row level security;

revoke all on table public.seller_store_contacts from anon, public;
grant select, insert, update, delete on table public.seller_store_contacts to authenticated;

drop policy if exists "seller_store_contacts_owner_rw" on public.seller_store_contacts;
create policy "seller_store_contacts_owner_rw" on public.seller_store_contacts
  for all to authenticated
  using (
    public.is_admin() = true
    or exists (
      select 1 from public.seller_stores s
      where s.id = seller_store_contacts.store_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    public.is_admin() = true
    or exists (
      select 1 from public.seller_stores s
      where s.id = seller_store_contacts.store_id
        and s.user_id = auth.uid()
    )
  );

insert into public.seller_store_contacts (store_id, email)
select s.id, s.email
from public.seller_stores s
where s.email is not null
on conflict (store_id) do update set email = excluded.email;

commit;

-- =====================================================================
-- VERIFICAÇÃO (após COMMIT)
-- =====================================================================
-- -- contagem migrada x origem:
-- select (select count(*) from public.announcement_contacts) as ac,
--        (select count(*) from public.announcements where whatsapp is not null) as src_ac,
--        (select count(*) from public.seller_store_contacts) as sc,
--        (select count(*) from public.seller_stores where email is not null) as src_sc;
--
-- -- anon NÃO lê as tabelas privadas:
-- --   curl .../rest/v1/announcement_contacts?select=whatsapp  (apikey anon) -> []/permission denied
--
-- PRÓXIMOS PASSOS (não neste arquivo):
--   SWITCH (app): gravar/ler contato nas tabelas privadas; remover whatsapp/email
--                 dos selects de announcements/seller_stores.
--   CONTRACT (SQL separado): após o app no ar e validado, dropar
--                 announcements.whatsapp e seller_stores.email.
-- =====================================================================
