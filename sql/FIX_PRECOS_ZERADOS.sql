-- ==========================================
-- FIX: Corrigir preços zerados nos anúncios
-- ==========================================
-- 
-- PROBLEMA: Anúncios com price = 0.00 mas podem ter unit_price preenchido
-- SOLUÇÃO: Investigar e corrigir preços
-- ==========================================

-- 1. INVESTIGAR O ANÚNCIO "TRATORZÃO"
-- ==========================================

-- Buscar o anúncio pelo título
SELECT 
  id,
  title,
  price,
  unit_price,
  status,
  created_at
FROM announcements
WHERE title ILIKE '%TRATORZÃO%';

-- Resultado esperado: ver se unit_price tem valor

-- 2. VER TODOS OS ANÚNCIOS COM PREÇO ZERADO
-- ==========================================

SELECT 
  id,
  title,
  price,
  unit_price,
  status,
  created_at
FROM announcements
WHERE price = 0 OR price IS NULL
ORDER BY created_at DESC
LIMIT 20;

-- 3. CORRIGIR PREÇO DO TRATORZÃO
-- ==========================================

-- OPÇÃO A: Se você sabe o preço correto, atualize diretamente
-- Substitua 'ID_DO_ANUNCIO' e o valor do preço

/*
UPDATE announcements
SET price = 45000.00  -- ← Coloque o preço correto aqui
WHERE title = 'TRATORZÃO';
*/

-- OPÇÃO B: Se o anúncio tem unit_price mas não tem price total
-- (Exemplo: unit_price = 45000 por unidade, e está vendendo 1 unidade)

/*
UPDATE announcements
SET price = unit_price * 1  -- Multiplique pela quantidade
WHERE title = 'TRATORZÃO'
AND (price = 0 OR price IS NULL)
AND unit_price > 0;
*/

-- 4. VERIFICAR SE FOI CORRIGIDO
-- ==========================================

SELECT 
  title,
  price,
  unit_price
FROM announcements
WHERE title = 'TRATORZÃO';

-- Deve mostrar o preço atualizado

-- 5. TESTAR NA VIEW
-- ==========================================

-- Buscar o chat novamente
SELECT 
  id,
  ad_title,
  ad_price,
  buyer_name,
  seller_name
FROM chats_full
WHERE ad_title = 'TRATORZÃO'
LIMIT 1;

-- O ad_price deve estar correto agora!

-- ==========================================
-- 6. CORRIGIR TODOS OS ANÚNCIOS COM PREÇO ZERADO
-- ==========================================

-- ATENÇÃO: Execute apenas se quiser corrigir TODOS os anúncios
-- que têm price = 0 mas têm unit_price preenchido

/*
UPDATE announcements
SET price = unit_price
WHERE (price = 0 OR price IS NULL)
AND unit_price > 0
AND unit_price IS NOT NULL;
*/

-- Verificar quantos foram atualizados
SELECT COUNT(*) as anuncios_corrigidos
FROM announcements
WHERE price > 0 AND unit_price > 0;

-- ==========================================
-- 7. DEBUG: POR QUE O PREÇO ESTÁ ZERADO?
-- ==========================================

-- Possíveis causas:
-- 1. Anúncio foi criado sem preencher o campo price
-- 2. Formulário de criação não está enviando o price
-- 3. Trigger ou validação está zerando o price

-- Verificar quando o anúncio foi criado
SELECT 
  id,
  title,
  price,
  unit_price,
  created_at,
  updated_at,
  status
FROM announcements
WHERE title = 'TRATORZÃO';

-- ==========================================
-- FIM DO SCRIPT
-- ==========================================

-- RESUMO DE AÇÕES:
-- 1. Execute seção 1 para investigar o anúncio
-- 2. Se unit_price estiver preenchido, execute OPÇÃO B da seção 3
-- 3. Se não, execute OPÇÃO A com o preço correto
-- 4. Execute seção 5 para confirmar
-- 5. Recarregue a aplicação (F5) e teste novamente
