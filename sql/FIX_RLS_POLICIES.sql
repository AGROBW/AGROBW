-- ==========================================
-- FIX: Políticas RLS para Leads e Messages
-- ==========================================
-- 
-- PROBLEMA: Erro 406 ao buscar leads e erro 400 ao marcar mensagens como lidas
-- SOLUÇÃO: Recriar políticas RLS com permissões corretas
-- ==========================================

-- 1. RECRIAR POLÍTICAS PARA LEADS
-- ==========================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Vendedores e compradores podem ver seus leads" ON leads;
DROP POLICY IF EXISTS "Sistema pode criar leads" ON leads;
DROP POLICY IF EXISTS "Vendedores podem atualizar status do lead" ON leads;

-- Criar políticas novas
CREATE POLICY "Vendedores e compradores podem ver seus leads" ON leads
  FOR SELECT USING (
    auth.uid() = buyer_id OR auth.uid() = seller_id
  );

CREATE POLICY "Usuários podem criar leads" ON leads
  FOR INSERT WITH CHECK (
    auth.uid() = buyer_id
  );

CREATE POLICY "Vendedores podem atualizar leads" ON leads
  FOR UPDATE USING (
    auth.uid() = seller_id
  );

-- 2. RECRIAR POLÍTICAS PARA MESSAGES
-- ==========================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Usuários podem ver mensagens de seus chats" ON messages;
DROP POLICY IF EXISTS "Usuários podem enviar mensagens em seus chats" ON messages;
DROP POLICY IF EXISTS "Usuários podem marcar mensagens como lidas" ON messages;

-- SELECT: Ver mensagens dos próprios chats
CREATE POLICY "Usuários podem ver mensagens de seus chats" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND (chats.buyer_id = auth.uid() OR chats.seller_id = auth.uid())
    )
  );

-- INSERT: Enviar mensagens em chats onde participa
CREATE POLICY "Usuários podem enviar mensagens" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND (chats.buyer_id = auth.uid() OR chats.seller_id = auth.uid())
    )
  );

-- UPDATE: Marcar como lida QUALQUER mensagem dos próprios chats
CREATE POLICY "Usuários podem atualizar mensagens de seus chats" ON messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND (chats.buyer_id = auth.uid() OR chats.seller_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
      AND (chats.buyer_id = auth.uid() OR chats.seller_id = auth.uid())
    )
  );

-- 3. VERIFICAR SE AS POLÍTICAS FORAM CRIADAS
-- ==========================================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('messages', 'leads')
ORDER BY tablename, policyname;

-- 4. TESTAR ACESSO A LEADS
-- ==========================================

-- Execute esta query como usuário vendedor logado:
-- Deve retornar os leads onde você é seller_id
/*
SELECT 
  id,
  buyer_name,
  buyer_email,
  buyer_phone,
  buyer_cep,
  chat_id,
  status
FROM leads
WHERE seller_id = auth.uid();
*/

-- 5. TESTAR UPDATE DE MESSAGES
-- ==========================================

-- Execute esta query como usuário logado:
-- Deve atualizar mensagens dos seus chats
/*
UPDATE messages
SET is_read = true
WHERE chat_id IN (
  SELECT id FROM chats
  WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
)
AND sender_id != auth.uid()
LIMIT 1;
*/

-- ==========================================
-- RESULTADO ESPERADO:
-- ✅ Políticas criadas para leads (3)
-- ✅ Políticas criadas para messages (3)
-- ✅ SELECT em leads funciona
-- ✅ UPDATE em messages funciona
-- ==========================================

-- 6. BONUS: VERIFICAR ESTRUTURA DA TABELA MESSAGES
-- ==========================================

SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'messages'
ORDER BY ordinal_position;

-- Certificar que a coluna is_read existe e é boolean

-- 7. SE AINDA DER ERRO 400, EXECUTAR ISTO:
-- ==========================================

-- Garantir que is_read tem valor padrão
DO $$
BEGIN
  -- Atualizar mensagens NULL para false
  UPDATE messages SET is_read = false WHERE is_read IS NULL;
  
  -- Garantir constraint
  ALTER TABLE messages ALTER COLUMN is_read SET DEFAULT false;
  ALTER TABLE messages ALTER COLUMN is_read SET NOT NULL;
  
  RAISE NOTICE '✅ Coluna is_read corrigida';
END $$;

-- ==========================================
-- FIM DO SCRIPT
-- ==========================================
