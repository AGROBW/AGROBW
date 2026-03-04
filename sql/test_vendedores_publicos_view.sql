-- ============================================
-- Script de Teste: View vendedores_publicos
-- ============================================

-- 1. Criar a view (copie e execute tudo)
-- ============================================

CREATE OR REPLACE VIEW vendedores_publicos AS
SELECT 
  u.id,
  u.name,
  u.avatar,
  u.document_verified,
  a.city as cidade,
  a.state as estado
FROM users u
LEFT JOIN addresses a ON a.user_id = u.id AND a.is_primary = true;

COMMENT ON VIEW vendedores_publicos IS 'View pública que expõe dados seguros do vendedor para exibição em anúncios';

GRANT SELECT ON vendedores_publicos TO anon, authenticated;

-- 2. Verificar se a view foi criada
-- ============================================

SELECT 
  schemaname,
  viewname,
  viewowner
FROM pg_views
WHERE viewname = 'vendedores_publicos';

-- Resultado esperado: 1 linha mostrando a view

-- 3. Testar dados da view
-- ============================================

SELECT 
  id,
  name,
  avatar,
  document_verified,
  cidade,
  estado
FROM vendedores_publicos
LIMIT 10;

-- Resultado esperado: Lista de vendedores com seus dados

-- 4. Verificar permissões
-- ============================================

SELECT 
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'vendedores_publicos';

-- Resultado esperado: 
-- grantee: anon, privilege_type: SELECT
-- grantee: authenticated, privilege_type: SELECT

-- 5. Testar JOIN com announcements
-- ============================================

SELECT 
  a.id as anuncio_id,
  a.title as anuncio_titulo,
  a.status,
  v.name as vendedor_nome,
  v.avatar as vendedor_avatar,
  v.document_verified as vendedor_verificado,
  v.cidade as vendedor_cidade,
  v.estado as vendedor_estado
FROM announcements a
LEFT JOIN vendedores_publicos v ON v.id = a.user_id
WHERE a.status = 'ACTIVE'
ORDER BY a.created_at DESC
LIMIT 5;

-- Resultado esperado: Anúncios com dados dos vendedores

-- 6. Buscar vendedor específico (Bruno Henrique)
-- ============================================

SELECT 
  id,
  name,
  avatar,
  document_verified,
  cidade,
  estado
FROM vendedores_publicos
WHERE name ILIKE '%Bruno%Henrique%';

-- Resultado esperado: Dados do Bruno Henrique Morais Antunes

-- 7. Testar anúncios do Bruno Henrique
-- ============================================

SELECT 
  a.id,
  a.title,
  a.price,
  v.name as vendedor,
  v.document_verified as verificado,
  v.cidade,
  v.estado
FROM announcements a
LEFT JOIN vendedores_publicos v ON v.id = a.user_id
WHERE v.name ILIKE '%Bruno%Henrique%'
  AND a.status = 'ACTIVE';

-- Resultado esperado: Anúncios do Bruno com seus dados de vendedor

-- 8. Estatísticas de verificação
-- ============================================

SELECT 
  COUNT(*) as total_vendedores,
  COUNT(document_verified) FILTER (WHERE document_verified = true) as verificados,
  COUNT(document_verified) FILTER (WHERE document_verified = false) as nao_verificados,
  COUNT(avatar) as com_avatar,
  COUNT(cidade) as com_localizacao
FROM vendedores_publicos;

-- Resultado esperado: Estatísticas dos vendedores

-- 9. Testar performance
-- ============================================

EXPLAIN ANALYZE
SELECT 
  a.id,
  a.title,
  v.name,
  v.document_verified
FROM announcements a
LEFT JOIN vendedores_publicos v ON v.id = a.user_id
WHERE a.status = 'ACTIVE'
LIMIT 100;

-- Resultado esperado: Query plan com tempo de execução

-- ============================================
-- TODOS OS TESTES DEVEM PASSAR!
-- ============================================

-- Se algum teste falhar:
-- 1. Verifique se as tabelas 'users' e 'addresses' existem
-- 2. Verifique se o campo 'is_primary' existe em 'addresses'
-- 3. Verifique se o campo 'document_verified' existe em 'users'
-- 4. Execute o SQL de criação da coluna document_verified:
--    sql/add_document_verified_column.sql
