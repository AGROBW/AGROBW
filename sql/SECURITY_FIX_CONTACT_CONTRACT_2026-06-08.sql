-- =====================================================================
-- SECURITY FIX — R3 (A-01): FASE CONTRACT
-- Data: 2026-06-08
-- =====================================================================
-- ⚠️ SÓ EXECUTAR DEPOIS de:
--   (1) EXPAND aplicado (tabelas privadas criadas + dados copiados);
--   (2) App da FASE SWITCH no ar e validado (lê/grava contato do privado;
--       nenhum caminho ainda lê/grava announcements.whatsapp / seller_stores.email);
--   (3) Smoke tests OK.
--
-- Remove as colunas-base de contato. A partir daqui o owner-only fica
-- GARANTIDO no REST (a coluna não existe mais para anon nem p/ outro logado).
-- announcements.whatsapp e seller_stores.email saem; seller_stores.whatsapp FICA.
--
-- Pré-cheque obrigatório (deve dar 0): nenhuma diferença entre base e privado.
--   select count(*) from public.announcements a
--   left join public.announcement_contacts c on c.announcement_id=a.id
--   where a.whatsapp is distinct from c.whatsapp and a.whatsapp is not null;  -- esperado 0
--   select count(*) from public.seller_stores s
--   left join public.seller_store_contacts c on c.store_id=s.id
--   where s.email is distinct from c.email and s.email is not null;           -- esperado 0
-- =====================================================================

begin;

-- Re-sincronizar quaisquer valores escritos na base entre o EXPAND e o SWITCH
-- (rede de segurança: se algo ainda gravou na coluna-base, leva para o privado).
insert into public.announcement_contacts (announcement_id, whatsapp)
select a.id, a.whatsapp from public.announcements a where a.whatsapp is not null
on conflict (announcement_id) do update set whatsapp = excluded.whatsapp
where public.announcement_contacts.whatsapp is distinct from excluded.whatsapp;

insert into public.seller_store_contacts (store_id, email)
select s.id, s.email from public.seller_stores s where s.email is not null
on conflict (store_id) do update set email = excluded.email
where public.seller_store_contacts.email is distinct from excluded.email;

-- Remover as colunas-base (CONTRACT)
alter table public.announcements  drop column if exists whatsapp;
alter table public.seller_stores  drop column if exists email;

commit;

-- =====================================================================
-- VERIFICAÇÃO
-- =====================================================================
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='announcements' and column_name='whatsapp';  -- 0 linhas
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='seller_stores' and column_name='email';      -- 0 linhas
--
-- TESTE (anon): GET /rest/v1/announcements?select=whatsapp  -> erro de coluna inexistente (esperado)
--               GET /rest/v1/seller_stores?select=email      -> erro de coluna inexistente (esperado)
--
-- ROLLBACK do CONTRACT (se necessário, antes de novos dados divergirem):
--   alter table public.announcements add column whatsapp text;
--   update public.announcements a set whatsapp = c.whatsapp
--     from public.announcement_contacts c where c.announcement_id = a.id;
--   alter table public.seller_stores add column email text;
--   update public.seller_stores s set email = c.email
--     from public.seller_store_contacts c where c.store_id = s.id;
--   (e reverter o app para ler/gravar das colunas-base)
-- =====================================================================
