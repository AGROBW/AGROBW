-- =====================================================================
-- REMOÇÃO DAS REDES SOCIAIS DA LOJA PARCEIRA (seller_stores)
-- Data: 2026-06-12
-- Objetivo: remover os campos de redes sociais (Facebook, Instagram,
--           LinkedIn) da Loja Parceira. O campo "Site" (website_url)
--           é mantido — não é rede social.
--
-- PRÉ-REQUISITO DE DEPLOY (IMPORTANTE):
--   Faça o deploy do frontend ANTES de rodar este SQL. O hook
--   src/hooks/useSellerStore.ts já não envia mais facebook_url /
--   instagram_url / linkedin_url no payload de save. Se este SQL rodar
--   com a versão antiga do frontend ainda no ar, o save/insert de loja
--   passa a falhar ("column ... does not exist").
--
-- Ordem segura:
--   1) Deploy do frontend (sem os campos sociais).
--   2) Rodar este script.
--
-- Verificado: nenhuma VIEW pública depende dessas colunas (somente a
--   tabela base seller_stores as declara). O DROP é seguro.
--
-- Rode TUDO de uma vez (transação única). É idempotente: pode rodar
--   novamente sem erro.
-- =====================================================================

BEGIN;

-- (Opcional) Quantos registros tinham algum valor preenchido — só p/ log.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.seller_stores
  WHERE facebook_url IS NOT NULL
     OR instagram_url IS NOT NULL
     OR linkedin_url IS NOT NULL;

  RAISE NOTICE 'Lojas com redes sociais preenchidas antes da remoção: %', v_count;
END $$;

-- Remoção das colunas (idempotente).
ALTER TABLE public.seller_stores
  DROP COLUMN IF EXISTS facebook_url,
  DROP COLUMN IF EXISTS instagram_url,
  DROP COLUMN IF EXISTS linkedin_url;

COMMIT;

-- =====================================================================
-- VERIFICAÇÃO (rode separadamente após o COMMIT; deve retornar 0 linhas)
-- =====================================================================
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'seller_stores'
--   AND column_name IN ('facebook_url', 'instagram_url', 'linkedin_url');
