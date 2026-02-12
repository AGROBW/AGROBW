-- Função RPC para incrementar visualizações de anúncios
-- Esta função incrementa o contador de views na tabela announcements

-- Remover função antiga se existir (com nome antigo)
DROP FUNCTION IF EXISTS increment_ad_views(uuid);

-- Criar função atualizada para a tabela announcements
CREATE OR REPLACE FUNCTION increment_ad_views(ad_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Incrementar o contador de views
  UPDATE announcements
  SET views = COALESCE(views, 0) + 1
  WHERE id = ad_id;
  
  -- Log opcional para debug (remover em produção)
  RAISE NOTICE 'Views incrementado para anúncio: %', ad_id;
END;
$$;

-- Conceder permissões de execução para usuários autenticados e anônimos
GRANT EXECUTE ON FUNCTION increment_ad_views(uuid) TO anon;
GRANT EXECUTE ON FUNCTION increment_ad_views(uuid) TO authenticated;

-- Verificar se a função foi criada corretamente
SELECT proname, proargnames, proargtypes::regtype[]
FROM pg_proc
WHERE proname = 'increment_ad_views';
