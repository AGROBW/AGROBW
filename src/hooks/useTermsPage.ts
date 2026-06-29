import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface TermsSection {
  id: string;
  label: string;
  title: string;
  content: string;
}

export interface TermsPageContent {
  id: string;
  last_updated_date: string;
  sections: TermsSection[];
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
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateTermsPageData {
  last_updated_date?: string;
  sections?: TermsSection[];
}

interface UseTermsPageReturn {
  content: TermsPageContent | null;
  isLoading: boolean;
  error: string | null;
  fetchContent: () => Promise<void>;
  updateContent: (updates: UpdateTermsPageData, userId: string) => Promise<{ error: string | null }>;
}

const stripSectionPrefix = (value: string) => value.replace(/^\s*\d+\.\s*/, '').trim();

const sanitizeSection = (section: Partial<TermsSection>, index: number): TermsSection => ({
  id: String(section.id || `section-${index + 1}`),
  label: String(section.label || '').trim(),
  title: String(section.title || '').trim(),
  content: String(section.content || '').trim(),
});

const buildLegacySections = (source: Record<string, unknown>): TermsSection[] => {
  const sections = Array.from({ length: 6 }, (_, index) => {
    const position = index + 1;
    const title = String(source[`section${position}_title`] || '').trim();
    const content = String(source[`section${position}_content`] || '').trim();
    return sanitizeSection(
      {
        id: `section${position}`,
        label: stripSectionPrefix(title),
        title,
        content,
      },
      index,
    );
  });

  return sections.filter((section) => section.title || section.content);
};

const normalizeSections = (source: Record<string, unknown>): TermsSection[] => {
  const rawSections = source.sections;
  if (Array.isArray(rawSections) && rawSections.length > 0) {
    return rawSections
      .map((section, index) => sanitizeSection((section || {}) as Partial<TermsSection>, index))
      .filter((section) => section.title || section.content || section.label);
  }

  return buildLegacySections(source);
};

const normalizeTermsPageContent = (source: Record<string, unknown>): TermsPageContent => ({
  id: String(source.id || ''),
  last_updated_date: String(source.last_updated_date || ''),
  sections: normalizeSections(source),
  section1_title: String(source.section1_title || ''),
  section1_content: String(source.section1_content || ''),
  section2_title: String(source.section2_title || ''),
  section2_content: String(source.section2_content || ''),
  section3_title: String(source.section3_title || ''),
  section3_content: String(source.section3_content || ''),
  section4_title: String(source.section4_title || ''),
  section4_content: String(source.section4_content || ''),
  section5_title: String(source.section5_title || ''),
  section5_content: String(source.section5_content || ''),
  section6_title: String(source.section6_title || ''),
  section6_content: String(source.section6_content || ''),
  last_updated_by: source.last_updated_by ? String(source.last_updated_by) : null,
  created_at: String(source.created_at || new Date().toISOString()),
  updated_at: String(source.updated_at || new Date().toISOString()),
});

const buildLegacyMirrorFields = (sections: TermsSection[]) =>
  Array.from({ length: 6 }).reduce<Record<string, string>>((accumulator, _, index) => {
    const section = sections[index];
    const position = index + 1;
    accumulator[`section${position}_title`] = section?.title || '';
    accumulator[`section${position}_content`] = section?.content || '';
    return accumulator;
  }, {});

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
        console.error('Erro ao buscar pagina Terms:', fetchError);
        setError(fetchError.message);
        return;
      }

      setContent(normalizeTermsPageContent(data as Record<string, unknown>));
    } catch (err) {
      console.error('Erro inesperado ao buscar conteudo:', err);
      setError('Erro ao carregar conteudo');
    } finally {
      setIsLoading(false);
    }
  };

  const updateContent = async (
    updates: UpdateTermsPageData,
    userId: string,
  ): Promise<{ error: string | null }> => {
    try {
      const normalizedSections = (updates.sections || []).map((section, index) => sanitizeSection(section, index));
      const payload = {
        ...(updates.last_updated_date !== undefined ? { last_updated_date: updates.last_updated_date } : {}),
        ...(updates.sections !== undefined
          ? {
              sections: normalizedSections,
              ...buildLegacyMirrorFields(normalizedSections),
            }
          : {}),
        last_updated_by: userId,
      };

      const { data, error: updateError } = await supabase
        .from('terms_page_content')
        .update(payload)
        .eq('id', SINGLETON_ID)
        .select('*')
        .single();

      if (updateError) {
        console.error('Erro ao atualizar pagina Terms:', updateError);
        return { error: updateError.message };
      }

      setContent(normalizeTermsPageContent(data as Record<string, unknown>));
      return { error: null };
    } catch (err) {
      console.error('Erro inesperado ao atualizar:', err);
      return { error: 'Erro ao salvar alteracoes' };
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

export const TERMS_PAGE_FALLBACK: TermsPageContent = normalizeTermsPageContent({
  id: '00000000-0000-0000-0000-000000000002',
  last_updated_date: '25 de Maio de 2026',
  section1_title: '1. Escopo, aceite e papel da plataforma',
  section1_content:
    'A BWAGRO e uma plataforma digital voltada ao agronegocio para divulgacao de anuncios, operacao de lojas parceiras, contratacao de planos, troca de mensagens e aproximacao entre usuarios. Ao acessar, criar conta ou utilizar qualquer recurso da plataforma, o usuario declara que leu e concorda com estes Termos de Uso e com a Politica de Privacidade.\n\nA BWAGRO nao compra, nao vende e nao assume a posse dos bens anunciados. A plataforma atua como ambiente de divulgacao, organizacao de informacoes, moderacao e apoio operacional. A conclusao do negocio depende exclusivamente das partes envolvidas.',
  section2_title: '2. Cadastro, conta e veracidade das informacoes',
  section2_content:
    'Para utilizar recursos como publicar anuncios, contratar planos, operar loja parceira, enviar documentos de verificacao ou interagir por mensagens, o usuario deve manter cadastro correto, completo e atualizado. O acesso e pessoal e intransferivel, e a senha deve ser guardada com seguranca.\n\nO usuario responde por todas as atividades realizadas em sua conta e deve informar imediatamente qualquer uso indevido, suspeita de fraude ou acesso nao autorizado. A BWAGRO pode solicitar confirmacao de identidade, complementar dados cadastrais, bloquear alteracoes sensiveis ou suspender funcionalidades quando houver inconsistencias, duplicidade documental, risco operacional ou determinacao legal.',
  section3_title: '3. Regras de anuncios, moderacao e verificacoes',
  section3_content:
    'Todo anuncio deve refletir a realidade do bem, servico ou oportunidade ofertada. O anunciante e integralmente responsavel pelo titulo, descricao, preco, imagens, videos, documentos, disponibilidade, localizacao, categoria escolhida e demais dados publicados.\n\nNao e permitido publicar conteudo ilicito, enganoso, ofensivo, duplicado de forma indevida, com indicios de fraude, com links externos ou contatos em locais proibidos pelas regras da plataforma, ou que viole direitos de terceiros. A BWAGRO pode aplicar filtros automaticos, revisao manual, bloqueio preventivo, envio para analise, rejeicao, remocao, limitacao de alcance, cancelamento de destaque, exigencia de documentos ou suspensao da conta.\n\nRecursos como selo verificado, loja parceira, destaque em Home, destaque em Categoria, vitrine premium e edicoes sob analise dependem do cumprimento das politicas internas, das regras comerciais vigentes e da disponibilidade tecnica da plataforma.',
  section4_title: '4. Planos, destaques, cobrancas e reembolsos',
  section4_content:
    'A plataforma pode oferecer modalidade gratuita e modalidades pagas, incluindo planos recorrentes, boosters, vitrines, destaques e outros recursos de exposicao ou conversao. Os valores, beneficios, limites, prazos, elegibilidade e condicoes promocionais sao os descritos na pagina comercial vigente no momento da contratacao.\n\nO pagamento de um plano ou destaque nao garante venda, lead, volume minimo de visualizacoes nem resultado comercial especifico. Recursos pagos podem possuir prazo proprio, regras de cooldown, limite de uso, dependencia de aprovacao do anuncio e perda do beneficio quando houver violacao das politicas da plataforma.\n\nPedidos de cancelamento, estorno ou reembolso serao tratados conforme a politica comercial aplicavel, a legislacao de consumo e o historico de utilizacao efetiva do recurso contratado.',
  section5_title: '5. Condutas proibidas e propriedade intelectual',
  section5_content:
    'E proibido utilizar a BWAGRO para fraude, raspagem automatizada de dados, engenharia reversa, envio massivo de mensagens, contorno de moderacao, uso indevido de identidade visual de terceiros, tentativa de burlar planos, captacao irregular de contatos ou qualquer pratica que prejudique usuarios, parceiros ou a integridade do sistema.\n\nA marca BWAGRO, seu software, layout, base visual, textos institucionais e demais ativos da plataforma pertencem aos respectivos titulares. O usuario continua titular do conteudo que enviar, mas declara possuir autorizacao para publicacao e concede a BWAGRO licenca de uso necessaria para hospedagem, exibicao, distribuicao, moderacao e promocao do anuncio dentro do ecossistema da plataforma.',
  section6_title: '6. Responsabilidade, sancoes e atualizacoes',
  section6_content:
    'A BWAGRO nao garante qualidade, procedencia, titularidade, regularidade documental, entrega, pagamento, adimplemento ou conclusao de negocios entre usuarios. Sempre recomendamos verificacao presencial, conferencia documental e uso de meios seguros antes da contratacao.\n\nA plataforma podera advertir, restringir funcionalidades, remover anuncios, reprovar verificacoes, reter publicacoes para analise, cancelar beneficios, suspender ou encerrar contas em caso de descumprimento destes Termos, suspeita de fraude, risco reputacional, exigencia legal ou operacional.\n\nEstes Termos podem ser atualizados a qualquer tempo. Havendo alteracoes relevantes, a BWAGRO podera exigir novo aceite para continuidade do uso. Duvidas ou solicitacoes podem ser encaminhadas para suporte@bwagro.com.br.',
  last_updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
