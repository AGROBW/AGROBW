-- =====================================================
-- TRIGGER: Criar notificação quando radar match é criado
-- =====================================================
-- Descrição:
--   Quando um radar match é criado com score >= 50 (e não dismissed),
--   cria automaticamente uma notificação para o usuário.
--
-- Tabelas relacionadas:
--   - opportunity_matches (fonte do trigger)
--   - notifications (destino)
--   - announcements (para buscar detalhes do anúncio)
--   - categories (para buscar nome da categoria)
--
-- Execução:
--   Execute este script no Supabase SQL Editor
-- =====================================================

-- Remover trigger e função existentes (se houver)
DROP TRIGGER IF EXISTS on_radar_match_notify ON opportunity_matches;
DROP FUNCTION IF EXISTS create_radar_match_notification();

-- Criar função que cria notificação
CREATE OR REPLACE FUNCTION create_radar_match_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_announcement_title TEXT;
  v_announcement_category TEXT;
  v_alert_name TEXT;
  v_match_score INTEGER;
BEGIN
  -- Apenas criar notificação se:
  -- 1. Score >= 50 (já é critério do radar, mas validamos aqui também)
  -- 2. Match não foi dismissed
  -- 3. Match não foi viewed (evitar duplicatas se usuário já viu)
  IF NEW.match_score < 50 OR NEW.is_dismissed OR NEW.is_viewed THEN
    RETURN NEW;
  END IF;

  -- Buscar dados do anúncio e categoria
  SELECT 
    a.title, 
    COALESCE(c.name, 'Produtos Agro')
  INTO 
    v_announcement_title, 
    v_announcement_category
  FROM announcements a
  LEFT JOIN categories c ON c.id = a.category_id
  WHERE a.id = NEW.announcement_id;

  -- Se anúncio não encontrado, não criar notificação
  IF v_announcement_title IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do alerta (se disponível)
  SELECT name INTO v_alert_name
  FROM opportunity_alerts
  WHERE id = NEW.alert_id;

  -- Valor do score (arredondado)
  v_match_score := NEW.match_score;

  -- Criar notificação
  INSERT INTO notifications (
    user_id,
    type,
    title,
    content,
    link,
    is_read,
    created_at
  ) VALUES (
    NEW.user_id,
    'radar_match',
    '🎯 Nova oportunidade: ' || SUBSTRING(v_announcement_title, 1, 50),
    'O Radar de Oportunidades encontrou um anúncio de ' || 
    v_announcement_category || 
    ' que corresponde aos critérios do seu alerta' ||
    CASE 
      WHEN v_alert_name IS NOT NULL THEN ' "' || v_alert_name || '"'
      ELSE ''
    END ||
    '. Score de compatibilidade: ' || v_match_score || '/100.',
    '/anuncio/' || NEW.announcement_id::text,
    false,
    NOW()
  )
  ON CONFLICT DO NOTHING; -- Evitar duplicatas se trigger rodar múltiplas vezes

  RETURN NEW;
END;
$$;

-- Criar trigger (dispara APÓS INSERT em opportunity_matches)
CREATE TRIGGER on_radar_match_notify
AFTER INSERT ON opportunity_matches
FOR EACH ROW
EXECUTE FUNCTION create_radar_match_notification();

-- Comentários para documentação
COMMENT ON FUNCTION create_radar_match_notification() IS 
'Cria notificação automática quando radar match é criado (score >= 50, não dismissed, não viewed)';

COMMENT ON TRIGGER on_radar_match_notify ON opportunity_matches IS
'Dispara notificação para usuário quando novo radar match é detectado';

-- =====================================================
-- Mensagem de sucesso
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Trigger de notificação de radar match criado com sucesso!';
  RAISE NOTICE 'Agora, sempre que um match for criado com score >= 50:';
  RAISE NOTICE '  1. Uma notificação será inserida automaticamente';
  RAISE NOTICE '  2. O badge de notificações será atualizado em real-time';
  RAISE NOTICE '  3. O usuário poderá visualizar no Modal de Notificações';
END $$;
