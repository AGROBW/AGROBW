import { describe, expect, it } from 'vitest';
import {
  buildSellerStoreCatalogDocument,
  SELLER_STORE_CATALOG_LAYOUT_VERSION,
  SELLER_STORE_CATALOG_MAX_PRODUCTS,
  SELLER_STORE_CATALOG_PRODUCTS_PER_PAGE,
  type SellerStoreCatalogBuildInput,
} from '../sellerStoreCatalog/documentModel';
import { renderSellerStoreCatalogHtml } from '../sellerStoreCatalog/renderHtml';

const announcement = (index: number) => ({
  id: `announcement-${index}`,
  slug: `maquina-${index}`,
  title: `Maquina agricola ${index}`,
  description: `<p>Equipamento revisado para a safra ${index}.</p>`,
  price: 120000 + index,
  price_negotiable: index % 2 === 0,
  product_condition: 'used',
  availability: 'available',
  accepts_trade: index % 3 === 0,
  city: 'Campo Grande',
  state: 'MS',
  sub_category_label: 'Maquinas agricolas',
  images: [`https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/machine-${index}.webp`, 'https://cdn.example.com/untrusted.webp', 'javascript:alert(1)'],
  public_url: `https://agrobw.com.br/anuncio/maquina-${index}#tracking`,
});

const input = (count = 3): SellerStoreCatalogBuildInput => ({
  exportId: 'export-1',
  catalogTitle: 'Catalogo Safra 2026',
  catalogSubtitle: 'Oportunidades selecionadas para o produtor rural',
  priceMode: 'show',
  generatedAt: '2026-09-21T18:00:00.000Z',
  store: {
    id: 'store-1',
    slug: 'campo-forte',
    store_name: 'Campo Forte Maquinas',
    description: '<b>Negocios confiaveis</b> para todo o Brasil.',
    logo_url: 'https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/logo.png',
    cover_url: 'https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/cover.webp',
    city: 'Campo Grande',
    state: 'MS',
    is_verified: true,
    public_url: 'https://agrobw.com.br/loja/campo-forte#top',
  },
  announcements: Array.from({ length: count }, (_, index) => announcement(index + 1)),
});

describe('Seller Store PDF Catalog premium document', () => {
  it('normalizes snapshot data into a deterministic safe document', () => {
    const first = buildSellerStoreCatalogDocument(input());
    const second = buildSellerStoreCatalogDocument(input());

    expect(second).toEqual(first);
    expect(first.layoutVersion).toBe(SELLER_STORE_CATALOG_LAYOUT_VERSION);
    expect(first.store.coverAlignment).toBe('center');
    expect(first.store.description).toBe('Negocios confiaveis para todo o Brasil.');
    expect(first.store.publicUrl).toBe('https://agrobw.com.br/loja/campo-forte');
    expect(first.products[0].description).toBe('Equipamento revisado para a safra 1.');
    expect(first.products[0].images).toEqual([
      'https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/machine-1.webp',
    ]);
    expect(first.products[0].publicUrl).toBe('https://agrobw.com.br/anuncio/maquina-1');
  });

  it('paginates six-product grids without a duplicated index', () => {
    const document = buildSellerStoreCatalogDocument(input(35));
    const productPages = document.pages.filter((page) => page.kind === 'products');

    expect(document.pages.some((page) => (page as { kind: string }).kind === 'index')).toBe(false);
    expect(productPages).toHaveLength(Math.ceil(35 / SELLER_STORE_CATALOG_PRODUCTS_PER_PAGE));
    expect(productPages.every((page) => page.products.length <= SELLER_STORE_CATALOG_PRODUCTS_PER_PAGE)).toBe(true);
    expect(document.pages.map((page) => page.pageNumber)).toEqual(
      Array.from({ length: document.totalPages }, (_, index) => index + 1),
    );
  });

  it('fits up to six products on a single compact page', () => {
    const document = buildSellerStoreCatalogDocument(input(6));
    const productPages = document.pages.filter((page) => page.kind === 'products');

    expect(productPages).toHaveLength(1);
    expect(productPages[0].products).toHaveLength(6);
  });

  it('preserves a valid cover alignment and renders it as a constrained class', async () => {
    const document = buildSellerStoreCatalogDocument({ ...input(1), coverAlignment: 'right' });
    const html = await renderSellerStoreCatalogHtml(document, {
      qrCodeFactory: async () => 'data:image/png;base64,qr',
    });

    expect(document.store.coverAlignment).toBe('right');
    expect(html).toContain('cover-page cover-align-right cover-hero-standard');
    expect(html).toContain('.cover-align-right .cover-hero-image { object-position: right top; }');
  });

  it('uses the natural proportional height for ultrawide banners without leaving a fixed hero gap', async () => {
    const document = buildSellerStoreCatalogDocument(input(1));
    document.store.coverAspectRatio = 6.8;
    const html = await renderSellerStoreCatalogHtml(document, {
      qrCodeFactory: async () => 'data:image/png;base64,qr',
    });

    expect(html).toContain('cover-hero-ultrawide');
    expect(html).toContain('--cover-hero-height: 30.88mm; --cover-content-top: 41.88mm;');
    expect(html).toContain('.cover-hero-ultrawide .cover-hero-image { object-fit: contain; }');
    expect(html).toContain('height: 6mm; background: linear-gradient');
  });

  it('sizes the cover heading from the store name and keeps the catalog label separate', async () => {
    const longName = input(1);
    longName.store.store_name = 'Cooperativa Regional de Máquinas Implementos e Soluções para o Campo';
    longName.catalogTitle = 'Um título curto que não deve controlar o tamanho da capa';
    const document = buildSellerStoreCatalogDocument(longName);
    const html = await renderSellerStoreCatalogHtml(document, {
      institutionalBackgroundUrl: 'data:image/png;base64,background',
      qrCodeFactory: async () => 'data:image/png;base64,qr',
    });

    expect(html).toContain(`class="cover-title-long">${document.store.name}</h1>`);
    expect(html).toContain('class="cover-catalog-label">| Cat&aacute;logo</span>');
    expect(html).not.toContain(`>${document.title}</h1>`);
    expect(html).toContain('class="cover-institutional-bg"');
    expect(html).not.toContain('class="cover-store-name"');
    expect(html).toContain('class="cover-store-location"');
  });

  it('applies all price disclosure modes', () => {
    const visible = buildSellerStoreCatalogDocument(input(1));
    const hidden = buildSellerStoreCatalogDocument({ ...input(1), priceMode: 'hide' });
    const consult = buildSellerStoreCatalogDocument({ ...input(1), priceMode: 'consult' });

    expect(visible.products[0].priceLabel).toMatch(/R\$\s*120\.001,00/);
    expect(hidden.products[0].priceLabel).toBeNull();
    expect(consult.products[0].priceLabel).toBe('Sob consulta');
  });

  it('never exposes a numeric price when the announcement is negotiable', () => {
    const negotiable = input(2);
    const document = buildSellerStoreCatalogDocument(negotiable);

    expect(document.products[1].badges).toEqual(['Usado', 'Disponivel']);
    expect(document.products[1].priceLabel).toBe('Sob consulta');
  });

  it('hides technical stock values and limits each product to two friendly badges', () => {
    const technical = input(1);
    technical.announcements[0].availability = 'consultar_estoque';
    technical.announcements[0].accepts_trade = true;
    const document = buildSellerStoreCatalogDocument(technical);

    expect(document.products[0].availabilityLabel).toBeNull();
    expect(document.products[0].badges).toEqual(['Usado', 'Aceita troca']);
    expect(document.products[0].badges).toHaveLength(2);
  });

  it('falls back to canonical AGRO BW URLs', () => {
    const unsafe = input(1);
    unsafe.store.public_url = 'https://phishing.example/loja';
    unsafe.announcements[0].public_url = 'javascript:alert(1)';
    const document = buildSellerStoreCatalogDocument(unsafe);

    expect(document.store.publicUrl).toBe('https://agrobw.com.br/loja/campo-forte');
    expect(document.products[0].publicUrl).toBe('https://agrobw.com.br/anuncio/announcement-1');
  });

  it('rejects empty and oversized catalogs', () => {
    expect(() => buildSellerStoreCatalogDocument(input(0))).toThrow('CATALOG_DOCUMENT_ANNOUNCEMENT_LIMIT');
    expect(() => buildSellerStoreCatalogDocument(input(SELLER_STORE_CATALOG_MAX_PRODUCTS))).not.toThrow();
    expect(() => buildSellerStoreCatalogDocument(input(SELLER_STORE_CATALOG_MAX_PRODUCTS + 1))).toThrow('CATALOG_DOCUMENT_ANNOUNCEMENT_LIMIT');
  });

  it('renders A4 print HTML with one QR code per product and one for the store', async () => {
    const calls: string[] = [];
    const document = buildSellerStoreCatalogDocument(input(3));
    const html = await renderSellerStoreCatalogHtml(document, {
      platformLogoUrl: 'https://agrobw.com.br/agrobw-logo.png',
      qrCodeFactory: async (url) => {
        calls.push(url);
        return `data:image/png;base64,qr-${calls.length}`;
      },
    });

    expect(calls).toEqual([...document.products.map((product) => product.publicUrl), document.store.publicUrl]);
    expect(html).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(html).toContain(`data-layout-version="${SELLER_STORE_CATALOG_LAYOUT_VERSION}"`);
    expect(html.match(/class="catalog-page/g)).toHaveLength(document.totalPages);
    expect(html).toContain('class="cover-hero-image"');
    expect(html).toContain('.cover-hero-image {');
    expect(html).toContain('.cover-hero-ultrawide .cover-hero-image { object-fit: contain; }');
    expect(html).toContain('.cover-hero-standard .cover-hero-image { object-fit: cover; }');
    expect(html).toContain(`<h1 class="cover-title-short">${document.store.name}</h1>`);
    expect(html).not.toContain(`<h1 class="cover-title-short">${document.title}</h1>`);
    expect(html).toContain('class="products-grid"');
    expect(html.match(/class="product-card"/g)).toHaveLength(3);
    expect(html).not.toContain('class="catalog-page content-page index-page"');
    expect(html).toContain('Ver an&uacute;ncio');
    expect(html).not.toContain('class="description"');
    expect(html).not.toContain('class="location"');
    expect(html).not.toContain('Escaneie para acessar');
  });

  it('escapes text again at the HTML boundary', async () => {
    const malicious = input(1);
    malicious.announcements[0].title = '<img src=x onerror=alert(1)> Trator & implemento';
    const document = buildSellerStoreCatalogDocument(malicious);
    const html = await renderSellerStoreCatalogHtml(document, {
      qrCodeFactory: async () => 'data:image/png;base64,qr',
    });

    expect(html).not.toContain('onerror=');
    expect(html).toContain('Trator &amp; implemento');
  });
});
