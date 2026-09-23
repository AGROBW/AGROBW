import { describe, expect, it } from 'vitest';
import {
  buildSellerStoreCatalogDocument,
  SELLER_STORE_CATALOG_INDEX_ITEMS_PER_PAGE,
  SELLER_STORE_CATALOG_PRODUCTS_PER_PAGE,
  SELLER_STORE_CATALOG_SMALL_CATALOG_LIMIT,
  type SellerStoreCatalogBuildInput,
  type SellerStoreCatalogPriceMode,
} from '../sellerStoreCatalog/documentModel';
import { renderSellerStoreCatalogHtml } from '../sellerStoreCatalog/renderHtml';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const qaScript = readFileSync(resolve(process.cwd(), 'scripts/render-seller-store-catalog-qa-matrix.ts'), 'utf8');

const announcement = (index: number, withImage = true) => ({
  id: `matrix-${index}`,
  title: `Título extenso do equipamento agrícola ${index} com configuração completa para operações profissionais e uso contínuo`,
  description: 'Descrição técnica extensa '.repeat(40),
  price: 50_000 + index,
  product_condition: 'used',
  availability: 'available',
  city: 'Campo Grande',
  state: 'MS',
  images: withImage ? ['https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/test.webp'] : [],
  public_url: `https://agrobw.com.br/anuncio/matrix-${index}`,
});

const input = (count: number, priceMode: SellerStoreCatalogPriceMode = 'show'): SellerStoreCatalogBuildInput => ({
  exportId: `matrix-${count}`,
  catalogTitle: 'Catálogo editorial com um título deliberadamente extenso para validar a composição tipográfica da capa',
  catalogSubtitle: 'Subtítulo de validação para diferentes quantidades de produtos.',
  priceMode,
  coverAlignment: 'right',
  generatedAt: '2026-09-22T18:00:00.000Z',
  store: {
    id: 'store',
    slug: 'store',
    store_name: 'Loja de Validação',
    cover_url: 'https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/cover.webp',
    public_url: 'https://agrobw.com.br/loja/store',
  },
  announcements: Array.from({ length: count }, (_, index) => announcement(index + 1, index % 3 !== 0)),
});

const expectedPages = (count: number) => count <= SELLER_STORE_CATALOG_SMALL_CATALOG_LIMIT
  ? count + 2
  : 2
    + Math.ceil(count / SELLER_STORE_CATALOG_INDEX_ITEMS_PER_PAGE)
    + Math.ceil(count / SELLER_STORE_CATALOG_PRODUCTS_PER_PAGE);

describe('Seller Store PDF Catalog visual stage 3 matrix', () => {
  it.each([1, 2, 5, 20, 100])('keeps deterministic pagination for %i announcements', (count) => {
    const document = buildSellerStoreCatalogDocument(input(count));
    expect(document.totalPages).toBe(expectedPages(count));
    expect(document.pages.at(-1)?.kind).toBe('back-cover');
    expect(document.pages.map((page) => page.pageNumber)).toEqual(
      Array.from({ length: document.totalPages }, (_, index) => index + 1),
    );
  });

  it('keeps no more than six index rows and reserves print-safe footer space', () => {
    expect(SELLER_STORE_CATALOG_INDEX_ITEMS_PER_PAGE).toBe(12);
    expect(expectedPages(20)).toBe(14);
    expect(expectedPages(100)).toBe(61);
  });

  it('constrains long copy and keeps missing images as safe placeholders', async () => {
    const document = buildSellerStoreCatalogDocument(input(5));
    const html = await renderSellerStoreCatalogHtml(document, {
      qrCodeFactory: async () => 'data:image/png;base64,qr',
    });

    expect(document.title.length).toBeLessThanOrEqual(120);
    expect(document.products.every((product) => product.title.length <= 96)).toBe(true);
    expect(document.products.every((product) => product.description.length <= 420)).toBe(true);
    expect(document.products.some((product) => product.images.length === 0)).toBe(true);
    expect(html).toContain('image-placeholder');
    expect(html).toContain('cover-title-long');
  });

  it('renders a single branded cover fallback when the store has no cover or logo', async () => {
    const withoutBrandAssets = input(2);
    withoutBrandAssets.store.cover_url = null;
    withoutBrandAssets.store.logo_url = null;
    const html = await renderSellerStoreCatalogHtml(buildSellerStoreCatalogDocument(withoutBrandAssets), {
      qrCodeFactory: async () => 'data:image/png;base64,qr',
    });

    expect(html.match(/class="cover-empty"/g)).toHaveLength(1);
    expect(html).not.toContain('cover-image-backdrop image-placeholder');
    expect(html).not.toContain('cover-image-main image-placeholder');
  });

  it('matches the production browser isolation and rejects measurable overflow', () => {
    expect(qaScript).toContain("request.abort('blockedbyclient')");
    expect(qaScript).toContain("page.emulateMediaType('print')");
    expect(qaScript).toContain('globalThis.document.fonts.ready');
    expect(qaScript).toContain('CATALOG_QA_LAYOUT_OVERFLOW');
    expect(qaScript).toContain('withoutBrandAssets: true');
    expect(qaScript).toContain('worstCaseIndex: true');
    expect(qaScript).toContain("'.store-intro, .index-grid, .index-item, .product-card'");
    expect(qaScript).toContain('.slice(0, 680)');
    expect(qaScript).not.toContain('networkidle0');
  });

  it.each([
    ['show', 'R$'],
    ['consult', 'Consulte o vendedor'],
    ['hide', null],
  ] as const)('applies the %s price policy throughout the document', (priceMode, expected) => {
    const document = buildSellerStoreCatalogDocument(input(5, priceMode));
    if (expected === null) {
      expect(document.products.every((product) => product.priceLabel === null)).toBe(true);
    } else {
      expect(document.products.every((product) => product.priceLabel?.includes(expected))).toBe(true);
    }
  });
});
