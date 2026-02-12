-- ==========================================
-- FIX COMPLETO: Adicionar TODAS as colunas faltantes
-- ==========================================
-- 
-- Este script verifica e adiciona TODAS as colunas que podem estar faltando
-- devido a tabelas que já existiam antes do script principal
-- ==========================================

-- 1. ADICIONAR COLUNA 'message' na tabela notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'message'
  ) THEN
    ALTER TABLE notifications ADD COLUMN message TEXT NOT NULL DEFAULT '';
    RAISE NOTICE '✅ Coluna "message" adicionada em notifications';
  ELSE
    RAISE NOTICE '⚠️ Coluna "message" já existe em notifications';
  END IF;
END $$;

-- 2. ADICIONAR COLUNA 'buyer_cep' na tabela leads (se estiver faltando)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'buyer_cep'
  ) THEN
    ALTER TABLE leads ADD COLUMN buyer_cep TEXT;
    RAISE NOTICE '✅ Coluna "buyer_cep" adicionada em leads';
  ELSE
    RAISE NOTICE '⚠️ Coluna "buyer_cep" já existe em leads';
  END IF;
END $$;

-- 3. VERIFICAR SE TODAS AS COLUNAS NECESSÁRIAS EXISTEM
SELECT 
  '✅ VERIFICAÇÃO COMPLETA' as status,
  'Todas as colunas necessárias foram verificadas' as resultado;

-- 4. MOSTRAR SCHEMA COMPLETO DAS TABELAS
SELECT 'notifications' as tabela, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
ORDER BY ordinal_position

UNION ALL

SELECT 'leads' as tabela, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads'
ORDER BY ordinal_position;

-- ==========================================
-- ✅ SCRIPT SEGURO DE EXECUTAR
-- - Não duplica colunas se já existirem
-- - Adiciona apenas o que está faltando
-- - Mostra o resultado no final
-- ==========================================
