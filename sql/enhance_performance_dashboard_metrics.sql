-- Atualiza a RPC get_dashboard_stats com metricas de conversao,
-- favoritos, ranking de anuncios e alertas de atencao.

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
  v_total_favorites INT;
  v_conversion_rate NUMERIC;
  v_clicks_by_state JSONB;
  v_price_analysis JSONB;
  v_top_ads_by_views JSONB;
  v_top_ads_by_leads JSONB;
  v_attention_ads JSONB;
  v_latest_ad_id UUID;
  v_user_price DECIMAL;
  v_market_avg DECIMAL;
  v_price_position TEXT;
  v_percentage DECIMAL;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado';
  END IF;

  SELECT COUNT(*)
  INTO v_total_ads
  FROM announcements
  WHERE user_id = v_user_id
    AND UPPER(status) = 'ACTIVE';

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

  SELECT COUNT(*)
  INTO v_total_leads
  FROM leads
  WHERE seller_id = v_user_id;

  SELECT COUNT(*)
  INTO v_total_favorites
  FROM favorites f
  INNER JOIN announcements a ON a.id = f.announcement_id
  WHERE a.user_id = v_user_id;

  v_conversion_rate := CASE
    WHEN COALESCE(v_total_views, 0) > 0
      THEN ROUND((v_total_leads::NUMERIC / v_total_views::NUMERIC) * 100, 1)
    ELSE 0
  END;

  IF p_announcement_id IS NOT NULL THEN
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
        SUM(acs.count) AS total_clicks
      FROM announcement_clicks_by_state acs
      WHERE acs.announcement_id = p_announcement_id
      GROUP BY acs.state
      ORDER BY total_clicks DESC
      LIMIT 5
    ) top_states;
  ELSE
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
        SUM(acs.count) AS total_clicks
      FROM announcement_clicks_by_state acs
      INNER JOIN announcements a ON a.id = acs.announcement_id
      WHERE a.user_id = v_user_id
      GROUP BY acs.state
      ORDER BY total_clicks DESC
      LIMIT 5
    ) top_states;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'announcement_id', ranked.announcement_id,
        'title', ranked.title,
        'status', ranked.status,
        'views', ranked.views,
        'leads', ranked.leads,
        'favorites_count', ranked.favorites_count,
        'conversion_rate', ranked.conversion_rate
      )
      ORDER BY ranked.views DESC, ranked.leads DESC, ranked.favorites_count DESC, ranked.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_top_ads_by_views
  FROM (
    SELECT
      a.id AS announcement_id,
      a.title,
      a.status,
      a.created_at,
      COALESCE(a.views, 0) AS views,
      COALESCE(l.leads_count, 0) AS leads,
      COALESCE(f.favorites_count, 0) AS favorites_count,
      CASE
        WHEN COALESCE(a.views, 0) > 0
          THEN ROUND((COALESCE(l.leads_count, 0)::NUMERIC / COALESCE(a.views, 0)::NUMERIC) * 100, 1)
        ELSE 0
      END AS conversion_rate
    FROM announcements a
    LEFT JOIN (
      SELECT announcement_id, COUNT(*) AS leads_count
      FROM leads
      GROUP BY announcement_id
    ) l ON l.announcement_id = a.id
    LEFT JOIN (
      SELECT announcement_id, COUNT(*) AS favorites_count
      FROM favorites
      GROUP BY announcement_id
    ) f ON f.announcement_id = a.id
    WHERE a.user_id = v_user_id
    ORDER BY COALESCE(a.views, 0) DESC, COALESCE(l.leads_count, 0) DESC, a.created_at DESC
    LIMIT 5
  ) ranked;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'announcement_id', ranked.announcement_id,
        'title', ranked.title,
        'status', ranked.status,
        'views', ranked.views,
        'leads', ranked.leads,
        'favorites_count', ranked.favorites_count,
        'conversion_rate', ranked.conversion_rate
      )
      ORDER BY ranked.leads DESC, ranked.views DESC, ranked.favorites_count DESC, ranked.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_top_ads_by_leads
  FROM (
    SELECT
      a.id AS announcement_id,
      a.title,
      a.status,
      a.created_at,
      COALESCE(a.views, 0) AS views,
      COALESCE(l.leads_count, 0) AS leads,
      COALESCE(f.favorites_count, 0) AS favorites_count,
      CASE
        WHEN COALESCE(a.views, 0) > 0
          THEN ROUND((COALESCE(l.leads_count, 0)::NUMERIC / COALESCE(a.views, 0)::NUMERIC) * 100, 1)
        ELSE 0
      END AS conversion_rate
    FROM announcements a
    LEFT JOIN (
      SELECT announcement_id, COUNT(*) AS leads_count
      FROM leads
      GROUP BY announcement_id
    ) l ON l.announcement_id = a.id
    LEFT JOIN (
      SELECT announcement_id, COUNT(*) AS favorites_count
      FROM favorites
      GROUP BY announcement_id
    ) f ON f.announcement_id = a.id
    WHERE a.user_id = v_user_id
    ORDER BY COALESCE(l.leads_count, 0) DESC, COALESCE(a.views, 0) DESC, a.created_at DESC
    LIMIT 5
  ) ranked;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'announcement_id', attention.announcement_id,
        'title', attention.title,
        'status', attention.status,
        'views', attention.views,
        'leads', attention.leads,
        'favorites_count', attention.favorites_count,
        'reason', attention.reason
      )
      ORDER BY attention.priority DESC, attention.views DESC, attention.favorites_count DESC, attention.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_attention_ads
  FROM (
    SELECT *
    FROM (
      SELECT
        a.id AS announcement_id,
        a.title,
        a.status,
        a.created_at,
        COALESCE(a.views, 0) AS views,
        COALESCE(l.leads_count, 0) AS leads,
        COALESCE(f.favorites_count, 0) AS favorites_count,
        CASE
          WHEN COALESCE(a.views, 0) >= 20 AND COALESCE(l.leads_count, 0) = 0
            THEN 'Muitas visualizacoes e nenhum lead. Vale revisar preco, imagens ou descricao.'
          WHEN UPPER(a.status) = 'ACTIVE' AND COALESCE(a.views, 0) = 0
            THEN 'Anuncio ativo sem visualizacoes. Considere melhorar titulo, categoria ou exposicao.'
          WHEN COALESCE(f.favorites_count, 0) >= 3 AND COALESCE(l.leads_count, 0) = 0
            THEN 'Recebeu favoritos, mas ainda nao gerou contato. Pode haver resistencia de preco ou confianca.'
          ELSE NULL
        END AS reason,
        CASE
          WHEN COALESCE(a.views, 0) >= 20 AND COALESCE(l.leads_count, 0) = 0 THEN 3
          WHEN COALESCE(f.favorites_count, 0) >= 3 AND COALESCE(l.leads_count, 0) = 0 THEN 2
          WHEN UPPER(a.status) = 'ACTIVE' AND COALESCE(a.views, 0) = 0 THEN 1
          ELSE 0
        END AS priority
      FROM announcements a
      LEFT JOIN (
        SELECT announcement_id, COUNT(*) AS leads_count
        FROM leads
        GROUP BY announcement_id
      ) l ON l.announcement_id = a.id
      LEFT JOIN (
        SELECT announcement_id, COUNT(*) AS favorites_count
        FROM favorites
        GROUP BY announcement_id
      ) f ON f.announcement_id = a.id
      WHERE a.user_id = v_user_id
    ) base_attention
    WHERE base_attention.reason IS NOT NULL
    LIMIT 5
  ) attention;

  IF p_announcement_id IS NOT NULL THEN
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

  IF v_latest_ad_id IS NOT NULL THEN
    v_percentage := (v_user_price / v_market_avg) * 100;

    v_price_analysis := jsonb_build_object(
      'announcement_id', v_latest_ad_id,
      'user_price', v_user_price,
      'market_avg_price', v_market_avg,
      'price_position', v_price_position,
      'percentage', ROUND(v_percentage, 1),
      'has_market_data', true
    );
  ELSE
    SELECT id, price
    INTO v_latest_ad_id, v_user_price
    FROM announcements
    WHERE user_id = v_user_id
      AND price IS NOT NULL
      AND price > 0
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_latest_ad_id IS NOT NULL THEN
      v_price_analysis := jsonb_build_object(
        'announcement_id', v_latest_ad_id,
        'user_price', v_user_price,
        'market_avg_price', NULL,
        'price_position', NULL,
        'percentage', NULL,
        'has_market_data', false
      );
    ELSE
      v_price_analysis := NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'total_ads', v_total_ads,
    'total_views', v_total_views,
    'total_leads', v_total_leads,
    'total_favorites', COALESCE(v_total_favorites, 0),
    'conversion_rate', COALESCE(v_conversion_rate, 0),
    'clicks_by_state', COALESCE(v_clicks_by_state, '[]'::jsonb),
    'price_analysis', v_price_analysis,
    'top_ads_by_views', COALESCE(v_top_ads_by_views, '[]'::jsonb),
    'top_ads_by_leads', COALESCE(v_top_ads_by_leads, '[]'::jsonb),
    'attention_ads', COALESCE(v_attention_ads, '[]'::jsonb),
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
    RETURN jsonb_build_object(
      'total_ads', 0,
      'total_views', 0,
      'total_leads', 0,
      'total_favorites', 0,
      'conversion_rate', 0,
      'clicks_by_state', '[]'::jsonb,
      'price_analysis', NULL,
      'top_ads_by_views', '[]'::jsonb,
      'top_ads_by_leads', '[]'::jsonb,
      'attention_ads', '[]'::jsonb,
      'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION get_dashboard_stats(UUID) IS
'Retorna estatisticas agregadas do painel incluindo total de anuncios ativos, visualizacoes, leads, favoritos, taxa de conversao, cliques por estado, ranking de anuncios e analise de preco comparativa. Aceita parametro opcional p_announcement_id para filtrar metricas de um anuncio especifico.';

GRANT EXECUTE ON FUNCTION get_dashboard_stats(UUID) TO authenticated;
