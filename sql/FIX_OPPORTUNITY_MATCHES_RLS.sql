-- =====================================================
-- FIX: Corrigir RLS em opportunity_matches
-- =====================================================
-- Problema: Ao publicar anúncio, o trigger do Radar tenta criar matches
--           mas RLS bloqueia porque:
--           1. Não há política de INSERT
--           2. A função match_announcements_to_alerts não usa SECURITY DEFINER
-- Solução: 
--           1. Adicionar política de INSERT
--           2. Tornar funções do Radar SECURITY DEFINER para bypassar RLS

-- PARTE 1: Corrigir função match_announcements_to_alerts
-- =====================================================

-- Recriar função com SECURITY DEFINER
CREATE OR REPLACE FUNCTION match_announcements_to_alerts(p_announcement_id UUID)
RETURNS INTEGER 
LANGUAGE plpgsql
SECURITY DEFINER -- ← CRÍTICO: Permite bypass do RLS
SET search_path = public
AS $$
DECLARE
  v_announcement RECORD;
  v_alert RECORD;
  v_match_score INTEGER;
  v_match_reason JSONB;
  v_distance DECIMAL;
  v_matches_created INTEGER := 0;
BEGIN
  -- Buscar anúncio
  SELECT * INTO v_announcement
  FROM announcements
  WHERE id = p_announcement_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Loop através dos alertas ativos
  FOR v_alert IN
    SELECT oa.*, u.latitude as user_lat, u.longitude as user_lon
    FROM opportunity_alerts oa
    JOIN users u ON u.id = oa.user_id
    WHERE oa.status = 'ativo'
  LOOP
    v_match_score := 0;
    v_match_reason := '{}'::jsonb;

    -- Verificar categoria
    IF v_alert.category_id IS NOT NULL THEN
      IF v_announcement.category_id = v_alert.category_id THEN
        v_match_score := v_match_score + 30;
        v_match_reason := v_match_reason || jsonb_build_object('category', true);
      END IF;
    END IF;

    -- Verificar subcategoria (se especificada)
    IF v_alert.subcategory_id IS NOT NULL THEN
      IF v_announcement.sub_category_id = v_alert.subcategory_id THEN
        v_match_score := v_match_score + 20;
        v_match_reason := v_match_reason || jsonb_build_object('subcategory', true);
      END IF;
    END IF;

    -- Verificar preço
    IF v_alert.max_price IS NOT NULL THEN
      IF COALESCE(v_announcement.unit_price, v_announcement.price) <= v_alert.max_price THEN
        v_match_score := v_match_score + 25;
        v_match_reason := v_match_reason || jsonb_build_object('price', true);
      END IF;
    END IF;

    -- Verificar keywords (case-insensitive, qualquer uma)
    IF v_alert.keywords IS NOT NULL AND array_length(v_alert.keywords, 1) > 0 THEN
      FOR i IN 1..array_length(v_alert.keywords, 1) LOOP
        IF v_announcement.title ILIKE '%' || v_alert.keywords[i] || '%' 
           OR v_announcement.description ILIKE '%' || v_alert.keywords[i] || '%' THEN
          v_match_score := v_match_score + 15;
          v_match_reason := v_match_reason || jsonb_build_object('keywords', v_alert.keywords);
          EXIT; -- Não somar múltiplas vezes
        END IF;
      END LOOP;
    END IF;

    -- Verificar distância (se ambos tiverem coordenadas)
    IF v_announcement.latitude IS NOT NULL 
       AND v_announcement.longitude IS NOT NULL
       AND v_alert.user_lat IS NOT NULL 
       AND v_alert.user_lon IS NOT NULL
       AND v_alert.radius_km IS NOT NULL 
       AND v_alert.radius_km > 0 THEN
      
      -- Calcular distância usando fórmula Haversine
      v_distance := 6371 * acos(
        cos(radians(v_alert.user_lat)) * 
        cos(radians(v_announcement.latitude)) * 
        cos(radians(v_announcement.longitude) - radians(v_alert.user_lon)) + 
        sin(radians(v_alert.user_lat)) * 
        sin(radians(v_announcement.latitude))
      );

      IF v_distance <= v_alert.radius_km THEN
        v_match_score := v_match_score + 10;
        v_match_reason := v_match_reason || jsonb_build_object('distance_km', ROUND(v_distance, 1));
      END IF;
    END IF;

    -- Se score >= 50, criar match
    IF v_match_score >= 50 THEN
      INSERT INTO opportunity_matches (
        alert_id,
        announcement_id,
        user_id,
        match_score,
        match_reason,
        is_viewed,
        is_dismissed
      ) VALUES (
        v_alert.id,
        p_announcement_id,
        v_alert.user_id,
        LEAST(v_match_score, 100),
        v_match_reason,
        false,
        false
      )
      ON CONFLICT (alert_id, announcement_id) DO NOTHING;

      v_matches_created := v_matches_created + 1;

      -- Atualizar last_match_at
      UPDATE opportunity_alerts
      SET last_match_at = NOW()
      WHERE id = v_alert.id;
    END IF;
  END LOOP;

  RETURN v_matches_created;
END;
$$;

-- Comentário explicativo
COMMENT ON FUNCTION match_announcements_to_alerts(UUID) IS 
'Faz matching de um anúncio com alertas ativos. SECURITY DEFINER permite bypass de RLS para inserir matches automaticamente.';

-- PARTE 2: Adicionar Política de INSERT
-- =====================================================

-- 1. Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "Users can insert their own matches" ON opportunity_matches;
DROP POLICY IF EXISTS "System can insert matches" ON opportunity_matches;
DROP POLICY IF EXISTS "Allow insert for matching system" ON opportunity_matches;

-- 2. Criar política de INSERT
-- Esta política permite que matches sejam criados quando:
-- - O user_id do match corresponde ao usuário autenticado (dono do alerta)
-- - Ou via funções SECURITY DEFINER (sistema automático)
CREATE POLICY "Users can insert their own matches"
ON opportunity_matches FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Comentário explicativo
COMMENT ON POLICY "Users can insert their own matches" ON opportunity_matches IS 
'Permite inserção de matches quando o user_id corresponde ao usuário autenticado. Triggers do sistema usam SECURITY DEFINER para bypass.';

-- PARTE 3: Garantir que Trigger usa a função SQL
-- =====================================================

-- Recriar trigger usando a função SQL SECURITY DEFINER
DROP TRIGGER IF EXISTS on_announcement_published_sql ON announcements;
DROP TRIGGER IF EXISTS on_announcement_activated_sql ON announcements;
DROP TRIGGER IF EXISTS trigger_radar_match_on_publish ON announcements;
DROP TRIGGER IF EXISTS trigger_radar_match_on_activate ON announcements;

-- Função do trigger
CREATE OR REPLACE FUNCTION trigger_radar_matcher_sql()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas processar anúncios ativos
  IF NEW.status = 'ACTIVE' THEN
    -- Chamar função de matching (que também é SECURITY DEFINER)
    PERFORM match_announcements_to_alerts(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger para novos anúncios
CREATE TRIGGER trigger_radar_match_on_publish
AFTER INSERT ON announcements
FOR EACH ROW
WHEN (NEW.status = 'ACTIVE')
EXECUTE FUNCTION trigger_radar_matcher_sql();

-- Trigger para anúncios que mudam para ACTIVE
CREATE TRIGGER trigger_radar_match_on_activate
AFTER UPDATE OF status ON announcements
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ACTIVE')
EXECUTE FUNCTION trigger_radar_matcher_sql();

-- Comentários
COMMENT ON TRIGGER trigger_radar_match_on_publish ON announcements IS
'Cria matches automaticamente quando novo anúncio é publicado como ACTIVE';

COMMENT ON TRIGGER trigger_radar_match_on_activate ON announcements IS  
'Cria matches automaticamente quando anúncio muda status para ACTIVE';

-- PARTE 4: Verificações
-- =====================================================

-- Verificar políticas RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'opportunity_matches'
ORDER BY cmd, policyname;

-- Resultado esperado:
-- - SELECT: "Users can view their own matches"
-- - INSERT: "Users can insert their own matches" 
-- - UPDATE: "Users can update their own matches"

-- Verificar se RLS está ativo
SELECT 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE tablename = 'opportunity_matches';
-- Deve retornar rowsecurity = true

-- Verificar triggers ativos
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'announcements'
  AND trigger_name LIKE '%radar%'
ORDER BY trigger_name;

-- Resultado esperado:
-- - trigger_radar_match_on_publish (AFTER INSERT)
-- - trigger_radar_match_on_activate (AFTER UPDATE)

-- Verificar se função tem SECURITY DEFINER
SELECT 
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  CASE p.prosecdef 
    WHEN true THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('match_announcements_to_alerts', 'trigger_radar_matcher_sql')
  AND n.nspname = 'public';

-- Resultado esperado: Ambas funções devem ter SECURITY DEFINER

-- =====================================================
-- TESTE MANUAL (Opcional)
-- =====================================================
-- Para testar, publique um anúncio e verifique se matches foram criados:

-- 1. Verificar quantos alertas ativos existem
SELECT COUNT(*) as alertas_ativos FROM opportunity_alerts WHERE status = 'ativo';

-- 2. Após publicar um anúncio, verificar matches criados
-- SELECT * FROM opportunity_matches ORDER BY created_at DESC LIMIT 5;
