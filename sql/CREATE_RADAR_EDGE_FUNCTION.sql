-- =====================================================
-- EDGE FUNCTION: Radar Opportunity Matching
-- =====================================================
-- Trigger automático para criar matches quando um anúncio
-- corresponde aos critérios de um alerta ativo
-- =====================================================

-- PASSO 1: Criar a Edge Function (Deno/TypeScript)
-- Este código deve ser implementado no Supabase Edge Functions
-- Deploy: supabase functions deploy radar-matcher

/*
// arquivo: supabase/functions/radar-matcher/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { announcement_id } = await req.json()
    
    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Buscar dados do anúncio
    const { data: announcement, error: announcementError } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', announcement_id)
      .single()

    if (announcementError || !announcement) {
      throw new Error('Anúncio não encontrado')
    }

    // 2. Buscar todos os alertas ativos
    const { data: alerts, error: alertsError } = await supabase
      .from('opportunity_alerts')
      .select('*, users(latitude, longitude, cep)')
      .eq('status', 'ativo')

    if (alertsError || !alerts) {
      throw new Error('Erro ao buscar alertas')
    }

    // 3. Para cada alerta, verificar se o anúncio faz match
    const matches = []

    for (const alert of alerts) {
      let matchScore = 0
      const matchReason: any = {}

      // Verificar categoria
      if (alert.category_id) {
        if (announcement.category_id === alert.category_id) {
          matchScore += 30
          matchReason.category = true
        } else {
          continue // Não faz match, pular
        }
      } else {
        matchScore += 10 // Bonus por aceitar qualquer categoria
      }

      // Verificar estado
      if (alert.state) {
        if (announcement.state === alert.state) {
          matchScore += 20
          matchReason.state = true
        } else {
          continue // Não faz match, pular
        }
      } else {
        matchScore += 5
      }

      // Verificar raio de distância (se configurado e se houver coordenadas)
      if (alert.radius_km > 0 && alert.users?.latitude && announcement.latitude) {
        const distance = calculateDistance(
          alert.users.latitude,
          alert.users.longitude,
          announcement.latitude,
          announcement.longitude
        )

        if (distance <= alert.radius_km) {
          matchScore += 25
          matchReason.distance_km = Math.round(distance)
        } else {
          continue // Fora do raio, pular
        }
      }

      // Verificar faixa de preço
      if (alert.min_price || alert.max_price) {
        const price = announcement.price || announcement.unit_price || 0

        if (alert.min_price && price < alert.min_price) {
          continue // Preço abaixo do mínimo, pular
        }

        if (alert.max_price && price > alert.max_price) {
          continue // Preço acima do máximo, pular
        }

        matchScore += 15
        matchReason.price = true
      }

      // Verificar palavras-chave
      if (alert.keywords && alert.keywords.length > 0) {
        const text = `${announcement.title} ${announcement.description}`.toLowerCase()
        const matchedKeywords = []

        for (const keyword of alert.keywords) {
          if (text.includes(keyword.toLowerCase())) {
            matchedKeywords.push(keyword)
          }
        }

        if (matchedKeywords.length > 0) {
          matchScore += 10 * matchedKeywords.length
          matchReason.keywords = matchedKeywords
        } else if (alert.keywords.length > 0) {
          // Se tem keywords configuradas mas nenhuma bateu, descartar
          continue
        }
      }

      // Se chegou aqui, é um match! Adicionar à lista
      if (matchScore >= 50) { // Score mínimo para considerar match
        matches.push({
          alert_id: alert.id,
          announcement_id: announcement_id,
          user_id: alert.user_id,
          match_score: Math.min(matchScore, 100), // Cap em 100
          match_reason: matchReason,
          is_viewed: false,
          is_dismissed: false
        })
      }
    }

    // 4. Inserir matches no banco
    if (matches.length > 0) {
      const { error: insertError } = await supabase
        .from('opportunity_matches')
        .insert(matches)

      if (insertError) {
        console.error('Erro ao inserir matches:', insertError)
      }

      // 5. Atualizar last_match_at nos alertas
      const alertIds = matches.map(m => m.alert_id)
      await supabase
        .from('opportunity_alerts')
        .update({ last_match_at: new Date().toISOString() })
        .in('id', alertIds)
    }

    return new Response(
      JSON.stringify({
        success: true,
        announcement_id,
        matches_created: matches.length
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

//Helper: Calcular distância (Haversine)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}
*/

-- PASSO 2: Criar Trigger no PostgreSQL para chamar a Edge Function

-- Função que será chamada pelo trigger
CREATE OR REPLACE FUNCTION trigger_radar_matcher()
RETURNS TRIGGER AS $$
DECLARE
  function_url TEXT;
  payload JSONB;
BEGIN
  -- Apenas processar anúncios ativos
  IF NEW.status = 'ACTIVE' THEN
    -- Construir URL da Edge Function
    function_url := current_setting('app.settings.edge_function_url', true) || '/radar-matcher';
    
    -- Construir payload
    payload := jsonb_build_object('announcement_id', NEW.id);
    
    -- Chamar Edge Function de forma assíncrona usando pg_net (se disponível)
    -- Nota: pg_net precisa estar instalado no Supabase
    PERFORM net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := payload
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para novos anúncios
DROP TRIGGER IF EXISTS on_announcement_published ON announcements;
CREATE TRIGGER on_announcement_published
AFTER INSERT ON announcements
FOR EACH ROW
EXECUTE FUNCTION trigger_radar_matcher();

-- Criar trigger para anúncios que mudam de status para ACTIVE
DROP TRIGGER IF EXISTS on_announcement_activated ON announcements;
CREATE TRIGGER on_announcement_activated
AFTER UPDATE OF status ON announcements
FOR EACH ROW
WHEN (OLD.status != 'ACTIVE' AND NEW.status = 'ACTIVE')
EXECUTE FUNCTION trigger_radar_matcher();

-- Criar trigger para reduções de preço significativas (>20%)
CREATE OR REPLACE FUNCTION trigger_radar_matcher_price_drop()
RETURNS TRIGGER AS $$
DECLARE
  price_reduction_pct DECIMAL;
  function_url TEXT;
  payload JSONB;
BEGIN
  -- Calcular percentual de redução
  IF OLD.price > 0 AND NEW.price > 0 THEN
    price_reduction_pct := ((OLD.price - NEW.price) / OLD.price) * 100;
    
    -- Se redução >= 20%, disparar matching novamente
    IF price_reduction_pct >= 20 THEN
      function_url := current_setting('app.settings.edge_function_url', true) || '/radar-matcher';
      payload := jsonb_build_object('announcement_id', NEW.id, 'event', 'price_drop');
      
      PERFORM net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := payload
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_announcement_price_drop ON announcements;
CREATE TRIGGER on_announcement_price_drop
AFTER UPDATE OF price ON announcements
FOR EACH ROW
WHEN (NEW.status = 'ACTIVE')
EXECUTE FUNCTION trigger_radar_matcher_price_drop();


-- =====================================================
-- CONFIGURAÇÃO: Definir variáveis no Supabase Dashboard
-- =====================================================
-- Vá em: Settings > Database > Configuration
-- Adicione:
-- app.settings.edge_function_url = 'https://seu-projeto.supabase.co/functions/v1'
-- app.settings.service_role_key = 'sua-service-role-key'
-- =====================================================


-- =====================================================
-- ALTERNATIVA: Matching via Database Function (sem Edge Function)
-- =====================================================
-- Se não quiser usar Edge Functions, pode implementar tudo em SQL puro

CREATE OR REPLACE FUNCTION match_announcements_to_alerts(p_announcement_id UUID)
RETURNS INTEGER AS $$
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
        v_match_reason := v_match_reason || '{"category": true}'::jsonb;
      ELSE
        CONTINUE; -- Não faz match
      END IF;
    ELSE
      v_match_score := v_match_score + 10;
    END IF;

    -- Verificar estado
    IF v_alert.state IS NOT NULL THEN
      IF v_announcement.state = v_alert.state THEN
        v_match_score := v_match_score + 20;
        v_match_reason := v_match_reason || '{"state": true}'::jsonb;
      ELSE
        CONTINUE;
      END IF;
    ELSE
      v_match_score := v_match_score + 5;
    END IF;

    -- Verificar raio
    IF v_alert.radius_km > 0 AND v_alert.user_lat IS NOT NULL AND v_announcement.latitude IS NOT NULL THEN
      v_distance := calculate_distance_km(
        v_alert.user_lat, v_alert.user_lon,
        v_announcement.latitude, v_announcement.longitude
      );

      IF v_distance <= v_alert.radius_km THEN
        v_match_score := v_match_score + 25;
        v_match_reason := v_match_reason || jsonb_build_object('distance_km', ROUND(v_distance));
      ELSE
        CONTINUE;
      END IF;
    END IF;

    -- Verificar preço
    IF v_alert.min_price IS NOT NULL OR v_alert.max_price IS NOT NULL THEN
      IF v_alert.min_price IS NOT NULL AND v_announcement.price < v_alert.min_price THEN
        CONTINUE;
      END IF;
      IF v_alert.max_price IS NOT NULL AND v_announcement.price > v_alert.max_price THEN
        CONTINUE;
      END IF;
      v_match_score := v_match_score + 15;
      v_match_reason := v_match_reason || '{"price": true}'::jsonb;
    END IF;

    -- Verificar keywords
    IF v_alert.keywords IS NOT NULL AND array_length(v_alert.keywords, 1) > 0 THEN
      DECLARE
        v_text TEXT;
        v_keyword TEXT;
        v_matched_keywords TEXT[] := ARRAY[]::TEXT[];
      BEGIN
        v_text := LOWER(v_announcement.title || ' ' || v_announcement.description);
        
        FOREACH v_keyword IN ARRAY v_alert.keywords LOOP
          IF v_text LIKE '%' || LOWER(v_keyword) || '%' THEN
            v_matched_keywords := array_append(v_matched_keywords, v_keyword);
          END IF;
        END LOOP;

        IF array_length(v_matched_keywords, 1) > 0 THEN
          v_match_score := v_match_score + (10 * array_length(v_matched_keywords, 1));
          v_match_reason := v_match_reason || jsonb_build_object('keywords', v_matched_keywords);
        ELSE
          CONTINUE; -- Tem keywords mas nenhuma bateu
        END IF;
      END;
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
$$ LANGUAGE plpgsql;

-- Trigger usando a função SQL
CREATE OR REPLACE FUNCTION trigger_radar_matcher_sql()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    PERFORM match_announcements_to_alerts(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Você pode usar este trigger em vez dos anteriores
-- DROP TRIGGER IF EXISTS on_announcement_published_sql ON announcements;
-- CREATE TRIGGER on_announcement_published_sql
-- AFTER INSERT OR UPDATE ON announcements
-- FOR EACH ROW
-- WHEN (NEW.status = 'ACTIVE')
-- EXECUTE FUNCTION trigger_radar_matcher_sql();


-- =====================================================
-- FIM DO SCRIPT
-- =====================================================
