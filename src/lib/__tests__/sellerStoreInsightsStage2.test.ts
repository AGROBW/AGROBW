import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendSellerStoreAttribution,
  buildAttributedStoreUrl,
  readSellerStoreAttribution,
  resolveSellerStoreInsightSource,
} from '../sellerStoreInsights/attribution';

const storefront = readFileSync(resolve(process.cwd(), 'pages/StorefrontView.tsx'), 'utf8');
const adCard = readFileSync(resolve(process.cwd(), 'components/AdCard.tsx'), 'utf8');
const adDetail = readFileSync(resolve(process.cwd(), 'pages/AdDetailView.tsx'), 'utf8');
const contactModal = readFileSync(resolve(process.cwd(), 'components/ContactSellerModal.tsx'), 'utf8');
const partnerStores = readFileSync(resolve(process.cwd(), 'pages/PartnerStoresView.tsx'), 'utf8');
const homeStores = readFileSync(resolve(process.cwd(), 'components/HomeStoresCarousel.tsx'), 'utf8');
const tracking = readFileSync(
  resolve(process.cwd(), 'src/lib/sellerStoreInsights/tracking.ts'),
  'utf8',
);

describe('Seller Store Insights stage 2', () => {
  it('normalizes explicit and referrer-based traffic sources', () => {
    expect(resolveSellerStoreInsightSource({ search: '?store_source=catalog_pdf' })).toBe('catalog_pdf');
    expect(resolveSellerStoreInsightSource({ search: '?utm_source=WhatsApp' })).toBe('whatsapp');
    expect(resolveSellerStoreInsightSource({ referrer: 'https://www.google.com/search?q=agro' })).toBe('google');
    expect(resolveSellerStoreInsightSource({
      referrer: 'https://agrobw.com.br/categorias',
      currentOrigin: 'https://agrobw.com.br',
    })).toBe('internal');
    expect(resolveSellerStoreInsightSource({ referrer: '' })).toBe('direct');
    expect(resolveSellerStoreInsightSource({ referrer: 'https://example.com/post' })).toBe('other');
  });

  it('propagates only a normalized store attribution to announcement routes', () => {
    const path = appendSellerStoreAttribution('/anuncio/trator-bovino', {
      storeSlug: 'evolucao-metalurgica',
      sourceChannel: 'social',
    });

    expect(path).toBe('/anuncio/trator-bovino?store=evolucao-metalurgica&store_source=social');
    expect(readSellerStoreAttribution('?store=evolucao-metalurgica&store_source=social')).toEqual({
      storeSlug: 'evolucao-metalurgica',
      sourceChannel: 'social',
    });
    expect(readSellerStoreAttribution('?store=../admin&store_source=social')).toBeNull();
    expect(readSellerStoreAttribution('?store=evolucao-metalurgica&store_source=raw-referrer')).toBeNull();
  });

  it('marks outbound shared storefront URLs without exposing a raw referrer', () => {
    expect(buildAttributedStoreUrl('https://agrobw.com.br/loja/evolucao-metalurgica', 'whatsapp')).toBe(
      'https://agrobw.com.br/loja/evolucao-metalurgica?store_source=whatsapp',
    );
  });

  it('instruments storefront commercial actions without replacing existing visit analytics', () => {
    expect(storefront).toContain("eventType: 'contact_whatsapp'");
    expect(storefront).toContain("eventType: 'website_click'");
    expect(storefront).toContain("eventType: 'store_share'");
    expect(storefront).toContain('sellerStoreAttribution={{ storeSlug: store.slug, sourceChannel }}');
    expect(storefront).not.toContain("eventType: 'store_view'");
    expect(partnerStores).toContain('?store_source=internal');
    expect(homeStores).toContain('?store_source=internal');
  });

  it('records product opens and successful platform contacts as fire-and-forget events', () => {
    expect(adCard).toContain("eventType: 'announcement_open'");
    expect(adDetail).toContain("eventType: 'contact_platform'");
    expect(contactModal).toContain('onContactSent?.();');
    expect(tracking).toContain("supabase.rpc('record_seller_store_insight_event'");
    expect(tracking).toContain('ensureSiteAnalyticsSessionId()');
  });
});
