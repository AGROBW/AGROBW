export const SELLER_STORE_CATALOG_SCHEMA_VERSION = '2026-09-21' as const;
export const SELLER_STORE_CATALOG_LAYOUT_VERSION = 'premium-v1' as const;
export const SELLER_STORE_CATALOG_PRODUCTS_PER_PAGE = 2;
export const SELLER_STORE_CATALOG_INDEX_ITEMS_PER_PAGE = 16;
export const SELLER_STORE_CATALOG_IMAGE_HOSTS = new Set([
  'agrobw.com.br',
  'www.agrobw.com.br',
  'dockpbyzrvgewgdoaibn.supabase.co',
]);

export type SellerStoreCatalogPriceMode = 'show' | 'hide' | 'consult';

export type SellerStoreCatalogStoreSnapshot = {
  id: string;
  slug: string;
  store_name: string;
  description?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  cover_mobile_url?: string | null;
  city?: string | null;
  state?: string | null;
  is_verified?: boolean | null;
  public_url: string;
  platform_name?: string | null;
};

export type SellerStoreCatalogAnnouncementSnapshot = {
  id: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  price?: number | string | null;
  price_negotiable?: boolean | null;
  product_condition?: string | null;
  availability?: string | null;
  accepts_trade?: boolean | null;
  city?: string | null;
  state?: string | null;
  category_id?: string | null;
  sub_category_id?: string | null;
  sub_category_label?: string | null;
  images?: unknown;
  public_url: string;
  store_display_order?: number | null;
  updated_at?: string | null;
};

export type SellerStoreCatalogBuildInput = {
  exportId: string;
  catalogTitle: string;
  catalogSubtitle?: string | null;
  priceMode: SellerStoreCatalogPriceMode;
  generatedAt: string;
  store: SellerStoreCatalogStoreSnapshot;
  announcements: SellerStoreCatalogAnnouncementSnapshot[];
};

export type SellerStoreCatalogStore = {
  id: string;
  name: string;
  description: string;
  logoUrl: string | null;
  coverUrl: string | null;
  location: string;
  verified: boolean;
  publicUrl: string;
};

export type SellerStoreCatalogProduct = {
  id: string;
  ordinal: number;
  title: string;
  description: string;
  priceLabel: string | null;
  location: string;
  conditionLabel: string | null;
  availabilityLabel: string | null;
  categoryLabel: string | null;
  badges: string[];
  images: string[];
  publicUrl: string;
};

export type SellerStoreCatalogPage =
  | { kind: 'cover'; pageNumber: 1 }
  | { kind: 'index'; pageNumber: number; products: SellerStoreCatalogProduct[] }
  | { kind: 'products'; pageNumber: number; products: SellerStoreCatalogProduct[] }
  | { kind: 'back-cover'; pageNumber: number };

export type SellerStoreCatalogDocument = {
  schemaVersion: typeof SELLER_STORE_CATALOG_SCHEMA_VERSION;
  layoutVersion: typeof SELLER_STORE_CATALOG_LAYOUT_VERSION;
  exportId: string;
  generatedAt: string;
  title: string;
  subtitle: string | null;
  priceMode: SellerStoreCatalogPriceMode;
  store: SellerStoreCatalogStore;
  products: SellerStoreCatalogProduct[];
  pages: SellerStoreCatalogPage[];
  totalPages: number;
};

const CONDITION_LABELS: Record<string, string> = {
  new: 'Novo',
  novo: 'Novo',
  used: 'Usado',
  usado: 'Usado',
  seminovo: 'Seminovo',
};

const AVAILABILITY_LABELS: Record<string, string> = {
  available: 'Disponivel',
  disponivel: 'Disponivel',
  pronta_entrega: 'Pronta entrega',
  preorder: 'Sob encomenda',
  sob_encomenda: 'Sob encomenda',
};

const stripMarkup = (value: unknown): string => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  const lastSpace = shortened.lastIndexOf(' ');
  return `${lastSpace > maxLength * 0.6 ? shortened.slice(0, lastSpace) : shortened}...`;
};

const canonicalPlatformUrl = (value: unknown, fallbackPath: string): string => {
  try {
    const parsed = new URL(String(value ?? ''));
    if (parsed.protocol === 'https:' && (parsed.hostname === 'agrobw.com.br' || parsed.hostname.endsWith('.agrobw.com.br'))) {
      parsed.hash = '';
      return parsed.toString();
    }
  } catch {
    // Invalid or non-canonical snapshot URLs fall back to the platform URL.
  }
  return `https://agrobw.com.br${fallbackPath}`;
};

const safeImageUrl = (value: unknown): string | null => {
  try {
    const parsed = new URL(String(value ?? ''));
    if (parsed.protocol !== 'https:' || !SELLER_STORE_CATALOG_IMAGE_HOSTS.has(parsed.hostname)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
};

const normalizeImages = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map(safeImageUrl).filter((url): url is string => Boolean(url)).slice(0, 3);
};

const formatLocation = (city: unknown, state: unknown): string => {
  const parts = [stripMarkup(city), stripMarkup(state)].filter(Boolean);
  return parts.join(' - ');
};

const formatMappedLabel = (value: unknown, labels: Record<string, string>): string | null => {
  const normalized = stripMarkup(value).toLocaleLowerCase('pt-BR').replace(/[\s-]+/g, '_');
  if (!normalized) return null;
  return labels[normalized] ?? truncate(stripMarkup(value), 36);
};

const formatPrice = (
  value: unknown,
  mode: SellerStoreCatalogPriceMode,
  priceNegotiable = false,
): string | null => {
  if (mode === 'hide') return null;
  if (mode === 'consult' || priceNegotiable) return 'Consulte o vendedor';
  const numericValue = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'Consulte o vendedor';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

export const buildSellerStoreCatalogDocument = (
  input: SellerStoreCatalogBuildInput,
): SellerStoreCatalogDocument => {
  if (!input.exportId.trim()) throw new Error('CATALOG_DOCUMENT_EXPORT_ID_REQUIRED');
  if (!input.announcements.length || input.announcements.length > 100) {
    throw new Error('CATALOG_DOCUMENT_ANNOUNCEMENT_LIMIT');
  }
  if (!['show', 'hide', 'consult'].includes(input.priceMode)) {
    throw new Error('CATALOG_DOCUMENT_INVALID_PRICE_MODE');
  }
  if (Number.isNaN(Date.parse(input.generatedAt))) {
    throw new Error('CATALOG_DOCUMENT_INVALID_GENERATED_AT');
  }

  const storeName = truncate(stripMarkup(input.store.store_name) || 'Loja Parceira', 80);
  const products = input.announcements.map((announcement, index): SellerStoreCatalogProduct => {
    const conditionLabel = formatMappedLabel(announcement.product_condition, CONDITION_LABELS);
    const availabilityLabel = formatMappedLabel(announcement.availability, AVAILABILITY_LABELS);
    const badges = [
      announcement.price_negotiable ? 'Sob consulta' : null,
      announcement.accepts_trade ? 'Aceita troca' : null,
    ].filter((badge): badge is string => Boolean(badge));

    return {
      id: announcement.id,
      ordinal: index + 1,
      title: truncate(stripMarkup(announcement.title) || `Anuncio ${index + 1}`, 96),
      description: truncate(stripMarkup(announcement.description), 420),
      priceLabel: formatPrice(announcement.price, input.priceMode, announcement.price_negotiable === true),
      location: formatLocation(announcement.city, announcement.state),
      conditionLabel,
      availabilityLabel,
      categoryLabel: truncate(stripMarkup(announcement.sub_category_label), 42) || null,
      badges,
      images: normalizeImages(announcement.images),
      publicUrl: canonicalPlatformUrl(announcement.public_url, `/anuncio/${announcement.id}`),
    };
  });

  const pages: SellerStoreCatalogPage[] = [{ kind: 'cover', pageNumber: 1 }];
  for (const productsPage of chunk(products, SELLER_STORE_CATALOG_INDEX_ITEMS_PER_PAGE)) {
    pages.push({ kind: 'index', pageNumber: pages.length + 1, products: productsPage });
  }
  for (const productsPage of chunk(products, SELLER_STORE_CATALOG_PRODUCTS_PER_PAGE)) {
    pages.push({ kind: 'products', pageNumber: pages.length + 1, products: productsPage });
  }
  pages.push({ kind: 'back-cover', pageNumber: pages.length + 1 });

  return {
    schemaVersion: SELLER_STORE_CATALOG_SCHEMA_VERSION,
    layoutVersion: SELLER_STORE_CATALOG_LAYOUT_VERSION,
    exportId: input.exportId.trim(),
    generatedAt: new Date(input.generatedAt).toISOString(),
    title: truncate(stripMarkup(input.catalogTitle) || `Catalogo ${storeName}`, 120),
    subtitle: truncate(stripMarkup(input.catalogSubtitle), 240) || null,
    priceMode: input.priceMode,
    store: {
      id: input.store.id,
      name: storeName,
      description: truncate(stripMarkup(input.store.description), 680),
      logoUrl: safeImageUrl(input.store.logo_url),
      coverUrl: safeImageUrl(input.store.cover_url) ?? safeImageUrl(input.store.cover_mobile_url),
      location: formatLocation(input.store.city, input.store.state),
      verified: input.store.is_verified === true,
      publicUrl: canonicalPlatformUrl(input.store.public_url, `/loja/${encodeURIComponent(input.store.slug)}`),
    },
    products,
    pages,
    totalPages: pages.length,
  };
};
