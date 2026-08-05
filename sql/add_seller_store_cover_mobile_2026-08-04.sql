-- ============================================================================
-- Migração aditiva — Capa mobile das Lojas Parceiras (Fase 1)
-- Data: 2026-08-04
-- Escopo: SOMENTE banco. Adiciona a coluna nullable public.seller_stores.cover_mobile_url.
--
-- Aditiva e retrocompatível: coluna nullable, sem default, sem NOT NULL; o código
-- atualmente em produção NÃO a lê. NÃO altera cover_url, cover_position_x/y, RLS,
-- policies, grants, dados, storage, hooks, painel ou RPC. NÃO migra nem popula dados.
--
-- Recomendação de arte (documentada na coluna): capa DESKTOP em cover_url = 2000x300;
-- capa MOBILE/tablet em cover_mobile_url = 1200x600 (usada até 1023px; NULL => fallback
-- para cover_url). Renderização pública futura em duas camadas (fundo cover+blur +
-- arte object-contain) — não faz parte desta migração.
--
-- NÃO aplicar automaticamente. Rodar por seções: revisar a Seção 0 (preview) ANTES e a
-- Seção 2 (validação) DEPOIS. A aplicação (Seção 1) está em uma transação.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- SEÇÃO 0 — PREVIEW / CONFIRMAÇÃO (read-only; rodar ANTES de aplicar)
-- ----------------------------------------------------------------------------

-- 0.1 Confirmar que seller_stores é REALMENTE uma tabela base (esperado: BASE TABLE).
select table_type
from information_schema.tables
where table_schema = 'public' and table_name = 'seller_stores';

-- 0.2 Confirmar o tipo atual de cover_url e a AUSÊNCIA de cover_mobile_url.
--     Esperado: cover_url => text / is_nullable=YES; cover_position_x e cover_position_y
--     => integer / NO / default 50; cover_mobile_url => NÃO aparece (0 linhas para ele).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'seller_stores'
  and column_name in ('cover_url', 'cover_position_x', 'cover_position_y', 'cover_mobile_url')
order by column_name;

-- 0.3 Baseline de contagem (a contagem de capas mobile fica na Seção 2, pós-criação da coluna).
select
  count(*) as total_lojas,
  count(cover_url) as lojas_com_capa_desktop
from public.seller_stores;


-- ----------------------------------------------------------------------------
-- SEÇÃO 1 — APLICAÇÃO (transação atômica)
-- ----------------------------------------------------------------------------
begin;

-- 1.1 Coluna nullable, sem default, sem NOT NULL. Idempotente (IF NOT EXISTS).
alter table public.seller_stores
  add column if not exists cover_mobile_url text;

-- 1.2 Documentação da finalidade e das dimensões recomendadas.
comment on column public.seller_stores.cover_mobile_url is
  'URL opcional da capa mobile/tablet da loja. Usada na pagina publica ate 1023px; '
  'NULL => usar cover_url (desktop) como fallback. Recomendacao de arte: desktop '
  'cover_url = 2000x300; mobile cover_mobile_url = 1200x600. Render publico futuro em '
  'duas camadas (fundo cover+blur + arte object-contain). Nao altera cover_url nem '
  'cover_position_x/y (mantidos para compatibilidade das capas antigas).';

commit;


-- ----------------------------------------------------------------------------
-- SEÇÃO 2 — VALIDAÇÃO / CONSULTAS PÓS-APLICAÇÃO (read-only; rodar DEPOIS)
-- ----------------------------------------------------------------------------

-- 2.1 A coluna deve existir: tipo text, nullable (YES) e SEM default (column_default NULL).
--     Esperado: 1 linha => data_type=text, is_nullable=YES, column_default IS NULL.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'seller_stores'
  and column_name = 'cover_mobile_url';

-- 2.2 Confirmar que cover_url e cover_position_x/y permanecem inalterados.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'seller_stores'
  and column_name in ('cover_url', 'cover_position_x', 'cover_position_y')
order by column_name;

-- 2.3 Contagem total de lojas e quantas já possuem capa mobile.
--     Esperado: total_lojas = baseline (0.3); lojas_com_capa_mobile = 0 (nada migrado).
select
  count(*) as total_lojas,
  count(cover_mobile_url) as lojas_com_capa_mobile
from public.seller_stores;


-- ----------------------------------------------------------------------------
-- SEÇÃO 3 — ROLLBACK (deixar COMENTADO; usar só se estritamente necessário)
-- ----------------------------------------------------------------------------
-- ATENÇÃO: DROP COLUMN é DESTRUTIVO — apaga permanentemente qualquer valor já gravado
-- em cover_mobile_url. Normalmente NÃO deve ser executado: a coluna nullable é INERTE
-- para o código que não a lê, então reverter o frontend (fase futura) NÃO exige remover
-- a coluna. Só remova após garantir que nenhuma versão do app a utiliza e que não há
-- dados a preservar.
--
-- begin;
-- alter table public.seller_stores drop column if exists cover_mobile_url;
-- commit;
-- ============================================================================
