-- ==================================================
-- CRIAÇÃO DA TABELA institutional_pages
-- ==================================================
-- CMS para gerenciamento de páginas institucionais
-- ==================================================

CREATE TABLE IF NOT EXISTS public.institutional_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(200) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  meta_title VARCHAR(200),
  meta_description VARCHAR(300),
  is_published BOOLEAN DEFAULT false,
  last_updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_institutional_pages_slug ON public.institutional_pages(slug);
CREATE INDEX IF NOT EXISTS idx_institutional_pages_published ON public.institutional_pages(is_published);
CREATE INDEX IF NOT EXISTS idx_institutional_pages_updated_by ON public.institutional_pages(last_updated_by);

-- Comentários
COMMENT ON TABLE public.institutional_pages IS 'Páginas institucionais gerenciadas via CMS';
COMMENT ON COLUMN public.institutional_pages.title IS 'Título da página';
COMMENT ON COLUMN public.institutional_pages.slug IS 'URL amigável (ex: termos-de-uso)';
COMMENT ON COLUMN public.institutional_pages.content IS 'Conteúdo HTML da página';
COMMENT ON COLUMN public.institutional_pages.meta_title IS 'Título SEO (meta tag)';
COMMENT ON COLUMN public.institutional_pages.meta_description IS 'Descrição SEO (meta tag)';
COMMENT ON COLUMN public.institutional_pages.is_published IS 'Se a página está publicada';
COMMENT ON COLUMN public.institutional_pages.last_updated_by IS 'Último admin que editou';


-- ==================================================
-- POLÍTICAS RLS (Row Level Security)
-- ==================================================

-- Habilitar RLS
ALTER TABLE public.institutional_pages ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Public can view published pages" ON public.institutional_pages;
DROP POLICY IF EXISTS "Admins can view all pages" ON public.institutional_pages;
DROP POLICY IF EXISTS "Admins can insert pages" ON public.institutional_pages;
DROP POLICY IF EXISTS "Admins can update pages" ON public.institutional_pages;
DROP POLICY IF EXISTS "Admins can delete pages" ON public.institutional_pages;

-- SELECT: Público pode ler páginas publicadas
CREATE POLICY "Public can view published pages"
ON public.institutional_pages
FOR SELECT
TO authenticated, anon
USING (is_published = true);

-- SELECT: Admins veem todas as páginas
CREATE POLICY "Admins can view all pages"
ON public.institutional_pages
FOR SELECT
TO authenticated
USING (public.is_admin() = true);

-- INSERT: Apenas admins podem criar
CREATE POLICY "Admins can insert pages"
ON public.institutional_pages
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() = true);

-- UPDATE: Apenas admins podem editar
CREATE POLICY "Admins can update pages"
ON public.institutional_pages
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

-- DELETE: Apenas admins podem deletar
CREATE POLICY "Admins can delete pages"
ON public.institutional_pages
FOR DELETE
TO authenticated
USING (public.is_admin() = true);


-- ==================================================
-- TRIGGER: Atualizar updated_at automaticamente
-- ==================================================

DROP TRIGGER IF EXISTS update_institutional_pages_updated_at ON public.institutional_pages;

CREATE TRIGGER update_institutional_pages_updated_at
BEFORE UPDATE ON public.institutional_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ==================================================
-- FUNÇÃO: Validar slug (apenas letras, números, hífen)
-- ==================================================

CREATE OR REPLACE FUNCTION public.validate_page_slug()
RETURNS TRIGGER AS $$
BEGIN
  -- Converter para minúsculas
  NEW.slug := LOWER(NEW.slug);
  
  -- Validar formato (apenas a-z, 0-9, hífen)
  IF NEW.slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Slug inválido. Use apenas letras minúsculas, números e hífens.';
  END IF;
  
  -- Não permitir slugs reservados
  IF NEW.slug IN ('admin', 'api', 'auth', 'dashboard', 'login', 'register', 'settings', 'p', 'pages') THEN
    RAISE EXCEPTION 'Este slug está reservado pelo sistema.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_slug_before_insert_update ON public.institutional_pages;

CREATE TRIGGER validate_slug_before_insert_update
BEFORE INSERT OR UPDATE ON public.institutional_pages
FOR EACH ROW
EXECUTE FUNCTION public.validate_page_slug();


-- ==================================================
-- DADOS INICIAIS (Migração das páginas existentes)
-- ==================================================

-- Página de Termos de Uso
INSERT INTO public.institutional_pages (title, slug, content, meta_title, meta_description, is_published)
VALUES (
  'Termos de Uso',
  'termos-de-uso',
  '<h1>Termos de Uso - BWAGRO</h1>
<p>Bem-vindo ao BWAGRO. Ao acessar e utilizar nossa plataforma, você concorda com os seguintes termos e condições.</p>

<h2>1. Aceitação dos Termos</h2>
<p>Ao criar uma conta ou utilizar qualquer serviço oferecido pela BWAGRO, você declara ter lido, compreendido e aceito estes Termos de Uso.</p>

<h2>2. Descrição do Serviço</h2>
<p>O BWAGRO é uma plataforma de marketplace especializada no agronegócio, conectando compradores e vendedores de produtos, insumos, equipamentos e serviços rurais.</p>

<h2>3. Responsabilidades do Usuário</h2>
<ul>
  <li>Fornecer informações verdadeiras e atualizadas</li>
  <li>Manter a confidencialidade de sua senha</li>
  <li>Não utilizar a plataforma para atividades ilegais</li>
  <li>Respeitar os direitos de propriedade intelectual</li>
</ul>

<h2>4. Publicação de Anúncios</h2>
<p>Os usuários são responsáveis pelo conteúdo de seus anúncios e devem garantir que:</p>
<ul>
  <li>As informações sejam precisas e completas</li>
  <li>As imagens sejam de propriedade ou autorizadas</li>
  <li>Os preços estejam claramente especificados</li>
  <li>Não violem direitos de terceiros</li>
</ul>

<h2>5. Moderação de Conteúdo</h2>
<p>A BWAGRO reserva-se o direito de moderar, editar ou remover qualquer conteúdo que viole estes termos ou seja considerado inadequado.</p>

<h2>6. Limitação de Responsabilidade</h2>
<p>A BWAGRO não se responsabiliza por transações realizadas entre usuários, atuando apenas como intermediadora da plataforma.</p>

<h2>7. Modificações dos Termos</h2>
<p>Reservamo-nos o direito de modificar estes termos a qualquer momento. Usuários serão notificados sobre alterações significativas.</p>

<p><strong>Data de vigência:</strong> 01 de janeiro de 2026</p>',
  'Termos de Uso - BWAGRO',
  'Leia os termos e condições de uso da plataforma BWAGRO.',
  true
) ON CONFLICT (slug) DO NOTHING;

-- Página de Política de Privacidade
INSERT INTO public.institutional_pages (title, slug, content, meta_title, meta_description, is_published)
VALUES (
  'Política de Privacidade',
  'politica-de-privacidade',
  '<h1>Política de Privacidade - BWAGRO</h1>
<p>Na BWAGRO, levamos a sério a proteção de seus dados pessoais. Esta política descreve como coletamos, usamos e protegemos suas informações.</p>

<h2>1. Informações Coletadas</h2>
<p>Coletamos diferentes tipos de informações:</p>
<ul>
  <li><strong>Dados de Cadastro:</strong> nome, email, telefone, CPF/CNPJ</li>
  <li><strong>Dados de Localização:</strong> endereço, cidade, estado</li>
  <li><strong>Dados de Uso:</strong> histórico de navegação, anúncios visualizados</li>
  <li><strong>Dados de Transação:</strong> anúncios publicados, mensagens trocadas</li>
</ul>

<h2>2. Uso das Informações</h2>
<p>Utilizamos suas informações para:</p>
<ul>
  <li>Criar e gerenciar sua conta</li>
  <li>Processar e exibir seus anúncios</li>
  <li>Facilitar comunicação entre usuários</li>
  <li>Enviar notificações importantes</li>
  <li>Melhorar nossos serviços</li>
  <li>Cumprir obrigações legais</li>
</ul>

<h2>3. Compartilhamento de Dados</h2>
<p>Não vendemos seus dados pessoais. Compartilhamos informações apenas quando:</p>
<ul>
  <li>Necessário para completar uma transação</li>
  <li>Exigido por lei ou ordem judicial</li>
  <li>Com seu consentimento explícito</li>
</ul>

<h2>4. Segurança dos Dados</h2>
<p>Implementamos medidas de segurança técnicas e organizacionais para proteger seus dados:</p>
<ul>
  <li>Criptografia SSL/TLS em todas as transmissões</li>
  <li>Armazenamento em servidores seguros</li>
  <li>Acesso restrito aos dados</li>
  <li>Monitoramento contínuo de segurança</li>
</ul>

<h2>5. Seus Direitos (LGPD)</h2>
<p>De acordo com a Lei Geral de Proteção de Dados, você tem direito a:</p>
<ul>
  <li>Acessar seus dados pessoais</li>
  <li>Corrigir dados incompletos ou desatualizados</li>
  <li>Solicitar a exclusão de dados</li>
  <li>Revogar consentimento</li>
  <li>Portabilidade dos dados</li>
</ul>

<h2>6. Cookies</h2>
<p>Utilizamos cookies para melhorar sua experiência. Você pode configurar seu navegador para recusar cookies, mas isso pode afetar a funcionalidade da plataforma.</p>

<h2>7. Retenção de Dados</h2>
<p>Mantemos seus dados pelo tempo necessário para fornecer nossos serviços e cumprir obrigações legais.</p>

<h2>8. Contato</h2>
<p>Para questões sobre privacidade, entre em contato: <a href="mailto:privacidade@bwagro.com.br">privacidade@bwagro.com.br</a></p>

<p><strong>Última atualização:</strong> 01 de janeiro de 2026</p>',
  'Política de Privacidade - BWAGRO',
  'Conheça como a BWAGRO protege seus dados pessoais e respeita sua privacidade.',
  true
) ON CONFLICT (slug) DO NOTHING;

-- Página de Quem Somos
INSERT INTO public.institutional_pages (title, slug, content, meta_title, meta_description, is_published)
VALUES (
  'Quem Somos',
  'quem-somos',
  '<h1>BWAGRO: Conectando quem produz ao futuro do agronegócio</h1>
<p class="lead">A plataforma líder que transforma o mercado rural com transparência e tecnologia.</p>

<h2>Nossa História</h2>
<p>Nascida da necessidade real do produtor rural brasileiro, a BWAGRO surgiu em 2020 para eliminar barreiras e burocracias no mercado de compra e venda no campo. O que começou como um projeto regional de classificados de máquinas tornou-se a maior rede de conexões do agronegócio nacional.</p>

<p>Entendemos que o tempo no campo é precioso e que a confiança é o adubo de qualquer bom negócio. Por isso, cada funcionalidade da nossa plataforma foi pensada para ser simples, rápida e eficaz.</p>

<h2>Nossos Pilares</h2>

<h3>Missão</h3>
<p>Prover as melhores ferramentas tecnológicas para que o produtor rural comercialize seus ativos com segurança e eficiência máxima.</p>

<h3>Visão</h3>
<p>Ser o ecossistema digital indispensável para o agronegócio, sendo a primeira escolha para compra, venda e parcerias rurais.</p>

<h3>Valores</h3>
<p>Integridade nas relações, inovação constante centrada no usuário, e compromisso absoluto com o desenvolvimento sustentável do campo.</p>

<h2>Números que Falam</h2>
<ul>
  <li><strong>+10.000 Usuários Ativos:</strong> Uma comunidade crescente de produtores, compradores e fornecedores</li>
  <li><strong>+50.000 Anúncios Criados:</strong> Milhares de oportunidades de negócio todos os dias</li>
  <li><strong>R$ 850 Milhões em Negócios Gerados:</strong> Movimentação financeira que transforma o agronegócio</li>
</ul>

<h2>Por que a BWAGRO é diferente?</h2>
<p>Não somos apenas um site de anúncios. Somos uma ferramenta estratégica para quem vive o agronegócio. Cada linha de código é pensada para suportar a robustez das operações rurais.</p>

<h3>Tecnologia de Ponta</h3>
<p>Filtros inteligentes e interface otimizada para quem está no campo. Nossa plataforma funciona perfeitamente mesmo em conexões lentas, garantindo acesso em qualquer lugar do Brasil.</p>

<h3>Facilidade de Uso</h3>
<p>Anuncie seus produtos em menos de 2 minutos pelo celular. Interface intuitiva que não exige conhecimentos técnicos avançados.</p>

<h3>Suporte Especializado</h3>
<p>Time que entende a realidade rural pronto para auxiliar. Nosso suporte fala a linguagem do campo e está sempre disponível para ajudar.</p>

<h2>Faça parte da nossa história</h2>
<p>Comece hoje mesmo a transformar o jeito que você faz negócios no campo. Anuncie grátis e conecte-se com compradores reais em todo o Brasil.</p>

<p><strong>BWAGRO - O Campo em Movimento</strong></p>',
  'Quem Somos - BWAGRO',
  'Conheça a história da BWAGRO, a plataforma líder que conecta quem produz ao futuro do agronegócio.',
  true
) ON CONFLICT (slug) DO NOTHING;


-- ==================================================
-- VERIFICAÇÃO
-- ==================================================

SELECT 
  id, 
  title, 
  slug, 
  is_published,
  LENGTH(content) as content_length,
  created_at
FROM public.institutional_pages
ORDER BY created_at DESC;

-- Verificar políticas RLS
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'institutional_pages'
ORDER BY cmd;
