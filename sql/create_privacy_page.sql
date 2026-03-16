-- ==================================================
-- CRIAÇÃO DA TABELA privacy_page_content
-- ==================================================
-- Estrutura dedicada para a página "Política de Privacidade"
-- ==================================================

CREATE TABLE IF NOT EXISTS public.privacy_page_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Meta
  last_updated_date VARCHAR(50) DEFAULT '15 de Agosto de 2024',
  
  -- Seção 1: Dados que Coletamos
  section1_title VARCHAR(200) DEFAULT '1. Dados que Coletamos',
  section1_content TEXT NOT NULL,
  
  -- Seção 2: Como Usamos Seus Dados
  section2_title VARCHAR(200) DEFAULT '2. Como Usamos Seus Dados',
  section2_content TEXT NOT NULL,
  
  -- Seção 3: Compartilhamento com Terceiros
  section3_title VARCHAR(200) DEFAULT '3. Compartilhamento com Terceiros',
  section3_content TEXT NOT NULL,
  
  -- Seção 4: Seus Direitos (LGPD)
  section4_title VARCHAR(200) DEFAULT '4. Seus Direitos (LGPD)',
  section4_content TEXT NOT NULL,
  
  -- Seção 5: Retenção e Segurança
  section5_title VARCHAR(200) DEFAULT '5. Retenção e Segurança',
  section5_content TEXT NOT NULL,
  
  -- Seção 6: Encarregado de Dados (DPO)
  section6_title VARCHAR(200) DEFAULT '6. Encarregado de Dados (DPO)',
  section6_content TEXT NOT NULL,
  
  -- Metadata
  last_updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Garantir apenas 1 registro (singleton)
  CONSTRAINT single_row CHECK (id = '00000000-0000-0000-0000-000000000003')
);

-- Comentários
COMMENT ON TABLE public.privacy_page_content IS 'Conteúdo estruturado da página Política de Privacidade (singleton)';

-- ==================================================
-- POLÍTICAS RLS
-- ==================================================

ALTER TABLE public.privacy_page_content ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Public can view privacy page" ON public.privacy_page_content;
DROP POLICY IF EXISTS "Admins can update privacy page" ON public.privacy_page_content;

-- SELECT: Público pode ler
CREATE POLICY "Public can view privacy page"
ON public.privacy_page_content
FOR SELECT
TO authenticated, anon
USING (true);

-- UPDATE: Apenas admins podem editar
CREATE POLICY "Admins can update privacy page"
ON public.privacy_page_content
FOR UPDATE
TO authenticated
USING (public.is_admin() = true)
WITH CHECK (public.is_admin() = true);

-- ==================================================
-- TRIGGER: Atualizar updated_at
-- ==================================================

DROP TRIGGER IF EXISTS update_privacy_page_updated_at ON public.privacy_page_content;

CREATE TRIGGER update_privacy_page_updated_at
BEFORE UPDATE ON public.privacy_page_content
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ==================================================
-- DADOS INICIAIS
-- ==================================================

INSERT INTO public.privacy_page_content (
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
  '00000000-0000-0000-0000-000000000003',
  '15 de Agosto de 2024',
  '1. Dados que Coletamos',
  'Coletamos dados pessoais quando você cria uma conta, publica um anúncio ou interage com nossa plataforma. Isso inclui:

• Nome completo, e-mail, telefone e CPF/CNPJ (obrigatórios para cadastro).
• Dados adicionais como cidade, estado e categoria de interesse.
• Informações sobre sua navegação (cookies, IP, dispositivo).',
  '2. Como Usamos Seus Dados',
  'Seus dados permitem publicar anúncios, mediar negociações e garantir a segurança contra fraudes.

Usamos seus dados para:

• Habilitar funcionalidades, como publicação de anúncios e sistema de mensagens.
• Personalizar sua experiência com recomendações e alertas relevantes.
• Enviar notificações sobre atividades da sua conta (novos interessados, mensagens).',
  '3. Compartilhamento com Terceiros',
  'A BWAGRO não vende seus dados. Compartilhamos apenas com:

• Outros usuários (nome, telefone, cidade) quando você publica um anúncio.
• Parceiros técnicos (Supabase, Resend) sempre dentro dos limites necessários para a operação.
• Autoridades legais, apenas mediante ordem judicial.',
  '4. Seus Direitos (LGPD)',
  'Você pode a qualquer momento:

• Acessar, corrigir ou atualizar seus dados no painel do usuário.
• Solicitar a exclusão da conta (salvo obrigações legais de retenção, como auditoria fiscal).
• Revogar consentimentos para uso de cookies ou newsletters.',
  '5. Retenção e Segurança',
  'Mantemos seus dados pelo tempo necessário para cumprir as finalidades descritas ou por obrigações legais.

• Anúncios inativos são arquivados após 90 dias.
• Dados de transações financeiras (se aplicável) são retidos por até 5 anos (legislação fiscal).
• Implementamos criptografia, autenticação segura e monitoramento constante.',
  '6. Encarregado de Dados (DPO)',
  'Se você tiver dúvidas ou solicitações sobre privacidade (acesso aos dados, correção, exclusão), entre em contato com:

📧 privacidade@bwagro.com.br

Responderemos em até 15 dias úteis conforme previsto na LGPD.'
) ON CONFLICT (id) DO NOTHING;

-- Verificação
SELECT * FROM public.privacy_page_content;
