import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('sql/create_seller_store_catalog_exports_stage1_2026-09-21.sql');
const validation = read('sql/VALIDATE_create_seller_store_catalog_exports_stage1_2026-09-21.sql');
const transactionalValidation = read(
  'sql/VALIDATE_create_seller_store_catalog_exports_stage1_transactional_2026-09-21.sql',
);
const rollback = read('sql/ROLLBACK_create_seller_store_catalog_exports_stage1_2026-09-21.sql');
const runbook = read('docs/SELLER_STORE_CATALOG_STAGE1_2026-09-21.md');

describe('Seller Store PDF Catalog foundation', () => {
  it('creates a private PDF-only bucket without client writes', () => {
    expect(migration).toContain("'seller-store-catalogs'");
    expect(migration).toContain("array['application/pdf']");
    expect(migration).toContain('31457280');
    expect(migration).toContain('public = false');
    expect(migration).not.toContain('create policy seller_store_catalogs_owner_read');
    expect(migration).not.toContain('create policy seller_store_catalogs_admin_read');
    expect(migration).not.toMatch(/create policy seller_store_catalogs[^\n]*(upload|insert|update|delete)/i);
    expect(validation).toContain('bucket_sem_acesso_direto');
    expect(validation).toContain('cliente_sem_escrita_bucket');
    expect(transactionalValidation).toContain('set local role authenticated');
    expect(transactionalValidation).toContain("bucket_id = 'ads-images'");
  });

  it('gates exports by owner, active plan, active store and active ads', () => {
    expect(migration).toContain('v_user_id uuid := auth.uid()');
    expect(migration).toContain("subscriptions.status = 'active'");
    expect(migration).toContain('subscriptions.current_period_end > now()');
    expect(migration).toContain('plans.has_seller_store');
    expect(migration).toContain('stores.is_store_feature_enabled = true');
    expect(migration).toContain("announcements.status = 'ACTIVE'");
    expect(migration).toContain('announcements.user_id = v_user_id');
  });

  it('limits volume, concurrency and daily requests', () => {
    expect(migration).toContain('v_requested_count > 100');
    expect(migration).toContain('CATALOG_EXPORT_CONCURRENCY_LIMIT');
    expect(migration).toContain("now() - interval '24 hours'");
    expect(migration).toContain('CATALOG_EXPORT_DAILY_LIMIT');
    expect(migration).toContain('idx_seller_store_catalog_exports_open_snapshot');
    expect(migration).toContain('pg_advisory_xact_lock');
  });

  it('rejects new requests while the operational runtime is paused', () => {
    expect(migration).toContain("to_regclass('public.seller_store_catalog_runtime_settings')");
    expect(migration).toContain('CATALOG_EXPORT_RUNTIME_DISABLED');
  });

  it('freezes canonical snapshots without direct contact data', () => {
    expect(migration).toContain("'public_url', 'https://agrobw.com.br/loja/'");
    expect(migration).toContain("'public_url', 'https://agrobw.com.br/anuncio/'");
    expect(migration).not.toContain("'email', v_store.email");
    expect(migration).not.toContain("'whatsapp', v_store.whatsapp");
    expect(migration).toContain("'images', to_jsonb(announcements.images[1:3])");
    expect(transactionalValidation).toContain("v_export.store_snapshot ? 'email'");
    expect(transactionalValidation).toContain("v_export.store_snapshot ? 'whatsapp'");
  });

  it('keeps mutations behind RPCs and service role', () => {
    expect(migration).toContain('force row level security');
    expect(migration).not.toContain('grant select on table public.seller_store_catalog_exports to authenticated');
    expect(migration).toContain('list_my_seller_store_catalog_exports');
    expect(migration).toContain('grant select, insert, update, delete on table public.seller_store_catalog_exports to service_role');
    expect(migration).toContain('security definer');
    expect(migration).toContain('cancel_seller_store_catalog_export');
    expect(transactionalValidation).toContain('Solicitacao equivalente nao foi deduplicada');
    expect(transactionalValidation.trimEnd()).toMatch(/rollback;$/);
  });

  it('ships fail-closed rollback and deployment documentation', () => {
    expect(rollback).toContain('Rollback recusado: existem exportacoes de catalogo');
    expect(rollback).toContain('Rollback recusado: o bucket seller-store-catalogs possui arquivos');
    expect(rollback).not.toContain('delete from storage.objects');
    expect(runbook).toContain('Require every returned boolean to be `true`');
    expect(runbook).toContain('always rolled back');
  });
});
