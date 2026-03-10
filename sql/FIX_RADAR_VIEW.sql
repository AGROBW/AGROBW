-- =====================================================
-- FIX: Corrigir Erro 406 na View v_radar_stats
-- =====================================================
-- Data: 09/03/2026
-- Descrição: Adiciona security_invoker e GRANT SELECT
-- =====================================================

-- Recriar view com security_invoker
DROP VIEW IF EXISTS v_radar_stats;

CREATE VIEW v_radar_stats
WITH (security_invoker = on)
AS
SELECT 
  oa.user_id,
  COUNT(DISTINCT oa.id) as total_alerts,
  COUNT(DISTINCT CASE WHEN oa.status = 'ativo' THEN oa.id END) as active_alerts,
  COUNT(DISTINCT om.id) as total_matches,
  COUNT(DISTINCT CASE WHEN om.is_viewed = false THEN om.id END) as unviewed_matches,
  MAX(om.created_at) as last_match_date
FROM opportunity_alerts oa
LEFT JOIN opportunity_matches om ON om.alert_id = oa.id
GROUP BY oa.user_id;

-- Garantir permissões de acesso
GRANT SELECT ON v_radar_stats TO authenticated;
GRANT SELECT ON v_radar_stats TO anon;

-- Comentário
COMMENT ON VIEW v_radar_stats IS 'Estatísticas agregadas de alertas e matches por usuário - com security_invoker';

-- Verificar se foi criada corretamente
SELECT 
  viewname,
  definition
FROM pg_views 
WHERE viewname = 'v_radar_stats';
