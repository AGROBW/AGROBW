export const SELLER_STORE_INSIGHT_SOURCE_CHANNELS = [
  'direct',
  'internal',
  'google',
  'whatsapp',
  'social',
  'catalog_pdf',
  'other',
] as const;

export type SellerStoreInsightSourceChannel = (typeof SELLER_STORE_INSIGHT_SOURCE_CHANNELS)[number];

export type SellerStoreAttribution = {
  storeSlug: string;
  sourceChannel: SellerStoreInsightSourceChannel;
  catalogExportId?: string;
};

const SOURCE_QUERY_PARAM = 'store_source';
const STORE_QUERY_PARAM = 'store';
const CATALOG_QUERY_PARAM = 'catalog';
const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isSourceChannel = (value: string | null): value is SellerStoreInsightSourceChannel =>
  Boolean(value && SELLER_STORE_INSIGHT_SOURCE_CHANNELS.includes(value as SellerStoreInsightSourceChannel));

const normalizeCampaignSource = (value: string | null): SellerStoreInsightSourceChannel | null => {
  const source = value?.trim().toLowerCase();
  if (!source) return null;
  if (isSourceChannel(source)) return source;
  if (source.includes('whatsapp') || source === 'wa') return 'whatsapp';
  if (source.includes('google')) return 'google';
  if (
    source.includes('facebook') ||
    source.includes('instagram') ||
    source.includes('linkedin') ||
    source.includes('twitter') ||
    source === 'x' ||
    source.includes('social')
  ) {
    return 'social';
  }
  if (source.includes('catalog') || source.includes('pdf')) return 'catalog_pdf';
  return 'other';
};

export const resolveSellerStoreInsightSource = ({
  search = '',
  referrer = '',
  currentOrigin = '',
}: {
  search?: string;
  referrer?: string;
  currentOrigin?: string;
}): SellerStoreInsightSourceChannel => {
  const params = new URLSearchParams(search);
  const explicitSource = normalizeCampaignSource(
    params.get(SOURCE_QUERY_PARAM) || params.get('utm_source'),
  );
  if (explicitSource) return explicitSource;

  if (!referrer) return 'direct';

  try {
    const referrerUrl = new URL(referrer);
    const hostname = referrerUrl.hostname.toLowerCase();

    if (currentOrigin && referrerUrl.origin === currentOrigin) return 'internal';
    if (hostname === 'google.com' || hostname.endsWith('.google.com')) return 'google';
    if (hostname === 'wa.me' || hostname.includes('whatsapp')) return 'whatsapp';
    if (
      hostname.includes('facebook') ||
      hostname.includes('instagram') ||
      hostname.includes('linkedin') ||
      hostname.includes('twitter') ||
      hostname === 'x.com' ||
      hostname.endsWith('.x.com')
    ) {
      return 'social';
    }
  } catch {
    return 'other';
  }

  return 'other';
};

export const appendSellerStoreAttribution = (
  path: string,
  attribution: SellerStoreAttribution,
) => {
  const [pathAndSearch, hash = ''] = path.split('#', 2);
  const [pathname, search = ''] = pathAndSearch.split('?', 2);
  const params = new URLSearchParams(search);

  params.set(STORE_QUERY_PARAM, attribution.storeSlug);
  params.set(SOURCE_QUERY_PARAM, attribution.sourceChannel);
  if (attribution.catalogExportId && UUID_PATTERN.test(attribution.catalogExportId)) {
    params.set(CATALOG_QUERY_PARAM, attribution.catalogExportId);
  }

  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ''}${hash ? `#${hash}` : ''}`;
};

export const readSellerStoreAttribution = (search: string): SellerStoreAttribution | null => {
  const params = new URLSearchParams(search);
  const storeSlug = params.get(STORE_QUERY_PARAM)?.trim().toLowerCase() || '';
  const sourceChannel = params.get(SOURCE_QUERY_PARAM);
  const catalogExportId = params.get(CATALOG_QUERY_PARAM)?.trim() || '';

  if (!STORE_SLUG_PATTERN.test(storeSlug) || !isSourceChannel(sourceChannel)) return null;
  return {
    storeSlug,
    sourceChannel,
    ...(UUID_PATTERN.test(catalogExportId) ? { catalogExportId } : {}),
  };
};

export const buildAttributedStoreUrl = (
  baseUrl: string,
  sourceChannel: SellerStoreInsightSourceChannel,
) => {
  const url = new URL(baseUrl);
  url.searchParams.set(SOURCE_QUERY_PARAM, sourceChannel);
  return url.toString();
};
