import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getEffectiveCatalogStatus,
  getSellerStoreCatalogErrorMessage,
  isTrustedCatalogDownloadUrl,
} from '../../hooks/useSellerStoreCatalog';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const hook = read('src/hooks/useSellerStoreCatalog.ts');
const panel = read('components/dashboard/SellerStoreCatalogPanel.tsx');
const dashboard = read('components/dashboard/SellerStoreDashboard.tsx');
const downloadFunction = read('supabase/functions/seller-store-catalog-download/index.ts');

describe('Seller Store PDF Catalog experience', () => {
  it('exposes the builder inside Minha Loja without coupling it to store editing', () => {
    expect(dashboard).toContain("import SellerStoreCatalogPanel from './SellerStoreCatalogPanel'");
    expect(dashboard).toContain('<SellerStoreCatalogPanel');
    expect(panel).toContain('Transforme sua vitrine em um PDF pronto para vender.');
    expect(panel).toContain('Seus catálogos');
  });

  it('supports selection, customization and every price policy', () => {
    expect(panel).toContain("value: 'show'");
    expect(panel).toContain("value: 'consult'");
    expect(panel).toContain("value: 'hide'");
    expect(panel).toContain('announcements.slice(0, 100)');
    expect(panel).toContain('aria-pressed={selected}');
    expect(hook).toContain('p_announcement_ids: input.announcementIds');
  });

  it('uses only RPCs for client mutations and polls only while work is open', () => {
    expect(hook).toContain("supabase.rpc('request_seller_store_catalog_export_v2'");
    expect(hook).toContain("supabase.rpc('cancel_seller_store_catalog_export'");
    expect(hook).not.toMatch(/\.from\('seller_store_catalog_exports'\)\s*\.insert/);
    expect(hook).not.toMatch(/\.from\('seller_store_catalog_exports'\)\s*\.update/);
    expect(hook).toContain("supabase.rpc('list_my_seller_store_catalog_exports_v2'");
    expect(hook).not.toContain(".from('seller_store_catalog_exports')");
    expect(hook).toContain("item.status === 'queued' || item.status === 'processing'");
    expect(hook).toContain('window.setInterval(() => pollExports(), 5_000)');
  });

  it('blocks new requests while the worker is paused without exposing runtime internals', () => {
    expect(hook).toContain("supabase.rpc('get_seller_store_catalog_availability'");
    expect(panel).toContain('storeEligible && isRuntimeEnabled');
    expect(panel).toContain('temporariamente indisponível durante a liberação acompanhada');
  });

  it('downloads through the owner-bound function without exposing storage paths', () => {
    expect(hook).toContain("'seller-store-catalog-download'");
    expect(hook).toContain('isTrustedCatalogDownloadUrl(data.signedUrl)');
    expect(hook).not.toContain('storage_path');
    expect(downloadFunction).toContain(".eq('user_id', authData.user.id)");
    expect(panel).not.toContain('storagePath');
  });

  it('treats a ready export past its retention date as expired immediately', () => {
    expect(getEffectiveCatalogStatus({ status: 'ready', expiresAt: '2026-09-20T00:00:00.000Z' }, Date.parse('2026-09-21T00:00:00.000Z'))).toBe('expired');
    expect(getEffectiveCatalogStatus({ status: 'ready', expiresAt: '2026-09-22T00:00:00.000Z' }, Date.parse('2026-09-21T00:00:00.000Z'))).toBe('ready');
    expect(getEffectiveCatalogStatus({ status: 'failed', expiresAt: '2026-09-22T00:00:00.000Z' })).toBe('failed');
  });

  it('maps known database failures without exposing backend details', () => {
    expect(getSellerStoreCatalogErrorMessage(
      new Error('CATALOG_EXPORT_CONCURRENCY_LIMIT'),
      'fallback',
    )).toContain('duas gerações');
    expect(getSellerStoreCatalogErrorMessage(
      { message: 'internal database detail' },
      'Mensagem segura',
    )).toBe('Mensagem segura');
  });

  it('accepts only HTTPS signed URLs from the configured Supabase host', () => {
    const host = new URL(import.meta.env.VITE_SUPABASE_URL).hostname;
    expect(isTrustedCatalogDownloadUrl(`https://${host}/storage/v1/object/sign/test`)).toBe(true);
    expect(isTrustedCatalogDownloadUrl(`http://${host}/storage/v1/object/sign/test`)).toBe(false);
    expect(isTrustedCatalogDownloadUrl('https://example.com/catalog.pdf')).toBe(false);
    expect(isTrustedCatalogDownloadUrl('not-a-url')).toBe(false);
  });

  it('communicates asynchronous progress and preserves page usability', () => {
    expect(panel).toContain('aria-live="polite"');
    expect(panel).toContain('Você pode continuar usando a plataforma.');
    expect(panel).toContain("document.createElement('a')");
    expect(panel).toContain('anchor.download = download.filename');
    expect(panel).not.toContain("window.open('', '_blank')");
  });
});
