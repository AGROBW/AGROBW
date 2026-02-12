-- ============================================================================
-- DIAGNÓSTICO: Verificar estado atual do banco de dados
-- ============================================================================

-- 1. Listar todas as tabelas que contêm 'ad' ou 'announcement' no nome
SELECT 
  schemaname,
  tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename LIKE '%ad%' OR tablename LIKE '%announcement%')
ORDER BY tablename;

-- 2. Verificar colunas da tabela principal (qualquer que seja o nome)
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name LIKE '%ad%' OR table_name LIKE '%announcement%')
  AND table_name NOT LIKE '%_old%'
ORDER BY table_name, ordinal_position;

-- 3. Verificar constraints de foreign key
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND (tc.table_name LIKE '%ad%' 
       OR tc.table_name LIKE '%announcement%'
       OR ccu.table_name LIKE '%ad%'
       OR ccu.table_name LIKE '%announcement%')
ORDER BY tc.table_name;

-- 4. Listar todas as tabelas que podem referenciar anúncios
SELECT 
  table_name,
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name LIKE '%ad_id%' OR column_name LIKE '%announcement_id%')
ORDER BY table_name, column_name;
