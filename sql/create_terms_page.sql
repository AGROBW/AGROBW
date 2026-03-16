-- ==================================================
-- CRIAÇÃO DA TABELA terms_page_content
-- ==================================================
-- Estrutura dedicada para a página "Termos de Uso"
-- ==================================================

CREATE TABLE IF NOT EXISTS public.terms_page_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Meta
  last_updated_date VARCHAR(50) DEFAULT '20 de Maio de 2024',
  
  -- Seção 1: Aceitação dos Termos
  section1_title VARCHAR(200) DEFAULT '1. Aceitação dos Termos',
  section1_content TEXT NOT NULL,
  
  -- Seção 2: Cadastro e Segurança da Conta
  section2_title VARCHAR(200) DEFAULT '2. Cadastro e Segurança da Conta',
  section2_content TEXT NOT NULL,
  
  -- Seção 3: Regras para Publicação de Anúncios
  section3_title VARCHAR(200) DEFAULT '3. Regras para Publicação de Anúncios',
  section3_content TEXT NOT NULL,
  
  -- Seção 4: Planos de Assinatura e Reembolso
  section4_title VARCHAR(200) DEFAULT '4. Planos de Assinatura e Reembolso',
  section4_content TEXT NOT NULL,
  
  -- Seção 5: Propriedade Intelectual
  section5_title VARCHAR(200) DEFAULT '5. Propriedade Intelectual',
  section5_content TEXT NOT NULL,
  
  -- Seção 6: Limitação de Responsabilidade
  section6_title VARCHAR(200) DEFAULT '6. Limitação de Responsabilidade',
  section6_content TEXT NOT NULL,
  
  -- Metadata
  last_updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Garantir apenas 1 registro (singleton)
  CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000002')
);

-- Comentários
COMMENT ON TABLE public.terms_page_content IS 'Conteúdo estruturado da página Termos de Uso (singleton)';

-- ==================================================
-- POLÍTICAS RLS
-- ==================================================

ALTER TABLE public.terms_page_content ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Public can view terms page" ON public.terms_page_content;
DROP POLICY IF EXISTS "Admins can update terms page" ON public.terms_page_content;

-- SELECT: Público pode ler
CREATE POLICY "Public can view terms page"
ON public.terms_page_content
FOR SELECT
TO authenticated, anon
USING (true);

-- UPDATE: Apenas admins podem editar
CREATE POLICY "Admins can update terms page"
ON public.terms_page_content
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

-- ==================================================
-- TRIGGER: Atualizar updated_at
-- ==================================================

DROP TRIGGER IF EXISTS update_terms_page_updated_at ON public.terms_page_content;

CREATE TRIGGER update_terms_page_updated_at
BEFORE UPDATE ON public.terms_page_content
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ==================================================
-- DADOS INICIAIS
-- ==================================================

INSERT INTO public.terms_page_content (
  id,
  last_updated_date,
  section1_title,
  section1_content,
  section2_title,
  section2_content,
  section3_title,
  section3_content,
  section4_title,
  section4_content,
  section5_title,
  section5_content,
  section6_title,
  section6_content
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '20 de Maio de 2024',
  '1. Aceitação dos Termos',
  'Ao acessar e utilizar a plataforma BWAGRO, você concorda expressamente com estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços. A BWAGRO atua como uma plataforma de classificados, conectando compradores e vendedores do agronegócio.',
  '2. Cadastro e Segurança da Conta',
  'Para publicar anúncios, o usuário deve realizar um cadastro fornecendo dados verídicos e atualizados. Você é o único responsável por manter a confidencialidade de sua senha e por todas as atividades que ocorrem em sua conta.

• O cadastro é pessoal e intransferível.
• A BWAGRO reserva-se o direito de suspender contas com dados suspeitos.',
  '3. Regras para Publicação de Anúncios',
  'Todos os anúncios devem ser verídicos e refletir o estado real do produto. É proibida a publicação de:

• Produtos ilegais ou de origem duvidosa.
• Conteúdo ofensivo, discriminatório ou fraudulento.
• Anúncios duplicados na mesma categoria.

O anunciante é civil e criminalmente responsável pelo conteúdo de suas publicações.',
  '4. Planos de Assinatura e Reembolso',
  'A BWAGRO oferece planos gratuitos e premium. O pagamento dos planos premium garante maior visibilidade conforme descrito na página de Planos. Reembolsos podem ser solicitados em até 7 dias após a contratação, desde que os benefícios de destaque ainda não tenham sido integralmente utilizados.',
  '5. Propriedade Intelectual',
  'A marca BWAGRO, logotipos, layouts e o código-fonte da plataforma são propriedade exclusiva de nossa empresa. O uso indevido de nossa marca ou o "scraping" de dados de nossos usuários para fins comerciais externos é terminantemente proibido e passível de medidas legais.',
  '6. Limitação de Responsabilidade',
  'A BWAGRO não participa das negociações financeiras entre usuários. Não garantimos a qualidade dos produtos anunciados nem a idoneidade financeira dos compradores. Recomendamos sempre verificar o produto pessoalmente e realizar transações seguras.'
) ON CONFLICT (id) DO NOTHING;

-- Verificação
SELECT * FROM public.terms_page_content;
