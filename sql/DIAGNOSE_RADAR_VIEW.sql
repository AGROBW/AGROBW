-- =====================================================
-- DIAGNÓSTICO: Verificar configuração da v_radar_stats
-- =====================================================
-- Execute este script para diagnosticar o problema do erro 406
-- =====================================================

-- 1. Verificar se a view existe e suas opções
SELECT 
  schemaname,
  viewname,
  viewowner,
  definition
FROM pg_views 
WHERE viewname = 'v_radar_stats';

-- 2. Verificar opções da view (incluindo security_invoker)
SELECT 
  c.relname AS view_name,
  c.reloptions AS view_options
FROM pg_class c
WHERE c.relname = 'v_radar_stats' AND c.relkind = 'v';

-- 3. Verificar permissões (GRANT)
SELECT 
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'v_radar_stats';

-- 4. Verificar se as tabelas base têm RLS habilitado
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('opportunity_alerts', 'opportunity_matches');

-- 5. Verificar policies das tabelas base
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('opportunity_alerts', 'opportunity_matches')
ORDER BY tablename, cmd;

-- 6. Testar acesso direto à view (deve funcionar)
SELECT * FROM v_radar_stats 
WHERE user_id = auth.uid()
LIMIT 1;
