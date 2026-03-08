-- ==========================================
-- FIX: Adicionar fallback de preço nas views
-- ==========================================
-- 
-- PROBLEMA: Anúncios com price = 0 aparecem sem preço nos chats
-- SOLUÇÃO: Usar COALESCE para fallback em unit_price
-- ==========================================

-- 1. ATUALIZAR VIEW chats_full COM FALLBACK DE PREÇO
-- ==========================================

DROP VIEW IF EXISTS chats_full CASCADE;

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
  c.status,
  c.created_at,
  c.updated_at,
  
  -- Informações do anúncio (COM FALLBACK DE PREÇO)
  a.title as ad_title,
  COALESCE(NULLIF(a.price, 0), a.unit_price, 0) as ad_price,  -- ✅ Usa unit_price se price for 0
  a.unit_price as ad_unit_price,
  a.images[1] as ad_image,
  a.status as ad_status,
  
  -- Informações do comprador
  buyer.name as buyer_name,
  buyer.avatar as buyer_avatar,
  buyer.email as buyer_email,
  
  -- Informações do vendedor
  seller.name as seller_name,
  seller.avatar as seller_avatar,
  seller.email as seller_email,
  
  -- Contador de não lidas baseado no usuário logado
  CASE 
    WHEN auth.uid() = c.buyer_id THEN c.unread_count_buyer
    WHEN auth.uid() = c.seller_id THEN c.unread_count_seller
    ELSE 0
  END as unread_count
  
FROM chats c
LEFT JOIN announcements a ON a.id = c.announcement_id
LEFT JOIN users buyer ON buyer.id = c.buyer_id
LEFT JOIN users seller ON seller.id = c.seller_id;

-- Conceder permissões
GRANT SELECT ON chats_full TO authenticated, anon;

-- ==========================================
-- 2. VERIFICAR SE A VIEW ESTÁ FUNCIONANDO
-- ==========================================

-- Testar a view
SELECT 
  id,
  ad_title,
  ad_price,       -- ✅ Deve usar fallback se price = 0
  ad_unit_price,
  buyer_name,
  seller_name
FROM chats_full
LIMIT 5;

-- ==========================================
-- NOTAS IMPORTANTES:
-- ==========================================
-- A função COALESCE(NULLIF(a.price, 0), a.unit_price, 0) funciona assim:
-- 1. NULLIF(a.price, 0) retorna NULL se price = 0
-- 2. COALESCE pega o primeiro valor não-NULL:
--    - Se price > 0: usa price
--    - Se price = 0: usa unit_price
--    - Se ambos NULL: usa 0
