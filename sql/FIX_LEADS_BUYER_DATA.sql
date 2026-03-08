-- ==========================================
-- FIX: Preencher dados do comprador em leads existentes
-- ==========================================
-- 
-- PROBLEMA: Leads com buyer_name, buyer_email, buyer_phone, buyer_cep vazios/nulos
-- SOLUÇÃO: Buscar dados da tabela users usando buyer_id e atualizar
-- ==========================================

-- 1. VERIFICAR LEADS COM DADOS VAZIOS/NULOS
-- ==========================================

SELECT 
  l.id,
  l.buyer_id,
  l.buyer_name,
  l.buyer_email,
  l.buyer_phone,
  l.buyer_cep,
  u.name as user_name,
  u.email as user_email,
  u.phone as user_phone,
  u.cep as user_cep,
  l.created_at
FROM leads l
LEFT JOIN users u ON u.id = l.buyer_id
WHERE 
  l.buyer_name IS NULL 
  OR l.buyer_name = '' 
  OR l.buyer_email IS NULL 
  OR l.buyer_email = ''
ORDER BY l.created_at DESC;

-- ==========================================
-- 2. ATUALIZAR LEADS COM DADOS DA TABELA USERS
-- ==========================================

-- Atualizar buyer_name (usar name do users ou email até @)
UPDATE leads l
SET buyer_name = COALESCE(
  u.name,
  SPLIT_PART(u.email, '@', 1),
  'Comprador'
)
FROM users u
WHERE l.buyer_id = u.id
  AND (l.buyer_name IS NULL OR l.buyer_name = '');

-- Atualizar buyer_email
UPDATE leads l
SET buyer_email = COALESCE(u.email, '')
FROM users u
WHERE l.buyer_id = u.id
  AND (l.buyer_email IS NULL OR l.buyer_email = '');

-- Atualizar buyer_phone (usar phone ou whatsapp)
UPDATE leads l
SET buyer_phone = COALESCE(u.phone, u.whatsapp)
FROM users u
WHERE l.buyer_id = u.id
  AND l.buyer_phone IS NULL;

-- Atualizar buyer_cep
UPDATE leads l
SET buyer_cep = u.cep
FROM users u
WHERE l.buyer_id = u.id
  AND l.buyer_cep IS NULL
  AND u.cep IS NOT NULL;

-- ==========================================
-- 3. VERIFICAR RESULTADOS
-- ==========================================

SELECT 
  COUNT(*) as total_leads,
  COUNT(CASE WHEN buyer_name IS NOT NULL AND buyer_name != '' THEN 1 END) as com_nome,
  COUNT(CASE WHEN buyer_email IS NOT NULL AND buyer_email != '' THEN 1 END) as com_email,
  COUNT(CASE WHEN buyer_phone IS NOT NULL THEN 1 END) as com_phone,
  COUNT(CASE WHEN buyer_cep IS NOT NULL THEN 1 END) as com_cep
FROM leads;

-- ==========================================
-- 4. MOSTRAR LEADS ATUALIZADOS
-- ==========================================

SELECT 
  id,
  buyer_name,
  buyer_email,
  buyer_phone,
  buyer_cep,
  created_at
FROM leads
ORDER BY created_at DESC
LIMIT 10;

-- ==========================================
-- NOTAS IMPORTANTES:
-- ==========================================
-- 1. Este script não afeta leads que já têm dados preenchidos
-- 2. Usa COALESCE para fallback de valores
-- 3. Se o usuário não tiver name, usa a parte antes do @ do email
-- 4. Para phone, tenta phone primeiro, depois whatsapp
-- 5. CEP só é preenchido se o usuário tiver cadastrado
