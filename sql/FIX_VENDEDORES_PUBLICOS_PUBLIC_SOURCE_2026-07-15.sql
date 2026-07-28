-- =====================================================================
-- vendedores_publicos — Opção A: fonte pública própria + view invoker por cima
-- Data: 2026-07-15
-- =====================================================================
-- Problema: vendedores_publicos é uma VIEW security-definer SOBRE public.users (PII),
--   exposta a anon/authenticated. Funciona hoje só porque ignora a RLS de users.
--   Ligar security_invoker direto QUEBRARIA (users não tem policy pública).
-- Solução: criar uma fonte pública dedicada (seller_public_profiles) com SOMENTE os
--   7 campos públicos, RLS genuinamente pública, sync a partir de users, e recriar
--   vendedores_publicos como security_invoker=on por cima dela — preservando o NOME
--   da view e o embed PostgREST `seller:vendedores_publicos!user_id`. users fica intacta.
-- Fase 1 auditada: view usada em useAds (embed), useAd, AboutView; 0 dependentes no banco.
-- Campos: id, name, avatar, document_verified, business_description, cidade, estado.
-- Escopo: CORE sincroniza TODOS os usuários (== comportamento atual, risco zero p/ vitrine).
--   Refinamento opcional (só vendedores) documentado no fim — NÃO aplicar sem checar AboutView.
-- =====================================================================


-- =====================================================================
-- FASE 1 — Fonte pública dedicada + RLS pública
-- Objetivo: criar seller_public_profiles (só campos públicos) legível por anon/auth.
-- Risco: baixíssimo — objeto novo, nada consome ainda; não toca users nem a view.
-- =====================================================================
begin;

create table if not exists public.seller_public_profiles (
  id                   uuid primary key references public.users(id) on delete cascade,
  name                 text,
  avatar               text,
  document_verified    boolean,
  business_description text,
  cidade               text,
  estado               text,
  updated_at           timestamptz not null default now()
);

alter table public.seller_public_profiles enable row level security;

drop policy if exists "public read seller profiles" on public.seller_public_profiles;
create policy "public read seller profiles"
  on public.seller_public_profiles
  for select to anon, authenticated
  using (true);

-- Escrita só via trigger(definer)/owner/service_role; leitura pública.
revoke all on public.seller_public_profiles from public;
grant select on public.seller_public_profiles to anon, authenticated;

-- PREVIEW (na transação): tabela criada, RLS on, policy pública presente.
select c.relname, c.relrowsecurity as rls_on,
       has_table_privilege('anon','public.seller_public_profiles','select') as anon_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='seller_public_profiles';

-- 1ª passada: troque COMMIT por ROLLBACK para pré-visualizar. Conferido -> COMMIT.
commit;

-- VALIDAÇÃO PÓS-COMMIT (Fase 1):
--   select * from pg_policies where schemaname='public' and tablename='seller_public_profiles';
--   -- esperado: 1 policy SELECT, roles {anon,authenticated}, qual=true, rls_on=true, anon_select=true
-- ROLLBACK (Fase 1):
--   drop table if exists public.seller_public_profiles cascade;


-- =====================================================================
-- FASE 2 — Sync (trigger) + backfill a partir de users
-- Objetivo: manter seller_public_profiles espelhando os 7 campos públicos de users.
-- Risco: baixo. Trigger SECURITY DEFINER + search_path=public; só escreve os 7 campos.
--   AFTER (não bloqueia o INSERT/UPDATE de users se algo falhar? falha propaga -> ver nota).
-- =====================================================================
begin;

create or replace function public.sync_seller_public_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.seller_public_profiles
    (id, name, avatar, document_verified, business_description, cidade, estado, updated_at)
  values
    (new.id, new.name, new.avatar, new.document_verified,
     new.business_description, new.cidade, new.estado, now())
  on conflict (id) do update set
    name                 = excluded.name,
    avatar               = excluded.avatar,
    document_verified    = excluded.document_verified,
    business_description  = excluded.business_description,
    cidade               = excluded.cidade,
    estado               = excluded.estado,
    updated_at           = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_seller_public_profile on public.users;
create trigger trg_sync_seller_public_profile
  after insert or update of name, avatar, document_verified, business_description, cidade, estado
  on public.users
  for each row
  execute function public.sync_seller_public_profile();

-- BACKFILL (CORE: todos os usuários — igual ao comportamento atual da view)
insert into public.seller_public_profiles
  (id, name, avatar, document_verified, business_description, cidade, estado, updated_at)
select id, name, avatar, document_verified, business_description, cidade, estado, now()
from public.users
on conflict (id) do update set
  name                 = excluded.name,
  avatar               = excluded.avatar,
  document_verified    = excluded.document_verified,
  business_description  = excluded.business_description,
  cidade               = excluded.cidade,
  estado               = excluded.estado,
  updated_at           = now();

-- PREVIEW: contagem deve bater com a de users.
select (select count(*) from public.users)                  as users_total,
       (select count(*) from public.seller_public_profiles) as profiles_total;

-- 1ª passada: ROLLBACK para pré-visualizar. Conferido (contagens iguais) -> COMMIT.
commit;

-- VALIDAÇÃO PÓS-COMMIT (Fase 2):
--   (1) contagem: profiles_total == users_total (backfill completo).
--   (2) sync vivo: update public.users set cidade=cidade where id='<um_id>'; -- toca trigger
--       select cidade from public.seller_public_profiles where id='<um_id>'; -- reflete.
-- ROLLBACK (Fase 2):
--   drop trigger if exists trg_sync_seller_public_profile on public.users;
--   drop function if exists public.sync_seller_public_profile();
--   -- (linhas já inseridas ficam; para zerar: truncate public.seller_public_profiles;)


-- =====================================================================
-- FASE 3 — Recriar vendedores_publicos como security_invoker=on sobre a fonte pública
-- Objetivo: silenciar o Advisor sem quebrar app/embed. Mesmas colunas e nome.
-- Risco: MÉDIO — o ponto de atenção é o EMBED PostgREST (ver checklist). users fica intacta.
-- =====================================================================
begin;

create or replace view public.vendedores_publicos
  with (security_invoker = on) as
select id, name, avatar, document_verified, business_description, cidade, estado
from public.seller_public_profiles;

-- create or replace preserva grants; reafirmamos por segurança.
grant select on public.vendedores_publicos to anon, authenticated;

-- PREVIEW: view aponta para a fonte pública e está com invoker on.
select relname, reloptions
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and relname='vendedores_publicos';

-- 1ª passada: ROLLBACK para pré-visualizar. Conferido -> COMMIT.
commit;

-- VALIDAÇÃO PÓS-COMMIT (Fase 3):
--   (1) reloptions mostra {security_invoker=on}.
--   (2) leitura pública: set role anon; select count(*) from public.vendedores_publicos; reset role; -- > 0
--   (3) CRÍTICO — embed no app: listagem de anúncios ainda traz o vendedor
--       (seller:vendedores_publicos!user_id) e AdDetail/AboutView carregam o vendedor.
-- ROLLBACK (Fase 3) — volta à definição definer antiga sobre users:
--   create or replace view public.vendedores_publicos as
--   select id, name, avatar, document_verified, business_description, cidade, estado
--   from public.users;
--   -- (sem security_invoker => volta a ser definer, como estava)
--   grant select on public.vendedores_publicos to anon, authenticated;


-- =====================================================================
-- VARIANTE DE ESCOPO (OPCIONAL — só vendedores; NÃO aplicar sem checar AboutView)
-- =====================================================================
-- Objetivo: não expor publicamente usuários que nunca foram vendedores (só compradores).
-- SEGURO p/ vitrine SOMENTE se o conjunto público >= todo user_id que o app pede via a view.
--   - Embed e AdDetail pedem SEMPRE donos de anúncio -> "quem tem >=1 anúncio" é seguro.
--   - ⚠️ AboutView: CONFIRMAR o que ela lê antes (se listar vendedores por outro critério,
--     este filtro pode esconder alguém). Só ligar após validar AboutView.
-- Mudanças (substituem partes da Fase 2):
--   (a) Backfill filtrado:
--       ... from public.users u
--       where exists (select 1 from public.announcements a where a.user_id = u.id);
--   (b) Trigger em announcements p/ ADICIONAR novo vendedor ao primeiro anúncio:
--       create or replace function public.ensure_seller_public_profile_from_announcement()
--       returns trigger language plpgsql security definer set search_path=public as $$
--       begin
--         insert into public.seller_public_profiles
--           (id,name,avatar,document_verified,business_description,cidade,estado,updated_at)
--         select u.id,u.name,u.avatar,u.document_verified,u.business_description,u.cidade,u.estado,now()
--         from public.users u where u.id = new.user_id
--         on conflict (id) do nothing;
--         return new;
--       end; $$;
--       create trigger trg_ensure_seller_profile_from_ann
--         after insert on public.announcements for each row
--         execute function public.ensure_seller_public_profile_from_announcement();
--   (c) Trigger em users passa a só ATUALIZAR membros existentes (troca o insert..on conflict
--       por: update public.seller_public_profiles set ... where id = new.id;), para não
--       readicionar não-vendedores.
-- =====================================================================
