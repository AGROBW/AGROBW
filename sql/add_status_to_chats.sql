-- ==========================================
-- ADICIONAR CAMPO STATUS À TABELA CHATS
-- Execute no Supabase SQL Editor
-- ==========================================

-- Adicionar coluna status à tabela chats se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chats' AND column_name = 'status'
  ) THEN
    ALTER TABLE chats 
    ADD COLUMN status TEXT DEFAULT 'novo' 
    CHECK (status IN ('novo', 'contatado', 'negociando', 'fechado', 'perdido'));
    
    RAISE NOTICE 'Coluna status adicionada com sucesso à tabela chats';
  ELSE
    RAISE NOTICE 'Coluna status já existe na tabela chats';
  END IF;
END $$;

-- Criar índice para melhor performance em filtros por status
CREATE INDEX IF NOT EXISTS idx_chats_status ON chats(status);

-- Comentário descritivo
COMMENT ON COLUMN chats.status IS 'Status do chat/lead: novo, contatado, negociando, fechado, perdido';

-- ==========================================
-- VERIFICAR ESTRUTURA
-- ==========================================

-- Conferir se a coluna foi criada corretamente
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'chats' AND column_name = 'status';

-- Conferir o constraint
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'chats'::regclass
  AND conname LIKE '%status%';
