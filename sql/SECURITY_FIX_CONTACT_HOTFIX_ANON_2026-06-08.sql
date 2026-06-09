-- =====================================================================
-- R3 — HOTFIX intermediário: fechar scraping ANÔNIMO já após o SWITCH
-- Data: 2026-06-08
-- =====================================================================
-- Aplicar LOGO APÓS o SWITCH (deploy) e ANTES do CONTRACT. Fecha imediatamente a
-- leitura pública (anon) de:
--   - announcements.whatsapp
--   - seller_stores.email
-- sem quebrar o DONO autenticado (authenticated mantém acesso pleno durante a
-- transição). O owner-only COMPLETO (também bloqueando outro logado) só vem no
-- CONTRACT, quando as colunas-base são removidas.
--
-- ⚠️ Por que não basta "revoke select (whatsapp) ... from anon":
--   no Postgres, o acesso a uma coluna é concedido se houver privilégio de TABELA
--   OU de COLUNA. Como anon tem SELECT de TABELA (para ler anúncios/lojas ativos),
--   um revoke só de coluna é INEFETIVO. É preciso remover o SELECT de tabela do
--   anon e reconceder por coluna, EXCETO a coluna sensível. Os blocos abaixo
--   fazem isso dinamicamente (sem enumerar colunas à mão).
--
-- NÃO aplicar automaticamente. Transacional. SMOKE TEST de leitura pública após.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) announcements: anon perde só a coluna whatsapp
-- ---------------------------------------------------------------------
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'announcements'
    and column_name <> 'whatsapp';

  -- remove o SELECT de tabela (cobre todas as colunas) e reconcede por coluna
  execute 'revoke select on public.announcements from anon';
  execute format('grant select (%s) on public.announcements to anon', v_cols);
end $$;

-- ---------------------------------------------------------------------
-- 2) seller_stores: anon perde só a coluna email
--    (whatsapp da loja CONTINUA público — telefone/SEO)
-- ---------------------------------------------------------------------
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'seller_stores'
    and column_name <> 'email';

  execute 'revoke select on public.seller_stores from anon';
  execute format('grant select (%s) on public.seller_stores to anon', v_cols);
end $$;

commit;

-- =====================================================================
-- NOTA pós-CONTRACT (opcional): após o drop das colunas-base, pode-se
-- restaurar o grant de TABELA para anon (não há mais coluna sensível), evitando
-- que colunas FUTURAS precisem de grant manual:
--   grant select on public.announcements to anon;
--   grant select on public.seller_stores to anon;
-- (mantendo, claro, o whatsapp/email já fora dessas tabelas.)
-- =====================================================================

-- =====================================================================
-- VERIFICAÇÃO
-- =====================================================================
-- -- a) anon NÃO tem mais a coluna sensível (deve retornar 0 linhas):
-- select table_name, column_name from information_schema.column_privileges
-- where table_schema='public' and grantee='anon'
--   and ((table_name='announcements' and column_name='whatsapp')
--     or (table_name='seller_stores' and column_name='email'));
--
-- -- b) anon AINDA lê as demais colunas (listagem pública funciona):
-- --   curl ".../rest/v1/announcements?select=id,title,price&status=eq.ACTIVE&limit=3" -H "apikey: <ANON>"  -> ok
-- --   curl ".../rest/v1/announcements?select=whatsapp&status=eq.ACTIVE&limit=3"      -H "apikey: <ANON>"  -> permission denied (esperado)
-- --   curl ".../rest/v1/seller_stores?select=id,store_name,whatsapp&is_active=eq.true" -H "apikey: <ANON>" -> ok (whatsapp da loja segue público)
-- --   curl ".../rest/v1/seller_stores?select=email&is_active=eq.true"                  -H "apikey: <ANON>" -> permission denied (esperado)
--
-- ROLLBACK do hotfix: grant select on public.announcements to anon;
--                     grant select on public.seller_stores to anon;
-- =====================================================================
