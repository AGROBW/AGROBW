-- ==========================================
-- INSTALAÇÃO COMPLETA DO SISTEMA DE CHAT E LEADS
-- Execute os blocos NA ORDEM indicada
-- ==========================================

-- ============================================================
-- BLOCO 1: CRIAR TABELAS, ÍNDICES E RLS
-- ============================================================
-- Cole todo o conteúdo de: sql/create_chat_tables.sql


-- ============================================================
-- BLOCO 2: CRIAR TRIGGERS E AUTOMAÇÕES
-- ============================================================
-- Cole todo o conteúdo de: sql/create_chat_triggers.sql


-- ============================================================
-- BLOCO 3: CRIAR VIEW CONSOLIDADA
-- ============================================================
-- Cole todo o conteúdo de: sql/create_chats_view.sql


-- ============================================================
-- BLOCO 4: VERIFICAÇÃO (COPIE E COLE SEPARADAMENTE)
-- ============================================================
-- Execute estas queries uma a uma para verificar:

-- 1. Verificar tabelas
SELECT 
  'chats' as tabela,
  EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chats') as existe
UNION ALL SELECT 'messages', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages')
UNION ALL SELECT 'leads', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads')
UNION ALL SELECT 'notifications', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications');

-- 2. Verificar RLS habilitado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('chats', 'messages', 'leads', 'notifications');

-- 3. Contar políticas RLS
SELECT tablename, COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('chats', 'messages', 'leads', 'notifications')
GROUP BY tablename;

-- 4. Verificar triggers
SELECT event_object_table, COUNT(*) as total_triggers
FROM information_schema.triggers
WHERE event_object_schema = 'public' 
  AND event_object_table IN ('chats', 'messages', 'leads')
GROUP BY event_object_table;

-- 5. Verificar VIEW
SELECT EXISTS (
  SELECT FROM information_schema.views 
  WHERE table_schema = 'public' AND table_name = 'chats_full'
) as chats_full_exists;


-- ============================================================
-- RESULTADO ESPERADO:
-- ============================================================
-- 
-- ✅ 4 tabelas criadas (chats, messages, leads, notifications)
-- ✅ RLS habilitado em todas (rowsecurity = TRUE)
-- ✅ Políticas RLS: chats(3), messages(3), leads(3), notifications(3)
-- ✅ Triggers: chats(1), messages(3), leads(1)
-- ✅ VIEW chats_full existe
-- 
-- Se todos os checks passarem, o sistema está pronto! 🎉
-- ============================================================
