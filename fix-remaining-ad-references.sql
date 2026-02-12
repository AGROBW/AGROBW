-- ============================================================================
-- COMPLEMENTO: Atualizar tabelas remanescentes (ad_id → announcement_id)
-- Data: 2026-02-07
-- ============================================================================

-- IMPORTANTE: Execute este script APENAS se a tabela 'announcements' já existe!

-- PASSO 1: Atualizar tabela ad_clicks_by_state
ALTER TABLE IF EXISTS public.ad_clicks_by_state 
  DROP CONSTRAINT IF EXISTS ad_clicks_by_state_ad_id_fkey;

ALTER TABLE IF EXISTS public.ad_clicks_by_state 
  RENAME COLUMN ad_id TO announcement_id;

ALTER TABLE IF EXISTS public.ad_clicks_by_state 
  ADD CONSTRAINT ad_clicks_by_state_announcement_id_fkey 
  FOREIGN KEY (announcement_id) 
  REFERENCES public.announcements(id) 
  ON DELETE CASCADE;

-- Renomear a própria tabela para consistência
ALTER TABLE IF EXISTS public.ad_clicks_by_state 
  RENAME TO announcement_clicks_by_state;

-- PASSO 2: Atualizar tabela opportunities
ALTER TABLE IF EXISTS public.opportunities 
  DROP CONSTRAINT IF EXISTS opportunities_ad_id_fkey;

ALTER TABLE IF EXISTS public.opportunities 
  RENAME COLUMN ad_id TO announcement_id;

ALTER TABLE IF EXISTS public.opportunities 
  ADD CONSTRAINT opportunities_announcement_id_fkey 
  FOREIGN KEY (announcement_id) 
  REFERENCES public.announcements(id) 
  ON DELETE CASCADE;

-- PASSO 3: Atualizar tabela price_drop_notifications
ALTER TABLE IF EXISTS public.price_drop_notifications 
  DROP CONSTRAINT IF EXISTS price_drop_notifications_ad_id_fkey;

ALTER TABLE IF EXISTS public.price_drop_notifications 
  RENAME COLUMN ad_id TO announcement_id;

ALTER TABLE IF EXISTS public.price_drop_notifications 
  ADD CONSTRAINT price_drop_notifications_announcement_id_fkey 
  FOREIGN KEY (announcement_id) 
  REFERENCES public.announcements(id) 
  ON DELETE CASCADE;

-- PASSO 4: Recriar VIEW chats_full com coluna correta
DROP VIEW IF EXISTS public.chats_full CASCADE;

CREATE OR REPLACE VIEW public.chats_full AS
SELECT 
  c.id,
  c.announcement_id,
  c.seller_id,
  c.buyer_id,
  c.status,
  c.created_at,
  c.last_message,
  c.last_message_time,
  c.unread_count,
  a.title AS ad_title,
  a.price AS ad_price,
  a.images[1] AS ad_image,
  seller.name AS seller_name,
  buyer.name AS buyer_name
FROM public.chats c
LEFT JOIN public.announcements a ON c.announcement_id = a.id
LEFT JOIN public.users seller ON c.seller_id = seller.id
LEFT JOIN public.users buyer ON c.buyer_id = buyer.id;

-- PASSO 5: Criar/atualizar view de opportunities
DROP VIEW IF EXISTS public.opportunities_view CASCADE;

CREATE OR REPLACE VIEW public.opportunities_view AS
SELECT 
  o.id,
  o.user_id,
  o.announcement_id,
  o.expires_at,
  a.title AS announcement_title,
  a.price AS announcement_price
FROM public.opportunities o
LEFT JOIN public.announcements a ON o.announcement_id = a.id;

-- PASSO 6: Verificação final
SELECT 
  'Verificação concluída' AS status,
  COUNT(*) AS total_announcements
FROM public.announcements;

-- ============================================================================
-- Execute este script e verifique se não há erros.
-- Depois, recarregue a aplicação frontend.
-- ============================================================================
