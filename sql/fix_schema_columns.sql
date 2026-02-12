-- ==========================================
-- DIAGNÓSTICO E CORREÇÃO DO SCHEMA
-- Execute este script no Supabase SQL Editor
-- ==========================================

-- 1. VERIFICAR ESTRUTURA ATUAL DAS TABELAS
-- ==========================================

-- Verificar colunas da tabela leads
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads'
ORDER BY ordinal_position;

-- Verificar colunas da tabela notifications
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
ORDER BY ordinal_position;


-- 2. ADICIONAR COLUNAS FALTANTES (SE NECESSÁRIO)
-- ==========================================

-- Se a coluna buyer_cep não existir em leads:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'buyer_cep'
  ) THEN
    ALTER TABLE leads ADD COLUMN buyer_cep TEXT;
    RAISE NOTICE 'Coluna buyer_cep adicionada à tabela leads';
  ELSE
    RAISE NOTICE 'Coluna buyer_cep já existe na tabela leads';
  END IF;
END $$;

-- Se a coluna message não existir em notifications:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'message'
  ) THEN
    ALTER TABLE notifications ADD COLUMN message TEXT NOT NULL DEFAULT '';
    RAISE NOTICE 'Coluna message adicionada à tabela notifications';
  ELSE
    RAISE NOTICE 'Coluna message já existe na tabela notifications';
  END IF;
END $$;


-- 3. VERIFICAÇÃO FINAL
-- ==========================================

-- Contar colunas esperadas
SELECT 
  'leads' as tabela,
  COUNT(*) as total_colunas,
  COUNT(*) FILTER (WHERE column_name IN ('buyer_cep', 'buyer_name', 'buyer_email', 'buyer_phone')) as colunas_buyer
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads'
UNION ALL
SELECT 
  'notifications' as tabela,
  COUNT(*) as total_colunas,
  COUNT(*) FILTER (WHERE column_name IN ('message', 'title', 'type')) as colunas_principais
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications';


-- 4. ESTRUTURA COMPLETA ESPERADA
-- ==========================================

-- LEADS deve ter estas colunas:
-- - id (uuid)
-- - chat_id (uuid)
-- - announcement_id (uuid)
-- - buyer_id (uuid)
-- - seller_id (uuid)
-- - buyer_name (text)
-- - buyer_email (text)
-- - buyer_phone (text)
-- - buyer_cep (text)         ← ESTA COLUNA
-- - initial_message (text)
-- - status (text)
-- - created_at (timestamptz)
-- - updated_at (timestamptz)

-- NOTIFICATIONS deve ter estas colunas:
-- - id (uuid)
-- - user_id (uuid)
-- - type (text)
-- - title (text)
-- - message (text)           ← ESTA COLUNA
-- - link (text)
-- - is_read (boolean)
-- - created_at (timestamptz)


-- 5. SE AS TABELAS NÃO EXISTEM, CRIE-AS
-- ==========================================

-- Verificar se as tabelas existem
SELECT 
  'chats' as tabela,
  EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chats') as existe
UNION ALL SELECT 'messages', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages')
UNION ALL SELECT 'leads', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads')
UNION ALL SELECT 'notifications', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications');

-- Se alguma tabela não existir, execute:
-- sql/create_chat_tables.sql (COMPLETO)
-- sql/create_chat_triggers.sql (COMPLETO)
-- sql/create_chats_view.sql (COMPLETO)
