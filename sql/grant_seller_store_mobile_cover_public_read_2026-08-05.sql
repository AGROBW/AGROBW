-- ============================================================================
-- Hotfix versionado - leitura publica da capa mobile das Lojas Parceiras
-- Data: 2026-08-05
--
-- Contexto: seller_stores usa grants SELECT por coluna para anon. A coluna
-- cover_mobile_url foi adicionada depois e, sem o grant correspondente, a
-- consulta publica do catalogo falhava com "permission denied for table
-- seller_stores". Este script espelha o grant ja validado no banco vivo.
--
-- Escopo: somente GRANT SELECT da coluna cover_mobile_url para anon.
-- Nao concede SELECT na tabela inteira e nao altera RLS, policies ou dados.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- SECAO 0 - PREVIEW (read-only)
-- ----------------------------------------------------------------------------

-- 0.1 A coluna deve existir como text nullable.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'seller_stores'
  and column_name = 'cover_mobile_url';

-- 0.2 Estado esperado antes/depois do hotfix:
--     anon_select_tabela=false e anon_cover_mobile=true depois da aplicacao.
select
  has_table_privilege('anon', 'public.seller_stores', 'select') as anon_select_tabela,
  has_column_privilege('anon', 'public.seller_stores', 'cover_url', 'select') as anon_cover_desktop,
  has_column_privilege('anon', 'public.seller_stores', 'cover_mobile_url', 'select') as anon_cover_mobile;

-- 0.3 RLS deve continuar ligada; este script nao modifica esse estado.
select c.relrowsecurity as rls_on
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'seller_stores';


-- ----------------------------------------------------------------------------
-- SECAO 1 - APLICACAO (idempotente)
-- ----------------------------------------------------------------------------

begin;

grant select (cover_mobile_url)
on public.seller_stores
to anon;

commit;


-- ----------------------------------------------------------------------------
-- SECAO 2 - VALIDACAO POS-APLICACAO (read-only)
-- ----------------------------------------------------------------------------

-- Esperado: false / true / true.
select
  has_table_privilege('anon', 'public.seller_stores', 'select') as anon_select_tabela,
  has_column_privilege('anon', 'public.seller_stores', 'cover_url', 'select') as anon_cover_desktop,
  has_column_privilege('anon', 'public.seller_stores', 'cover_mobile_url', 'select') as anon_cover_mobile;

-- Smoke test como anon. Deve executar sem permission denied.
begin;
set local role anon;

select id, slug, store_name, cover_url, cover_mobile_url
from public.seller_stores
where is_active = true
  and is_store_feature_enabled = true
limit 5;

rollback;


-- ----------------------------------------------------------------------------
-- SECAO 3 - ROLLBACK (documentado; nao executar no fluxo normal)
-- ----------------------------------------------------------------------------

-- ATENCAO: revogar este grant volta a quebrar a consulta publica enquanto ela
-- selecionar cover_mobile_url. Use apenas junto com rollback compativel do app.
--
-- begin;
-- revoke select (cover_mobile_url) on public.seller_stores from anon;
-- commit;
