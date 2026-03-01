-- =====================================================
-- Dashboard Stats RPC Function
-- Retorna estatísticas agregadas para o Dashboard de Inteligência
-- =====================================================

-- Função principal: get_dashboard_stats
-- Retorna um objeto JSONB com todas as métricas do dashboard
-- @param p_announcement_id: ID opcional do anúncio para filtrar métricas individuais
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_announcement_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_total_ads INT;
  v_total_views BIGINT;
  v_total_leads INT;
  v_clicks_by_state JSONB;
  v_price_analysis JSONB;
  v_latest_ad_id UUID;
  v_user_price DECIMAL;
  v_market_avg DECIMAL;
  v_price_position TEXT;
  v_percentage DECIMAL;
BEGIN
  -- 1. Identificar usuário autenticado
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  -- 2. Total de anúncios ativos (case-insensitive)
  SELECT COUNT(*)
  INTO v_total_ads
  FROM announcements
  WHERE user_id = v_user_id 
    AND UPPER(status) = 'ACTIVE';

  -- 3. Total de visualizações (soma do campo views)
  -- Se p_announcement_id for fornecido, conta apenas desse anúncio
  IF p_announcement_id IS NOT NULL THEN
    SELECT COALESCE(views, 0)
    INTO v_total_views
    FROM announcements
    WHERE id = p_announcement_id
      AND user_id = v_user_id;
  ELSE
    SELECT COALESCE(SUM(views), 0)
    INTO v_total_views
    FROM announcements
    WHERE user_id = v_user_id;
  END IF;

  -- 4. Total de Leads gerados
  SELECT COUNT(*)
  INTO v_total_leads
  FROM leads
  WHERE seller_id = v_user_id;

  -- 5. Top 5 estados com mais cliques
  -- Somando cliques de todos os anúncios do usuário (ou apenas do anúncio específico), agrupando por estado
  IF p_announcement_id IS NOT NULL THEN
    -- Filtrar cliques apenas do anúncio específico
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'state', state,
          'clicks', total_clicks
        )
        ORDER BY total_clicks DESC
      ),
      '[]'::jsonb
    )
    INTO v_clicks_by_state
    FROM (
      SELECT 
        acs.state,
        SUM(acs.count) as total_clicks
      FROM announcement_clicks_by_state acs
      WHERE acs.announcement_id = p_announcement_id
      GROUP BY acs.state
      ORDER BY total_clicks DESC
      LIMIT 5
    ) top_states;
  ELSE
    -- Consolidar cliques de todos os anúncios do usuário
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'state', state,
          'clicks', total_clicks
        )
        ORDER BY total_clicks DESC
      ),
      '[]'::jsonb
    )
    INTO v_clicks_by_state
    FROM (
      SELECT 
        acs.state,
        SUM(acs.count) as total_clicks
      FROM announcement_clicks_by_state acs
      INNER JOIN announcements a ON a.id = acs.announcement_id
      WHERE a.user_id = v_user_id
      GROUP BY acs.state
      ORDER BY total_clicks DESC
      LIMIT 5
    ) top_states;
  END IF;

  -- 6. Análise de Preço (anúncio mais recente COM métricas, ou anúncio específico se fornecido)
  -- Se p_announcement_id for fornecido, busca obrigatoriamente esse anúncio
  IF p_announcement_id IS NOT NULL THEN
    -- Buscar anúncio específico
    SELECT 
      a.id, 
      a.price,
      am.market_avg_price,
      am.price_position
    INTO v_latest_ad_id, v_user_price, v_market_avg, v_price_position
    FROM announcements a
    LEFT JOIN announcement_metrics am ON am.announcement_id = a.id
    WHERE a.id = p_announcement_id
      AND a.user_id = v_user_id;
  ELSE
    -- Buscar o anúncio mais recente do usuário que possua métricas de mercado
    SELECT 
      a.id, 
      a.price,
      am.market_avg_price,
      am.price_position
    INTO v_latest_ad_id, v_user_price, v_market_avg, v_price_position
    FROM announcements a
    INNER JOIN announcement_metrics am ON am.announcement_id = a.id
    WHERE a.user_id = v_user_id 
      AND a.price IS NOT NULL 
      AND a.price > 0
      AND am.market_avg_price IS NOT NULL
      AND am.market_avg_price > 0
    ORDER BY a.created_at DESC
    LIMIT 1;
  END IF;

  -- Se encontrou anúncio com métricas, calcular análise
  IF v_latest_ad_id IS NOT NULL THEN
    -- Calcular percentual de posicionamento
    v_percentage := (v_user_price / v_market_avg) * 100;

    -- Montar objeto de análise de preço
    v_price_analysis := jsonb_build_object(
      'announcement_id', v_latest_ad_id,
      'user_price', v_user_price,
      'market_avg_price', v_market_avg,
      'price_position', v_price_position,
      'percentage', ROUND(v_percentage, 1),
      'has_market_data', true
    );
  ELSE
    -- Nenhum anúncio com métricas encontrado
    -- Buscar anúncio mais recente apenas com preço (para exibir mensagem de aguardo)
    SELECT id, price
    INTO v_latest_ad_id, v_user_price
    FROM announcements
    WHERE user_id = v_user_id 
      AND price IS NOT NULL 
      AND price > 0
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_latest_ad_id IS NOT NULL THEN
      -- Tem anúncio com preço mas sem métricas
      v_price_analysis := jsonb_build_object(
        'announcement_id', v_latest_ad_id,
        'user_price', v_user_price,
        'market_avg_price', NULL,
        'price_position', NULL,
        'percentage', NULL,
        'has_market_data', false
      );
    ELSE
      -- Nenhum anúncio com preço
      v_price_analysis := NULL;
    END IF;
  END IF;

  -- 7. Montar e retornar objeto final
  RETURN jsonb_build_object(
    'total_ads', v_total_ads,
    'total_views', v_total_views,
    'total_leads', v_total_leads,
    'clicks_by_state', COALESCE(v_clicks_by_state, '[]'::jsonb),
    'price_analysis', v_price_analysis,
    'home_highlights', (
      SELECT COUNT(*)
      FROM announcements
      WHERE user_id = v_user_id
        AND highlight_home = true
        AND UPPER(status) = 'ACTIVE'
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Em caso de erro, retornar estrutura vazia
    RETURN jsonb_build_object(
      'total_ads', 0,
      'total_views', 0,
      'total_leads', 0,
      'clicks_by_state', '[]'::jsonb,
      'price_analysis', NULL,
      'error', SQLERRM
    );
END;
$$;

-- Comentário para documentação
COMMENT ON FUNCTION get_dashboard_stats(UUID) IS 
'Retorna estatísticas agregadas do dashboard incluindo: total de anúncios ativos, visualizações, leads, cliques por estado e análise de preço comparativa. Aceita parâmetro opcional p_announcement_id para filtrar métricas de um anúncio específico.';

-- Grant de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO authenticated;
