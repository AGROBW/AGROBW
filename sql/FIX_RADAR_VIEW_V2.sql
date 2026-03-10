-- =====================================================
-- FIX ALTERNATIVO: Corrigir Erro 406 na View v_radar_stats
-- =====================================================
-- Este script usa uma abordagem mais robusta para criar a view
-- =====================================================

-- 1. Dropar a view se existir
DROP VIEW IF EXISTS public.v_radar_stats CASCADE;

-- 2. Criar a view no schema public explicitamente
-- COM security_invoker para respeitar as RLS policies do usuário
CREATE OR REPLACE VIEW public.v_radar_stats
WITH (security_invoker = on)
AS
SELECT 
  oa.user_id,
  COUNT(DISTINCT oa.id) as total_alerts,
  COUNT(DISTINCT CASE WHEN oa.status = 'ativo' THEN oa.id END) as active_alerts,
  COUNT(DISTINCT om.id) as total_matches,
  COUNT(DISTINCT CASE WHEN om.is_viewed = false THEN om.id END) as unviewed_matches,
  MAX(om.created_at) as last_match_date
FROM public.opportunity_alerts oa
LEFT JOIN public.opportunity_matches om ON om.alert_id = oa.id
GROUP BY oa.user_id;

-- 3. Garantir que não há RLS na view (views herdam RLS das tabelas base)
ALTER VIEW public.v_radar_stats SET (security_barrier = false);

-- 4. Adicionar comentário
COMMENT ON VIEW public.v_radar_stats IS 'Estatísticas agregadas de alertas e matches por usuário';

-- 5. Garantir permissões de acesso explícitas
GRANT SELECT ON public.v_radar_stats TO authenticated;
GRANT SELECT ON public.v_radar_stats TO anon;
GRANT SELECT ON public.v_radar_stats TO service_role;

-- 6. Verificar se foi criada corretamente
SELECT 
  schemaname,
  viewname,
  viewowner
FROM pg_views 
WHERE viewname = 'v_radar_stats';

-- 7. Verificar opções da view
SELECT 
  c.relname AS view_name,
  c.reloptions AS view_options
FROM pg_class c
WHERE c.relname = 'v_radar_stats' AND c.relkind = 'v';

-- 8. Teste rápido (deve retornar dados ou vazio, mas SEM erro)
SELECT * FROM public.v_radar_stats LIMIT 1;
