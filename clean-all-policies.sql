-- ============================================================================
-- LIMPAR TODAS AS POLÍTICAS E RECRIAR DO ZERO
-- ============================================================================

-- PASSO 1: Dropar TODAS as políticas existentes
DROP POLICY IF EXISTS "Anúncios ativos são públicos" ON public.announcements;
DROP POLICY IF EXISTS "Qualquer usuário autenticado pode criar anúncios" ON public.announcements;
DROP POLICY IF EXISTS "Usuários podem editar próprios anúncios" ON public.announcements;
DROP POLICY IF EXISTS "Usuários podem deletar próprios anúncios" ON public.announcements;
DROP POLICY IF EXISTS "Admins têm acesso total - ads" ON public.announcements;
DROP POLICY IF EXISTS "Anúncios públicos visíveis" ON public.announcements;
DROP POLICY IF EXISTS "Usuários podem gerenciar próprios anúncios" ON public.announcements;
DROP POLICY IF EXISTS "Usuários podem ver suas próprias métricas" ON public.announcements;
DROP POLICY IF EXISTS "Permitir atualização para o dono" ON public.announcements;
DROP POLICY IF EXISTS "Permitir leitura para o dono" ON public.announcements;
DROP POLICY IF EXISTS "Leitura pública para anúncios ativos" ON public.announcements;
DROP POLICY IF EXISTS "announcements_select_policy" ON public.announcements;
DROP POLICY IF EXISTS "announcements_insert_policy" ON public.announcements;
DROP POLICY IF EXISTS "announcements_update_policy" ON public.announcements;
DROP POLICY IF EXISTS "announcements_delete_policy" ON public.announcements;

-- PASSO 2: Criar apenas 4 políticas limpas e simples
CREATE POLICY "select_announcements" 
  ON public.announcements 
  FOR SELECT 
  USING (
    status = 'ACTIVE' 
    OR auth.uid() = user_id
  );

CREATE POLICY "insert_announcements" 
  ON public.announcements 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_announcements" 
  ON public.announcements 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "delete_announcements" 
  ON public.announcements 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- PASSO 3: Verificar
SELECT 
  'Políticas limpas!' AS status,
  COUNT(*) AS total_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'announcements';
