-- =====================================================
-- RADAR: Matching retroativo ao criar/editar alertas
-- =====================================================
-- Garante que um alerta ativo processe tambem anuncios
-- ja existentes que combinem com os filtros configurados.
-- =====================================================

CREATE OR REPLACE FUNCTION public.match_existing_announcements_to_alert(p_alert_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert RECORD;
  v_announcement RECORD;
  v_match_score INTEGER;
  v_match_reason JSONB;
  v_distance DECIMAL;
  v_matches_created INTEGER := 0;
  v_keyword_matched BOOLEAN;
  i INTEGER;
BEGIN
  SELECT
    oa.*,
    u.latitude AS user_lat,
    u.longitude AS user_lon
  INTO v_alert
  FROM public.opportunity_alerts oa
  JOIN public.users u ON u.id = oa.user_id
  WHERE oa.id = p_alert_id;

  IF NOT FOUND OR v_alert.status <> 'ativo' THEN
    RETURN 0;
  END IF;

  DELETE FROM public.opportunity_matches
  WHERE alert_id = v_alert.id;

  FOR v_announcement IN
    SELECT *
    FROM public.announcements
    WHERE status = 'ACTIVE'
  LOOP
    v_match_score := 0;
    v_match_reason := '{}'::jsonb;
    v_keyword_matched := false;

    IF v_alert.category_id IS NOT NULL THEN
      IF v_announcement.category_id = v_alert.category_id THEN
        v_match_score := v_match_score + 30;
        v_match_reason := v_match_reason || jsonb_build_object('category', true);
      ELSE
        CONTINUE;
      END IF;
    ELSIF v_alert.category_group_id IS NOT NULL THEN
      IF v_announcement.category_group_id = v_alert.category_group_id THEN
        v_match_score := v_match_score + 20;
        v_match_reason := v_match_reason || jsonb_build_object('category_group', true);
      ELSE
        CONTINUE;
      END IF;
    END IF;

    IF v_alert.subcategory_id IS NOT NULL THEN
      IF COALESCE(v_announcement.sub_category_id::text, '') = v_alert.subcategory_id::text THEN
        v_match_score := v_match_score + 20;
        v_match_reason := v_match_reason || jsonb_build_object('subcategory', true);
      ELSE
        CONTINUE;
      END IF;
    END IF;

    IF v_alert.state IS NOT NULL THEN
      IF v_announcement.state = v_alert.state THEN
        v_match_score := v_match_score + 20;
        v_match_reason := v_match_reason || jsonb_build_object('state', true);
      ELSE
        CONTINUE;
      END IF;
    END IF;

    IF v_alert.min_price IS NOT NULL OR v_alert.max_price IS NOT NULL THEN
      IF v_alert.min_price IS NOT NULL
         AND COALESCE(v_announcement.unit_price, v_announcement.price) < v_alert.min_price THEN
        CONTINUE;
      END IF;

      IF v_alert.max_price IS NOT NULL
         AND COALESCE(v_announcement.unit_price, v_announcement.price) > v_alert.max_price THEN
        CONTINUE;
      END IF;

      v_match_score := v_match_score + 25;
      v_match_reason := v_match_reason || jsonb_build_object('price', true);
    END IF;

    IF v_alert.keywords IS NOT NULL AND array_length(v_alert.keywords, 1) > 0 THEN
      FOR i IN 1..array_length(v_alert.keywords, 1) LOOP
        IF v_announcement.title ILIKE '%' || v_alert.keywords[i] || '%'
           OR COALESCE(v_announcement.description, '') ILIKE '%' || v_alert.keywords[i] || '%' THEN
          v_match_score := v_match_score + 15;
          v_match_reason := v_match_reason || jsonb_build_object('keywords', v_alert.keywords);
          v_keyword_matched := true;
          EXIT;
        END IF;
      END LOOP;

      IF NOT v_keyword_matched THEN
        CONTINUE;
      END IF;
    END IF;

    IF v_alert.radius_km IS NOT NULL AND v_alert.radius_km > 0 THEN
      IF v_announcement.latitude IS NOT NULL
         AND v_announcement.longitude IS NOT NULL
         AND v_alert.user_lat IS NOT NULL
         AND v_alert.user_lon IS NOT NULL THEN
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
        ELSE
          CONTINUE;
        END IF;
      ELSE
        CONTINUE;
      END IF;
    END IF;

    IF v_match_score > 0 THEN
      INSERT INTO public.opportunity_matches (
        alert_id,
        announcement_id,
        user_id,
        match_score,
        match_reason,
        is_viewed,
        is_dismissed
      ) VALUES (
        v_alert.id,
        v_announcement.id,
        v_alert.user_id,
        LEAST(v_match_score, 100),
        v_match_reason,
        false,
        false
      )
      ON CONFLICT (alert_id, announcement_id) DO NOTHING;

      v_matches_created := v_matches_created + 1;
    END IF;
  END LOOP;

  UPDATE public.opportunity_alerts
  SET last_match_at = NOW()
  WHERE id = v_alert.id;

  RETURN v_matches_created;
END;
$$;

COMMENT ON FUNCTION public.match_existing_announcements_to_alert(UUID) IS
'Processa anuncios ativos ja existentes para um alerta especifico, respeitando todos os filtros configurados.';

CREATE OR REPLACE FUNCTION public.trigger_match_existing_announcements_to_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ativo' THEN
    PERFORM public.match_existing_announcements_to_alert(NEW.id);
  ELSE
    DELETE FROM public.opportunity_matches
    WHERE alert_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_opportunity_alert_backfill_matches ON public.opportunity_alerts;

CREATE TRIGGER on_opportunity_alert_backfill_matches
AFTER INSERT OR UPDATE OF
  category_group_id,
  category_id,
  subcategory_id,
  state,
  radius_km,
  min_price,
  max_price,
  keywords,
  status
ON public.opportunity_alerts
FOR EACH ROW
EXECUTE FUNCTION public.trigger_match_existing_announcements_to_alert();

GRANT EXECUTE ON FUNCTION public.match_existing_announcements_to_alert(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_existing_announcements_to_alert(UUID) TO service_role;
