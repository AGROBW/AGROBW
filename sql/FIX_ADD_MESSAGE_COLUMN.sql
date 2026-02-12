-- ==========================================
-- FIX: Adicionar coluna 'message' na tabela notifications
-- ==========================================
-- 
-- MOTIVO: A tabela notifications já existia sem a coluna 'message'
-- O script INSTALL_ALL_IN_ONE.sql usa "IF NOT EXISTS", então não adicionou a coluna
--
-- EXECUTE ESTE SCRIPT para adicionar a coluna faltante
-- ==========================================

-- 1. Verificar se a coluna existe
DO $$
BEGIN
  -- Tentar adicionar a coluna se ela não existir
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'message'
  ) THEN
    -- Adicionar a coluna
    ALTER TABLE notifications ADD COLUMN message TEXT NOT NULL DEFAULT '';
    RAISE NOTICE '✅ Coluna "message" adicionada com sucesso!';
  ELSE
    RAISE NOTICE '⚠️ Coluna "message" já existe!';
  END IF;
END $$;

-- 2. Verificar se a coluna foi adicionada
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'notifications' 
      AND column_name = 'message'
    ) THEN '✅ Coluna "message" existe na tabela notifications'
    ELSE '❌ ERRO: Coluna "message" ainda não existe!'
  END as status;

-- 3. Ver o schema completo da tabela notifications
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'notifications'
ORDER BY ordinal_position;

-- ==========================================
-- DEPOIS DE EXECUTAR ESTE SCRIPT:
-- 1. Verifique se a saída mostra "✅ Coluna message existe"
-- 2. Volte para a aplicação e teste novamente
-- 3. O formulário de contato deve funcionar agora!
-- ==========================================
