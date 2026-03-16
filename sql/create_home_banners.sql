-- ==================================================
-- CRIAÇÃO DA TABELA home_banners
-- ==================================================
-- Armazena banners dinâmicos exibidos no slider da Home
-- ==================================================

CREATE TABLE IF NOT EXISTS public.home_banners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  badge_text VARCHAR(50) DEFAULT 'Destaque BWAGRO',
  title VARCHAR(200) NOT NULL,
  subtitle TEXT,
  button_text VARCHAR(50) NOT NULL DEFAULT 'Ver Mais',
  button_link VARCHAR(500) NOT NULL,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_home_banners_active ON public.home_banners(is_active);
CREATE INDEX IF NOT EXISTS idx_home_banners_sort ON public.home_banners(sort_order);

-- Comentários
COMMENT ON TABLE public.home_banners IS 'Banners dinâmicos exibidos no slider da Home';
COMMENT ON COLUMN public.home_banners.badge_text IS 'Texto do badge (ex: "Destaque BWAGRO")';
COMMENT ON COLUMN public.home_banners.title IS 'Título principal do banner';
COMMENT ON COLUMN public.home_banners.subtitle IS 'Subtítulo/descrição do banner';
COMMENT ON COLUMN public.home_banners.button_text IS 'Texto do botão (ex: "Explorar Agora")';
COMMENT ON COLUMN public.home_banners.button_link IS 'Link de destino do botão';
COMMENT ON COLUMN public.home_banners.image_url IS 'URL da imagem do banner (Supabase Storage)';
COMMENT ON COLUMN public.home_banners.sort_order IS 'Ordem de exibição (menor = primeiro)';
COMMENT ON COLUMN public.home_banners.is_active IS 'Se o banner está ativo';


-- ==================================================
-- POLÍTICAS RLS (Row Level Security)
-- ==================================================

-- Habilitar RLS
ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;

-- SELECT: Público pode ler banners ativos
CREATE POLICY "Public can view active banners"
ON public.home_banners
FOR SELECT
TO authenticated, anon
USING (is_active = true);

-- SELECT: Admins veem todos os banners (ativos e inativos)
CREATE POLICY "Admins can view all banners"
ON public.home_banners
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- INSERT: Apenas admins podem criar
CREATE POLICY "Admins can insert banners"
ON public.home_banners
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() = true);

-- UPDATE: Apenas admins podem editar
CREATE POLICY "Admins can update banners"
ON public.home_banners
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

-- DELETE: Apenas admins podem deletar
CREATE POLICY "Admins can delete banners"
ON public.home_banners
FOR DELETE
TO authenticated
USING (public.is_admin() = true);


-- ==================================================
-- TRIGGER: Atualizar updated_at automaticamente
-- ==================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_home_banners_updated_at
BEFORE UPDATE ON public.home_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ==================================================
-- DADOS INICIAIS (Migração dos banners estáticos)
-- ==================================================

INSERT INTO public.home_banners (badge_text, title, subtitle, button_text, button_link, image_url, sort_order, is_active)
VALUES 
  (
    'Destaque BWAGRO',
    'O Campo em Movimento',
    'A maior vitrine do agronegócio brasileiro está aqui.',
    'Explorar Agora',
    '#/anuncios',
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop',
    1,
    true
  ),
  (
    'Destaque BWAGRO',
    'Insumos de Alta Performance',
    'Maximize sua produtividade com os melhores parceiros.',
    'Ver Insumos',
    '#/categoria/insumos',
    'https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=1600&auto=format&fit=crop',
    2,
    true
  );


-- ==================================================
-- VERIFICAÇÃO
-- ==================================================

-- Listar todos os banners criados
SELECT 
  id, 
  badge_text,
  title, 
  button_text, 
  sort_order, 
  is_active,
  created_at
FROM public.home_banners
ORDER BY sort_order;

-- Verificar políticas RLS
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'home_banners'
ORDER BY cmd;
