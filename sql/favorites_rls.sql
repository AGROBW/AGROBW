-- ============================================================================
-- POLÍTICAS RLS PARA TABELA FAVORITES
-- Data: 2026-03-01
-- Descrição: Políticas de segurança para favoritos
-- ============================================================================

-- Habilitar RLS na tabela favorites
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "Usuários podem ver seus próprios favoritos" ON public.favorites;
DROP POLICY IF EXISTS "Usuários podem adicionar favoritos" ON public.favorites;
DROP POLICY IF EXISTS "Usuários podem remover seus favoritos" ON public.favorites;

-- POLÍTICA 1: SELECT - Usuários podem ver seus próprios favoritos
CREATE POLICY "Usuários podem ver seus próprios favoritos"
ON public.favorites
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- POLÍTICA 2: INSERT - Usuários podem adicionar favoritos
CREATE POLICY "Usuários podem adicionar favoritos"
ON public.favorites
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- POLÍTICA 3: DELETE - Usuários podem remover seus favoritos
CREATE POLICY "Usuários podem remover seus favoritos"
ON public.favorites
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- COMENTÁRIOS
COMMENT ON TABLE public.favorites IS 'Tabela de favoritos dos usuários - controla quais anúncios foram salvos';
COMMENT ON COLUMN public.favorites.price_at_favorite IS 'Preço do anúncio no momento em que foi favoritado - usado para detectar oportunidades';
