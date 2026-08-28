import type { Ad } from '../../types';

export type AdArtworkTemplate = 'showcase' | 'impact' | 'institutional';
export type AdArtworkFormat = 'square' | 'story' | 'landscape';
export type AdArtworkPriceMode = 'price' | 'consult';

export const AD_ARTWORK_TEMPLATES: Array<{
  id: AdArtworkTemplate;
  name: string;
  description: string;
}> = [
  { id: 'showcase', name: 'Vitrine', description: 'Produto em primeiro plano e leitura direta.' },
  { id: 'impact', name: 'Impacto', description: 'Visual forte para chamar atencao rapidamente.' },
  { id: 'institutional', name: 'Institucional', description: 'Composicao limpa com destaque para a marca.' },
];

export const AD_ARTWORK_FORMATS: Array<{
  id: AdArtworkFormat;
  name: string;
  dimensions: string;
  width: number;
  height: number;
}> = [
  { id: 'square', name: 'Feed quadrado', dimensions: '1080 x 1080', width: 1080, height: 1080 },
  { id: 'story', name: 'Stories', dimensions: '1080 x 1920', width: 1080, height: 1920 },
  { id: 'landscape', name: 'Facebook', dimensions: '1200 x 628', width: 1200, height: 628 },
];

export const getAdArtworkDimensions = (format: AdArtworkFormat) => {
  const selected = AD_ARTWORK_FORMATS.find((item) => item.id === format);
  return selected || AD_ARTWORK_FORMATS[0];
};

export const formatAdArtworkPrice = (
  price: number | null | undefined,
  mode: AdArtworkPriceMode,
) => {
  if (mode === 'consult' || !Number.isFinite(price) || Number(price) <= 0) {
    return 'Sob consulta';
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number(price));
};

export const getDefaultAdArtworkPriceMode = (ad: Pick<Ad, 'price' | 'priceNegotiable'>): AdArtworkPriceMode =>
  ad.price > 0 && !ad.priceNegotiable ? 'price' : 'consult';

export const buildAdArtworkLocation = (location?: Ad['location']) =>
  [location?.city?.trim(), location?.state?.trim()].filter(Boolean).join(' - ') || 'Brasil';

export const buildAdArtworkFileName = (
  title: string,
  format: AdArtworkFormat,
  template: AdArtworkTemplate,
) => {
  const safeTitle = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'anuncio';

  return `agro-bw-${safeTitle}-${template}-${format}.png`;
};

