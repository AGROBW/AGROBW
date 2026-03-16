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
  last_updated_date: '15 de Agosto de 2024',
  section1_title: '1. Dados que Coletamos',
  section1_content:
    'Coletamos dados pessoais quando você cria uma conta, publica um anúncio ou interage com nossa plataforma. Isso inclui:\n\n• Nome completo, e-mail, telefone e CPF/CNPJ (obrigatórios para cadastro).\n• Dados adicionais como cidade, estado e categoria de interesse.\n• Informações sobre sua navegação (cookies, IP, dispositivo).',
  section2_title: '2. Como Usamos Seus Dados',
  section2_content:
    'Seus dados permitem publicar anúncios, mediar negociações e garantir a segurança contra fraudes.\n\nUsamos seus dados para:\n\n• Habilitar funcionalidades, como publicação de anúncios e sistema de mensagens.\n• Personalizar sua experiência com recomendações e alertas relevantes.\n• Enviar notificações sobre atividades da sua conta (novos interessados, mensagens).',
  section3_title: '3. Compartilhamento com Terceiros',
  section3_content:
    'A BWAGRO não vende seus dados. Compartilhamos apenas com:\n\n• Outros usuários (nome, telefone, cidade) quando você publica um anúncio.\n• Parceiros técnicos (Supabase, Resend) sempre dentro dos limites necessários para a operação.\n• Autoridades legais, apenas mediante ordem judicial.',
  section4_title: '4. Seus Direitos (LGPD)',
  section4_content:
    'Você pode a qualquer momento:\n\n• Acessar, corrigir ou atualizar seus dados no painel do usuário.\n• Solicitar a exclusão da conta (salvo obrigações legais de retenção, como auditoria fiscal).\n• Revogar consentimentos para uso de cookies ou newsletters.',
  section5_title: '5. Retenção e Segurança',
  section5_content:
    'Mantemos seus dados pelo tempo necessário para cumprir as finalidades descritas ou por obrigações legais.\n\n• Anúncios inativos são arquivados após 90 dias.\n• Dados de transações financeiras (se aplicável) são retidos por até 5 anos (legislação fiscal).\n• Implementamos criptografia, autenticação segura e monitoramento constante.',
  section6_title: '6. Encarregado de Dados (DPO)',
  section6_content:
    'Se você tiver dúvidas ou solicitações sobre privacidade (acesso aos dados, correção, exclusão), entre em contato com:\n\n📧 privacidade@bwagro.com.br\n\nResponderemos em até 15 dias úteis conforme previsto na LGPD.',
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
