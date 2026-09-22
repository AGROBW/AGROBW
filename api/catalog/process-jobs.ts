import { createClient } from '@supabase/supabase-js';
import { processSellerStoreCatalogJobs } from '../../server/seller-store-catalog-worker';

const MAX_REQUEST_BYTES = 1024;

const timingSafeEqual = (expected: string, received: string) => {
  let mismatch = expected.length === received.length ? 0 : 1;
  const length = Math.max(expected.length, received.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (expected.charCodeAt(index) || 0) ^ (received.charCodeAt(index) || 0);
  }
  return mismatch === 0;
};

const safeBatchErrorCode = (error: unknown) => {
  const value = error instanceof Error ? error.message : String(error || '');
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 80);
  return normalized || 'CATALOG_WORKER_BATCH_FAILED';
};

export const getCatalogBatchFailureCode = (summary: {
  claimed: number;
  ready: number;
  released?: number;
  transitionErrors: number;
}) => {
  if (summary.transitionErrors > 0) return 'CATALOG_WORKER_TRANSITION_FAILURE';
  const attempted = Math.max(0, summary.claimed - (summary.released ?? 0));
  if (attempted > 0 && summary.ready === 0) return 'CATALOG_WORKER_NO_READY_EXPORT';
  return null;
};

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Allow', 'POST');

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }
  if (Number(req.headers['content-length'] || 0) > MAX_REQUEST_BYTES) {
    res.status(413).json({ success: false, error: 'Request too large' });
    return;
  }
  if (Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8') > MAX_REQUEST_BYTES) {
    res.status(413).json({ success: false, error: 'Request too large' });
    return;
  }

  const expectedSecret = process.env.CATALOG_EXPORT_CRON_SECRET || '';
  const receivedSecret = String(req.headers['x-cron-secret'] || '');
  if (!expectedSecret || !receivedSecret || !timingSafeEqual(expectedSecret, receivedSecret)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ success: false, error: 'Catalog worker configuration unavailable' });
    return;
  }

  const startedAt = Date.now();
  const workerId = crypto.randomUUID();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let runId: string | null = null;

  try {
    const { data: beginData, error: beginError } = await supabase.rpc('begin_seller_store_catalog_worker_run', {
      p_worker_id: workerId,
      p_requested_limit: req.body?.limit,
    });
    if (beginError) throw new Error(`CATALOG_WORKER_BEGIN_${beginError.code || 'FAILED'}`);
    const runtime = Array.isArray(beginData) ? beginData[0] : null;
    if (!runtime?.run_id) throw new Error('CATALOG_WORKER_BEGIN_INVALID_RESPONSE');
    runId = String(runtime.run_id);

    if (runtime.allowed !== true) {
      res.status(200).json({
        success: true,
        skipped: true,
        runId,
        reason: String(runtime.reason || 'CATALOG_WORKER_DISABLED'),
      });
      return;
    }

    const summary = await processSellerStoreCatalogJobs({
      supabaseUrl,
      serviceRoleKey,
      limit: runtime.effective_limit,
      workerId,
      maxRuntimeMs: 240_000,
    });
    const durationMs = Date.now() - startedAt;
    const batchFailureCode = getCatalogBatchFailureCode(summary);
    const { data: finished, error: finishError } = await supabase.rpc('finish_seller_store_catalog_worker_run', {
      p_run_id: runId,
      p_succeeded: batchFailureCode === null,
      p_summary: summary,
      p_error_code: batchFailureCode,
      p_duration_ms: durationMs,
    });
    if (finishError || finished !== true) throw new Error(`CATALOG_WORKER_FINISH_${finishError?.code || 'FAILED'}`);
    if (batchFailureCode) {
      res.status(500).json({
        success: false,
        runId,
        durationMs,
        error: 'Catalog batch did not produce output',
        summary,
      });
      return;
    }
    res.status(200).json({ success: true, runId, durationMs, summary });
  } catch (error) {
    const errorCode = safeBatchErrorCode(error);
    if (runId) {
      const { error: finishError } = await supabase.rpc('finish_seller_store_catalog_worker_run', {
        p_run_id: runId,
        p_succeeded: false,
        p_summary: {},
        p_error_code: errorCode,
        p_duration_ms: Date.now() - startedAt,
      });
      if (finishError) console.error('[catalog/process-jobs] failed to persist batch failure', finishError.code);
    }
    console.error('[catalog/process-jobs] batch failure', error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, runId, error: 'Catalog batch failed' });
  }
}
