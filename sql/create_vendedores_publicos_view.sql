-- View pública para dados do vendedor
-- Expõe apenas informações necessárias sem expor dados sensíveis
-- Esta view permite leitura pública sem precisar modificar policies de RLS na tabela users

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

-- Comentário explicativo
COMMENT ON VIEW vendedores_publicos IS 'View pública que expõe dados seguros do vendedor para exibição em anúncios';

-- Grant de leitura pública
GRANT SELECT ON vendedores_publicos TO anon, authenticated;
