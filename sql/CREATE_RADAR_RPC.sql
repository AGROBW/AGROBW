-- =====================================================
-- SOLUÇÃO DEFINITIVA: Criar função RPC para estatísticas
-- =====================================================
-- Views com RLS podem causar erro 406 no PostgREST
-- A solução é usar uma função RPC que retorna os mesmos dados
-- =====================================================

-- 1. Criar função que retorna as estatísticas do usuário
CREATE OR REPLACE FUNCTION get_radar_stats()
RETURNS TABLE (
  user_id UUID,
  total_alerts BIGINT,
  active_alerts BIGINT,
  total_matches BIGINT,
  unviewed_matches BIGINT,
  last_match_date TIMESTAMPTZ
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oa.user_id,
    COUNT(DISTINCT oa.id)::BIGINT as total_alerts,
    COUNT(DISTINCT CASE WHEN oa.status = 'ativo' THEN oa.id END)::BIGINT as active_alerts,
    COUNT(DISTINCT om.id)::BIGINT as total_matches,
    COUNT(DISTINCT CASE WHEN om.is_viewed = false THEN om.id END)::BIGINT as unviewed_matches,
    MAX(om.created_at) as last_match_date
  FROM opportunity_alerts oa
  LEFT JOIN opportunity_matches om ON om.alert_id = oa.id
  WHERE oa.user_id = auth.uid()  -- Filtro automático pelo usuário autenticado
  GROUP BY oa.user_id;
END;
$$;

-- 2. Garantir permissões
GRANT EXECUTE ON FUNCTION get_radar_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_radar_stats() TO anon;

-- 3. Adicionar comentário
COMMENT ON FUNCTION get_radar_stats() IS 'Retorna estatísticas de alertas e matches do usuário autenticado (via RPC)';

-- 4. Teste rápido
SELECT * FROM get_radar_stats();
