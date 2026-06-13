-- =====================================================================
-- IMAGEM DE COMPARTILHAMENTO (OPEN GRAPH) NO LAYOUT
-- Data: 2026-06-13
-- Objetivo: adicionar a coluna que guarda a URL da imagem usada no card
--           de compartilhamento (Facebook/WhatsApp/X) do site e das lojas.
--           Gerenciada pelo painel admin > Layout > Imagens das páginas >
--           Compartilhamento. Lida pela serverless function api/og-loja.mjs.
--
-- Idempotente: pode rodar novamente sem erro.
-- =====================================================================

ALTER TABLE public.layout_settings
  ADD COLUMN IF NOT EXISTS og_default_image_url text;

-- Verificação (deve retornar 1 linha):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'layout_settings'
--   AND column_name = 'og_default_image_url';
