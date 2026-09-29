import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildSellerStoreCatalogDocument } from '../sellerStoreCatalog/documentModel';
import { renderSellerStoreCatalogHtml } from '../sellerStoreCatalog/renderHtml';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const worker = read('server/seller-store-catalog-worker.ts');
const download = read('supabase/functions/seller-store-catalog-download/index.ts');
const adDetail = read('pages/AdDetailView.tsx');

const exportId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Seller Store Insights stage 5', () => {
  it('embeds catalog-safe attribution in product and store QR targets', async () => {
    const qrCodeFactory = vi.fn(async (url: string) => `qr:${url}`);
    const document = buildSellerStoreCatalogDocument({
      exportId,
      catalogTitle: 'Catalogo rastreavel',
      priceMode: 'show',
      generatedAt: '2026-09-29T12:00:00.000Z',
      store: {
        id: '33333333-3333-4333-8333-333333333333',
        slug: 'loja-teste',
        store_name: 'Loja Teste',
        public_url: 'https://agrobw.com.br/loja/loja-teste',
      },
      announcements: [{
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Produto teste',
        price: 100,
        images: [],
        public_url: 'https://agrobw.com.br/anuncio/produto-teste',
      }],
    });

    await renderSellerStoreCatalogHtml(document, { qrCodeFactory });

    expect(qrCodeFactory).toHaveBeenCalledWith(
      `https://agrobw.com.br/anuncio/produto-teste?store=loja-teste&store_source=catalog_pdf&catalog=${exportId}`,
    );
    expect(qrCodeFactory).toHaveBeenCalledWith(
      'https://agrobw.com.br/loja/loja-teste?store_source=catalog_pdf',
    );
  });

  it('records generated and downloaded catalogs without coupling analytics to delivery', () => {
    expect(worker).toContain("p_event_type: 'catalog_generated'");
    expect(worker).toContain('p_event_key: job.id');
    expect(worker.indexOf("p_event_type: 'catalog_generated'"))
      .toBeGreaterThan(worker.indexOf("complete_seller_store_catalog_export"));
    expect(worker).toContain("console.warn('[SellerStoreCatalog] Catalog generated insight");

    expect(download).toContain("p_event_type: 'catalog_download'");
    expect(download).toContain('p_event_key: crypto.randomUUID()');
    expect(download).toContain(".select('id,user_id,store_id,status,storage_path,catalog_title,expires_at')");
    expect(download.indexOf("p_event_type: 'catalog_download'"))
      .toBeGreaterThan(download.indexOf('.createSignedUrl('));
    expect(download).toContain("console.warn('[SellerStoreCatalog] Catalog download insight");
  });

  it('records QR opens only when catalog attribution reaches an active announcement', () => {
    expect(adDetail).toContain("sellerStoreAttribution?.sourceChannel !== 'catalog_pdf'");
    expect(adDetail).toContain("eventType: 'catalog_qr_open'");
    expect(adDetail).toContain('catalogExportId,');
    expect(adDetail).toContain('trackedCatalogQrOpenRef.current === trackingKey');
  });
});
