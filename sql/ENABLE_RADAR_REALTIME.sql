-- =====================================================
-- RADAR: Habilitar Real-time e Replicação
-- =====================================================
-- Execute este script para garantir que o Real-time funcione
-- =====================================================

-- 1. Verificar se a replicação está habilitada
SELECT 
  schemaname,
  tablename,
  hasindexes,
  hasrules,
  hastriggers
FROM pg_tables 
WHERE tablename IN ('opportunity_matches', 'opportunity_alerts');

-- 2. Habilitar replicação para opportunity_matches
-- No Supabase, isso é feito via SQL ou pelo painel Database > Replication
-- Mas podemos verificar se a tabela está publicada
SELECT * FROM pg_publication_tables 
WHERE tablename = 'opportunity_matches';

-- 3. Se não estiver, adicionar à publicação supabase_realtime
-- ATENÇÃO: Execute apenas se necessário (verifique resultado do passo 2)
ALTER PUBLICATION supabase_realtime ADD TABLE opportunity_matches;

-- 4. Também habilitar para opportunity_alerts (para futuras features)
ALTER PUBLICATION supabase_realtime ADD TABLE opportunity_alerts;

-- 5. Verificar publicações ativas
SELECT 
  pubname,
  puballtables,
  pubinsert,
  pubupdate,
  pubdelete,
  pubtruncate
FROM pg_publication
WHERE pubname = 'supabase_realtime';

-- 6. Listar todas as tabelas publicadas no supabase_realtime
SELECT 
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- 7. Teste manual: Inserir um match de teste (ajuste user_id e alert_id)
/*
INSERT INTO opportunity_matches (
  alert_id,
  announcement_id,
  user_id,
  match_score,
  match_reason,
  is_viewed,
  is_dismissed
) VALUES (
  'seu-alert-id-aqui',
  'seu-announcement-id-aqui',
  'seu-user-id-aqui',
  85,
  '{"category": true, "state": true}'::jsonb,
  false,
  false
);
*/

-- 8. Verificar se há triggers que possam estar bloqueando
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'opportunity_matches';

-- =====================================================
-- RESULTADO ESPERADO:
-- =====================================================
-- Após executar este script:
-- 1. opportunity_matches deve aparecer em pg_publication_tables
-- 2. supabase_realtime deve ter pubinsert=true
-- 3. Frontend deve receber notificações instantâneas via WebSocket
-- =====================================================
