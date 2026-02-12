-- ==========================================
-- VERIFICAÇÃO: Chats e Leads
-- ==========================================
-- 
-- Este script verifica se TODOS os chats têm leads vinculados
-- e identifica problemas de integridade
-- ==========================================

-- 1. VERIFICAR CHATS SEM LEADS
-- ==========================================

SELECT 
  '🚨 CHATS SEM LEADS' as alerta,
  c.id as chat_id,
  c.created_at as chat_criado_em,
  a.title as anuncio,
  buyer.name as comprador,
  seller.name as vendedor
FROM chats c
JOIN announcements a ON a.id = c.announcement_id
JOIN users buyer ON buyer.id = c.buyer_id
JOIN users seller ON seller.id = c.seller_id
LEFT JOIN leads l ON l.chat_id = c.id
WHERE l.id IS NULL
ORDER BY c.created_at DESC;

-- Se esta query retornar linhas, há chats sem leads!

-- 2. ESTATÍSTICAS GERAIS
-- ==========================================

SELECT 
  'Total de Chats' as metrica,
  COUNT(*) as quantidade
FROM chats

UNION ALL

SELECT 
  'Total de Leads' as metrica,
  COUNT(*) as quantidade
FROM leads

UNION ALL

SELECT 
  'Chats SEM Lead' as metrica,
  COUNT(*) as quantidade
FROM chats c
LEFT JOIN leads l ON l.chat_id = c.id
WHERE l.id IS NULL;

-- ==========================================
-- RESULTADO ESPERADO:
-- Total de Chats = Total de Leads
-- Chats SEM Lead = 0
-- ==========================================

-- 3. VERIFICAR DADOS DOS LEADS
-- ==========================================

SELECT 
  l.id as lead_id,
  l.chat_id,
  l.buyer_name,
  l.buyer_email,
  l.buyer_phone,
  l.buyer_cep,
  l.initial_message,
  l.status,
  l.created_at,
  a.title as anuncio
FROM leads l
JOIN announcements a ON a.id = l.announcement_id
ORDER BY l.created_at DESC
LIMIT 20;

-- Verificar se os campos estão preenchidos corretamente

-- 4. VERIFICAR INTEGRIDADE BUYER_ID E SELLER_ID
-- ==========================================

SELECT 
  '=== DADOS DO LEAD ===' as secao,
  l.id as lead_id,
  l.buyer_id,
  l.seller_id,
  
  '=== DADOS DO CHAT ===' as secao2,
  c.buyer_id as chat_buyer_id,
  c.seller_id as chat_seller_id,
  
  '=== CONSISTÊNCIA ===' as secao3,
  CASE 
    WHEN l.buyer_id = c.buyer_id THEN '✅ OK'
    ELSE '❌ INCONSISTENTE'
  END as buyer_consistente,
  CASE 
    WHEN l.seller_id = c.seller_id THEN '✅ OK'
    ELSE '❌ INCONSISTENTE'
  END as seller_consistente
  
FROM leads l
JOIN chats c ON c.id = l.chat_id
WHERE l.buyer_id != c.buyer_id OR l.seller_id != c.seller_id;

-- Se retornar linhas, há inconsistência entre lead e chat!

-- 5. VERIFICAR CAMPOS OBRIGATÓRIOS
-- ==========================================

SELECT 
  'Leads com dados faltantes' as problema,
  l.id as lead_id,
  l.buyer_name,
  l.buyer_email,
  l.buyer_phone,
  l.buyer_cep,
  CASE 
    WHEN l.buyer_name IS NULL OR l.buyer_name = '' THEN '❌ Nome vazio'
    WHEN l.buyer_email IS NULL OR l.buyer_email = '' THEN '❌ Email vazio'
    WHEN l.buyer_phone IS NULL OR l.buyer_phone = '' THEN '⚠️ Telefone vazio'
    WHEN l.buyer_cep IS NULL OR l.buyer_cep = '' THEN '⚠️ CEP vazio'
    ELSE '✅ Completo'
  END as status_dados
FROM leads l
WHERE 
  l.buyer_name IS NULL OR l.buyer_name = '' OR
  l.buyer_email IS NULL OR l.buyer_email = ''
ORDER BY l.created_at DESC;

-- 6. CRIAR LEADS FALTANTES (SE NECESSÁRIO)
-- ==========================================

-- ATENÇÃO: Execute apenas se houver chats sem leads!
-- Este script cria leads para chats antigos que não têm lead vinculado

/*
INSERT INTO leads (
  chat_id,
  announcement_id,
  buyer_id,
  seller_id,
  buyer_name,
  buyer_email,
  buyer_phone,
  buyer_cep,
  initial_message,
  status
)
SELECT 
  c.id as chat_id,
  c.announcement_id,
  c.buyer_id,
  c.seller_id,
  buyer.name as buyer_name,
  buyer.email as buyer_email,
  buyer.phone as buyer_phone,
  buyer.cep as buyer_cep,
  c.last_message as initial_message,
  'new' as status
FROM chats c
JOIN users buyer ON buyer.id = c.buyer_id
LEFT JOIN leads l ON l.chat_id = c.id
WHERE l.id IS NULL;
*/

-- Verificar quantos serão criados:
SELECT 
  COUNT(*) as leads_serao_criados
FROM chats c
LEFT JOIN leads l ON l.chat_id = c.id
WHERE l.id IS NULL;

-- 7. TESTAR CRIAÇÃO DE LEAD MANUALMENTE
-- ==========================================

-- Se você quiser testar a criação de um lead manualmente:
/*
INSERT INTO leads (
  chat_id,
  announcement_id,
  buyer_id,
  seller_id,
  buyer_name,
  buyer_email,
  buyer_phone,
  buyer_cep,
  initial_message,
  status
) VALUES (
  'CHAT_ID_AQUI',
  'ANNOUNCEMENT_ID_AQUI',
  'BUYER_ID_AQUI',
  'SELLER_ID_AQUI',
  'Nome do Comprador',
  'email@example.com',
  '(11) 98765-4321',
  '12345-678',
  'Mensagem inicial',
  'new'
)
RETURNING *;
*/

-- ==========================================
-- 8. VERIFICAR POLÍTICAS RLS
-- ==========================================

-- Verificar se as políticas RLS permitem inserção de leads
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'leads'
AND cmd = 'INSERT'
ORDER BY policyname;

-- Deve ter pelo menos 1 política INSERT ativa

-- 9. TESTAR INSERÇÃO COMO USUÁRIO LOGADO
-- ==========================================

-- Execute isto logado como comprador:
/*
INSERT INTO leads (
  chat_id,
  announcement_id,
  buyer_id,
  seller_id,
  buyer_name,
  buyer_email,
  buyer_phone,
  buyer_cep,
  initial_message,
  status
) VALUES (
  'SEU_CHAT_ID',
  'SEU_ANNOUNCEMENT_ID',
  auth.uid(), -- Seu user_id
  'SELLER_ID',
  'Seu Nome',
  'seu@email.com',
  '(11) 98765-4321',
  '12345-678',
  'Teste de mensagem',
  'new'
)
RETURNING *;
*/

-- Se der erro, verifique as políticas RLS

-- ==========================================
-- RESULTADO ESPERADO:
-- ==========================================

-- ✅ Total de Chats = Total de Leads
-- ✅ Chats SEM Lead = 0
-- ✅ Todos os buyer_id e seller_id consistentes
-- ✅ Todos os leads têm buyer_name e buyer_email
-- ✅ Políticas RLS permitem INSERT
-- ✅ Teste de inserção funciona

-- ==========================================
-- FIM DO SCRIPT
-- ==========================================
