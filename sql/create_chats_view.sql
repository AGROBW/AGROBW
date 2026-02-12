-- ==========================================
-- VIEW PARA FACILITAR CONSULTAS DE CHATS
-- Execute este script no Supabase SQL Editor
-- ==========================================

-- Criar VIEW para chats com informações completas
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
  
  -- Informações do anúncio
  a.title as ad_title,
  a.price as ad_price,
  a.unit_price as ad_unit_price,
  a.images[1] as ad_image,
  a.status,
  
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

-- Comentário descritivo
COMMENT ON VIEW chats_full IS 'View consolidada com informações completas de chats, anúncios e usuários para facilitar consultas';
