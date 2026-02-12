-- ==========================================
-- TRIGGERS E FUNÇÕES PARA AUTOMAÇÃO
-- ==========================================

-- 1. Função para atualizar última mensagem no chat
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

-- 2. Trigger para atualizar chat quando mensagem é inserida
DROP TRIGGER IF EXISTS trigger_update_chat_on_message ON messages;
CREATE TRIGGER trigger_update_chat_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_last_message();

-- 3. Função para criar notificação quando mensagem é recebida
CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  recipient_id UUID;
  sender_name TEXT;
  announcement_title TEXT;
BEGIN
  -- Determinar o destinatário
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
  
  -- Buscar nome do remetente
  SELECT name INTO sender_name FROM users WHERE id = NEW.sender_id;
  
  -- Criar notificação
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

-- 4. Trigger para criar notificação
DROP TRIGGER IF EXISTS trigger_create_message_notification ON messages;
CREATE TRIGGER trigger_create_message_notification
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION create_message_notification();

-- 5. Função para criar notificação de novo lead
CREATE OR REPLACE FUNCTION create_lead_notification()
RETURNS TRIGGER AS $$
DECLARE
  announcement_title TEXT;
BEGIN
  -- Buscar título do anúncio
  SELECT title INTO announcement_title FROM announcements WHERE id = NEW.announcement_id;
  
  -- Criar notificação para o vendedor
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

-- 6. Trigger para notificar vendedor sobre novo lead
DROP TRIGGER IF EXISTS trigger_create_lead_notification ON leads;
CREATE TRIGGER trigger_create_lead_notification
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION create_lead_notification();

-- 7. Função para resetar contador de não lidas ao marcar como lida
CREATE OR REPLACE FUNCTION reset_unread_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_read = true AND OLD.is_read = false THEN
    UPDATE chats
    SET 
      unread_count_buyer = CASE 
        WHEN NEW.sender_id != chats.buyer_id AND auth.uid() = chats.buyer_id THEN GREATEST(unread_count_buyer - 1, 0)
        ELSE unread_count_buyer
      END,
      unread_count_seller = CASE 
        WHEN NEW.sender_id != chats.seller_id AND auth.uid() = chats.seller_id THEN GREATEST(unread_count_seller - 1, 0)
        ELSE unread_count_seller
      END
    WHERE id = NEW.chat_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Trigger para resetar contador de não lidas
DROP TRIGGER IF EXISTS trigger_reset_unread_count ON messages;
CREATE TRIGGER trigger_reset_unread_count
  AFTER UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION reset_unread_count();

-- 9. Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Triggers para updated_at
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

-- Conceder permissões
GRANT EXECUTE ON FUNCTION update_chat_last_message() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_message_notification() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_lead_notification() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION reset_unread_count() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO authenticated, anon;
