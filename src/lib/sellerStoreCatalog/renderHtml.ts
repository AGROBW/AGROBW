import QRCode from 'qrcode';
import type {
  SellerStoreCatalogDocument,
  SellerStoreCatalogPage,
  SellerStoreCatalogProduct,
} from './documentModel.js';

export type SellerStoreCatalogHtmlOptions = {
  platformLogoUrl?: string;
  institutionalBackgroundUrl?: string;
  qrCodeFactory?: (url: string) => Promise<string>;
};

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const image = (url: string | null, className: string, alt: string): string => url
  ? `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" crossorigin="anonymous">`
  : `<div class="${className} image-placeholder" aria-label="Imagem nao disponivel"><span>AGRO BW</span></div>`;

const pageFooter = (document: SellerStoreCatalogDocument, page: SellerStoreCatalogPage): string => `
  <footer class="page-footer">
    <span>${escapeHtml(document.store.name)} · Catalogo digital AGRO BW</span>
    <span>${page.pageNumber}/${document.totalPages}</span>
  </footer>`;

const coverTitleSize = (name: string): string => {
  if (name.length > 64) return 'cover-title-long';
  if (name.length > 40) return 'cover-title-medium';
  return 'cover-title-short';
};

export const SELLER_STORE_CATALOG_ULTRAWIDE_RATIO = 3.5;
const STANDARD_HERO_HEIGHT_MM = 78;
const STANDARD_CONTENT_TOP_MM = 92;
const ULTRAWIDE_CONTENT_GAP_MM = 11;

export const getCoverHeroLayout = (aspectRatio: number | null | undefined) => {
  if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio >= SELLER_STORE_CATALOG_ULTRAWIDE_RATIO) {
    const heroHeightMm = Number((210 / aspectRatio).toFixed(2));
    return {
      mode: 'ultrawide' as const,
      heroHeightMm,
      contentTopMm: Number((heroHeightMm + ULTRAWIDE_CONTENT_GAP_MM).toFixed(2)),
    };
  }
  return {
    mode: 'standard' as const,
    heroHeightMm: STANDARD_HERO_HEIGHT_MM,
    contentTopMm: STANDARD_CONTENT_TOP_MM,
  };
};

const cover = (
  document: SellerStoreCatalogDocument,
  platformLogoUrl: string,
  institutionalBackgroundUrl: string,
): string => {
  const heroLayout = getCoverHeroLayout(document.store.coverAspectRatio);
  return `
  <section class="catalog-page cover-page cover-align-${document.store.coverAlignment} cover-hero-${heroLayout.mode}" style="--cover-hero-height: ${heroLayout.heroHeightMm}mm; --cover-content-top: ${heroLayout.contentTopMm}mm;">
    ${institutionalBackgroundUrl
      ? image(institutionalBackgroundUrl, 'cover-institutional-bg', '')
      : '<div class="cover-institutional-fallback"></div>'}
    <div class="cover-hero">
      ${document.store.coverUrl
        ? image(document.store.coverUrl, 'cover-hero-image', `Banner da ${document.store.name}`)
        : '<div class="cover-hero-fallback"></div>'}
      <div class="cover-hero-overlay"></div>
    </div>
    <div class="cover-content">
      <p class="cover-eyebrow">CAT&Aacute;LOGO DE OPORTUNIDADES &middot; ${escapeHtml(document.generatedAt.slice(0, 4))}</p>
      <div class="cover-heading">
        <h1 class="${coverTitleSize(document.store.name)}">${escapeHtml(document.store.name)}</h1>
        <span class="cover-catalog-label">| Cat&aacute;logo</span>
      </div>
      ${document.subtitle ? `<p class="cover-subtitle">${escapeHtml(document.subtitle)}</p>` : ''}
      <div class="cover-store">
        <div class="cover-store-logo-wrap">
          ${image(document.store.logoUrl, 'cover-store-logo', `Logo da ${document.store.name}`)}
        </div>
        <div class="cover-store-info">
          ${document.store.location ? `<p class="cover-store-location">${escapeHtml(document.store.location)}</p>` : ''}
          ${document.store.verified ? '<span class="verified-badge">VERIFICADA</span>' : ''}
        </div>
      </div>
    </div>
    <div class="cover-footer">
      <span class="partner-badge">LOJA PARCEIRA</span>
      <div class="cover-footer-divider"></div>
      ${image(platformLogoUrl, 'cover-platform-logo', 'AGRO BW')}
      <div class="cover-footer-divider"></div>
      <p class="cover-footer-copy">Cat&aacute;logo digital publicado em <strong>agrobw.com.br</strong></p>
    </div>
  </section>`;
};

const productCard = (product: SellerStoreCatalogProduct, qrCode: string): string => `
  <article class="product-card">
    <div class="product-media">
      ${image(product.images[0] ?? null, 'product-image', product.title)}
    </div>
    <div class="product-copy">
      <div class="product-meta">
        ${product.badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join('')}
      </div>
      <h3>${escapeHtml(product.title)}</h3>
      <div class="product-bottom">
        <p class="price">${escapeHtml(product.priceLabel ?? 'Consulte')}</p>
        <div class="qr-action"><img src="${escapeHtml(qrCode)}" alt="QR Code do anuncio"><strong>Ver an&uacute;ncio</strong></div>
      </div>
    </div>
  </article>`;

const productsPage = (
  document: SellerStoreCatalogDocument,
  page: Extract<SellerStoreCatalogPage, { kind: 'products' }>,
  qrCodes: Map<string, string>,
): string => `
  <section class="catalog-page content-page products-page">
    <header class="compact-header">
      <div><p class="eyebrow green">${escapeHtml(document.store.name)}</p><h2>Produtos em destaque</h2></div>
      <span>Catalogo ${escapeHtml(document.generatedAt.slice(0, 10).split('-').reverse().join('/'))}</span>
    </header>
    <div class="products-grid">
      ${page.products.map((product) => productCard(product, qrCodes.get(product.id) ?? '')).join('')}
    </div>
    ${pageFooter(document, page)}
  </section>`;

const backCover = (
  document: SellerStoreCatalogDocument,
  page: Extract<SellerStoreCatalogPage, { kind: 'back-cover' }>,
  platformLogoUrl: string,
  storeQrCode: string,
): string => `
  <section class="catalog-page back-page">
    <div class="back-orbit orbit-one"></div><div class="back-orbit orbit-two"></div>
    <div class="back-content">
      ${image(document.store.logoUrl, 'back-logo', `Logo da ${document.store.name}`)}
      <p class="eyebrow mint">CONTINUE EXPLORANDO</p>
      <h2>Mais oportunidades esperam por voce.</h2>
      <p>Acesse a vitrine atualizada, consulte a disponibilidade e converse com o vendedor diretamente pela AGRO BW.</p>
      <div class="back-qr"><img src="${escapeHtml(storeQrCode)}" alt="QR Code da loja"><div><strong>${escapeHtml(document.store.name)}</strong><small>${escapeHtml(document.store.publicUrl.replace(/^https?:\/\//, ''))}</small></div></div>
      ${document.store.location ? `<div class="back-location"><span>LOJA PARCEIRA</span><strong>${escapeHtml(document.store.location)}</strong></div>` : ''}
    </div>
    <div class="back-platform">${image(platformLogoUrl, 'platform-logo light-logo', 'AGRO BW')}<span>Marketplace rural</span></div>
    ${pageFooter(document, page)}
  </section>`;

const styles = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #dfe5e2; color: #0b172b; font-family: "Aptos", "Segoe UI", sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .catalog-page { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; break-after: page; background: #f7f8f2; }
  .catalog-page:last-child { page-break-after: auto; break-after: auto; }
  .image-placeholder { display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #dfe9df, #f7f8f2); color: #16854b; font-weight: 800; letter-spacing: .12em; }
  .eyebrow { margin: 0 0 4mm; color: #d8f475; font-size: 8pt; line-height: 1; letter-spacing: .22em; font-weight: 800; }
  .eyebrow.green { color: #16854b; }
  .eyebrow.mint { color: #6ee7b7; }
  .cover-page { position: relative; background: #061725; color: #fff; }
  .cover-institutional-bg { position: absolute; z-index: 0; inset: 0; width: 210mm; height: 297mm; object-fit: cover; pointer-events: none; }
  .cover-institutional-fallback { position: absolute; z-index: 0; inset: 0; background: radial-gradient(circle at 12% 8%, rgba(22, 133, 75, .35), transparent 34%), radial-gradient(circle at 88% 88%, rgba(52, 211, 153, .18), transparent 30%), linear-gradient(145deg, #0b3040, #061725 44%, #030f18); }
  .cover-hero { position: absolute; z-index: 1; top: 0; left: 0; width: 210mm; height: var(--cover-hero-height); overflow: hidden; background: transparent; }
  .cover-hero-image { position: absolute; inset: 0; width: 100%; height: 100%; object-position: center top; }
  .cover-hero-ultrawide .cover-hero-image { object-fit: contain; }
  .cover-hero-standard .cover-hero-image { object-fit: cover; }
  .cover-align-left .cover-hero-image { object-position: left top; }
  .cover-align-center .cover-hero-image { object-position: center top; }
  .cover-align-right .cover-hero-image { object-position: right top; }
  .cover-hero-overlay { position: absolute; z-index: 2; right: 0; bottom: 0; left: 0; height: 6mm; background: linear-gradient(180deg, rgba(3, 18, 30, 0), rgba(3, 18, 30, .78)); }
  .cover-hero-fallback { position: absolute; inset: 0; background: radial-gradient(circle at 70% 25%, rgba(38, 200, 110, .16), transparent 36%), linear-gradient(135deg, #0c2a39, #071723); }
  .cover-content { position: absolute; z-index: 3; top: var(--cover-content-top); left: 17mm; right: 17mm; }
  .cover-eyebrow { margin: 0 0 6mm; color: #48e58d; font-size: 8.5pt; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
  .cover-heading { display: flex; align-items: flex-end; flex-wrap: wrap; column-gap: 3mm; row-gap: 1.5mm; max-width: 174mm; }
  .cover-heading h1 { display: -webkit-box; max-width: 158mm; max-height: 3.1em; margin: 0; overflow: hidden; color: #fff; font-family: "Aptos", "Segoe UI", sans-serif; font-weight: 800; line-height: .98; letter-spacing: -.035em; text-wrap: balance; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  .cover-title-short { font-size: 35pt; }
  .cover-title-medium { font-size: 30pt; }
  .cover-title-long { font-size: 25pt; line-height: 1.03 !important; }
  .cover-catalog-label { margin-bottom: 1mm; color: #dce7e4; font-size: 23pt; font-weight: 300; white-space: nowrap; }
  .cover-subtitle { max-width: 145mm; margin: 7mm 0 0; color: #aebfba; font-size: 10.5pt; line-height: 1.45; }
  .cover-store { display: inline-flex; align-items: center; gap: 5mm; max-width: 112mm; margin-top: 12mm; padding: 4mm 5mm 4mm 4mm; border: .25mm solid rgba(101, 231, 161, .23); border-radius: 4mm; background: rgba(4, 21, 32, .72); backdrop-filter: blur(2mm); }
  .cover-store-logo-wrap { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; width: 22mm; height: 22mm; padding: 2mm; border-radius: 3.5mm; background: #fff; }
  .cover-store-logo { width: 100%; height: 100%; object-fit: contain; }
  .cover-store-logo.image-placeholder { padding: 0; color: #16854b; font-size: 6pt; letter-spacing: .06em; }
  .cover-store-info { min-width: 0; }
  .cover-store-location { margin: 0; color: #fff; font-size: 10pt; font-weight: 700; line-height: 1.2; }
  .verified-badge { display: inline-block; margin-top: 2mm; padding: .8mm 1.8mm; border-radius: 2mm; background: rgba(72, 229, 141, .12); color: #48e58d; font-size: 5.5pt; font-weight: 800; letter-spacing: .1em; }
  .cover-footer { position: absolute; z-index: 4; left: 11mm; right: 11mm; bottom: 11mm; min-height: 20mm; display: flex; align-items: center; gap: 5mm; padding-top: 4mm; border-top: .25mm solid rgba(255, 255, 255, .18); }
  .partner-badge { flex: 0 0 auto; padding: 2.3mm 4mm; border: .3mm solid rgba(255, 255, 255, .65); border-radius: 2.5mm; color: #fff; font-size: 7pt; font-weight: 800; letter-spacing: .16em; }
  .cover-footer-divider { flex: 0 0 auto; width: .25mm; height: 10mm; background: rgba(255, 255, 255, .25); }
  .cover-platform-logo { flex: 0 0 auto; width: 32mm; height: 10mm; object-fit: contain; object-position: left center; }
  .cover-footer-copy { margin: 0; color: #c2cfcb; font-size: 7.5pt; line-height: 1.35; }
  .cover-footer-copy strong { color: #fff; font-weight: 700; }
  .store-logo, .intro-logo, .back-logo { object-fit: contain; background: #fff; }
  .platform-logo { width: 29mm; height: 9mm; object-fit: contain; object-position: left center; }
  .content-page { padding: 16mm 16mm 14mm; }
  .compact-header { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: .45mm solid #cad7d2; }
  .compact-header { height: 21mm; padding-bottom: 5mm; }
  .compact-header h2 { margin: 0; font-family: Georgia, serif; font-weight: 700; letter-spacing: -.02em; }
  .compact-header h2 { font-size: 17pt; }
  .compact-header .eyebrow { margin-bottom: 2mm; }
  .compact-header > span { color: #64748b; font-size: 8pt; }
  .products-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(3, minmax(0, 1fr)); column-gap: 5mm; row-gap: 3.5mm; height: 242mm; padding: 5mm 0 2mm; }
  .product-card { min-width: 0; min-height: 0; display: grid; grid-template-rows: 38mm minmax(0, 1fr); overflow: hidden; border: .25mm solid #d3ddd8; border-radius: 2.5mm; background: #fff; box-shadow: 0 .6mm 1.8mm rgba(11, 23, 43, .035); }
  .product-media { position: relative; min-height: 0; background: #e8eeeb; }
  .product-image { width: 100%; height: 100%; object-fit: cover; object-position: center; }
  .product-copy { position: relative; min-width: 0; min-height: 0; padding: 2.5mm; }
  .product-meta { display: flex; flex-wrap: wrap; gap: 1mm; min-height: 3.8mm; }
  .product-meta span { padding: .8mm 1.7mm; border-radius: 99mm; background: #e8f5ed; color: #147044; font-size: 5.8pt; font-weight: 800; }
  .product-copy h3 { display: -webkit-box; max-height: 2.28em; margin: 1.5mm 0 0; padding-right: 20mm; overflow: hidden; font-family: Georgia, serif; font-size: 10.5pt; line-height: 1.14; letter-spacing: -.01em; text-overflow: ellipsis; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .price { margin: 0; color: #0b172b; font-size: 10.5pt; font-weight: 900; }
  .product-bottom { position: absolute; right: 2.5mm; bottom: 2.2mm; left: 2.5mm; display: flex; align-items: flex-end; justify-content: space-between; gap: 2mm; }
  .qr-action { display: flex; flex-direction: column; align-items: center; flex: 0 0 auto; color: #334155; text-align: center; }
  .qr-action img { width: 18mm; height: 18mm; }
  .qr-action strong { margin-top: .5mm; font-size: 5.8pt; }
  .page-footer { position: absolute; left: 16mm; right: 16mm; bottom: 7mm; display: flex; justify-content: space-between; color: #64748b; font-size: 6.5pt; letter-spacing: .04em; }
  .back-page { background: #071722; color: #fff; }
  .back-orbit { position: absolute; border: .4mm solid rgba(74, 222, 128, .25); border-radius: 50%; }
  .orbit-one { width: 170mm; height: 170mm; right: -65mm; top: -45mm; }
  .orbit-two { width: 120mm; height: 120mm; left: -50mm; bottom: -35mm; }
  .back-content { position: absolute; left: 28mm; right: 28mm; top: 55mm; }
  .back-logo { width: 27mm; height: 27mm; padding: 2mm; border-radius: 6mm; margin-bottom: 16mm; }
  .back-content h2 { max-width: 140mm; margin: 0; font-family: Georgia, serif; font-size: 34pt; line-height: 1.06; letter-spacing: -.035em; }
  .back-content > p:not(.eyebrow) { max-width: 125mm; margin: 8mm 0 12mm; color: #bdcbc6; font-size: 12pt; line-height: 1.5; }
  .back-qr { display: inline-flex; align-items: center; gap: 5mm; padding: 4mm 6mm 4mm 4mm; border-radius: 5mm; background: #fff; color: #0b172b; }
  .back-qr img { width: 25mm; height: 25mm; }
  .back-qr strong, .back-qr small { display: block; }
  .back-qr strong { max-width: 80mm; font-family: Georgia, serif; font-size: 12pt; }
  .back-qr small { max-width: 80mm; margin-top: 2mm; color: #64748b; font-size: 7pt; overflow-wrap: anywhere; }
  .back-location { display: flex; align-items: center; gap: 4mm; margin-top: 8mm; color: #a9bbb5; }
  .back-location span { padding: 1.5mm 2.5mm; border: .25mm solid rgba(110, 231, 183, .35); border-radius: 99mm; color: #6ee7b7; font-size: 6.5pt; font-weight: 800; letter-spacing: .12em; }
  .back-location strong { font-size: 9pt; }
  .back-platform { position: absolute; left: 28mm; bottom: 19mm; display: flex; align-items: center; gap: 5mm; color: #9fb0aa; font-size: 8pt; }
  .light-logo { padding: 1.5mm; border-radius: 2mm; background: #fff; }
  .back-page .page-footer { color: #7f918a; }
`;

export const renderSellerStoreCatalogHtml = async (
  document: SellerStoreCatalogDocument,
  options: SellerStoreCatalogHtmlOptions = {},
): Promise<string> => {
  const platformLogoUrl = options.platformLogoUrl ?? 'https://agrobw.com.br/agrobw-logo.png';
  const institutionalBackgroundUrl = options.institutionalBackgroundUrl ?? '';
  const qrCodeFactory = options.qrCodeFactory ?? ((url: string) => QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 180,
    color: { dark: '#071722', light: '#ffffff' },
  }));
  const productQrEntries = await Promise.all(document.products.map(async (product) => [
    product.id,
    await qrCodeFactory(product.publicUrl),
  ] as const));
  const qrCodes = new Map(productQrEntries);
  const storeQrCode = await qrCodeFactory(document.store.publicUrl);

  const pages = document.pages.map((page) => {
    if (page.kind === 'cover') return cover(document, platformLogoUrl, institutionalBackgroundUrl);
    if (page.kind === 'products') return productsPage(document, page, qrCodes);
    return backCover(document, page, platformLogoUrl, storeQrCode);
  }).join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(document.title)} · ${escapeHtml(document.store.name)}</title>
  <style>${styles}</style>
</head>
<body data-schema-version="${document.schemaVersion}" data-layout-version="${document.layoutVersion}">
${pages}
</body>
</html>`;
};
