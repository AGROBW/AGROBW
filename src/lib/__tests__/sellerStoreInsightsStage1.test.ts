import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'sql/create_seller_store_insights_stage1_2026-09-29.sql'),
  'utf8',
);
const validation = readFileSync(
  resolve(process.cwd(), 'sql/VALIDATE_create_seller_store_insights_stage1_2026-09-29.sql'),
  'utf8',
);
const transactionalValidation = readFileSync(
  resolve(process.cwd(), 'sql/VALIDATE_create_seller_store_insights_stage1_transactional_2026-09-29.sql'),
  'utf8',
);
const contract = readFileSync(
  resolve(process.cwd(), 'docs/seller-store-insights-metric-contract.md'),
  'utf8',
);

describe('Seller Store Insights stage 1', () => {
  it('defines a private and forced-RLS event ledger', () => {
    expect(migration).toContain('SELLER_STORE_INSIGHTS_PREREQUISITES_MISSING');
    expect(migration).toContain('create table if not exists public.seller_store_insight_events');
    expect(migration).toContain('force row level security');
    expect(migration).toContain('revoke all on table public.seller_store_insight_events from public, anon, authenticated');
    expect(migration).toContain('idx_seller_store_insight_events_five_minute_dedupe');
    expect(migration).toContain('seller_store_insight_retention_runs');
    expect(migration).toContain('seller_store_insight_rate_limit_windows');
    expect(migration).toContain('idx_seller_store_insight_events_store_created');
    expect(migration).toContain('on delete set null');
    expect(migration).toContain('dedupe_scope text not null');
    expect(migration).toMatch(/idx_seller_store_insight_events_five_minute_dedupe[\s\S]*dedupe_scope/);
  });

  it('enforces the active Seller Store entitlement in the database', () => {
    expect(migration).toContain('plans.has_seller_store');
    expect(migration).toContain("subscriptions.status = 'active'");
    expect(migration).toContain('subscriptions.current_period_end > now()');
    expect(migration).toContain('get_my_seller_store_insights_availability');
    expect(migration).toContain("'PLAN_REQUIRED'::text");
  });

  it('keeps browser writes behind a constrained and idempotent RPC', () => {
    expect(migration).toContain('record_seller_store_insight_event');
    expect(migration).toContain('auth.uid() = v_store.user_id');
    expect(migration).toContain("events.created_at >= v_now - interval '1 minute'");
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('seller-store-insights:'");
    expect(migration).toContain(') >= 60 then');
    expect(migration).toContain('date_trunc(\'minute\', v_now)');
    expect(migration).toContain('on conflict do nothing');
    expect(migration).toContain('md5(v_store.id::text');
  });

  it('separates public and service-only catalog events', () => {
    expect(migration).toContain('record_seller_store_insight_system_event');
    expect(migration).toContain("p_event_type not in ('catalog_generated', 'catalog_download')");
    expect(migration).toContain('to service_role');
    expect(migration).not.toMatch(/record_seller_store_insight_system_event[\s\S]*to anon/);
  });

  it('documents stable formulas, privacy and retention', () => {
    expect(contract).toContain('Conversion rate');
    expect(contract).toContain('Sharing is not a contact action');
    expect(contract).toContain('Raw session identifiers are transformed');
    expect(contract).toContain('180-day retention contract');
    expect(migration).toContain('purge_seller_store_insight_events');
    expect(migration).toContain('insert into public.seller_store_insight_retention_runs');
  });

  it('ships structural and rollback-safe validation', () => {
    expect(validation).toContain('deduplicacao_cinco_minutos');
    expect(validation).toContain("indexdef ilike '%dedupe_scope%'");
    expect(validation).toContain('indice_limite_global');
    expect(validation).toContain('observabilidade_limite_privada');
    expect(validation).toContain('sem_dados_sensiveis');
    expect(validation).toContain('evento_sistema_so_service_role');
    expect(transactionalValidation).toContain('IDEMPOTENCY_KEY_DID_NOT_DEDUPLICATE');
    expect(transactionalValidation).toContain('OWNER_EVENT_WAS_NOT_IGNORED');
    expect(transactionalValidation).toContain('ROTATING_SESSIONS_BYPASSED_STORE_RATE_LIMIT');
    expect(transactionalValidation).toContain('STORE_RATE_LIMIT_SATURATION_WAS_NOT_RECORDED');
    expect(transactionalValidation.trimEnd()).toMatch(/rollback;$/);
  });
});
