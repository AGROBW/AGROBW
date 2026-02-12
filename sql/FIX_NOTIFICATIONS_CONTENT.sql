-- ==========================================
-- FIX: Ajustar tabela notifications para usar 'content' ao invés de 'message'
-- ==========================================
-- 
-- PROBLEMA: A tabela notifications já existia com a coluna 'content' (NOT NULL)
-- Adicionamos 'message', mas os triggers estão confusos
-- 
-- SOLUÇÃO: Padronizar para usar apenas 'content'
-- ==========================================

-- 1. VERIFICAR ESTRUTURA ATUAL
SELECT 
  'ESTRUTURA ATUAL DA TABELA NOTIFICATIONS' as info,
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'notifications'
ORDER BY ordinal_position;

-- 2. REMOVER COLUNA 'message' se ela existe (foi adicionada por engano)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'message'
  ) THEN
    ALTER TABLE notifications DROP COLUMN message;
    RAISE NOTICE '✅ Coluna "message" removida (era duplicata de content)';
  ELSE
    RAISE NOTICE '⚠️ Coluna "message" não existe';
  END IF;
END $$;

-- 3. GARANTIR que 'content' existe e tem valor padrão
DO $$
BEGIN
  -- Se content não existe, criar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'content'
  ) THEN
    ALTER TABLE notifications ADD COLUMN content TEXT NOT NULL DEFAULT '';
    RAISE NOTICE '✅ Coluna "content" criada';
  ELSE
    RAISE NOTICE '⚠️ Coluna "content" já existe';
  END IF;
END $$;

-- 4. RECRIAR TRIGGER para usar 'content' ao invés de 'message'
CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  recipient_id UUID;
  sender_name TEXT;
  announcement_title TEXT;
BEGIN
  -- Buscar destinatário e título do anúncio
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
  
  -- Inserir notificação usando 'content' (não 'message')
  INSERT INTO notifications (user_id, type, title, content, link)
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

-- 5. RECRIAR TRIGGER para leads também
CREATE OR REPLACE FUNCTION create_lead_notification()
RETURNS TRIGGER AS $$
DECLARE
  announcement_title TEXT;
BEGIN
  SELECT title INTO announcement_title FROM announcements WHERE id = NEW.announcement_id;
  
  -- Inserir notificação usando 'content' (não 'message')
  INSERT INTO notifications (user_id, type, title, content, link)
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

-- 6. GARANTIR QUE OS TRIGGERS ESTÃO ATIVOS
DROP TRIGGER IF EXISTS trigger_create_message_notification ON messages;
CREATE TRIGGER trigger_create_message_notification
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION create_message_notification();

DROP TRIGGER IF EXISTS trigger_create_lead_notification ON leads;
CREATE TRIGGER trigger_create_lead_notification
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION create_lead_notification();

-- 7. VERIFICAR ESTRUTURA FINAL
SELECT 
  '✅ ESTRUTURA FINAL DA TABELA NOTIFICATIONS' as info,
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'notifications'
ORDER BY ordinal_position;

-- 8. TESTAR INSERÇÃO
SELECT '✅ Triggers atualizados para usar coluna "content"' as status;
SELECT '✅ Tente enviar a mensagem novamente na aplicação!' as proxima_acao;

-- ==========================================
-- ✅ DEPOIS DE EXECUTAR:
-- 1. Verifique se só existe a coluna 'content' (não 'message')
-- 2. Volte para a aplicação e teste o formulário novamente
-- 3. Deve funcionar agora!
-- ==========================================
