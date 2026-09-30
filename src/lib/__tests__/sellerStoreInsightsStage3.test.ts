import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'sql/create_seller_store_insights_stage3_2026-09-29.sql'),
  'utf8',
);
const validation = readFileSync(
  resolve(process.cwd(), 'sql/VALIDATE_create_seller_store_insights_stage3_2026-09-29.sql'),
  'utf8',
);
const transactionalValidation = readFileSync(
  resolve(process.cwd(), 'sql/VALIDATE_create_seller_store_insights_stage3_transactional_2026-09-29.sql'),
  'utf8',
);
const hook = readFileSync(resolve(process.cwd(), 'src/hooks/useSellerStoreInsights.ts'), 'utf8');
const storefront = readFileSync(resolve(process.cwd(), 'pages/StorefrontView.tsx'), 'utf8');

describe('Seller Store Insights stage 3', () => {
  it('exposes one owner-only aggregate RPC with fixed civil periods', () => {
    expect(migration).toContain('get_my_seller_store_insights');
    expect(migration).toContain('p_period_days not in (7, 30, 90)');
    expect(migration).toContain("at time zone 'America/Sao_Paulo'");
    expect(migration).toContain('seller_store_insights_has_active_plan');
    expect(migration).toContain('to authenticated');
    expect(migration).not.toMatch(/get_my_seller_store_insights[\s\S]*to anon/);
  });

  it('keeps store visits authoritative while collecting normalized source attribution', () => {
    expect(migration).toContain("views.page_type = 'storefront'");
    expect(migration).toContain('count(distinct views.session_id)');
    expect(migration).toContain('views.user_id is distinct from v_user_id');
    expect(migration).toContain("events.event_type = 'store_visit_attribution'");
    expect(migration).toContain('current_converted_visitors');
    expect(migration).toContain("events.event_type in ('announcement_open', 'catalog_qr_open')");
    expect(storefront).toContain("eventType: 'store_visit_attribution'");
  });

  it('returns comparisons, daily series, sources and top announcements without raw sessions', () => {
    expect(migration).toContain("'comparison'");
    expect(migration).toContain("'sourceCoverage'");
    expect(migration).toContain("'topAnnouncements'");
    expect(migration).toContain("'daily'");
    expect(migration).not.toContain("'sessionHash'");
    expect(migration).not.toContain("'sessionId'");
  });

  it('ships structural and rollback-safe transactional validation', () => {
    expect(validation).toContain('eventos_continuam_privados');
    expect(validation).toContain('periodos_limitados');
    expect(transactionalValidation).toContain('SOURCE_BREAKDOWN_MISSING_GOOGLE');
    expect(transactionalValidation).toContain('EXPIRED_PLAN_RECEIVED_AGGREGATED_INSIGHTS');
    expect(transactionalValidation).toContain('STORE_CONVERSION_EXCEEDED_100_PERCENT');
    expect(transactionalValidation).toContain('DIRECT_ANNOUNCEMENT_CONTACT_WAS_NOT_RECORDED');
    expect(transactionalValidation.trimEnd()).toMatch(/rollback;$/);
  });

  it('provides a typed client hook that only calls the aggregate RPC', () => {
    expect(hook).toContain("supabase.rpc('get_my_seller_store_insights'");
    expect(hook).toContain("supabase.rpc('get_my_seller_store_insights_availability'");
    expect(hook).toContain('SellerStoreInsightsPeriod = 7 | 30 | 90');
    expect(hook).not.toContain(".from('seller_store_insight_events')");
    expect(hook).not.toContain(".from('site_page_views')");
  });
});
