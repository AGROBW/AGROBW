import QRCode from 'qrcode';
import type {
  SellerStoreCatalogDocument,
  SellerStoreCatalogPage,
  SellerStoreCatalogProduct,
} from './documentModel.js';

export type SellerStoreCatalogHtmlOptions = {
  platformLogoUrl?: string;
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

const coverTitleSize = (title: string): string => {
  if (title.length > 82) return 'cover-title-long';
  if (title.length > 52) return 'cover-title-medium';
  return 'cover-title-short';
};

const cover = (document: SellerStoreCatalogDocument, platformLogoUrl: string): string => `
  <section class="catalog-page cover-page cover-align-${document.store.coverAlignment}">
    <div class="cover-visual">
      ${document.store.coverUrl ? `
        ${image(document.store.coverUrl, 'cover-image-backdrop', '')}
        <div class="cover-visual-shade"></div>
        ${image(document.store.coverUrl, 'cover-image-main', `Capa da ${document.store.name}`)}
      ` : '<div class="cover-empty"><span>AGRO BW</span><small>Loja Parceira</small></div>'}
    </div>
    <div class="cover-brand">
      ${image(document.store.logoUrl, 'store-logo', `Logo da ${document.store.name}`)}
      <div><span class="partner-badge">LOJA PARCEIRA${document.store.verified ? ' · VERIFICADA' : ''}</span><small>Uma selecao profissional AGRO BW</small></div>
    </div>
    <div class="cover-copy">
      <p class="eyebrow">CATALOGO DE OPORTUNIDADES · ${escapeHtml(document.generatedAt.slice(0, 4))}</p>
      <h1 class="${coverTitleSize(document.title)}">${escapeHtml(document.title)}</h1>
      ${document.subtitle ? `<p class="cover-subtitle">${escapeHtml(document.subtitle)}</p>` : ''}
      <div class="cover-store-line"><span></span><div><p class="store-name">${escapeHtml(document.store.name)}</p>${document.store.location ? `<p class="store-location">${escapeHtml(document.store.location)}</p>` : ''}</div></div>
    </div>
    <div class="cover-platform">
      ${image(platformLogoUrl, 'platform-logo', 'AGRO BW')}
      <span>Catalogo digital publicado em agrobw.com.br</span>
    </div>
  </section>`;

const indexPage = (document: SellerStoreCatalogDocument, page: Extract<SellerStoreCatalogPage, { kind: 'index' }>): string => `
  <section class="catalog-page content-page index-page">
    <header class="section-header">
      <div><p class="eyebrow green">SELECAO DA LOJA</p><h2>Encontre sua proxima oportunidade</h2></div>
      <span class="inventory-count">${document.products.length} ${document.products.length === 1 ? 'anuncio' : 'anuncios'}</span>
    </header>
    <div class="store-intro">
      <div>${image(document.store.logoUrl, 'intro-logo', `Logo da ${document.store.name}`)}</div>
      <div><strong>${escapeHtml(document.store.name)}</strong><p>${escapeHtml(document.store.description || 'Produtos selecionados para quem vive e investe no agro.')}</p></div>
    </div>
    <div class="index-grid ${page.products.length <= 8 ? 'index-grid-visual' : 'index-grid-compact'}">
      ${page.products.map((product) => `
        <article class="index-item">
          <span>${String(product.ordinal).padStart(2, '0')}</span>
          ${image(product.images[0] ?? null, 'index-thumb', product.title)}
          <div><strong>${escapeHtml(product.title)}</strong><small>${escapeHtml(product.location || product.categoryLabel || 'Disponivel na AGRO BW')}</small></div>
          ${product.priceLabel ? `<b>${escapeHtml(product.priceLabel)}</b>` : '<b>Veja online</b>'}
        </article>`).join('')}
    </div>
    ${pageFooter(document, page)}
  </section>`;

const productCard = (product: SellerStoreCatalogProduct, qrCode: string): string => `
  <article class="product-card">
    <div class="product-media">
      ${image(product.images[0] ?? null, 'product-image', product.title)}
      <span class="product-number">${String(product.ordinal).padStart(2, '0')}</span>
    </div>
    <div class="product-copy">
      <div class="product-meta">
        ${product.categoryLabel ? `<span>${escapeHtml(product.categoryLabel)}</span>` : ''}
        ${product.conditionLabel ? `<span>${escapeHtml(product.conditionLabel)}</span>` : ''}
        ${product.availabilityLabel ? `<span>${escapeHtml(product.availabilityLabel)}</span>` : ''}
      </div>
      <h3>${escapeHtml(product.title)}</h3>
      ${product.location ? `<p class="location">${escapeHtml(product.location)}</p>` : ''}
      ${product.priceLabel ? `<p class="price">${escapeHtml(product.priceLabel)}</p>` : ''}
      <p class="description">${escapeHtml(product.description || 'Consulte os detalhes completos deste anuncio na plataforma.')}</p>
      <div class="product-bottom">
        <div class="badges">${product.badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join('')}</div>
        <div class="qr-action"><img src="${escapeHtml(qrCode)}" alt="QR Code do anuncio"><div><strong>Veja o anuncio</strong><small>Escaneie para acessar</small></div></div>
      </div>
    </div>
  </article>`;

const productsPage = (
  document: SellerStoreCatalogDocument,
  page: Extract<SellerStoreCatalogPage, { kind: 'products' }>,
  qrCodes: Map<string, string>,
): string => `
  <section class="catalog-page content-page products-page ${page.products.length === 1 ? 'single-product-page' : 'double-product-page'}">
    <header class="compact-header">
      <div><p class="eyebrow green">${escapeHtml(document.store.name)}</p><h2>Produtos em destaque</h2></div>
      <span>Catalogo ${escapeHtml(document.generatedAt.slice(0, 10).split('-').reverse().join('/'))}</span>
    </header>
    <div class="products-stack ${page.products.length === 1 ? 'products-stack-single' : 'products-stack-double'}">
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
  .cover-page { background: #071722; color: #fff; }
  .cover-visual { position: absolute; inset: 0 0 auto; height: 121mm; overflow: hidden; background: #10272d; }
  .cover-image-backdrop { position: absolute; inset: -8mm; width: calc(100% + 16mm); height: calc(100% + 16mm); object-fit: cover; filter: blur(7mm) saturate(.72) brightness(.56); transform: scale(1.05); }
  .cover-visual-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(3, 16, 22, .18), rgba(3, 16, 22, .05) 58%, rgba(7, 23, 34, .86)); }
  .cover-image-main { position: absolute; inset: 11mm 14mm 10mm; width: calc(100% - 28mm); height: calc(100% - 21mm); object-fit: contain; object-position: center; filter: drop-shadow(0 3mm 9mm rgba(0, 0, 0, .28)); }
  .cover-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; background: radial-gradient(circle at 72% 20%, rgba(52, 211, 153, .2), transparent 30%), linear-gradient(145deg, #10272d, #071722); color: #6ee7b7; font-size: 20pt; font-weight: 900; letter-spacing: .18em; }
  .cover-empty small { color: rgba(255, 255, 255, .62); font-size: 7pt; letter-spacing: .24em; text-transform: uppercase; }
  .cover-align-left .cover-image-main { object-position: left center; }
  .cover-align-center .cover-image-main { object-position: center; }
  .cover-align-right .cover-image-main { object-position: right center; }
  .cover-brand { position: absolute; z-index: 2; top: 14mm; left: 16mm; display: flex; align-items: center; gap: 4mm; padding: 2.5mm 4mm 2.5mm 2.5mm; border: .25mm solid rgba(255, 255, 255, .22); border-radius: 5mm; background: rgba(5, 22, 29, .72); backdrop-filter: blur(4mm); }
  .store-logo, .intro-logo, .back-logo { object-fit: contain; background: #fff; }
  .store-logo { width: 18mm; height: 18mm; border-radius: 4mm; padding: 1.8mm; }
  .partner-badge { display: block; color: #fff; font-size: 7pt; letter-spacing: .17em; font-weight: 800; }
  .cover-brand small { display: block; margin-top: 1.2mm; color: #aebfba; font-size: 6.4pt; }
  .cover-copy { position: absolute; left: 18mm; right: 18mm; top: 135mm; color: #fff; }
  .cover-copy h1 { margin: 0; max-width: 170mm; font-family: Georgia, serif; line-height: 1.02; font-weight: 700; letter-spacing: -.035em; text-wrap: balance; }
  .cover-title-short { font-size: 37pt; }
  .cover-title-medium { font-size: 32pt; }
  .cover-title-long { font-size: 27pt; line-height: 1.07 !important; }
  .cover-subtitle { max-width: 150mm; margin: 6mm 0 0; color: #c9d8d3; font-size: 11.5pt; line-height: 1.5; }
  .cover-store-line { display: flex; align-items: flex-start; gap: 5mm; margin-top: 10mm; }
  .cover-store-line > span { width: 18mm; height: 1mm; margin-top: 2.7mm; background: #4ade80; }
  .store-name { margin: 0; font-size: 12pt; font-weight: 800; }
  .store-location { margin: 1.5mm 0 0; color: #9fb2ac; font-size: 8.5pt; }
  .cover-platform { position: absolute; left: 18mm; right: 18mm; bottom: 14mm; display: flex; align-items: center; justify-content: space-between; gap: 5mm; padding-top: 5mm; border-top: .25mm solid rgba(255, 255, 255, .14); color: #91a59e; font-size: 7.5pt; }
  .platform-logo { width: 29mm; height: 9mm; object-fit: contain; object-position: left center; }
  .content-page { padding: 16mm 16mm 14mm; }
  .section-header, .compact-header { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: .45mm solid #cad7d2; }
  .section-header { padding-bottom: 8mm; }
  .compact-header { height: 21mm; padding-bottom: 5mm; }
  .section-header h2, .compact-header h2 { margin: 0; font-family: Georgia, serif; font-weight: 700; letter-spacing: -.02em; }
  .section-header h2 { font-size: 24pt; }
  .compact-header h2 { font-size: 17pt; }
  .compact-header .eyebrow { margin-bottom: 2mm; }
  .compact-header > span { color: #64748b; font-size: 8pt; }
  .inventory-count { padding: 3mm 5mm; border-radius: 99mm; background: #e5eee9; color: #166534; font-size: 9pt; font-weight: 800; }
  .store-intro { display: grid; grid-template-columns: 22mm 1fr; gap: 5mm; align-items: center; margin: 9mm 0; padding: 6mm; border-radius: 5mm; background: #0b172b; color: #fff; }
  .intro-logo { width: 19mm; height: 19mm; padding: 1.5mm; border-radius: 4mm; }
  .store-intro strong { font-family: Georgia, serif; font-size: 15pt; }
  .store-intro p { margin: 2mm 0 0; color: #cbd5e1; font-size: 8.5pt; line-height: 1.45; }
  .index-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 5mm; }
  .index-item { min-height: 21mm; display: grid; grid-template-columns: 8mm 17mm 1fr; grid-template-rows: auto 1fr; column-gap: 2.5mm; padding: 3mm; border: .3mm solid #d8e1dd; border-radius: 3mm; background: #fff; }
  .index-item > span { grid-row: 1 / 3; color: #18a35d; font-family: Georgia, serif; font-size: 14pt; font-weight: 700; }
  .index-thumb { grid-row: 1 / 3; width: 17mm; height: 17mm; border-radius: 2mm; object-fit: contain; background: #eef2ef; }
  .index-item strong { display: block; font-size: 7.8pt; line-height: 1.24; }
  .index-item small { display: block; margin-top: .8mm; color: #64748b; font-size: 6.3pt; }
  .index-item b { grid-column: 3; align-self: end; margin-top: 1mm; color: #166534; font-size: 7pt; }
  .index-grid-visual { gap: 5mm; }
  .index-grid-visual .index-item { min-height: 33mm; grid-template-columns: 9mm 27mm 1fr; padding: 4mm; }
  .index-grid-visual .index-thumb { width: 27mm; height: 25mm; }
  .index-grid-visual .index-item strong { font-size: 9.2pt; }
  .index-grid-visual .index-item small { font-size: 7pt; }
  .products-stack { display: grid; height: 242mm; padding: 7mm 0 3mm; }
  .products-stack-double { grid-template-rows: 1fr 1fr; gap: 6mm; }
  .products-stack-single { grid-template-rows: 1fr; }
  .product-card { min-height: 0; display: grid; grid-template-columns: 76mm 1fr; overflow: hidden; border: .3mm solid #d6e0dc; border-radius: 5mm; background: #fff; box-shadow: 0 2mm 7mm rgba(11, 23, 43, .07); }
  .product-media { position: relative; min-height: 0; background: #e8eeeb; }
  .product-image { width: 100%; height: 100%; object-fit: contain; object-position: center; padding: 2mm; }
  .product-number { position: absolute; top: 4mm; left: 4mm; display: grid; place-items: center; width: 12mm; height: 12mm; border-radius: 50%; background: rgba(11, 23, 43, .9); color: #fff; font-family: Georgia, serif; font-size: 10pt; font-weight: 700; }
  .product-copy { min-width: 0; display: flex; flex-direction: column; padding: 6mm; }
  .product-meta { display: flex; flex-wrap: wrap; gap: 1.5mm; min-height: 5mm; }
  .product-meta span, .badges span { padding: 1.2mm 2.2mm; border-radius: 99mm; background: #e8f5ed; color: #147044; font-size: 6.5pt; font-weight: 800; }
  .product-copy h3 { margin: 4mm 0 1.5mm; font-family: Georgia, serif; font-size: 16pt; line-height: 1.12; letter-spacing: -.02em; }
  .location { margin: 0; color: #64748b; font-size: 7.5pt; }
  .price { margin: 4mm 0 0; color: #0b172b; font-size: 14pt; font-weight: 900; }
  .description { margin: 3mm 0 0; color: #435468; font-size: 7.8pt; line-height: 1.42; }
  .product-bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 3mm; margin-top: auto; }
  .badges { display: flex; flex-wrap: wrap; gap: 1.5mm; }
  .qr-action { display: flex; align-items: center; gap: 2mm; flex: 0 0 auto; }
  .qr-action img { width: 15mm; height: 15mm; }
  .qr-action strong, .qr-action small { display: block; }
  .qr-action strong { font-size: 7pt; }
  .qr-action small { margin-top: .8mm; color: #64748b; font-size: 5.8pt; }
  .single-product-page .product-card { grid-template-columns: 1fr; grid-template-rows: 128mm 1fr; }
  .single-product-page .product-media { border-bottom: .3mm solid #e1e8e4; }
  .single-product-page .product-image { padding: 5mm; }
  .single-product-page .product-number { top: 6mm; left: 6mm; width: 14mm; height: 14mm; font-size: 11pt; }
  .single-product-page .product-copy { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto auto auto 1fr; column-gap: 9mm; padding: 7mm 9mm 8mm; }
  .single-product-page .product-meta, .single-product-page .product-copy h3, .single-product-page .location, .single-product-page .price, .single-product-page .description { grid-column: 1; }
  .single-product-page .product-copy h3 { margin-top: 3mm; font-size: 21pt; line-height: 1.08; }
  .single-product-page .location { font-size: 8.5pt; }
  .single-product-page .price { margin-top: 3mm; font-size: 16pt; }
  .single-product-page .description { margin-top: 3mm; font-size: 9.2pt; line-height: 1.48; }
  .single-product-page .product-bottom { grid-column: 2; grid-row: 1 / -1; min-width: 37mm; flex-direction: column-reverse; align-items: flex-end; justify-content: flex-end; margin-top: 0; }
  .single-product-page .badges { justify-content: flex-end; }
  .single-product-page .qr-action { flex-direction: column; align-items: center; padding: 3mm; border: .3mm solid #dbe4df; border-radius: 3mm; background: #f8faf8; text-align: center; }
  .single-product-page .qr-action img { width: 24mm; height: 24mm; }
  .single-product-page .qr-action strong { margin-top: 1mm; font-size: 8pt; }
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
    if (page.kind === 'cover') return cover(document, platformLogoUrl);
    if (page.kind === 'index') return indexPage(document, page);
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
