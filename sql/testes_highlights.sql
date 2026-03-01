-- ======================================================
-- TESTES: Aplicar Destaques Manualmente
-- ======================================================
-- Use este script para testar a visualização de destaques
-- sem precisar passar pelo fluxo completo do modal

-- ======================================================
-- 1. APLICAR DESTAQUE DE CATEGORIA EM UM ANÚNCIO
-- ======================================================

UPDATE public.announcements
SET 
  highlight_category = true,
  highlight_category_until = NOW() + INTERVAL '7 days'
WHERE id = 'SEU_ANUNCIO_ID_AQUI';

-- Exemplo prático:
/*
UPDATE public.announcements
SET 
  highlight_category = true,
  highlight_category_until = NOW() + INTERVAL '7 days'
WHERE title ILIKE '%trator%'
LIMIT 1;
*/

-- ======================================================
-- 2. APLICAR DESTAQUE NA HOME EM UM ANÚNCIO
-- ======================================================

UPDATE public.announcements
SET 
  highlight_home = true,
  highlight_home_until = NOW() + INTERVAL '7 days'
WHERE id = 'SEU_ANUNCIO_ID_AQUI';

-- ======================================================
-- 3. APLICAR AMBOS OS DESTAQUES
-- ======================================================

UPDATE public.announcements
SET 
  highlight_category = true,
  highlight_category_until = NOW() + INTERVAL '7 days',
  highlight_home = true,
  highlight_home_until = NOW() + INTERVAL '7 days'
WHERE id = 'SEU_ANUNCIO_ID_AQUI';

-- ======================================================
-- 4. REMOVER TODOS OS DESTAQUES DE UM ANÚNCIO
-- ======================================================

UPDATE public.announcements
SET 
  highlight_category = false,
  highlight_category_until = NULL,
  highlight_home = false,
  highlight_home_until = NULL
WHERE id = 'SEU_ANUNCIO_ID_AQUI';

-- ======================================================
-- 5. LISTAR ANÚNCIOS COM DESTAQUES ATIVOS
-- ======================================================

SELECT 
  id,
  title,
  highlight_category,
  highlight_category_until,
  highlight_home,
  highlight_home_until,
  CASE 
    WHEN highlight_category AND highlight_category_until > NOW() THEN '✅ Categoria Ativo'
    WHEN highlight_category AND highlight_category_until <= NOW() THEN '❌ Categoria Expirado'
    ELSE '⚪ Sem Destaque Categoria'
  END as status_categoria,
  CASE 
    WHEN highlight_home AND highlight_home_until > NOW() THEN '✅ Home Ativo'
    WHEN highlight_home AND highlight_home_until <= NOW() THEN '❌ Home Expirado'
    ELSE '⚪ Sem Destaque Home'
  END as status_home,
  created_at
FROM public.announcements
WHERE highlight_category = true OR highlight_home = true
ORDER BY 
  highlight_category DESC,
  highlight_home DESC,
  created_at DESC;

-- ======================================================
-- 6. SIMULAR EXPIRAÇÃO (Para testar comportamento)
-- ======================================================

-- Define expiração no passado para testar o comportamento
UPDATE public.announcements
SET 
  highlight_category_until = NOW() - INTERVAL '1 day'
WHERE id = 'SEU_ANUNCIO_ID_AQUI';

-- ======================================================
-- 7. ESTATÍSTICAS DE DESTAQUES
-- ======================================================

SELECT 
  COUNT(*) FILTER (WHERE highlight_category = true) as total_destaques_categoria,
  COUNT(*) FILTER (WHERE highlight_home = true) as total_destaques_home,
  COUNT(*) FILTER (
    WHERE highlight_category = true 
    AND highlight_category_until > NOW()
  ) as categoria_ativos,
  COUNT(*) FILTER (
    WHERE highlight_home = true 
    AND highlight_home_until > NOW()
  ) as home_ativos,
  COUNT(*) FILTER (
    WHERE highlight_category = true 
    AND highlight_category_until <= NOW()
  ) as categoria_expirados,
  COUNT(*) FILTER (
    WHERE highlight_home = true 
    AND highlight_home_until <= NOW()
  ) as home_expirados
FROM public.announcements;

-- ======================================================
-- 8. TESTE DE ORDENAÇÃO
-- ======================================================

-- Esta query mostra como os anúncios serão ordenados nas listagens públicas
SELECT 
  id,
  title,
  highlight_category,
  highlight_home,
  created_at,
  CASE 
    WHEN highlight_category AND highlight_home THEN '🌟🌟 SUPER DESTAQUE'
    WHEN highlight_category THEN '📊 Destaque Categoria'
    WHEN highlight_home THEN '✨ Destaque Home'
    ELSE '⚪ Normal'
  END as tipo_destaque,
  ROW_NUMBER() OVER (
    ORDER BY 
      highlight_category DESC,
      highlight_home DESC,
      created_at DESC
  ) as posicao_na_listagem
FROM public.announcements
WHERE status = 'ACTIVE'
ORDER BY 
  highlight_category DESC,
  highlight_home DESC,
  created_at DESC
LIMIT 20;

-- ======================================================
-- 9. CENÁRIO DE TESTE COMPLETO
-- ======================================================

-- Cria uma situação realista para testar a ordenação:

-- Passo 1: Remover todos os destaques (limpar)
UPDATE public.announcements
SET 
  highlight_category = false,
  highlight_category_until = NULL,
  highlight_home = false,
  highlight_home_until = NULL
WHERE status = 'ACTIVE';

-- Passo 2: Aplicar destaques em anúncios específicos

-- Anúncio A: Destaque Categoria (criado há 5 dias)
UPDATE public.announcements
SET 
  highlight_category = true,
  highlight_category_until = NOW() + INTERVAL '7 days'
WHERE id = (
  SELECT id FROM public.announcements 
  WHERE status = 'ACTIVE' 
  ORDER BY created_at ASC 
  LIMIT 1 OFFSET 4
);

-- Anúncio B: Destaque Home (criado há 3 dias)
UPDATE public.announcements
SET 
  highlight_home = true,
  highlight_home_until = NOW() + INTERVAL '7 days'
WHERE id = (
  SELECT id FROM public.announcements 
  WHERE status = 'ACTIVE' 
  ORDER BY created_at ASC 
  LIMIT 1 OFFSET 2
);

-- Anúncio C: Ambos os destaques (criado há 7 dias)
UPDATE public.announcements
SET 
  highlight_category = true,
  highlight_category_until = NOW() + INTERVAL '7 days',
  highlight_home = true,
  highlight_home_until = NOW() + INTERVAL '7 days'
WHERE id = (
  SELECT id FROM public.announcements 
  WHERE status = 'ACTIVE' 
  ORDER BY created_at ASC 
  LIMIT 1 OFFSET 6
);

-- Verificar resultado:
SELECT 
  title,
  CASE 
    WHEN highlight_category AND highlight_home THEN '🌟🌟'
    WHEN highlight_category THEN '📊'
    WHEN highlight_home THEN '✨'
    ELSE '⚪'
  END as destaque,
  EXTRACT(DAY FROM NOW() - created_at) as dias_desde_criacao,
  ROW_NUMBER() OVER (
    ORDER BY 
      highlight_category DESC,
      highlight_home DESC,
      created_at DESC
  ) as posicao
FROM public.announcements
WHERE status = 'ACTIVE'
ORDER BY 
  highlight_category DESC,
  highlight_home DESC,
  created_at DESC
LIMIT 10;

-- Resultado esperado:
-- Posição 1: Anúncio C (🌟🌟 - ambos destaques - 7 dias)
-- Posição 2: Anúncio A (📊 - categoria - 5 dias)
-- Posição 3: Anúncio B (✨ - home - 3 dias)
-- Posição 4+: Anúncios sem destaque (⚪ - por data desc)

-- ======================================================
-- 10. DEBUGGING: Ver logs de highlight_history
-- ======================================================

SELECT 
  ah.*,
  a.title as anuncio_titulo,
  u.name as usuario_nome,
  CASE 
    WHEN ah.expires_at > NOW() THEN '✅ Ativo'
    ELSE '❌ Expirado'
  END as status
FROM public.announcement_highlights_history ah
JOIN public.announcements a ON a.id = ah.announcement_id
JOIN public.users u ON u.id = ah.user_id
ORDER BY ah.applied_at DESC
LIMIT 20;

-- ======================================================
-- NOTAS IMPORTANTES
-- ======================================================

-- 1. SEMPRE use NOW() + INTERVAL 'X days' para definir expiração futura
-- 2. Para testar expiração, use NOW() - INTERVAL '1 day'
-- 3. A ordenação SEMPRE prioriza highlight_category primeiro, depois highlight_home, depois created_at
-- 4. Certifique-se de que o cron job cleanup_expired_highlights() está rodando
-- 5. Use as queries de estatísticas para monitorar o uso de destaques

-- ======================================================
-- FIM DO SCRIPT DE TESTES
-- ======================================================
