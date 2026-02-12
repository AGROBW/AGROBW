-- ============================================================================
-- DIAGNÓSTICO: Encontrar referências à tabela 'ads' antiga
-- ============================================================================

-- 1. Verificar políticas RLS na tabela announcements
SELECT 
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'announcements';

-- 2. Verificar triggers na tabela announcements
SELECT 
  trigger_name,
  event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'announcements';

-- 3. Verificar se a tabela announcements existe e tem dados
SELECT 
  COUNT(*) AS row_count
FROM public.announcements;
