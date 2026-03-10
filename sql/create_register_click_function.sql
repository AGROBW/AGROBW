-- =====================================================
-- Função RPC para Registrar Cliques por Estado
-- =====================================================
-- Esta função registra ou incrementa cliques de um anúncio por estado
-- Usa UPSERT (INSERT ... ON CONFLICT) para evitar duplicatas

CREATE OR REPLACE FUNCTION register_click_by_state(
  p_announcement_id UUID,
  p_state VARCHAR(2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validar estado (sigla de 2 letras)
  IF p_state IS NULL OR LENGTH(p_state) != 2 THEN
    RAISE EXCEPTION 'Estado inválido: deve ter exatamente 2 caracteres';
  END IF;

  -- Inserir novo registro ou incrementar count se já existir
  INSERT INTO announcement_clicks_by_state (
    announcement_id, 
    state, 
    count
  )
  VALUES (
    p_announcement_id, 
    UPPER(p_state), -- Garantir uppercase
    1
  )
  ON CONFLICT (announcement_id, state)
  DO UPDATE SET 
    count = announcement_clicks_by_state.count + 1;
END;
$$;

-- Conceder permissões para usuários anônimos e autenticados
-- (Visitantes precisam poder registrar cliques mesmo sem login)
GRANT EXECUTE ON FUNCTION register_click_by_state(UUID, VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION register_click_by_state(UUID, VARCHAR) TO authenticated;

-- Comentário da função
COMMENT ON FUNCTION register_click_by_state(UUID, VARCHAR) IS 
'Registra ou incrementa o contador de cliques de um anúncio para um estado específico. Permite rastreamento anônimo para analytics.';
