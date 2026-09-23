import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import {
  buildSellerStoreCatalogDocument,
  type SellerStoreCatalogBuildInput,
  type SellerStoreCatalogCoverAlignment,
  type SellerStoreCatalogPriceMode,
} from '../src/lib/sellerStoreCatalog/documentModel';
import { renderSellerStoreCatalogHtml } from '../src/lib/sellerStoreCatalog/renderHtml';

const outputDirectory = resolve(process.argv[2] ?? 'output/pdf/catalog-qa');
const imageUrl = 'https://agrobw.com.br/assets/catalog-qa-equipment.svg';
const logoUrl = 'https://agrobw.com.br/assets/catalog-qa-logo.png';
const matrix: Array<{
  count: number;
  priceMode: SellerStoreCatalogPriceMode;
  coverAlignment: SellerStoreCatalogCoverAlignment;
  withoutBrandAssets?: boolean;
  worstCaseIndex?: boolean;
}> = [
  { count: 1, priceMode: 'hide', coverAlignment: 'left' },
  { count: 2, priceMode: 'consult', coverAlignment: 'center', withoutBrandAssets: true },
  { count: 5, priceMode: 'show', coverAlignment: 'right' },
  { count: 20, priceMode: 'show', coverAlignment: 'left', worstCaseIndex: true },
  { count: 100, priceMode: 'hide', coverAlignment: 'right' },
];

const announcement = (index: number, worstCaseIndex = false) => ({
  id: `qa-announcement-${String(index).padStart(3, '0')}`,
  title: worstCaseIndex || index % 7 === 0
    ? `Equipamento agrícola profissional com configuração especial para operações intensivas e assistência técnica - edição ${index}`
    : `Equipamento rural selecionado ${index}`,
  description: index % 5 === 0
    ? 'Descrição extensa para validar ritmo editorial, legibilidade e ocupação do espaço. Equipamento revisado, pronto para trabalhar e acompanhado de informações técnicas atualizadas para apoiar uma decisão comercial segura.'
    : `Equipamento revisado e selecionado para a oportunidade número ${index}.`,
  price: 10_000 + index * 137,
  price_negotiable: index % 4 === 0,
  product_condition: index % 3 === 0 ? 'seminovo' : 'new',
  availability: index % 6 === 0 ? 'sob_encomenda' : 'available',
  accepts_trade: index % 5 === 0,
  city: index % 2 === 0 ? 'Campo Grande' : 'Rondonópolis',
  state: index % 2 === 0 ? 'MS' : 'MT',
  sub_category_label: index % 2 === 0 ? 'Máquinas agrícolas' : 'Pecuária de precisão',
  images: index % 3 === 0 ? [] : [imageUrl],
  public_url: `https://agrobw.com.br/anuncio/qa-${index}`,
});

const inputFor = (
  count: number,
  priceMode: SellerStoreCatalogPriceMode,
  coverAlignment: SellerStoreCatalogCoverAlignment,
  withoutBrandAssets = false,
  worstCaseIndex = false,
): SellerStoreCatalogBuildInput => ({
  exportId: `qa-${count}`,
  catalogTitle: count === 1
    ? 'Catálogo institucional de máquinas, implementos e soluções para uma nova safra'
    : `Seleção profissional com ${count} oportunidades`,
  catalogSubtitle: 'Uma edição preparada para validar impressão, compartilhamento e leitura em diferentes volumes.',
  priceMode,
  coverAlignment,
  generatedAt: '2026-09-22T18:00:00.000Z',
  store: {
    id: 'qa-store',
    slug: 'loja-qa',
    store_name: 'Agro Campo Máquinas e Implementos',
    description: worstCaseIndex
      ? 'Descrição institucional extensa para validar o limite máximo da apresentação da loja no índice do catálogo. '.repeat(8).slice(0, 680)
      : 'Curadoria de equipamentos para produtores que valorizam informação clara, atendimento próximo e negócios confiáveis.',
    logo_url: withoutBrandAssets ? null : logoUrl,
    cover_url: withoutBrandAssets ? null : imageUrl,
    city: 'Campo Grande',
    state: 'MS',
    is_verified: true,
    public_url: 'https://agrobw.com.br/loja/loja-qa',
  },
  announcements: Array.from({ length: count }, (_, index) => announcement(index + 1, worstCaseIndex)),
});

await mkdir(outputDirectory, { recursive: true });
const logo = await readFile(new URL('../public/agrobw-logo.png', import.meta.url));
const platformLogoUrl = `data:image/png;base64,${logo.toString('base64')}`;
const fixtureImage = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#173f35"/><stop offset="1" stop-color="#9cc680"/></linearGradient></defs>
    <rect width="1200" height="800" fill="url(#g)"/><circle cx="980" cy="130" r="210" fill="#d8f475" opacity=".2"/>
    <path d="M120 590h960v90H120zM260 360h680l110 230H150z" fill="#edf4e8" opacity=".88"/>
    <path d="M340 420h520v95H340z" fill="#16854b"/><circle cx="350" cy="650" r="92" fill="#071722"/><circle cx="850" cy="650" r="92" fill="#071722"/>
    <text x="600" y="180" text-anchor="middle" fill="white" font-family="Arial" font-size="62" font-weight="700">EQUIPAMENTO QA</text>
  </svg>
`).toString('base64');
const fixtureImageDataUrl = `data:image/svg+xml;base64,${fixtureImage}`;
const makeSelfContained = (html: string): string => html
  .replaceAll(imageUrl, fixtureImageDataUrl)
  .replaceAll(logoUrl, platformLogoUrl);
const executablePath = process.env.CATALOG_QA_BROWSER_EXECUTABLE?.trim();
if (!executablePath) throw new Error('CATALOG_QA_BROWSER_EXECUTABLE_REQUIRED');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--disable-gpu'] });

const results: Array<Record<string, unknown>> = [];

try {
  for (const scenario of matrix) {
    const document = buildSellerStoreCatalogDocument(inputFor(
      scenario.count,
      scenario.priceMode,
      scenario.coverAlignment,
      scenario.withoutBrandAssets,
      scenario.worstCaseIndex,
    ));
    const html = makeSelfContained(await renderSellerStoreCatalogHtml(document, { platformLogoUrl }));
    const basename = `catalog-${String(scenario.count).padStart(3, '0')}-items`;
    const htmlPath = resolve(outputDirectory, `${basename}.html`);
    const pdfPath = resolve(outputDirectory, `${basename}.pdf`);
    await writeFile(htmlPath, html, 'utf8');

    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const requestUrl = request.url();
      if (requestUrl === 'about:blank' || requestUrl.startsWith('data:')) {
        void request.continue();
        return;
      }
      void request.abort('blockedbyclient');
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(() => globalThis.document.fonts.ready);
    await page.emulateMediaType('print');
    const layoutChecks = await page.$$eval('.catalog-page', (pages) => pages.map((catalogPage, index) => {
      const pageBounds = catalogPage.getBoundingClientRect();
      const footer = catalogPage.querySelector('.page-footer')?.getBoundingClientRect();
      const guardedItems = Array.from(catalogPage.querySelectorAll('.store-intro, .index-grid, .index-item, .product-card'));
      const itemBounds = guardedItems.map((item) => item.getBoundingClientRect());
      const contentBottom = guardedItems.reduce(
        (maximum, item) => Math.max(maximum, item.getBoundingClientRect().bottom),
        0,
      );
      const horizontalOverflowPx = itemBounds.reduce((maximum, bounds) => Math.max(
        maximum,
        Math.max(0, bounds.right - pageBounds.right),
        Math.max(0, pageBounds.left - bounds.left),
      ), 0);
      return {
        pageNumber: index + 1,
        verticalOverflowPx: contentBottom && footer ? Math.max(0, contentBottom - footer.top) : 0,
        horizontalOverflowPx,
      };
    }));
    const maxOverflowPx = Math.max(0, ...layoutChecks.flatMap((check) => [check.verticalOverflowPx, check.horizontalOverflowPx]));
    if (maxOverflowPx > 1) {
      throw new Error(`CATALOG_QA_LAYOUT_OVERFLOW:${basename}:${maxOverflowPx.toFixed(2)}px`);
    }
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });
    await page.close();

    results.push({
      announcements: scenario.count,
      priceMode: scenario.priceMode,
      coverAlignment: scenario.coverAlignment,
      withoutBrandAssets: scenario.withoutBrandAssets === true,
      worstCaseIndex: scenario.worstCaseIndex === true,
      expectedPages: document.totalPages,
      maxOverflowPx,
      html: htmlPath,
      pdf: pdfPath,
    });
  }
} finally {
  await browser?.close();
}

const manifestPath = resolve(outputDirectory, 'manifest.json');
await writeFile(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, 'utf8');
process.stdout.write(`${manifestPath}\n`);
