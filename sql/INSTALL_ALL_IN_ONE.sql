-- ==========================================
-- SCRIPT ÚNICO DE INSTALAÇÃO COMPLETA
-- Execute TODO este arquivo de uma vez no Supabase SQL Editor
-- ==========================================

-- PARTE 1: CRIAR TABELAS
-- ==========================================

-- 1. Tabela de Chats
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message TEXT,
  last_message_time TIMESTAMPTZ,
  unread_count_buyer INTEGER DEFAULT 0,
  unread_count_seller INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_chat_per_announcement UNIQUE (announcement_id, buyer_id, seller_id),
  CONSTRAINT buyer_seller_different CHECK (buyer_id != seller_id)
);

-- 2. Tabela de Mensagens
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (trim(content) != ''),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  buyer_cep TEXT,
  initial_message TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'negotiating', 'closed', 'lost')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de Notificações
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_message', 'new_lead', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PARTE 2: CRIAR ÍNDICES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_chats_buyer ON chats(buyer_id);
CREATE INDEX IF NOT EXISTS idx_chats_seller ON chats(seller_id);
CREATE INDEX IF NOT EXISTS idx_chats_announcement ON chats(announcement_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_buyer ON leads(buyer_id);
CREATE INDEX IF NOT EXISTS idx_leads_seller ON leads(seller_id);
CREATE INDEX IF NOT EXISTS idx_leads_announcement ON leads(announcement_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- PARTE 3: HABILITAR RLS
-- ==========================================

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- PARTE 4: CRIAR POLÍTICAS RLS
-- ==========================================

-- Políticas para CHATS
DROP POLICY IF EXISTS "Usuários podem ver seus próprios chats" ON chats;
CREATE POLICY "Usuários podem ver seus próprios chats" ON chats
  FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Compradores podem criar chats" ON chats;
CREATE POLICY "Compradores podem criar chats" ON chats
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Participantes podem atualizar chats" ON chats;
CREATE POLICY "Participantes podem atualizar chats" ON chats
  FOR UPDATE USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Políticas para MESSAGES
DROP POLICY IF EXISTS "Usuários podem ver mensagens de seus chats" ON messages;
CREATE POLICY "Usuários podem ver mensagens de seus chats" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND (chats.buyer_id = auth.uid() OR chats.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Usuários podem enviar mensagens em seus chats" ON messages;
CREATE POLICY "Usuários podem enviar mensagens em seus chats" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND (chats.buyer_id = auth.uid() OR chats.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Usuários podem marcar mensagens como lidas" ON messages;
CREATE POLICY "Usuários podem marcar mensagens como lidas" ON messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND (chats.buyer_id = auth.uid() OR chats.seller_id = auth.uid())
    )
  );

-- Políticas para LEADS
DROP POLICY IF EXISTS "Vendedores e compradores podem ver seus leads" ON leads;
CREATE POLICY "Vendedores e compradores podem ver seus leads" ON leads
  FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Sistema pode criar leads" ON leads;
CREATE POLICY "Sistema pode criar leads" ON leads
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Vendedores podem atualizar status do lead" ON leads;
CREATE POLICY "Vendedores podem atualizar status do lead" ON leads
  FOR UPDATE USING (auth.uid() = seller_id);

-- Políticas para NOTIFICATIONS
DROP POLICY IF EXISTS "Usuários podem ver suas próprias notificações" ON notifications;
CREATE POLICY "Usuários podem ver suas próprias notificações" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem marcar notificações como lidas" ON notifications;
CREATE POLICY "Usuários podem marcar notificações como lidas" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sistema pode criar notificações" ON notifications;
CREATE POLICY "Sistema pode criar notificações" ON notifications
  FOR INSERT WITH CHECK (true);

-- PARTE 5: CRIAR FUNÇÕES E TRIGGERS
-- ==========================================

-- Função para atualizar última mensagem no chat
CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chats
  SET 
    last_message = NEW.content,
    last_message_time = NEW.created_at,
    updated_at = now(),
    unread_count_buyer = CASE 
      WHEN NEW.sender_id != chats.buyer_id THEN unread_count_buyer + 1
      ELSE unread_count_buyer
    END,
    unread_count_seller = CASE 
      WHEN NEW.sender_id != chats.seller_id THEN unread_count_seller + 1
      ELSE unread_count_seller
    END
  WHERE id = NEW.chat_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_chat_on_message ON messages;
CREATE TRIGGER trigger_update_chat_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_last_message();

-- Função para criar notificação quando mensagem é recebida
CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  recipient_id UUID;
  sender_name TEXT;
  announcement_title TEXT;
BEGIN
  SELECT 
    CASE 
      WHEN NEW.sender_id = chats.buyer_id THEN chats.seller_id
      ELSE chats.buyer_id
    END,
    announcements.title
  INTO recipient_id, announcement_title
  FROM chats
  JOIN announcements ON announcements.id = chats.announcement_id
  WHERE chats.id = NEW.chat_id;
  
  SELECT name INTO sender_name FROM users WHERE id = NEW.sender_id;
  
  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    recipient_id,
    'new_message',
    'Nova mensagem de ' || COALESCE(sender_name, 'Usuário'),
    LEFT(NEW.content, 100) || CASE WHEN LENGTH(NEW.content) > 100 THEN '...' ELSE '' END,
    '/minha-conta/mensagens?chat=' || NEW.chat_id::text
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_message_notification ON messages;
CREATE TRIGGER trigger_create_message_notification
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION create_message_notification();

-- Função para criar notificação de novo lead
CREATE OR REPLACE FUNCTION create_lead_notification()
RETURNS TRIGGER AS $$
DECLARE
  announcement_title TEXT;
BEGIN
  SELECT title INTO announcement_title FROM announcements WHERE id = NEW.announcement_id;
  
  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    NEW.seller_id,
    'new_lead',
    'Novo interesse no seu anúncio',
    NEW.buyer_name || ' está interessado em: ' || COALESCE(announcement_title, 'seu anúncio'),
    '/minha-conta/leads?lead=' || NEW.id::text
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_lead_notification ON leads;
CREATE TRIGGER trigger_create_lead_notification
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION create_lead_notification();

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_chats_updated_at ON chats;
CREATE TRIGGER trigger_chats_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_messages_updated_at ON messages;
CREATE TRIGGER trigger_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_leads_updated_at ON leads;
CREATE TRIGGER trigger_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- PARTE 6: CRIAR VIEW
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
  a.title as ad_title,
  a.price as ad_price,
  a.unit_price as ad_unit_price,
  a.images[1] as ad_image,
  a.status,
  buyer.name as buyer_name,
  buyer.avatar as buyer_avatar,
  buyer.email as buyer_email,
  seller.name as seller_name,
  seller.avatar as seller_avatar,
  seller.email as seller_email,
  CASE 
    WHEN auth.uid() = c.buyer_id THEN c.unread_count_buyer
    WHEN auth.uid() = c.seller_id THEN c.unread_count_seller
    ELSE 0
  END as unread_count
FROM chats c
LEFT JOIN announcements a ON a.id = c.announcement_id
LEFT JOIN users buyer ON buyer.id = c.buyer_id
LEFT JOIN users seller ON seller.id = c.seller_id;

-- PARTE 7: CONCEDER PERMISSÕES
-- ==========================================

GRANT ALL ON chats TO authenticated, anon;
GRANT ALL ON messages TO authenticated, anon;
GRANT ALL ON leads TO authenticated, anon;
GRANT ALL ON notifications TO authenticated, anon;
GRANT SELECT ON chats_full TO authenticated, anon;

GRANT EXECUTE ON FUNCTION update_chat_last_message() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_message_notification() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_lead_notification() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO authenticated, anon;

-- ==========================================
-- INSTALAÇÃO COMPLETA! ✅
-- ==========================================

-- Execute este SELECT para confirmar:
SELECT 
  'chats' as tabela, EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chats') as criada
UNION ALL SELECT 'messages', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages')
UNION ALL SELECT 'leads', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads')
UNION ALL SELECT 'notifications', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications')
UNION ALL SELECT 'chats_full (view)', EXISTS (SELECT FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'chats_full');

-- Se todas retornarem TRUE, está tudo pronto! 🎉
