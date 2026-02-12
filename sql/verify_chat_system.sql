-- ==========================================
-- SCRIPT DE VERIFICAÇÃO DO SISTEMA DE CHAT
-- Execute este script no Supabase SQL Editor
-- ==========================================

-- Verificar se as tabelas existem
SELECT 
  'chats' as tabela,
  EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'chats'
  ) as existe
UNION ALL
SELECT 
  'messages' as tabela,
  EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'messages'
  ) as existe
UNION ALL
SELECT 
  'leads' as tabela,
  EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) as existe
UNION ALL
SELECT 
  'notifications' as tabela,
  EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) as existe;

-- Verificar políticas RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('chats', 'messages', 'leads', 'notifications')
ORDER BY tablename, policyname;

-- Verificar triggers
SELECT 
  event_object_table AS tabela,
  trigger_name AS trigger,
  event_manipulation AS evento,
  action_statement AS funcao
FROM information_schema.triggers
WHERE event_object_schema = 'public' 
  AND event_object_table IN ('chats', 'messages', 'leads')
ORDER BY event_object_table, trigger_name;

-- Verificar índices
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('chats', 'messages', 'leads', 'notifications')
ORDER BY tablename, indexname;
