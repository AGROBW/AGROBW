-- =====================================================
-- Configurar RLS para announcement_clicks_by_state
-- =====================================================

-- 1. Ativar Row Level Security
ALTER TABLE announcement_clicks_by_state ENABLE ROW LEVEL SECURITY;

-- 2. Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "Anyone can insert clicks" ON announcement_clicks_by_state;
DROP POLICY IF EXISTS "Announcement owners can view their clicks" ON announcement_clicks_by_state;
DROP POLICY IF EXISTS "Public can insert click records" ON announcement_clicks_by_state;
DROP POLICY IF EXISTS "Users see only their announcement clicks" ON announcement_clicks_by_state;

-- 3. Política de INSERT (permitir a todos - visitantes anônimos e autenticados)
CREATE POLICY "Public can insert click records" 
  ON announcement_clicks_by_state 
  FOR INSERT 
  TO public 
  WITH CHECK (true);

-- 4. Política de SELECT (apenas donos do anúncio veem seus cliques)
CREATE POLICY "Users see only their announcement clicks"
  ON announcement_clicks_by_state 
  FOR SELECT
  TO authenticated
  USING (
    announcement_id IN (
      SELECT id FROM announcements WHERE user_id = auth.uid()
    )
  );

-- 5. Política de UPDATE (apenas donos do anúncio)
-- Na prática, o UPDATE só acontece via função RPC com SECURITY DEFINER
-- mas definimos a política por segurança
CREATE POLICY "Users can update their announcement clicks"
  ON announcement_clicks_by_state
  FOR UPDATE
  TO authenticated
  USING (
    announcement_id IN (
      SELECT id FROM announcements WHERE user_id = auth.uid()
    )
  );

-- Comentários
COMMENT ON POLICY "Public can insert click records" ON announcement_clicks_by_state IS
'Permite que qualquer visitante (anônimo ou autenticado) registre cliques para analytics';

COMMENT ON POLICY "Users see only their announcement clicks" ON announcement_clicks_by_state IS
'Garante privacidade: cada usuário vê apenas estatísticas dos próprios anúncios';
