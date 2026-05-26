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
  last_updated_date: '25 de Maio de 2026',
  section1_title: '1. Escopo, aceite e papel da plataforma',
  section1_content:
    'A BWAGRO é uma plataforma digital voltada ao agronegócio para divulgação de anúncios, operação de lojas parceiras, contratação de planos, troca de mensagens e aproximação entre usuários. Ao acessar, criar conta ou utilizar qualquer recurso da plataforma, o usuário declara que leu e concorda com estes Termos de Uso e com a Política de Privacidade.\n\nA BWAGRO não compra, não vende e não assume a posse dos bens anunciados. A plataforma atua como ambiente de divulgação, organização de informações, moderação e apoio operacional. A conclusão do negócio depende exclusivamente das partes envolvidas.',
  section2_title: '2. Cadastro, conta e veracidade das informações',
  section2_content:
    'Para utilizar recursos como publicar anúncios, contratar planos, operar loja parceira, enviar documentos de verificação ou interagir por mensagens, o usuário deve manter cadastro correto, completo e atualizado. O acesso é pessoal e intransferível, e a senha deve ser guardada com segurança.\n\nO usuário responde por todas as atividades realizadas em sua conta e deve informar imediatamente qualquer uso indevido, suspeita de fraude ou acesso não autorizado. A BWAGRO pode solicitar confirmação de identidade, complementar dados cadastrais, bloquear alterações sensíveis ou suspender funcionalidades quando houver inconsistências, duplicidade documental, risco operacional ou determinação legal.',
  section3_title: '3. Regras de anúncios, moderação e verificações',
  section3_content:
    'Todo anúncio deve refletir a realidade do bem, serviço ou oportunidade ofertada. O anunciante é integralmente responsável pelo título, descrição, preço, imagens, vídeos, documentos, disponibilidade, localização, categoria escolhida e demais dados publicados.\n\nNão é permitido publicar conteúdo ilícito, enganoso, ofensivo, duplicado de forma indevida, com indícios de fraude, com links externos ou contatos em locais proibidos pelas regras da plataforma, ou que viole direitos de terceiros. A BWAGRO pode aplicar filtros automáticos, revisão manual, bloqueio preventivo, envio para análise, rejeição, remoção, limitação de alcance, cancelamento de destaque, exigência de documentos ou suspensão da conta.\n\nRecursos como selo verificado, loja parceira, destaque em Home, destaque em Categoria, vitrine premium e edições sob análise dependem do cumprimento das políticas internas, das regras comerciais vigentes e da disponibilidade técnica da plataforma.',
  section4_title: '4. Planos, destaques, cobranças e reembolsos',
  section4_content:
    'A plataforma pode oferecer modalidade gratuita e modalidades pagas, incluindo planos recorrentes, boosters, vitrines, destaques e outros recursos de exposição ou conversão. Os valores, benefícios, limites, prazos, elegibilidade e condições promocionais são os descritos na página comercial vigente no momento da contratação.\n\nO pagamento de um plano ou destaque não garante venda, lead, volume mínimo de visualizações nem resultado comercial específico. Recursos pagos podem possuir prazo próprio, regras de cooldown, limite de uso, dependência de aprovação do anúncio e perda do benefício quando houver violação das políticas da plataforma.\n\nPedidos de cancelamento, estorno ou reembolso serão tratados conforme a política comercial aplicável, a legislação de consumo e o histórico de utilização efetiva do recurso contratado.',
  section5_title: '5. Condutas proibidas e propriedade intelectual',
  section5_content:
    'É proibido utilizar a BWAGRO para fraude, raspagem automatizada de dados, engenharia reversa, envio massivo de mensagens, contorno de moderação, uso indevido de identidade visual de terceiros, tentativa de burlar planos, captação irregular de contatos ou qualquer prática que prejudique usuários, parceiros ou a integridade do sistema.\n\nA marca BWAGRO, seu software, layout, base visual, textos institucionais e demais ativos da plataforma pertencem aos respectivos titulares. O usuário continua titular do conteúdo que enviar, mas declara possuir autorização para publicação e concede à BWAGRO licença de uso necessária para hospedagem, exibição, distribuição, moderação e promoção do anúncio dentro do ecossistema da plataforma.',
  section6_title: '6. Responsabilidade, sanções e atualizações',
  section6_content:
    'A BWAGRO não garante qualidade, procedência, titularidade, regularidade documental, entrega, pagamento, adimplemento ou conclusão de negócios entre usuários. Sempre recomendamos verificação presencial, conferência documental e uso de meios seguros antes da contratação.\n\nA plataforma poderá advertir, restringir funcionalidades, remover anúncios, reprovar verificações, reter publicações para análise, cancelar benefícios, suspender ou encerrar contas em caso de descumprimento destes Termos, suspeita de fraude, risco reputacional, exigência legal ou operacional.\n\nEstes Termos podem ser atualizados a qualquer tempo. Havendo alterações relevantes, a BWAGRO poderá exigir novo aceite para continuidade do uso. Dúvidas ou solicitações podem ser encaminhadas para suporte@bwagro.com.br.',
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
