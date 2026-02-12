-- ==========================================
-- DEBUG: Verificar dados da VIEW chats_full
-- ==========================================
-- 
-- Execute estas queries para diagnosticar problemas de preço
-- e dados faltantes na sidebar
--
-- ⚠️ SE ad_price RETORNAR 0.00:
-- Execute primeiro: sql/FIX_PRECOS_ZERADOS.sql
-- (O problema é no anúncio, não na VIEW)
-- ==========================================

-- 1. VERIFICAR ESTRUTURA DA VIEW chats_full
-- ==========================================

-- Ver todas as colunas da view
SELECT 
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'chats_full'
ORDER BY ordinal_position;

-- Resultado esperado: deve ter coluna 'ad_price'

-- 2. VERIFICAR DADOS DE UM CHAT ESPECÍFICO
-- ==========================================

-- 2. VERIFICAR DADOS DE UM CHAT ESPECÍFICO
-- ==========================================

-- IMPORTANTE: Execute primeiro o FIX_VIEW_CHATS_FULL.sql para corrigir a VIEW!

-- Substitua 'SEU_CHAT_ID' pelo ID do chat que você está testando
SELECT 
  id as chat_id,
  announcement_id,
  ad_title,           -- Deve estar em snake_case
  ad_price,           -- ← Este é o campo que deve chegar
  ad_unit_price,
  ad_image,
  buyer_id,
  buyer_name,
  seller_id,
  seller_name,
  last_message,
  last_message_time,
  unread_count,
  status
FROM chats_full
WHERE id = 'SEU_CHAT_ID';

-- ==========================================
-- RESULTADO ESPERADO:
-- ✅ ad_price deve ter valor numérico (não null)
-- ✅ ad_title deve estar preenchido
-- ✅ buyer_name e seller_name devem estar preenchidos
-- ==========================================

-- 3. VERIFICAR SE ANÚNCIOS TÊM PREÇO
-- ==========================================

-- Ver anúncios vinculados aos chats
SELECT 
  a.id as anuncio_id,
  a.title,
  a.price,           -- ← Preço na tabela announcements
  a.unit_price,
  a.status,
  c.id as chat_id
FROM announcements a
LEFT JOIN chats c ON c.announcement_id = a.id
WHERE c.id IS NOT NULL
ORDER BY c.updated_at DESC
LIMIT 10;

-- ==========================================
-- RESULTADO ESPERADO:
-- ✅ Coluna 'price' deve ter valores
-- ✅ Se price = 0, verificar unit_price
-- ==========================================

-- 4. DEBUG COMPLETO DE UM CHAT
-- ==========================================

-- Query completa que mostra TUDO de um chat
SELECT 
  '=== DADOS DO CHAT ===' as secao,
  c.id as chat_id,
  c.created_at as chat_criado_em,
  c.updated_at as chat_atualizado_em,
  
  '=== DADOS DO ANÚNCIO ===' as secao2,
  a.id as anuncio_id,
  a.title as anuncio_titulo,
  a.price as anuncio_preco,
  a.unit_price as anuncio_preco_unitario,
  a.images[1] as anuncio_imagem,
  a.status as anuncio_status,
  
  '=== DADOS DO COMPRADOR ===' as secao3,
  u_buyer.id as comprador_id,
  u_buyer.name as comprador_nome,
  u_buyer.email as comprador_email,
  u_buyer.cep as comprador_cep,
  
  '=== DADOS DO VENDEDOR ===' as secao4,
  u_seller.id as vendedor_id,
  u_seller.name as vendedor_nome,
  u_seller.email as vendedor_email,
  u_seller.cep as vendedor_cep,
  
  '=== DADOS DO LEAD ===' as secao5,
  l.id as lead_id,
  l.buyer_phone as lead_telefone,
  l.buyer_cep as lead_cep,
  l.initial_message as lead_mensagem,
  l.status as lead_status
  
FROM chats c
JOIN announcements a ON a.id = c.announcement_id
JOIN users u_buyer ON u_buyer.id = c.buyer_id
JOIN users u_seller ON u_seller.id = c.seller_id
LEFT JOIN leads l ON l.chat_id = c.id
WHERE c.id = 'SEU_CHAT_ID';  -- ← Substitua pelo ID do chat

-- ==========================================
-- CHECKLIST DE VERIFICAÇÃO:
-- ==========================================

-- [ ] anuncio_preco tem valor? (não é 0 ou null)
-- [ ] comprador_nome e vendedor_nome estão preenchidos?
-- [ ] vendedor_cep está cadastrado?
-- [ ] lead_id existe? (leadh vinculado ao chat)
-- [ ] lead_telefone está preenchido?
-- [ ] lead_cep está preenchido?

-- ==========================================
-- 5. VERIFICAR POLÍTICAS RLS
-- ==========================================

-- Ver se você tem permissão para acessar os dados
SELECT 
  'Seu user_id:' as info,
  auth.uid() as user_id;

-- Ver chats que você pode acessar
SELECT 
  COUNT(*) as total_chats_acessiveis
FROM chats_full
WHERE buyer_id = auth.uid() OR seller_id = auth.uid();

-- ==========================================
-- 6. CORRIGIR PREÇO SE ESTIVER ZERADO
-- ==========================================

-- Se o anúncio tem price = 0 mas unit_price tem valor:
/*
UPDATE announcements
SET price = unit_price * 1  -- Ajuste a quantidade
WHERE id = 'SEU_ANNOUNCEMENT_ID'
AND price = 0
AND unit_price > 0;
*/

-- ==========================================
-- 7. TESTAR A VIEW DIRETAMENTE
-- ==========================================

-- Buscar todos os chats do usuário logado
SELECT 
  id,
  ad_title,
  ad_price,
  buyer_name,
  seller_name,
  last_message,
  unread_count
FROM chats_full
WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
ORDER BY last_message_time DESC
LIMIT 10;

-- ==========================================
-- RESULTADO ESPERADO:
-- ✅ Lista de chats com preços preenchidos
-- ✅ Nomes de comprador e vendedor visíveis
-- ✅ Se ad_price = 0, investigar o anúncio
-- ==========================================

-- ==========================================
-- 8. VERIFICAR SE VIEW EXISTE E ESTÁ CORRETA
-- ==========================================

-- Ver definição da view
SELECT pg_get_viewdef('chats_full'::regclass, true);

-- Deve mostrar o SELECT que cria a view
-- IMPORTANTE: Os aliases devem usar snake_case (ad_price, buyer_name, etc.)

-- ==========================================
-- SE A VIEW TIVER NOMES ERRADOS (camelCase):
-- Execute o script: sql/FIX_VIEW_CHATS_FULL.sql
-- Ele vai recriar a VIEW com os nomes corretos
-- ==========================================

-- ==========================================
-- FIM DO SCRIPT DE DEBUG
-- ==========================================
