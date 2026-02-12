-- ==========================================
-- FIX: Recriar VIEW chats_full com aliases corretos
-- ==========================================
-- 
-- PROBLEMA: A VIEW foi criada com nomes em camelCase mas o código espera snake_case
-- SOLUÇÃO: Recriar VIEW com aliases entre aspas para preservar snake_case
-- ==========================================

-- 1. REMOVER VIEW ANTIGA
-- ==========================================

DROP VIEW IF EXISTS chats_full CASCADE;

-- 2. CRIAR VIEW COM ALIASES CORRETOS (snake_case entre aspas)
-- ==========================================

CREATE OR REPLACE VIEW chats_full AS
SELECT 
  c.id,
  c.announcement_id,
  c.buyer_id,
  c.seller_id,
  c.last_message,
  c.last_message_time,
  c.unread_count_buyer,
  c.unread_count_seller,
  c.created_at,
  c.updated_at,
  
  -- Aliases com snake_case entre aspas duplas
  a.title as "ad_title",
  a.price as "ad_price",
  a.unit_price as "ad_unit_price",
  a.images[1] as "ad_image",
  a.status,
  
  buyer.name as "buyer_name",
  buyer.avatar as "buyer_avatar",
  buyer.email as "buyer_email",
  
  seller.name as "seller_name",
  seller.avatar as "seller_avatar",
  seller.email as "seller_email",
  
  CASE 
    WHEN auth.uid() = c.buyer_id THEN c.unread_count_buyer
    WHEN auth.uid() = c.seller_id THEN c.unread_count_seller
    ELSE 0
  END as "unread_count"
FROM chats c
LEFT JOIN announcements a ON a.id = c.announcement_id
LEFT JOIN users buyer ON buyer.id = c.buyer_id
LEFT JOIN users seller ON seller.id = c.seller_id;

-- 3. CONCEDER PERMISSÕES
-- ==========================================

GRANT SELECT ON chats_full TO authenticated, anon;

-- 4. VERIFICAR SE FOI CRIADA CORRETAMENTE
-- ==========================================

-- Testar query com snake_case (deve funcionar agora)
SELECT 
  id,
  ad_title,
  ad_price,
  buyer_name,
  seller_name,
  last_message,
  unread_count
FROM chats_full
WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
ORDER BY last_message_time DESC
LIMIT 5;

-- Se esta query funcionar, a VIEW está correta! ✅

-- 5. VERIFICAR ESTRUTURA DA VIEW
-- ==========================================

SELECT 
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'chats_full'
ORDER BY ordinal_position;

-- Resultado esperado: deve listar ad_title, ad_price (com underscore)

-- ==========================================
-- RESULTADO ESPERADO:
-- ✅ VIEW recriada com snake_case
-- ✅ Query de teste funciona sem erros
-- ✅ Lista mostra colunas com underscore
-- ==========================================

-- ==========================================
-- IMPORTANTE:
-- ==========================================
-- 
-- O código TypeScript em useMessages.ts usa:
-- - chat.ad_price
-- - chat.ad_title
-- - chat.buyer_name
-- - etc.
--
-- Por isso a VIEW DEVE ter esses nomes exatos (snake_case)!
-- ==========================================
