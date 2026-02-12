-- ============================================================================
-- BUSCA PROFUNDA: Encontrar TUDO que referencia 'ads'
-- ============================================================================

-- 1. Verificar definição completa das políticas RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  pg_get_expr(polqual, polrelid) AS using_clause,
  pg_get_expr(polwithcheck, polrelid) AS with_check_clause
FROM pg_policies
JOIN pg_policy ON pg_policies.policyname = pg_policy.polname
WHERE schemaname = 'public'
  AND tablename = 'announcements'
  AND (
    pg_get_expr(polqual, polrelid) ILIKE '%ads%'
    OR pg_get_expr(polwithcheck, polrelid) ILIKE '%ads%'
  );

-- 2. Verificar constraints que podem ter subconsultas
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(pgc.oid) AS constraint_definition
FROM information_schema.table_constraints tc
JOIN pg_constraint pgc ON tc.constraint_name = pgc.conname
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'announcements'
  AND pg_get_constraintdef(pgc.oid) ILIKE '%ads%';

-- 3. Listar TODAS as políticas na tabela announcements
SELECT 
  policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'announcements';

-- 4. Verificar se existe alguma tabela 'ads' temporária ou em outro schema
SELECT 
  schemaname,
  tablename
FROM pg_tables
WHERE tablename = 'ads';
