-- ============================================
-- Sistema de Expiração Automática de Destaques
-- ============================================

-- FUNÇÃO: clean_expired_highlights
-- Limpa destaques expirados automaticamente
CREATE OR REPLACE FUNCTION clean_expired_highlights()
RETURNS void AS $$
BEGIN
  -- Limpar highlight_home expirados
  UPDATE announcements
  SET highlight_home = false
  WHERE highlight_home = true
    AND highlight_home_until IS NOT NULL
    AND highlight_home_until < NOW();

  -- Limpar highlight_category expirados
  UPDATE announcements
  SET highlight_category = false
  WHERE highlight_category = true
    AND highlight_category_until IS NOT NULL
    AND highlight_category_until < NOW();

  RAISE NOTICE 'Destaques expirados limpos com sucesso';
END;
$$ LANGUAGE plpgsql;

-- COMENTÁRIO DA FUNÇÃO
COMMENT ON FUNCTION clean_expired_highlights() IS 
'Limpa automaticamente os destaques expirados (highlight_home e highlight_category) '
'baseado nas colunas highlight_home_until e highlight_category_until. '
'Pode ser executado manualmente ou via cron job.';

-- ============================================
-- TRIGGER: Limpeza Automática em SELECT
-- ============================================

-- Função que executa antes de buscar anúncios
CREATE OR REPLACE FUNCTION check_and_clean_highlights_before_select()
RETURNS TRIGGER AS $$
BEGIN
  -- Verificar se o anúncio tem destaque home expirado
  IF NEW.highlight_home = true 
     AND NEW.highlight_home_until IS NOT NULL 
     AND NEW.highlight_home_until < NOW() THEN
    NEW.highlight_home := false;
  END IF;

  -- Verificar se o anúncio tem destaque categoria expirado
  IF NEW.highlight_category = true 
     AND NEW.highlight_category_until IS NOT NULL 
     AND NEW.highlight_category_until < NOW() THEN
    NEW.highlight_category := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS clean_highlights_on_change ON announcements;

CREATE TRIGGER clean_highlights_on_change
  BEFORE INSERT OR UPDATE
  ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION check_and_clean_highlights_before_select();

-- COMENTÁRIO DO TRIGGER
COMMENT ON TRIGGER clean_highlights_on_change ON announcements IS 
'Trigger que limpa automaticamente destaques expirados antes de INSERT ou UPDATE. '
'Garante que nenhum anúncio seja salvo com destaque expirado.';

-- ============================================
-- VIEW: Anúncios com Destaques Ativos
-- ============================================

CREATE OR REPLACE VIEW announcements_with_active_highlights AS
SELECT 
  *,
  -- Calcular se o destaque home está ativo
  CASE 
    WHEN highlight_home = true 
         AND (highlight_home_until IS NULL OR highlight_home_until > NOW())
    THEN true
    ELSE false
  END as is_home_highlight_active,
  
  -- Calcular se o destaque categoria está ativo
  CASE 
    WHEN highlight_category = true 
         AND (highlight_category_until IS NULL OR highlight_category_until > NOW())
    THEN true
    ELSE false
  END as is_category_highlight_active
FROM announcements;

-- COMENTÁRIO DA VIEW
COMMENT ON VIEW announcements_with_active_highlights IS 
'View que adiciona colunas calculadas indicando se os destaques estão ativos. '
'Útil para queries que precisam verificar status de destaque sem lógica complexa.';

-- ============================================
-- FUNÇÃO AGENDADA: Limpeza Periódica
-- ============================================

-- Esta função deve ser executada periodicamente (a cada 1 hora, por exemplo)
-- via cron job do Supabase ou scheduler externo

CREATE OR REPLACE FUNCTION scheduled_highlights_cleanup()
RETURNS TABLE(
  home_highlights_cleaned INTEGER,
  category_highlights_cleaned INTEGER,
  total_cleaned INTEGER
) AS $$
DECLARE
  home_count INTEGER;
  category_count INTEGER;
BEGIN
  -- Contar e limpar highlight_home expirados
  WITH cleaned_home AS (
    UPDATE announcements
    SET highlight_home = false
    WHERE highlight_home = true
      AND highlight_home_until IS NOT NULL
      AND highlight_home_until < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO home_count FROM cleaned_home;

  -- Contar e limpar highlight_category expirados
  WITH cleaned_category AS (
    UPDATE announcements
    SET highlight_category = false
    WHERE highlight_category = true
      AND highlight_category_until IS NOT NULL
      AND highlight_category_until < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO category_count FROM cleaned_category;

  -- Retornar estatísticas
  home_highlights_cleaned := home_count;
  category_highlights_cleaned := category_count;
  total_cleaned := home_count + category_count;

  RAISE NOTICE 'Limpeza executada: % destaques home, % destaques categoria, % total', 
    home_count, category_count, (home_count + category_count);

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- COMENTÁRIO DA FUNÇÃO
COMMENT ON FUNCTION scheduled_highlights_cleanup() IS 
'Função para execução periódica (cron) que limpa destaques expirados '
'e retorna estatísticas de quantos foram limpos.';

-- ============================================
-- EXECUTAR LIMPEZA IMEDIATA (UMA VEZ)
-- ============================================

-- Execute esta query para limpar todos os destaques expirados agora:
SELECT * FROM scheduled_highlights_cleanup();

-- Resultado esperado:
-- home_highlights_cleaned | category_highlights_cleaned | total_cleaned
-- 5                       | 3                           | 8

-- ============================================
-- VERIFICAÇÃO: Ver Destaques Expirados
-- ============================================

-- Ver anúncios com destaque home expirado (antes da limpeza)
SELECT 
  id,
  title,
  highlight_home,
  highlight_home_until,
  CASE 
    WHEN highlight_home_until < NOW() THEN 'EXPIRADO'
    ELSE 'ATIVO'
  END as status
FROM announcements
WHERE highlight_home = true
  AND highlight_home_until IS NOT NULL
ORDER BY highlight_home_until DESC;

-- Ver anúncios com destaque categoria expirado (antes da limpeza)
SELECT 
  id,
  title,
  highlight_category,
  highlight_category_until,
  CASE 
    WHEN highlight_category_until < NOW() THEN 'EXPIRADO'
    ELSE 'ATIVO'
  END as status
FROM announcements
WHERE highlight_category = true
  AND highlight_category_until IS NOT NULL
ORDER BY highlight_category_until DESC;

-- ============================================
-- CONFIGURAR CRON NO SUPABASE (PostgreSQL)
-- ============================================

-- Nota: Supabase não suporta pg_cron nativamente no plano free.
-- Para execução automática, use uma das opções:

-- OPÇÃO 1: Supabase Edge Function (recomendado)
-- Crie uma Edge Function que executa a cada hora:
/*
supabase functions new cleanup-highlights

// Conteúdo do arquivo index.ts:
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data, error } = await supabase.rpc('scheduled_highlights_cleanup')

  return new Response(JSON.stringify({ data, error }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// Deploy:
supabase functions deploy cleanup-highlights

// Agendar com cron-job.org ou similar apontando para a URL da função
*/

-- OPÇÃO 2: Webhook Externo (cron-job.org)
-- Configure um webhook POST para executar a função periodicamente

-- OPÇÃO 3: Executar Manualmente
-- Execute manualmente quando necessário:
-- SELECT * FROM scheduled_highlights_cleanup();

-- ============================================
-- TESTE DO SISTEMA
-- ============================================

-- TESTE 1: Criar anúncio com destaque expirado
INSERT INTO announcements (
  title,
  description,
  user_id,
  category_id,
  price,
  unit_price,
  status,
  city,
  state,
  highlight_home,
  highlight_home_until
)
VALUES (
  'Teste Destaque Expirado',
  'Este anúncio tem destaque expirado',
  'SEU-USER-ID',
  'SEU-CATEGORY-ID',
  10000,
  10000,
  'ACTIVE',
  'São Paulo',
  'SP',
  true,
  NOW() - INTERVAL '1 day' -- Expirado há 1 dia
)
RETURNING id, title, highlight_home, highlight_home_until;

-- Resultado esperado:
-- O trigger deve ter mudado highlight_home para false automaticamente

-- TESTE 2: Atualizar anúncio com destaque expirado
UPDATE announcements
SET description = 'Descrição atualizada'
WHERE id = 'ID-DO-ANUNCIO-TESTE';

-- Verificar se o destaque foi limpo:
SELECT id, title, highlight_home, highlight_home_until
FROM announcements
WHERE id = 'ID-DO-ANUNCIO-TESTE';

-- TESTE 3: Executar limpeza manual
SELECT * FROM scheduled_highlights_cleanup();

-- ============================================
-- ROLLBACK (se necessário)
-- ============================================

-- Para desativar o trigger:
-- DROP TRIGGER IF EXISTS clean_highlights_on_change ON announcements;

-- Para remover as funções:
-- DROP FUNCTION IF EXISTS check_and_clean_highlights_before_select();
-- DROP FUNCTION IF EXISTS clean_expired_highlights();
-- DROP FUNCTION IF EXISTS scheduled_highlights_cleanup();

-- Para remover a view:
-- DROP VIEW IF EXISTS announcements_with_active_highlights;

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================

/*
1. O trigger executa ANTES de INSERT/UPDATE, garantindo que dados expirados
   nunca sejam salvos com destaque ativo.

2. A função scheduled_highlights_cleanup() deve ser executada periodicamente
   (recomendado: a cada 1 hora) para limpar destaques que expiraram entre updates.

3. A view announcements_with_active_highlights facilita queries que precisam
   verificar se destaques estão ativos sem lógica complexa.

4. O sistema é completamente automático: anúncios com destaque expirado
   "caem" naturalmente para a seção "Publicados Recentemente" sem intervenção manual.

5. Para monitorar: execure SELECT * FROM scheduled_highlights_cleanup()
   periodicamente e veja quantos destaques foram limpos.
*/
