-- ==================================================
-- CRIAÇÃO DA TABELA about_page_content
-- ==================================================
-- Estrutura dedicada para a página "Quem Somos"
-- ==================================================

CREATE TABLE IF NOT EXISTS public.about_page_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Estatísticas (Hero Section)
  stat_users_value VARCHAR(10) DEFAULT '10k+',
  stat_users_label VARCHAR(50) DEFAULT 'USUÁRIOS ATIVOS',
  stat_ads_value VARCHAR(10) DEFAULT '50k+',
  stat_ads_label VARCHAR(50) DEFAULT 'ANÚNCIOS CRIADOS',
  stat_revenue_value VARCHAR(20) DEFAULT '850 Mi',
  stat_revenue_label VARCHAR(50) DEFAULT 'NEGÓCIOS GERADOS',
  
  -- Seção História
  history_title VARCHAR(200) DEFAULT 'Nossa História',
  history_text TEXT NOT NULL,
  history_image_url TEXT,
  
  -- Pilares (Missão/Visão/Valores)
  mission_title VARCHAR(100) DEFAULT 'Missão',
  mission_text TEXT NOT NULL,
  vision_title VARCHAR(100) DEFAULT 'Visão',
  vision_text TEXT NOT NULL,
  values_title VARCHAR(100) DEFAULT 'Valores',
  values_text TEXT NOT NULL,
  
  -- Diferenciais (3 itens numerados)
  diff1_title VARCHAR(100) DEFAULT 'Tecnologia de Ponta',
  diff1_text TEXT NOT NULL,
  diff2_title VARCHAR(100) DEFAULT 'Facilidade de Uso',
  diff2_text TEXT NOT NULL,
  diff3_title VARCHAR(100) DEFAULT 'Suporte Especializado',
  diff3_text TEXT NOT NULL,
  
  -- Meta
  last_updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Garantir apenas 1 registro (singleton)
  CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000001')
);

-- Comentários
COMMENT ON TABLE public.about_page_content IS 'Conteúdo estruturado da página Quem Somos (singleton)';
COMMENT ON COLUMN public.about_page_content.history_image_url IS 'URL da imagem da seção História (opcional)';

-- ==================================================
-- POLÍTICAS RLS
-- ==================================================

ALTER TABLE public.about_page_content ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Public can view about page" ON public.about_page_content;
DROP POLICY IF EXISTS "Admins can update about page" ON public.about_page_content;

-- SELECT: Público pode ler
CREATE POLICY "Public can view about page"
ON public.about_page_content
FOR SELECT
TO authenticated, anon
USING (true);

-- UPDATE: Apenas admins podem editar
CREATE POLICY "Admins can update about page"
ON public.about_page_content
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

-- ==================================================
-- TRIGGER: Atualizar updated_at
-- ==================================================

DROP TRIGGER IF EXISTS update_about_page_updated_at ON public.about_page_content;

CREATE TRIGGER update_about_page_updated_at
BEFORE UPDATE ON public.about_page_content
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ==================================================
-- DADOS INICIAIS
-- ==================================================

INSERT INTO public.about_page_content (
  id,
  stat_users_value,
  stat_users_label,
  stat_ads_value,
  stat_ads_label,
  stat_revenue_value,
  stat_revenue_label,
  history_title,
  history_text,
  history_image_url,
  mission_title,
  mission_text,
  vision_title,
  vision_text,
  values_title,
  values_text,
  diff1_title,
  diff1_text,
  diff2_title,
  diff2_text,
  diff3_title,
  diff3_text
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '10k+',
  'USUÁRIOS ATIVOS',
  '50k+',
  'ANÚNCIOS CRIADOS',
  '850 Mi',
  'NEGÓCIOS GERADOS',
  'Nossa História',
  'Nascida da necessidade real do produtor rural brasileiro, a BWAGRO surgiu em 2020 para eliminar barreiras e burocracias no mercado de compra e venda no campo. O que começou como um projeto regional de classificados de máquinas tornou-se a maior rede de conexões do agronegócio nacional. Entendemos que o tempo no campo é precioso e que a confiança é o adubo de qualquer bom negócio.',
  'https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=800&auto=format&fit=crop',
  'Missão',
  'Prover as melhores ferramentas tecnológicas para que o produtor rural comercialize seus ativos com segurança e eficiência máxima.',
  'Visão',
  'Ser o ecossistema digital indispensável para o agronegócio, sendo a primeira escolha para compra, venda e parcerias rurais.',
  'Valores',
  'Integridade nas relações, inovação constante centrada no usuário, e compromisso absoluto com o desenvolvimento sustentável do campo.',
  'Tecnologia de Ponta',
  'Filtros inteligentes e interface otimizada para quem está no campo.',
  'Facilidade de Uso',
  'Anuncie seus produtos em menos de 2 minutos pelo celular.',
  'Suporte Especializado',
  'Time que entende a realidade rural pronto para auxiliar.'
) ON CONFLICT (id) DO NOTHING;

-- Verificação
SELECT * FROM public.about_page_content;
