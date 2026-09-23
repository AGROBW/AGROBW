import chromium from '@sparticuz/chromium';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
import {
  buildSellerStoreCatalogDocument,
  SELLER_STORE_CATALOG_IMAGE_HOSTS,
  type SellerStoreCatalogDocument,
} from '../src/lib/sellerStoreCatalog/documentModel.js';
import { renderSellerStoreCatalogHtml } from '../src/lib/sellerStoreCatalog/renderHtml.js';

const CATALOG_BUCKET = 'seller-store-catalogs';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_EMBEDDED_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 8_000;
const IMAGE_DOWNLOAD_CONCURRENCY = 8;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type CatalogExportRow = {
  id: string;
  user_id: string;
  catalog_title: string;
  catalog_subtitle: string | null;
  price_mode: 'show' | 'hide' | 'consult';
  cover_alignment?: 'left' | 'center' | 'right';
  created_at: string;
  store_snapshot: Parameters<typeof buildSellerStoreCatalogDocument>[0]['store'];
  announcement_snapshot: Parameters<typeof buildSellerStoreCatalogDocument>[0]['announcements'];
};

type ExpiredCatalogRow = { id: string; storage_path: string };

export type SellerStoreCatalogBatchSummary = {
  claimed: number;
  ready: number;
  retried: number;
  failed: number;
  released: number;
  transitionErrors: number;
  expiredFilesDeleted: number;
  orphanFilesDeleted: number;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'CATALOG_EXPORT_UNKNOWN_ERROR';

const safeErrorCode = (error: unknown) => {
  const normalized = errorMessage(error).toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
  return normalized.slice(0, 80) || 'CATALOG_EXPORT_UNKNOWN_ERROR';
};

export const isPermanentCatalogError = (error: unknown) => {
  const code = safeErrorCode(error);
  return code.startsWith('CATALOG_DOCUMENT_')
    || code === 'CATALOG_EXPORT_INVALID_SNAPSHOT'
    || code === 'CATALOG_EXPORT_PDF_TOO_LARGE';
};

const validateTrustedImageUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !SELLER_STORE_CATALOG_IMAGE_HOSTS.has(url.hostname)) {
    throw new Error('CATALOG_EXPORT_IMAGE_HOST_NOT_ALLOWED');
  }
  if (url.hostname === 'dockpbyzrvgewgdoaibn.supabase.co') {
    const decodedPath = decodeURIComponent(url.pathname);
    const allowedPrefix = decodedPath.startsWith('/storage/v1/object/public/ads-images/')
      || decodedPath.startsWith('/storage/v1/object/public/seller-stores/');
    if (!allowedPrefix || decodedPath.split('/').includes('..')) {
      throw new Error('CATALOG_EXPORT_IMAGE_PATH_NOT_ALLOWED');
    }
  }
  return url;
};

const hasExpectedImageSignature = (bytes: Uint8Array, contentType: string) => {
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  }
  if (contentType === 'image/webp') {
    return bytes.length >= 12
      && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF'
      && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP';
  }
  return false;
};

const readResponseBytesWithLimit = async (response: Response, maxBytes: number) => {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error('CATALOG_EXPORT_IMAGE_TOO_LARGE');
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel('CATALOG_EXPORT_IMAGE_TOO_LARGE');
      throw new Error('CATALOG_EXPORT_IMAGE_TOO_LARGE');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

export const fetchTrustedCatalogImage = async (
  value: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ dataUrl: string; byteLength: number }> => {
  const url = validateTrustedImageUrl(value);
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    headers: { Accept: 'image/jpeg,image/png,image/webp' },
  });
  if (!response.ok) throw new Error(`CATALOG_EXPORT_IMAGE_HTTP_${response.status}`);

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new Error('CATALOG_EXPORT_IMAGE_TYPE_NOT_ALLOWED');
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error('CATALOG_EXPORT_IMAGE_TOO_LARGE');

  const bytes = await readResponseBytesWithLimit(response, MAX_IMAGE_BYTES);
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('CATALOG_EXPORT_IMAGE_TOO_LARGE');
  }
  if (!hasExpectedImageSignature(bytes, contentType)) {
    throw new Error('CATALOG_EXPORT_IMAGE_SIGNATURE_INVALID');
  }
  return {
    dataUrl: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`,
    byteLength: bytes.byteLength,
  };
};

export const embedSellerStoreCatalogImages = async (
  document: SellerStoreCatalogDocument,
  fetchImpl: typeof fetch = fetch,
) => {
  const copy = structuredClone(document);
  const urls = new Set<string>();
  if (copy.store.logoUrl) urls.add(copy.store.logoUrl);
  if (copy.store.coverUrl) urls.add(copy.store.coverUrl);
  copy.products.forEach((product) => {
    if (product.images[0]) urls.add(product.images[0]);
  });
  urls.add('https://agrobw.com.br/agrobw-logo.png');

  const embedded = new Map<string, string>();
  let totalBytes = 0;
  const orderedUrls = [...urls];
  for (let index = 0; index < orderedUrls.length && totalBytes < MAX_EMBEDDED_IMAGE_BYTES; index += IMAGE_DOWNLOAD_CONCURRENCY) {
    const batch = orderedUrls.slice(index, index + IMAGE_DOWNLOAD_CONCURRENCY);
    const results = await Promise.all(batch.map(async (url) => {
      try {
        return { url, result: await fetchTrustedCatalogImage(url, fetchImpl) };
      } catch {
        return { url, result: null };
      }
    }));
    for (const { url, result } of results) {
      if (!result || totalBytes + result.byteLength > MAX_EMBEDDED_IMAGE_BYTES) continue;
      totalBytes += result.byteLength;
      embedded.set(url, result.dataUrl);
    }
  }

  copy.store.logoUrl = copy.store.logoUrl ? embedded.get(copy.store.logoUrl) ?? null : null;
  copy.store.coverUrl = copy.store.coverUrl ? embedded.get(copy.store.coverUrl) ?? null : null;
  copy.products.forEach((product) => {
    const primaryImage = product.images[0] ? embedded.get(product.images[0]) : null;
    product.images = primaryImage ? [primaryImage] : [];
  });

  return {
    document: copy,
    platformLogoDataUrl: embedded.get('https://agrobw.com.br/agrobw-logo.png') ?? '',
    embeddedImageBytes: totalBytes,
  };
};

const resolveChromiumLaunch = async () => {
  const localExecutable = process.env.CATALOG_CHROME_EXECUTABLE_PATH?.trim();
  if (localExecutable) {
    return { executablePath: localExecutable, args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true as const };
  }
  chromium.setGraphicsMode = false;
  return {
    executablePath: await chromium.executablePath(),
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    headless: 'shell' as const,
  };
};

export const renderSellerStoreCatalogPdf = async (
  document: SellerStoreCatalogDocument,
  platformLogoDataUrl: string,
): Promise<Buffer> => {
  const html = await renderSellerStoreCatalogHtml(document, { platformLogoUrl: platformLogoDataUrl });
  const launch = await resolveChromiumLaunch();
  const browser = await puppeteer.launch({
    ...launch,
    defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 1 },
  });
  try {
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
    const pdf = Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    }));
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('CATALOG_EXPORT_INVALID_PDF');
    if (pdf.byteLength > MAX_PDF_BYTES) throw new Error('CATALOG_EXPORT_PDF_TOO_LARGE');
    return pdf;
  } finally {
    await browser.close();
  }
};

const cleanupExpiredCatalogs = async (supabase: any) => {
  const { data, error } = await supabase.rpc('expire_seller_store_catalog_exports', { p_limit: 100 });
  if (error) throw new Error(`CATALOG_EXPORT_EXPIRY_RPC_${error.code || 'FAILED'}`);
  const expired = (Array.isArray(data) ? data : []) as ExpiredCatalogRow[];
  if (!expired.length) return 0;

  const { error: removeError } = await supabase.storage
    .from(CATALOG_BUCKET)
    .remove(expired.map((row) => row.storage_path));
  if (removeError) throw new Error(`CATALOG_EXPORT_EXPIRY_STORAGE_${removeError.message || 'FAILED'}`);

  const deletedIds = expired.map((row) => row.id);
  if (deletedIds.length) {
    const { data: marked, error: markError } = await supabase.rpc('mark_seller_store_catalog_storage_deleted', {
      p_export_ids: deletedIds,
    });
    if (markError || Number(marked) !== deletedIds.length) {
      throw new Error(`CATALOG_EXPORT_EXPIRY_MARK_${markError?.code || 'MISMATCH'}`);
    }
  }
  return deletedIds.length;
};

const cleanupOrphanedCatalogs = async (supabase: any) => {
  const { data, error } = await supabase.rpc('list_orphaned_seller_store_catalog_objects', { p_limit: 100 });
  if (error) throw new Error(`CATALOG_EXPORT_ORPHAN_RPC_${error.code || 'FAILED'}`);
  const paths = (Array.isArray(data) ? data : [])
    .map((row) => String(row?.storage_path || ''))
    .filter(Boolean);
  if (!paths.length) return 0;

  const { error: removeError } = await supabase.storage.from(CATALOG_BUCKET).remove(paths);
  if (removeError) throw new Error(`CATALOG_EXPORT_ORPHAN_STORAGE_${removeError.message || 'FAILED'}`);
  return paths.length;
};

export const processSellerStoreCatalogJobs = async (options: {
  supabaseUrl: string;
  serviceRoleKey: string;
  limit?: number;
  fetchImpl?: typeof fetch;
  renderPdf?: typeof renderSellerStoreCatalogPdf;
  supabaseClient?: any;
  workerId?: string;
  maxRuntimeMs?: number;
  now?: () => number;
}): Promise<SellerStoreCatalogBatchSummary> => {
  const limit = Math.min(2, Math.max(1, Math.floor(Number(options.limit) || 1)));
  const supabase = options.supabaseClient ?? createClient(options.supabaseUrl, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const workerId = options.workerId ?? crypto.randomUUID();
  const now = options.now ?? Date.now;
  const startedAt = now();
  const maxRuntimeMs = Math.min(270_000, Math.max(30_000, options.maxRuntimeMs ?? 240_000));
  const minimumJobBudgetMs = Math.min(90_000, maxRuntimeMs);
  const summary: SellerStoreCatalogBatchSummary = {
    claimed: 0,
    ready: 0,
    retried: 0,
    failed: 0,
    released: 0,
    transitionErrors: 0,
    expiredFilesDeleted: 0,
    orphanFilesDeleted: 0,
  };

  summary.expiredFilesDeleted = await cleanupExpiredCatalogs(supabase);
  summary.orphanFilesDeleted = await cleanupOrphanedCatalogs(supabase);
  const { data, error: claimError } = await supabase.rpc('claim_seller_store_catalog_exports', {
    p_limit: limit,
    p_worker_id: workerId,
  });
  if (claimError) throw new Error(`CATALOG_EXPORT_CLAIM_${claimError.code || 'FAILED'}`);
  const jobs = (Array.isArray(data) ? data : []) as CatalogExportRow[];
  summary.claimed = jobs.length;

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    if (maxRuntimeMs - (now() - startedAt) < minimumJobBudgetMs) {
      const unstartedIds = jobs.slice(index).map((item) => item.id);
      const { data: released, error: releaseError } = await supabase.rpc('release_seller_store_catalog_exports', {
        p_worker_id: workerId,
        p_export_ids: unstartedIds,
      });
      if (releaseError || Number(released) !== unstartedIds.length) {
        summary.transitionErrors += unstartedIds.length;
      } else {
        summary.released += unstartedIds.length;
      }
      break;
    }
    try {
      if (!Array.isArray(job.announcement_snapshot) || !job.store_snapshot) {
        throw new Error('CATALOG_EXPORT_INVALID_SNAPSHOT');
      }
      const document = buildSellerStoreCatalogDocument({
        exportId: job.id,
        catalogTitle: job.catalog_title,
        catalogSubtitle: job.catalog_subtitle,
        priceMode: job.price_mode,
        coverAlignment: job.cover_alignment,
        generatedAt: job.created_at,
        store: job.store_snapshot,
        announcements: job.announcement_snapshot,
      });
      const embedded = await embedSellerStoreCatalogImages(document, options.fetchImpl);
      const pdf = await (options.renderPdf ?? renderSellerStoreCatalogPdf)(
        embedded.document,
        embedded.platformLogoDataUrl,
      );
      const storagePath = `${job.user_id}/${job.id}.pdf`;
      const { error: uploadError } = await supabase.storage.from(CATALOG_BUCKET).upload(storagePath, pdf, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true,
      });
      if (uploadError) throw new Error(`CATALOG_EXPORT_UPLOAD_${uploadError.message}`);

      const { data: completed, error: completeError } = await supabase.rpc('complete_seller_store_catalog_export', {
        p_export_id: job.id,
        p_worker_id: workerId,
        p_storage_path: storagePath,
        p_file_size_bytes: pdf.byteLength,
        p_page_count: document.totalPages,
      });
      if (completeError || completed !== true) {
        throw new Error(`CATALOG_EXPORT_COMPLETE_${completeError?.code || 'LEASE_LOST'}`);
      }
      summary.ready += 1;
    } catch (error) {
      const retryable = !isPermanentCatalogError(error);
      const { data: nextStatus, error: failError } = await supabase.rpc('fail_seller_store_catalog_export', {
        p_export_id: job.id,
        p_worker_id: workerId,
        p_error_code: safeErrorCode(error),
        p_error_message: `Catalog generation failed (${safeErrorCode(error)})`,
        p_retryable: retryable,
      });
      if (failError || !nextStatus) {
        summary.transitionErrors += 1;
      } else if (nextStatus === 'queued') {
        summary.retried += 1;
      } else {
        summary.failed += 1;
      }
    }
  }

  return summary;
};
