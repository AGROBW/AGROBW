import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('sql/add_seller_store_catalog_cover_alignment_stage2_2026-09-22.sql');
const validator = read('sql/VALIDATE_add_seller_store_catalog_cover_alignment_stage2_2026-09-22.sql');
const transactionalValidator = read('sql/VALIDATE_add_seller_store_catalog_cover_alignment_stage2_transactional_2026-09-22.sql');
const rollback = read('sql/ROLLBACK_add_seller_store_catalog_cover_alignment_stage2_2026-09-22.sql');
const hook = read('src/hooks/useSellerStoreCatalog.ts');
const panel = read('components/dashboard/SellerStoreCatalogPanel.tsx');
const worker = read('server/seller-store-catalog-worker.ts');

describe('Seller Store PDF Catalog visual stage 2', () => {
  it('adds a constrained, backwards-compatible cover alignment contract', () => {
    expect(migration).toContain("add column if not exists cover_alignment text not null default 'center'");
    expect(migration).toContain("check (cover_alignment in ('left', 'center', 'right'))");
    expect(migration).toContain('request_seller_store_catalog_export_v2');
    expect(migration).toContain('public.request_seller_store_catalog_export(');
    expect(migration).toContain('for update');
    expect(migration).toContain('CATALOG_EXPORT_ALREADY_PROCESSING');
    expect(migration).toContain('CATALOG_EXPORT_ALIGNMENT_CONFLICT');
    expect(migration).toContain("set local lock_timeout = '5s'");
    expect(migration).toContain('CATALOG_EXPORTS_TABLE_REQUIRED');
    expect(migration).toContain('to authenticated');
  });

  it('ships validation and a guarded rollback', () => {
    expect(validator).toContain('alinhamento_criado');
    expect(validator).toContain('atualizacao_atomica');
    expect(validator).toContain('preserva_job_em_processamento');
    expect(validator).toContain('rejeita_mudanca_silenciosa');
    expect(transactionalValidator).toContain('VALIDATION_EXPECTED_ALIGNMENT_CONFLICT');
    expect(transactionalValidator).toContain('VALIDATION_EXPECTED_PROCESSING_CONFLICT');
    expect(transactionalValidator).toContain('started_at = coalesce(started_at, now())');
    expect(transactionalValidator).toContain('locked_at = now()');
    expect(transactionalValidator).toContain('locked_by = v_worker_id');
    expect(transactionalValidator).toContain('rollback;');
    expect(rollback).toContain("status in ('queued', 'processing')");
    expect(rollback).toContain('drop column if exists cover_alignment');
    expect(rollback).toContain('list_my_seller_store_catalog_exports_v2');
  });

  it('passes the preview selection through the RPC and worker', () => {
    expect(hook).toContain("supabase.rpc('request_seller_store_catalog_export_v2'");
    expect(hook).toContain("supabase.rpc('list_my_seller_store_catalog_exports_v2'");
    expect(hook).toContain('p_cover_alignment: input.coverAlignment');
    expect(worker).toContain('cover_alignment?:');
    expect(worker).toContain('coverAlignment: job.cover_alignment');
  });

  it('offers a live preview with three explicit alignment choices', () => {
    expect(panel).toContain('Prévia da capa');
    expect(panel).toContain('Esquerda');
    expect(panel).toContain('Centro');
    expect(panel).toContain('Direita');
    expect(panel).toContain('objectPosition: coverObjectPosition');
    expect(panel).toContain('coverAlignment,');
    expect(panel).toContain('a diferença entre os alinhamentos pode ser sutil ou inexistente');
  });
});
