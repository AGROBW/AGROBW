import { buildCanonicalSiteUrl, resolveSeoImageUrl } from '../siteConfig';

// Camada central de metadados de SEO. Normaliza título/descrição, garante
// canonical determinístico em https://agrobw.com.br e uma única imagem social
// padrão. Não altera regras de negócio nem conteúdo administrável — apenas
// formata os valores já fornecidos por cada página.

export const BRAND_NAME = 'AGRO BW';
export const TITLE_SUFFIX = ` | ${BRAND_NAME}`;
// Limite do TÍTULO FINAL (já com o sufixo de marca).
export const FINAL_TITLE_MAX_LENGTH = 70;
const DESCRIPTION_MAX_LENGTH = 160;

const DEFAULT_DESCRIPTION =
  'Marketplace rural para comprar, vender e anunciar no agronegócio com mais visibilidade.';

/** Remove marcação HTML e colapsa espaços — seguro para textos vindos de CMS. */
export const stripHtml = (input: string): string =>
  (input || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Limita o comprimento preservando palavras inteiras. O resultado (incluindo as
 * reticências, quando corta) nunca ultrapassa maxLength.
 */
const clampText = (value: string, maxLength: number): string => {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const hardSlice = trimmed.slice(0, maxLength - 1); // reserva espaço para "…"
  const lastSpace = hardSlice.lastIndexOf(' ');
  const base = lastSpace > maxLength * 0.6 ? hardSlice.slice(0, lastSpace) : hardSlice;
  return `${base.trim()}…`;
};

/**
 * Acrescenta o sufixo de marca " | AGRO BW", sem duplicar quando o título já
 * contém "AGRO BW". Espelha o comportamento aplicado pelo SeoHead.
 */
export const applyBrandSuffix = (title: string): string => {
  const trimmed = (title || '').trim();
  if (!trimmed) return BRAND_NAME;
  if (trimmed.includes(BRAND_NAME)) return trimmed;
  return `${trimmed}${TITLE_SUFFIX}`;
};

/**
 * Produz um título-base tal que, após o SeoHead adicionar o sufixo de marca, o
 * título final tenha no máximo FINAL_TITLE_MAX_LENGTH caracteres.
 */
const buildBaseTitle = (rawTitle: string): string => {
  const clampedFull = clampText(rawTitle, FINAL_TITLE_MAX_LENGTH);
  // Se o título (após clamp) já contém a marca, o SeoHead não adiciona sufixo.
  if (clampedFull.includes(BRAND_NAME)) return clampedFull || BRAND_NAME;
  // Caso contrário, reserva espaço para o sufixo dentro do limite final.
  return clampText(rawTitle, FINAL_TITLE_MAX_LENGTH - TITLE_SUFFIX.length) || BRAND_NAME;
};

export type SeoMetadataInput = {
  /** Título bruto (sem o sufixo "| AGRO BW", adicionado depois pelo SeoHead). */
  title: string;
  description: string;
  /** Caminho canônico relativo, ex.: "/contato". Vira URL absoluta em agrobw.com.br. */
  path: string;
  image?: string | null;
  type?: 'website' | 'article';
  noIndex?: boolean;
};

export type SeoMetadata = {
  title: string;
  description: string;
  /** URL absoluta canônica, sempre no domínio canônico. */
  canonical: string;
  /** URL absoluta da imagem social. */
  image: string;
  type: 'website' | 'article';
  noIndex: boolean;
};

export const buildSeoMetadata = (input: SeoMetadataInput): SeoMetadata => {
  const title = buildBaseTitle(stripHtml(input.title));
  const description = clampText(
    stripHtml(input.description) || DEFAULT_DESCRIPTION,
    DESCRIPTION_MAX_LENGTH,
  );

  return {
    title,
    description,
    canonical: buildCanonicalSiteUrl(input.path || '/'),
    image: resolveSeoImageUrl(input.image),
    type: input.type ?? 'website',
    noIndex: input.noIndex ?? false,
  };
};
