import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface PrivacyPageContent {
  id: string;
  last_updated_date: string;
  section1_title: string;
  section1_content: string;
  section2_title: string;
  section2_content: string;
  section3_title: string;
  section3_content: string;
  section4_title: string;
  section4_content: string;
  section5_title: string;
  section5_content: string;
  section6_title: string;
  section6_content: string;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdatePrivacyPageData {
  last_updated_date?: string;
  section1_title?: string;
  section1_content?: string;
  section2_title?: string;
  section2_content?: string;
  section3_title?: string;
  section3_content?: string;
  section4_title?: string;
  section4_content?: string;
  section5_title?: string;
  section5_content?: string;
  section6_title?: string;
  section6_content?: string;
}

interface UsePrivacyPageReturn {
  content: PrivacyPageContent | null;
  isLoading: boolean;
  error: string | null;
  fetchContent: () => Promise<void>;
  updateContent: (updates: UpdatePrivacyPageData, userId: string) => Promise<{ error: string | null }>;
}

export const usePrivacyPage = (): UsePrivacyPageReturn => {
  const [content, setContent] = useState<PrivacyPageContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const SINGLETON_ID = '00000000-0000-0000-0000-000000000003';

  const fetchContent = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('privacy_page_content')
        .select('*')
        .eq('id', SINGLETON_ID)
        .single();

      if (fetchError) {
        console.error('Erro ao buscar página Privacy:', fetchError);
        setError(fetchError.message);
        return;
      }

      setContent(data);
    } catch (err) {
      console.error('Erro inesperado ao buscar conteúdo:', err);
      setError('Erro ao carregar conteúdo');
    } finally {
      setIsLoading(false);
    }
  };

  const updateContent = async (
    updates: UpdatePrivacyPageData,
    userId: string
  ): Promise<{ error: string | null }> => {
    try {
      const { data, error: updateError } = await supabase
        .from('privacy_page_content')
        .update({
          ...updates,
          last_updated_by: userId,
        })
        .eq('id', SINGLETON_ID)
        .select()
        .single();

      if (updateError) {
        console.error('Erro ao atualizar página Privacy:', updateError);
        return { error: updateError.message };
      }

      setContent(data);
      return { error: null };
    } catch (err) {
      console.error('Erro inesperado ao atualizar:', err);
      return { error: 'Erro ao salvar alterações' };
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  return {
    content,
    isLoading,
    error,
    fetchContent,
    updateContent,
  };
};

// Fallback com conteúdo padrão
export const PRIVACY_PAGE_FALLBACK: PrivacyPageContent = {
  id: '00000000-0000-0000-0000-000000000003',
  last_updated_date: '25 de Maio de 2026',
  section1_title: '1. Dados que Coletamos',
  section1_content:
    'Coletamos os dados necessários para operar a BWAGRO com segurança e viabilizar os serviços contratados. Isso pode incluir dados cadastrais e de autenticação, informações de perfil, CPF ou CNPJ, telefone, endereço, cidade, estado, dados de anúncios, imagens, vídeos, informações comerciais da loja parceira, mensagens trocadas pela plataforma, registros de leads, dados de assinatura e histórico de atendimento.\n\nTambém podemos tratar documentos enviados para verificação de conta, imagem ou PDF submetidos ao fluxo de OCR, registros de aceite jurídico, dados técnicos de acesso, logs de segurança, identificadores de sessão e informações de uso da plataforma.',
  section2_title: '2. Finalidades e bases legais do tratamento',
  section2_content:
    'Utilizamos dados pessoais para criar e manter contas, publicar anúncios, processar planos e destaques, habilitar chats e leads, enviar notificações operacionais, permitir verificação documental, prevenir fraude, atender solicitações do titular, cumprir obrigações legais e aprimorar a experiência de navegação.\n\nAs bases legais podem variar conforme a situação, incluindo execução de contrato, procedimentos preliminares, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse para segurança e operação da plataforma e, quando aplicável, consentimento do titular.',
  section3_title: '3. Compartilhamento e operadores envolvidos',
  section3_content:
    'A BWAGRO não comercializa dados pessoais. O compartilhamento ocorre apenas dentro do necessário para prestar os serviços, cumprir exigências legais e proteger a plataforma. Dependendo do fluxo, dados podem ser tratados por fornecedores de infraestrutura, autenticação, banco de dados, storage, envio de e-mail, mensageria, processamento de pagamento, analytics, OCR ou suporte operacional.\n\nAlém disso, certas informações do anunciante precisam ser exibidas a terceiros para viabilizar a finalidade do marketplace, como nome, cidade, estado, dados públicos do anúncio e canais de contato liberados pelo próprio fluxo da plataforma. Também poderemos compartilhar dados com autoridades públicas, órgãos reguladores, escritórios jurídicos ou parceiros antifraude quando houver base legal para isso.',
  section4_title: '4. Cookies, armazenamento local e analytics',
  section4_content:
    'Utilizamos cookies e tecnologias semelhantes, além de recursos de localStorage e sessionStorage, para manter login, lembrar preferências, registrar sessões, proteger fluxos críticos e medir uso da plataforma. Algumas dessas tecnologias são estritamente necessárias para o funcionamento de cadastro, painel do usuário, segurança, notificações, drafts e analytics internos.\n\nA Política de Cookies detalha melhor as categorias utilizadas, sua finalidade e os controles disponíveis ao titular. Configurações do navegador ou do dispositivo podem impactar parte das funcionalidades da plataforma.',
  section5_title: '5. Retenção, segurança e direitos do titular',
  section5_content:
    'Os dados são mantidos pelo tempo necessário para cumprir as finalidades desta Política, respeitar prazos de defesa, auditoria, prevenção a fraude, rastreabilidade de consentimentos e obrigações legais ou regulatórias. O prazo de retenção pode variar conforme a natureza do dado e o recurso utilizado na plataforma.\n\nAdotamos medidas técnicas e administrativas compatíveis com o porte e os riscos da operação, incluindo autenticação, segregação de acessos, políticas de permissão, registros de auditoria, monitoramento e mecanismos de proteção na infraestrutura utilizada.\n\nNos termos da LGPD, o titular pode solicitar confirmação de tratamento, acesso, correção, anonimização quando cabível, portabilidade, eliminação de dados tratados com base em consentimento, informação sobre compartilhamentos e revisão de decisões exclusivamente automatizadas, observadas as limitações legais e técnicas aplicáveis.',
  section6_title: '6. Canal de privacidade e documentos de verificacao',
  section6_content:
    'Documentos enviados para verificação cadastral, selo ou validação de conta podem passar por análise manual e, em certos casos, por extração automatizada de texto para conferência preliminar. A aprovação ou rejeição do documento não elimina a possibilidade de revisão adicional quando houver suspeita de fraude, inconsistência ou exigência regulatória.\n\nSolicitações relacionadas à privacidade, aos direitos do titular ou a esta Política podem ser encaminhadas para privacidade@bwagro.com.br. Sempre que possível, responderemos dentro de prazo razoável e conforme as exigências da LGPD e da regulamentação aplicável.',
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
