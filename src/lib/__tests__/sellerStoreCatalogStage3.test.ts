import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  embedSellerStoreCatalogImages,
  fetchTrustedCatalogImage,
  isPermanentCatalogError,
  optimizeSellerStoreCatalogImages,
  prepareSellerStoreCatalogImagesForPdf,
} from '../../../server/seller-store-catalog-worker';
import { buildSellerStoreCatalogDocument } from '../sellerStoreCatalog/documentModel';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('sql/create_seller_store_catalog_exports_stage3_2026-09-21.sql');
const transactionalValidator = read('sql/VALIDATE_create_seller_store_catalog_exports_stage3_transactional_2026-09-21.sql');
const worker = read('server/seller-store-catalog-worker.ts');
const renderHtml = read('src/lib/sellerStoreCatalog/renderHtml.ts');
const endpoint = read('api/catalog/process-jobs.ts');
const download = read('supabase/functions/seller-store-catalog-download/index.ts');
const config = read('supabase/config.toml');
const vercel = read('vercel.json');

const imageUrl = 'https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/test.webp';
const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

const document = () => buildSellerStoreCatalogDocument({
  exportId: 'export-id',
  catalogTitle: 'Catalogo de teste',
  priceMode: 'show',
  generatedAt: '2026-09-21T18:00:00.000Z',
  store: {
    id: 'store-id',
    slug: 'loja-teste',
    store_name: 'Loja Teste',
    logo_url: imageUrl,
    cover_url: imageUrl,
    public_url: 'https://agrobw.com.br/loja/loja-teste',
  },
  announcements: [{
    id: 'announcement-id',
    title: 'Trator de teste',
    price: 100,
    images: [imageUrl],
    public_url: 'https://agrobw.com.br/anuncio/trator-teste',
  }],
});

describe('Seller Store PDF Catalog worker', () => {
  it('ships atomic claim, retry, completion and expiry RPCs', () => {
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain('limit least(greatest(coalesce(p_limit, 1), 1), 2)');
    expect(migration).toContain('power(2, greatest(v_export.attempts - 1, 0))');
    expect(migration).toContain("status = 'expired'");
    expect(migration).toContain("price_mode in ('show', 'hide', 'consult')");
  });

  it('enables the paused runtime only inside the transactional validator', () => {
    expect(transactionalValidator).toContain("to_regclass('public.seller_store_catalog_runtime_settings')");
    expect(transactionalValidator).toContain('set processing_enabled = true, paused_reason = null');
    expect(transactionalValidator.trimEnd()).toMatch(/rollback;$/);
  });

  it('keeps all worker transitions restricted to service_role', () => {
    expect(migration.match(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration).toContain('to service_role');
    expect(migration).toContain('from public, anon, authenticated');
  });

  it('protects the cron endpoint and constrains serverless execution', () => {
    expect(endpoint).toContain("from '../../server/seller-store-catalog-worker.js'");
    expect(worker).toContain("from '../src/lib/sellerStoreCatalog/documentModel.js'");
    expect(worker).toContain("from '../src/lib/sellerStoreCatalog/renderHtml.js'");
    expect(renderHtml).toContain("from './documentModel.js'");
    expect(endpoint).toContain('CATALOG_EXPORT_CRON_SECRET');
    expect(endpoint).toContain("req.headers['x-cron-secret']");
    expect(endpoint).toContain('timingSafeEqual');
    expect(vercel).toContain('api/catalog/process-jobs.ts');
    expect(vercel).toContain('"maxDuration": 300');
    expect(vercel).toContain('public/images/catalog-cover-institutional-v2.png');
    expect(worker).toContain('CATALOG_EXPORT_INSTITUTIONAL_BACKGROUND_UNAVAILABLE');
    expect(worker).toContain('institutionalBackgroundUrl: await loadInstitutionalBackground()');
    expect(endpoint).toContain("Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8')");
  });

  it('renders from snapshots and uses the immutable request creation time', () => {
    expect(worker).toContain('store: job.store_snapshot');
    expect(worker).toContain('announcements: job.announcement_snapshot');
    expect(worker).toContain('generatedAt: job.created_at');
    expect(worker).not.toContain(".from('announcements')");
    expect(worker).not.toContain(".from('seller_stores')");
  });

  it('rejects arbitrary image hosts before network access', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchTrustedCatalogImage('https://example.com/private.png', fetchImpl as typeof fetch))
      .rejects.toThrow('CATALOG_EXPORT_IMAGE_HOST_NOT_ALLOWED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('embeds official images and deduplicates repeated URLs', async () => {
    const fetchImpl = vi.fn(async () => new Response(webpBytes, {
      status: 200,
      headers: { 'content-type': 'image/webp', 'content-length': String(webpBytes.byteLength) },
    }));
    const embedded = await embedSellerStoreCatalogImages(document(), fetchImpl as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(embedded.document.store.logoUrl).toMatch(/^data:image\/webp;base64,/);
    expect(embedded.document.products[0].images[0]).toMatch(/^data:image\/webp;base64,/);
    expect(embedded.embeddedImageBytes).toBe(webpBytes.byteLength * 2);
  });

  it('rejects image bytes that do not match the declared MIME type', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }));
    await expect(fetchTrustedCatalogImage(imageUrl, fetchImpl as typeof fetch))
      .rejects.toThrow('CATALOG_EXPORT_IMAGE_SIGNATURE_INVALID');
  });

  it('downloads only the primary product image in bounded batches', () => {
    expect(worker).toContain('IMAGE_DOWNLOAD_CONCURRENCY = 8');
    expect(worker).toContain('if (product.images[0]) urls.add(product.images[0])');
    expect(worker).toContain('orderedUrls.slice(index, index + IMAGE_DOWNLOAD_CONCURRENCY)');
  });

  it('degrades unavailable images to placeholders', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }));
    const embedded = await embedSellerStoreCatalogImages(document(), fetchImpl as typeof fetch);

    expect(embedded.document.store.logoUrl).toBeNull();
    expect(embedded.document.store.coverUrl).toBeNull();
    expect(embedded.document.products[0].images).toEqual([]);
  });

  it('optimizes every embedded image while deduplicating equal inputs', async () => {
    const source = `data:image/webp;base64,${'a'.repeat(400)}`;
    const catalog = document();
    catalog.store.logoUrl = source;
    catalog.store.coverUrl = source;
    catalog.products.push(structuredClone(catalog.products[0]));
    catalog.products.forEach((product) => { product.images = [source]; });
    const optimizeImage = vi.fn(async (_dataUrl: string, options: { mimeType: string }) => (
      `data:${options.mimeType};base64,${'b'.repeat(40)}`
    ));

    const optimized = await optimizeSellerStoreCatalogImages(catalog, source, optimizeImage);

    expect(optimizeImage).toHaveBeenCalledTimes(3);
    expect(optimized.document.store.logoUrl).toMatch(/^data:image\/webp;base64,/);
    expect(optimized.document.store.coverUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(optimized.document.products).toHaveLength(2);
    expect(optimized.document.products.every((product) => product.images[0].startsWith('data:image/jpeg;base64,')))
      .toBe(true);
    expect(optimized.platformLogoDataUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it('keeps the original image when recompression would increase its size', async () => {
    const source = 'data:image/webp;base64,YWJj';
    const catalog = document();
    catalog.store.logoUrl = source;
    catalog.store.coverUrl = null;
    catalog.products[0].images = [];
    const optimizeImage = vi.fn(async () => `data:image/webp;base64,${'x'.repeat(100)}`);

    const optimized = await optimizeSellerStoreCatalogImages(catalog, '', optimizeImage);

    expect(optimized.document.store.logoUrl).toBe(source);
  });

  it('uses bounded canvas recompression before the isolated PDF render', () => {
    expect(worker).toContain('maxWidth: 720');
    expect(worker).toContain('MAX_PREPARED_IMAGE_BYTES');
    expect(worker).toContain('prepareSellerStoreCatalogImagesForPdf(');
    expect(worker).toContain("mimeType: 'image/jpeg'");
    expect(worker).toContain("globalThis.document.createElement('canvas')");
    expect(worker).toContain('canvas.toDataURL(settings.mimeType, settings.quality)');
    expect(worker.indexOf('optimizeSellerStoreCatalogImages('))
      .toBeLessThan(worker.indexOf('await page.setJavaScriptEnabled(false)'));
  });

  it('fetches each source once and stores only optimized images for the PDF', async () => {
    const catalog = document();
    const largeWebpBytes = new Uint8Array(500);
    largeWebpBytes.set(webpBytes);
    const fetchImpl = vi.fn(async () => new Response(largeWebpBytes, {
      status: 200,
      headers: { 'content-type': 'image/webp' },
    }));
    const optimizeImage = vi.fn(async (_source: string, options: { mimeType: string }) => (
      `data:${options.mimeType};base64,${'z'.repeat(32)}`
    ));

    const prepared = await prepareSellerStoreCatalogImagesForPdf(catalog, '', fetchImpl as typeof fetch, optimizeImage);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(prepared.document.store.coverUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(prepared.document.products[0].images[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(prepared.platformLogoDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(prepared.preparedImageBytes).toBeGreaterThan(0);
  });

  it('classifies malformed documents and oversized PDFs as permanent failures', () => {
    expect(isPermanentCatalogError(new Error('CATALOG_DOCUMENT_INVALID_PRICE_MODE'))).toBe(true);
    expect(isPermanentCatalogError(new Error('CATALOG_EXPORT_PDF_TOO_LARGE'))).toBe(true);
    expect(isPermanentCatalogError(new Error('CATALOG_EXPORT_UPLOAD_TIMEOUT'))).toBe(false);
  });

  it('creates owner-bound short-lived signed downloads', () => {
    expect(download).toContain(".eq('user_id', authData.user.id)");
    expect(download).toContain("catalog.status !== 'ready'");
    expect(download).toContain('SIGNED_URL_TTL_SECONDS = 15 * 60');
    expect(download).toContain('.createSignedUrl(');
    expect(config).toContain('[functions.seller-store-catalog-download]');
  });
});
