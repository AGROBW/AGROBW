import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { processSellerStoreCatalogJobs } from '../../../server/seller-store-catalog-worker';
import { getCatalogBatchFailureCode } from '../../../api/catalog/process-jobs';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('sql/create_seller_store_catalog_observability_stage5_2026-09-21.sql');
const validator = read('sql/VALIDATE_create_seller_store_catalog_observability_stage5_2026-09-21.sql');
const endpoint = read('api/catalog/process-jobs.ts');
const worker = read('server/seller-store-catalog-worker.ts');

const job = (id: string) => ({
  id,
  user_id: '11111111-1111-4111-8111-111111111111',
  catalog_title: 'Catalogo operacional',
  catalog_subtitle: null,
  price_mode: 'show',
  created_at: '2026-09-21T18:00:00.000Z',
  store_snapshot: {
    id: 'store-id',
    slug: 'loja-teste',
    store_name: 'Loja Teste',
    public_url: 'https://agrobw.com.br/loja/loja-teste',
  },
  announcement_snapshot: [{
    id: `announcement-${id}`,
    title: 'Trator de teste',
    price: 100,
    images: [],
    public_url: `https://agrobw.com.br/anuncio/${id}`,
  }],
});

const createFakeSupabase = (options: {
  jobs?: ReturnType<typeof job>[];
  expired?: Array<{ id: string; storage_path: string }>;
  orphans?: Array<{ storage_path: string }>;
  failureStatus?: 'queued' | 'failed';
  completeError?: boolean;
  completeCommitted?: boolean;
} = {}) => {
  const remove = vi.fn(async () => ({ error: null }));
  const upload = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'expire_seller_store_catalog_exports') return { data: options.expired || [], error: null };
    if (name === 'mark_seller_store_catalog_storage_deleted') {
      return { data: (args?.p_export_ids as string[]).length, error: null };
    }
    if (name === 'list_orphaned_seller_store_catalog_objects') {
      return { data: options.orphans || [], error: null };
    }
    if (name === 'claim_seller_store_catalog_exports') return { data: options.jobs || [], error: null };
    if (name === 'complete_seller_store_catalog_export') {
      return options.completeError
        ? { data: false, error: { code: 'COMPLETE_FAILED' } }
        : { data: true, error: null };
    }
    if (name === 'fail_seller_store_catalog_export') {
      return { data: options.completeCommitted ? null : options.failureStatus || 'queued', error: null };
    }
    if (name === 'release_seller_store_catalog_exports') {
      return { data: (args?.p_export_ids as string[]).length, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  return {
    client: { rpc, storage: { from: vi.fn(() => ({ remove, upload })) } },
    rpc,
    remove,
    upload,
  };
};

describe('Seller Store PDF Catalog operational hardening', () => {
  it('ships a disabled-by-default runtime, run history and circuit breaker', () => {
    expect(migration).toContain('processing_enabled boolean not null default false');
    expect(migration).toContain('seller_store_catalog_worker_runs');
    expect(migration).toContain('CATALOG_WORKER_STALE_RUN');
    expect(migration).toContain('CATALOG_WORKER_CIRCUIT_BREAKER');
    expect(migration).toContain('consecutive_failures + 1 >= failure_threshold');
    expect(validator).toContain('nasce_desativado');
  });

  it('keeps runtime mutations on service_role and observability behind admin checks', () => {
    expect(migration.match(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/g)?.length).toBe(2);
    expect(migration.match(/not public\.is_admin\(\)/g)?.length).toBe(3);
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
  });

  it('wraps every cron invocation in a persisted operational run', () => {
    expect(endpoint).toContain("supabase.rpc('begin_seller_store_catalog_worker_run'");
    expect(endpoint).toContain("supabase.rpc('finish_seller_store_catalog_worker_run'");
    expect(endpoint).toContain('runtime.allowed !== true');
    expect(endpoint).toContain('runId');
  });

  it('fails a batch that produced no catalog or lost a state transition', () => {
    expect(getCatalogBatchFailureCode({ claimed: 0, ready: 0, transitionErrors: 0 })).toBeNull();
    expect(getCatalogBatchFailureCode({ claimed: 1, ready: 0, transitionErrors: 0 })).toBe('CATALOG_WORKER_NO_READY_EXPORT');
    expect(getCatalogBatchFailureCode({ claimed: 1, ready: 1, transitionErrors: 1 })).toBe('CATALOG_WORKER_TRANSITION_FAILURE');
    expect(getCatalogBatchFailureCode({ claimed: 1, ready: 0, released: 1, transitionErrors: 0 })).toBeNull();
  });

  it('processes, uploads and completes a catalog end to end with injected infrastructure', async () => {
    const fake = createFakeSupabase({
      jobs: [job('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')],
      expired: [
        { id: 'expired-1', storage_path: 'user/expired-1.pdf' },
        { id: 'expired-2', storage_path: 'user/expired-2.pdf' },
      ],
    });
    const renderPdf = vi.fn(async () => Buffer.from('%PDF-1.4 test'));
    const summary = await processSellerStoreCatalogJobs({
      supabaseUrl: 'http://localhost',
      serviceRoleKey: 'test',
      supabaseClient: fake.client,
      workerId: '22222222-2222-4222-8222-222222222222',
      fetchImpl: vi.fn(async () => new Response('missing', { status: 404 })) as typeof fetch,
      renderPdf,
    });

    expect(summary).toMatchObject({ claimed: 1, ready: 1, retried: 0, failed: 0, released: 0, expiredFilesDeleted: 2 });
    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledWith(['user/expired-1.pdf', 'user/expired-2.pdf']);
    expect(fake.upload).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'application/pdf', upsert: true }),
    );
    expect(fake.rpc).toHaveBeenCalledWith('complete_seller_store_catalog_export', expect.objectContaining({
      p_export_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }));
  });

  it('retries a transient render failure without changing the job identity', async () => {
    const catalogJob = job('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const fake = createFakeSupabase({ jobs: [catalogJob], failureStatus: 'queued' });
    const summary = await processSellerStoreCatalogJobs({
      supabaseUrl: 'http://localhost',
      serviceRoleKey: 'test',
      supabaseClient: fake.client,
      workerId: '22222222-2222-4222-8222-222222222222',
      fetchImpl: vi.fn(async () => new Response('missing', { status: 404 })) as typeof fetch,
      renderPdf: vi.fn(async () => { throw new Error('BROWSER_TEMPORARILY_UNAVAILABLE'); }),
    });

    expect(summary).toMatchObject({ claimed: 1, ready: 0, retried: 1, failed: 0 });
    expect(fake.rpc).toHaveBeenCalledWith('fail_seller_store_catalog_export', expect.objectContaining({
      p_export_id: catalogJob.id,
      p_retryable: true,
    }));
  });

  it('preserves an uploaded PDF when the completion response is ambiguous', async () => {
    const fake = createFakeSupabase({
      jobs: [job('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')],
      completeError: true,
      completeCommitted: true,
    });
    const summary = await processSellerStoreCatalogJobs({
      supabaseUrl: 'http://localhost',
      serviceRoleKey: 'test',
      supabaseClient: fake.client,
      workerId: '22222222-2222-4222-8222-222222222222',
      fetchImpl: vi.fn(async () => new Response('missing', { status: 404 })) as typeof fetch,
      renderPdf: vi.fn(async () => Buffer.from('%PDF-1.4 test')),
    });

    expect(summary).toMatchObject({ ready: 0, retried: 0, transitionErrors: 1 });
    expect(fake.remove).not.toHaveBeenCalled();
    expect(fake.rpc).toHaveBeenCalledWith('fail_seller_store_catalog_export', expect.objectContaining({
      p_error_message: 'Catalog generation failed (CATALOG_EXPORT_COMPLETE_COMPLETE_FAILED)',
    }));
  });

  it('removes storage objects that no longer belong to an export', async () => {
    const fake = createFakeSupabase({
      orphans: [{ storage_path: 'orphaned-user/orphaned-export.pdf' }],
    });
    const summary = await processSellerStoreCatalogJobs({
      supabaseUrl: 'http://localhost',
      serviceRoleKey: 'test',
      supabaseClient: fake.client,
      workerId: '22222222-2222-4222-8222-222222222222',
      fetchImpl: vi.fn(async () => new Response('missing', { status: 404 })) as typeof fetch,
      renderPdf: vi.fn(async () => Buffer.from('%PDF-1.4 test')),
    });

    expect(summary).toMatchObject({ claimed: 0, orphanFilesDeleted: 1 });
    expect(fake.remove).toHaveBeenCalledWith(['orphaned-user/orphaned-export.pdf']);
  });

  it('releases jobs that were claimed but cannot safely start inside the runtime budget', async () => {
    let clock = 0;
    const jobs = [
      job('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      job('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    ];
    const fake = createFakeSupabase({ jobs });
    const summary = await processSellerStoreCatalogJobs({
      supabaseUrl: 'http://localhost',
      serviceRoleKey: 'test',
      supabaseClient: fake.client,
      workerId: '22222222-2222-4222-8222-222222222222',
      maxRuntimeMs: 30_000,
      now: () => clock,
      fetchImpl: vi.fn(async () => new Response('missing', { status: 404 })) as typeof fetch,
      renderPdf: vi.fn(async () => {
        clock = 35_000;
        return Buffer.from('%PDF-1.4 test');
      }),
    });

    expect(summary).toMatchObject({ claimed: 2, ready: 1, released: 1, transitionErrors: 0 });
    expect(fake.rpc).toHaveBeenCalledWith('release_seller_store_catalog_exports', {
      p_worker_id: '22222222-2222-4222-8222-222222222222',
      p_export_ids: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
    });
  });

  it('validates actual image signatures and removes expired objects in one storage call', () => {
    expect(worker).toContain('hasExpectedImageSignature');
    expect(worker).toContain('CATALOG_EXPORT_IMAGE_SIGNATURE_INVALID');
    expect(worker).toContain('.remove(expired.map((row) => row.storage_path))');
  });
});
