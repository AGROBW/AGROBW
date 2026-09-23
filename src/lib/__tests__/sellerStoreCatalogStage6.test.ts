import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getSellerStoreCatalogOperationalTone,
  type SellerStoreCatalogHealth,
} from '../../hooks/useSellerStoreCatalogOperations';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const hook = read('src/hooks/useSellerStoreCatalogOperations.ts');
const panel = read('components/admin/integrations/SellerStoreCatalogOperationsSection.tsx');
const integrations = read('pages/admin/IntegrationsManagement.tsx');
const validator = read('sql/VALIDATE_seller_store_catalog_rollout_stage6_2026-09-22.sql');
const runbook = read('docs/SELLER_STORE_CATALOG_STAGE6_2026-09-22.md');
const emailDispatcher = read('api/email/[action].mjs');
const vercelConfig = read('vercel.json');

const listVercelFunctions = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listVercelFunctions(path);
    return /\.(mjs|js|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });

const health = (changes: Partial<SellerStoreCatalogHealth> = {}): SellerStoreCatalogHealth => ({
  processing_enabled: true,
  max_batch_size: 1,
  failure_threshold: 3,
  consecutive_failures: 0,
  paused_reason: null,
  last_started_at: '2026-09-22T12:00:00.000Z',
  last_success_at: '2026-09-22T12:00:00.000Z',
  last_failure_at: null,
  queued: 0,
  processing: 0,
  ready_24h: 1,
  failed_24h: 0,
  oldest_queued_at: null,
  ...changes,
});

describe('Seller Store PDF Catalog controlled rollout', () => {
  it('adds operational controls to the existing admin integrations page', () => {
    expect(integrations).toContain("import SellerStoreCatalogOperationsSection from '../../components/admin/integrations/SellerStoreCatalogOperationsSection'");
    expect(integrations).toContain('<SellerStoreCatalogOperationsSection />');
    expect(panel).toContain('Operacao dos catalogos PDF');
  });

  it('loads health and history only through protected admin RPCs', () => {
    expect(hook).toContain("supabase.rpc('get_seller_store_catalog_health_admin'");
    expect(hook).toContain("supabase.rpc('list_seller_store_catalog_worker_runs_admin'");
    expect(hook).toContain("supabase.rpc('update_seller_store_catalog_runtime_admin'");
    expect(hook).not.toMatch(/\.from\('seller_store_catalog_(runtime_settings|worker_runs)'\)/);
  });

  it('requires explicit confirmation before activation', () => {
    expect(panel).toContain('Confirmo a ativacao acompanhada');
    expect(panel).toContain('!activationConfirmed');
    expect(panel).toContain('disabled={isSaving || !activationConfirmed}');
  });

  it('locks tuning controls while processing is active and keeps pause immediate', () => {
    expect(panel.match(/disabled=\{health\.processing_enabled \|\| isSaving\}/g)?.length).toBe(2);
    expect(panel).toContain('setProcessing(false)');
    expect(panel).toContain('Pausar processamento');
  });

  it('classifies paused, waiting, healthy and attention states deterministically', () => {
    const now = Date.parse('2026-09-22T12:05:00.000Z');
    expect(getSellerStoreCatalogOperationalTone(health({ processing_enabled: false }), now)).toBe('paused');
    expect(getSellerStoreCatalogOperationalTone(health({ last_success_at: null }), now)).toBe('waiting');
    expect(getSellerStoreCatalogOperationalTone(health(), now)).toBe('healthy');
    expect(getSellerStoreCatalogOperationalTone(health({ failed_24h: 1 }), now)).toBe('attention');
  });

  it('ships a read-only final validator with structural and live checks', () => {
    expect(validator).toContain('estrutura_completa');
    expect(validator).toContain('contratos_completos');
    expect(validator).toContain('request_seller_store_catalog_export_v2');
    expect(validator).toContain('list_my_seller_store_catalog_exports_v2');
    expect(validator).toContain('bucket_privado');
    expect(validator).toContain('bucket_sem_policy_browser');
    expect(validator).toContain('sem_jobs_travados');
    expect(validator).toContain('sem_execucoes_orfas');
    expect(validator).toContain('pronto_para_operar');
    expect(validator).not.toMatch(/\b(insert|update|delete|drop|alter)\b/i);
  });

  it('documents one scheduler, safe activation, stop conditions and rollback', () => {
    expect(runbook).toContain('Only one scheduler entry may target this endpoint.');
    expect(runbook).toContain('Confirm the admin catalog operations section loads while processing remains paused.');
    expect(runbook).toContain('Stop conditions');
    expect(runbook).toContain('Pause processing in the admin panel.');
    expect(runbook).not.toContain('SUPABASE_SERVICE_ROLE_KEY=');
    expect(runbook).not.toContain('CATALOG_EXPORT_CRON_SECRET=');
  });

  it('refreshes operational data without multiplying browser subscriptions', () => {
    expect(hook).toContain('window.setInterval(() => void fetchOperations({ silent: true }), 30_000)');
    expect(hook).toContain('window.clearInterval(interval)');
  });

  it('stays below the Hobby function limit with an email dispatcher and bundles Chromium assets', () => {
    expect(emailDispatcher).toContain("action === 'settings'");
    expect(emailDispatcher).toContain("action === 'test-connection'");
    expect(emailDispatcher).toContain("action === 'send-test'");
    expect(emailDispatcher).toContain("action === 'process-jobs'");
    expect(vercelConfig).toContain('node_modules/@sparticuz/chromium/bin/**');
    expect(listVercelFunctions(resolve(process.cwd(), 'api')).length).toBeLessThanOrEqual(12);
  });
});
