-- ==========================================
-- SCRIPT DE TESTE: Sidebar de Inteligência Logística
-- ==========================================
-- 
-- Execute estas queries para configurar dados de teste
-- e verificar se tudo está funcionando
-- ==========================================

-- 1. CONFIGURAR CEP DO VENDEDOR
-- Substitua 'SEU_USER_ID' pelo ID do vendedor
UPDATE users 
SET cep = '01310100'  -- CEP Av. Paulista, SP (exemplo)
WHERE id = 'SEU_USER_ID';

-- Verificar se foi atualizado
SELECT id, name, email, cep, cidade, estado 
FROM users 
WHERE id = 'SEU_USER_ID';

-- ==========================================
-- 2. VERIFICAR LEADS COM CEP
-- ==========================================

-- Ver todos os leads com buyer_cep preenchido
SELECT 
  l.id,
  l.buyer_name,
  l.buyer_email,
  l.buyer_phone,
  l.buyer_cep,
  l.chat_id,
  a.title as anuncio,
  u.name as vendedor,
  u.cep as vendedor_cep
FROM leads l
JOIN chats c ON c.id = l.chat_id
JOIN announcements a ON a.id = l.announcement_id
JOIN users u ON u.id = l.seller_id
WHERE l.buyer_cep IS NOT NULL
ORDER BY l.created_at DESC;

-- ==========================================
-- 3. SIMULAR LEAD COM CEP (Se não houver nenhum)
-- ==========================================

-- ATENÇÃO: Só execute se você quiser criar dados de teste!
-- Substitua os IDs pelos valores reais do seu banco

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
  'SEU_CHAT_ID',                    -- ID do chat existente
  'SEU_ANNOUNCEMENT_ID',            -- ID do anúncio
  'ID_DO_COMPRADOR',                -- ID do usuário comprador
  'ID_DO_VENDEDOR',                 -- ID do usuário vendedor
  'João da Silva',                  -- Nome do comprador
  'joao@example.com',               -- Email do comprador
  '(11) 98765-4321',                -- Telefone do comprador
  '04538133',                       -- CEP do comprador (Itaim Bibi, SP)
  'Olá, tenho interesse no anúncio!',
  'new'
);
*/

-- ==========================================
-- 4. TESTE DE DISTÂNCIA ENTRE CEPS
-- ==========================================

-- CEPs de teste para calcular distância (exemplo Brasil):
-- 01310100 - Av. Paulista, SP
-- 04538133 - Itaim Bibi, SP (aprox. 5km)
-- 22640100 - Barra da Tijuca, RJ (aprox. 430km)
-- 30130100 - Centro, Belo Horizonte, MG (aprox. 590km)

-- Consulta para verificar pares de CEPs que serão calculados:
SELECT 
  u.name as vendedor,
  u.cep as cep_vendedor,
  u.cidade as cidade_vendedor,
  l.buyer_name as comprador,
  l.buyer_cep as cep_comprador,
  l.chat_id,
  a.title as anuncio,
  a.price as preco
FROM leads l
JOIN users u ON u.id = l.seller_id
JOIN announcements a ON a.id = l.announcement_id
WHERE u.cep IS NOT NULL 
  AND l.buyer_cep IS NOT NULL
ORDER BY l.created_at DESC
LIMIT 10;

-- ==========================================
-- 5. VERIFICAR CHATS ATIVOS
-- ==========================================

-- Ver chats com leads (que terão a sidebar)
SELECT 
  c.id as chat_id,
  a.title as anuncio,
  a.price as preco,
  u_seller.name as vendedor,
  u_seller.cep as vendedor_cep,
  u_buyer.name as comprador,
  l.buyer_cep as comprador_cep,
  l.buyer_phone as comprador_phone
FROM chats c
JOIN announcements a ON a.id = c.announcement_id
JOIN users u_seller ON u_seller.id = c.seller_id
JOIN users u_buyer ON u_buyer.id = c.buyer_id
LEFT JOIN leads l ON l.chat_id = c.id
ORDER BY c.updated_at DESC
LIMIT 10;

-- ==========================================
-- 6. ATUALIZAR CEP DE LEAD EXISTENTE (TESTE)
-- ==========================================

-- Se você tem um lead sem CEP e quer adicionar:
/*
UPDATE leads 
SET buyer_cep = '04538133'  -- CEP de teste
WHERE id = 'SEU_LEAD_ID';
*/

-- ==========================================
-- 7. VERIFICAÇÃO FINAL
-- ==========================================

-- Esta query retorna TUDO que a sidebar precisa:
SELECT 
  'DADOS PARA SIDEBAR' as info,
  l.id as lead_id,
  l.buyer_name,
  l.buyer_email,
  l.buyer_phone,
  l.buyer_cep,
  l.initial_message,
  u.cep as vendedor_cep,
  u.name as vendedor_name,
  a.title as anuncio,
  a.price as preco,
  c.id as chat_id
FROM leads l
JOIN chats c ON c.id = l.chat_id
JOIN users u ON u.id = l.seller_id
JOIN announcements a ON a.id = l.announcement_id
WHERE c.id = 'SEU_CHAT_ID'  -- Substitua pelo chat que você vai abrir
LIMIT 1;

-- ==========================================
-- RESULTADOS ESPERADOS:
-- ✅ Vendedor tem CEP cadastrado
-- ✅ Lead tem buyer_cep preenchido
-- ✅ Lead tem buyer_phone preenchido
-- ✅ Chat existe e está ativo
-- 
-- Se todos os ✅ estiverem OK, a sidebar vai:
-- 1. Mostrar dados do comprador
-- 2. Calcular distância automaticamente
-- 3. Exibir botão WhatsApp funcional
-- 4. Permitir cálculo de frete
-- ==========================================

-- ==========================================
-- 8. TROUBLESHOOTING
-- ==========================================

-- Se a sidebar não aparecer, verifique:

-- A) Chat tem lead associado?
SELECT COUNT(*) as tem_lead FROM leads WHERE chat_id = 'SEU_CHAT_ID';
-- Resultado esperado: 1

-- B) Vendedor tem CEP?
SELECT cep FROM users WHERE id IN (
  SELECT seller_id FROM chats WHERE id = 'SEU_CHAT_ID'
);
-- Resultado esperado: CEP preenchido (8 dígitos)

-- C) Lead tem buyer_cep?
SELECT buyer_cep FROM leads WHERE chat_id = 'SEU_CHAT_ID';
-- Resultado esperado: CEP preenchido (8 dígitos)

-- D) Lead tem buyer_phone?
SELECT buyer_phone FROM leads WHERE chat_id = 'SEU_CHAT_ID';
-- Resultado esperado: Telefone preenchido

-- ==========================================
-- FIM DO SCRIPT DE TESTE
-- ==========================================
