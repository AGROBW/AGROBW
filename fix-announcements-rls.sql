-- ============================================================================
-- CORREÇÃO FINAL: Garantir que announcements funcione completamente
-- ============================================================================

-- PASSO 1: Habilitar RLS na tabela announcements
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- PASSO 2: Dropar todas as políticas antigas e recriar
DROP POLICY IF EXISTS "public_read_active_announcements" ON public.announcements;
DROP POLICY IF EXISTS "users_create_own_announcements" ON public.announcements;
DROP POLICY IF EXISTS "users_update_own_announcements" ON public.announcements;
DROP POLICY IF EXISTS "users_delete_own_announcements" ON public.announcements;

-- Política de leitura: qualquer um pode ver anúncios ativos, donos podem ver os próprios
CREATE POLICY "announcements_select_policy" 
  ON public.announcements 
  FOR SELECT 
  USING (
    status = 'ACTIVE' 
    OR auth.uid() = user_id
  );

-- Política de inserção: usuários autenticados podem criar seus próprios anúncios
CREATE POLICY "announcements_insert_policy" 
  ON public.announcements 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Política de atualização: apenas o dono pode atualizar
CREATE POLICY "announcements_update_policy" 
  ON public.announcements 
  FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política de exclusão: apenas o dono pode deletar
CREATE POLICY "announcements_delete_policy" 
  ON public.announcements 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- PASSO 3: Atualizar trigger de updated_at (se existir)
DROP TRIGGER IF EXISTS set_updated_at_announcements ON public.announcements;
DROP TRIGGER IF EXISTS handle_updated_at ON public.announcements;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER handle_updated_at
    BEFORE UPDATE ON public.announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- PASSO 4: Verificar se a tabela está acessível
SELECT 
  'Tabela configurada!' AS status,
  COUNT(*) AS total_registros,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'announcements') AS total_policies
FROM public.announcements;

-- PASSO 5: Teste de inserção (comentado, descomente para testar)
-- INSERT INTO public.announcements (
--   title, description, price, user_id, category_id, city, state, status
-- ) VALUES (
--   'Teste', 'Descrição teste', 100, auth.uid(), 
--   (SELECT id FROM categories LIMIT 1), 
--   'São Paulo', 'SP', 'PENDING'
-- );
