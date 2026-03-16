import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface TermsPageContent {
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

export interface UpdateTermsPageData {
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

interface UseTermsPageReturn {
  content: TermsPageContent | null;
  isLoading: boolean;
  error: string | null;
  fetchContent: () => Promise<void>;
  updateContent: (updates: UpdateTermsPageData, userId: string) => Promise<{ error: string | null }>;
}

export const useTermsPage = (): UseTermsPageReturn => {
  const [content, setContent] = useState<TermsPageContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const SINGLETON_ID = '00000000-0000-0000-0000-000000000002';

  const fetchContent = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('terms_page_content')
        .select('*')
        .eq('id', SINGLETON_ID)
        .single();

      if (fetchError) {
        console.error('Erro ao buscar página Terms:', fetchError);
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
    updates: UpdateTermsPageData,
    userId: string
  ): Promise<{ error: string | null }> => {
    try {
      const { data, error: updateError } = await supabase
        .from('terms_page_content')
        .update({
          ...updates,
          last_updated_by: userId,
        })
        .eq('id', SINGLETON_ID)
        .select()
        .single();

      if (updateError) {
        console.error('Erro ao atualizar página Terms:', updateError);
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
export const TERMS_PAGE_FALLBACK: TermsPageContent = {
  id: '00000000-0000-0000-0000-000000000002',
  last_updated_date: '20 de Maio de 2024',
  section1_title: '1. Aceitação dos Termos',
  section1_content:
    'Ao acessar e utilizar a plataforma BWAGRO, você concorda expressamente com estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços. A BWAGRO atua como uma plataforma de classificados, conectando compradores e vendedores do agronegócio.',
  section2_title: '2. Cadastro e Segurança da Conta',
  section2_content:
    'Para publicar anúncios, o usuário deve realizar um cadastro fornecendo dados verídicos e atualizados. Você é o único responsável por manter a confidencialidade de sua senha e por todas as atividades que ocorrem em sua conta.\n\n• O cadastro é pessoal e intransferível.\n• A BWAGRO reserva-se o direito de suspender contas com dados suspeitos.',
  section3_title: '3. Regras para Publicação de Anúncios',
  section3_content:
    'Todos os anúncios devem ser verídicos e refletir o estado real do produto. É proibida a publicação de:\n\n• Produtos ilegais ou de origem duvidosa.\n• Conteúdo ofensivo, discriminatório ou fraudulento.\n• Anúncios duplicados na mesma categoria.\n\nO anunciante é civil e criminalmente responsável pelo conteúdo de suas publicações.',
  section4_title: '4. Planos de Assinatura e Reembolso',
  section4_content:
    'A BWAGRO oferece planos gratuitos e premium. O pagamento dos planos premium garante maior visibilidade conforme descrito na página de Planos. Reembolsos podem ser solicitados em até 7 dias após a contratação, desde que os benefícios de destaque ainda não tenham sido integralmente utilizados.',
  section5_title: '5. Propriedade Intelectual',
  section5_content:
    'A marca BWAGRO, logotipos, layouts e o código-fonte da plataforma são propriedade exclusiva de nossa empresa. O uso indevido de nossa marca ou o "scraping" de dados de nossos usuários para fins comerciais externos é terminantemente proibido e passível de medidas legais.',
  section6_title: '6. Limitação de Responsabilidade',
  section6_content:
    'A BWAGRO não participa das negociações financeiras entre usuários. Não garantimos a qualidade dos produtos anunciados nem a idoneidade financeira dos compradores. Recomendamos sempre verificar o produto pessoalmente e realizar transações seguras.',
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
