import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';

export interface SellerStoreCatalogHealth {
  processing_enabled: boolean;
  max_batch_size: number;
  failure_threshold: number;
  consecutive_failures: number;
  paused_reason: string | null;
  last_started_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  queued: number;
  processing: number;
  ready_24h: number;
  failed_24h: number;
  oldest_queued_at: string | null;
}

export interface SellerStoreCatalogWorkerRun {
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  requested_limit: number;
  effective_limit: number;
  summary: Record<string, number | string | boolean | null>;
  error_code: string | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
}

export type SellerStoreCatalogOperationalTone = 'paused' | 'healthy' | 'attention' | 'waiting';

export const getSellerStoreCatalogOperationalTone = (
  health: SellerStoreCatalogHealth | null,
  now = Date.now(),
): SellerStoreCatalogOperationalTone => {
  if (!health?.processing_enabled) return 'paused';
  if (health.consecutive_failures > 0 || health.failed_24h > 0) return 'attention';
  if (!health.last_success_at || now - Date.parse(health.last_success_at) > 15 * 60 * 1000) return 'waiting';
  return 'healthy';
};

const normalizeHealth = (value: unknown): SellerStoreCatalogHealth | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as SellerStoreCatalogHealth;
};

export const useSellerStoreCatalogOperations = () => {
  const [health, setHealth] = useState<SellerStoreCatalogHealth | null>(null);
  const [runs, setRuns] = useState<SellerStoreCatalogWorkerRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOperations = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true);
    setError(null);
    try {
      const [healthResult, runsResult] = await Promise.all([
        supabase.rpc('get_seller_store_catalog_health_admin'),
        supabase.rpc('list_seller_store_catalog_worker_runs_admin', { p_limit: 25 }),
      ]);
      if (healthResult.error) throw healthResult.error;
      if (runsResult.error) throw runsResult.error;

      const healthValue = Array.isArray(healthResult.data) ? healthResult.data[0] : healthResult.data;
      setHealth(normalizeHealth(healthValue));
      setRuns(Array.isArray(runsResult.data) ? runsResult.data as SellerStoreCatalogWorkerRun[] : []);
    } catch (fetchError) {
      appError('[SellerStoreCatalog] Erro ao carregar operacao', fetchError);
      setError('Nao foi possivel carregar a operacao dos catalogos PDF.');
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, []);

  const updateRuntime = useCallback(async (input: {
    processingEnabled: boolean;
    maxBatchSize: number;
    failureThreshold: number;
  }) => {
    setIsSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.rpc('update_seller_store_catalog_runtime_admin', {
        p_processing_enabled: input.processingEnabled,
        p_max_batch_size: input.maxBatchSize,
        p_failure_threshold: input.failureThreshold,
      });
      if (updateError) throw updateError;
      await fetchOperations({ silent: true });
      return { updated: true, error: null };
    } catch (updateError) {
      appError('[SellerStoreCatalog] Erro ao atualizar runtime', updateError, {
        processingEnabled: input.processingEnabled,
      });
      const message = 'Nao foi possivel atualizar o processamento dos catalogos.';
      setError(message);
      return { updated: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, [fetchOperations]);

  useEffect(() => {
    void fetchOperations();
    const interval = window.setInterval(() => void fetchOperations({ silent: true }), 30_000);
    return () => window.clearInterval(interval);
  }, [fetchOperations]);

  return {
    health,
    runs,
    isLoading,
    isSaving,
    error,
    fetchOperations,
    updateRuntime,
  };
};
