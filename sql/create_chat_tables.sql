-- ==========================================
-- TABELAS PARA SISTEMA DE CHAT E LEADS
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

-- ==========================================
-- ÍNDICES PARA PERFORMANCE
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

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

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
DROP POLICY IF EXISTS "Admins can insert notifications" ON notifications;
CREATE POLICY "Admins can insert notifications" ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
