-- =====================================================
-- SYNC: category_group_id em anuncios e alertas
-- =====================================================
-- Garante que anuncios e alertas continuem sincronizados
-- com a hierarquia oficial, mesmo quando o front enviar
-- apenas a category_id real do banco.
-- =====================================================

CREATE OR REPLACE FUNCTION public.sync_category_group_id_from_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cgc.group_id
  INTO v_group_id
  FROM public.category_group_categories cgc
  WHERE cgc.category_id = NEW.category_id
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN
    NEW.category_group_id := v_group_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_announcement_category_group_id ON public.announcements;
CREATE TRIGGER trg_sync_announcement_category_group_id
BEFORE INSERT OR UPDATE OF category_id
ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.sync_category_group_id_from_category();

DROP TRIGGER IF EXISTS trg_sync_alert_category_group_id ON public.opportunity_alerts;
CREATE TRIGGER trg_sync_alert_category_group_id
BEFORE INSERT OR UPDATE OF category_id
ON public.opportunity_alerts
FOR EACH ROW
EXECUTE FUNCTION public.sync_category_group_id_from_category();

UPDATE public.announcements a
SET category_group_id = cgc.group_id
FROM public.category_group_categories cgc
WHERE a.category_id = cgc.category_id
  AND a.category_group_id IS DISTINCT FROM cgc.group_id;

UPDATE public.opportunity_alerts oa
SET category_group_id = cgc.group_id
FROM public.category_group_categories cgc
WHERE oa.category_id = cgc.category_id
  AND oa.category_group_id IS DISTINCT FROM cgc.group_id;

COMMENT ON FUNCTION public.sync_category_group_id_from_category() IS
'Mantem category_group_id sincronizado a partir da category_id em anuncios e alertas.';
