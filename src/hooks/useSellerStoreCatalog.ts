import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  SellerStoreCatalogCoverAlignment,
  SellerStoreCatalogPriceMode,
} from '../lib/sellerStoreCatalog/documentModel';

export type SellerStoreCatalogExportStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type SellerStoreCatalogExport = {
  id: string;
  status: SellerStoreCatalogExportStatus;
  priceMode: SellerStoreCatalogPriceMode;
  coverAlignment: SellerStoreCatalogCoverAlignment;
  catalogTitle: string;
  catalogSubtitle: string | null;
  announcementIds: string[];
  fileSizeBytes: number | null;
  pageCount: number | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
  errorCode: string | null;
};

type CatalogExportRow = {
  id: string;
  status: SellerStoreCatalogExportStatus;
  price_mode: SellerStoreCatalogPriceMode;
  cover_alignment: SellerStoreCatalogCoverAlignment;
  catalog_title: string;
  catalog_subtitle: string | null;
  announcement_ids: string[];
  file_size_bytes: number | null;
  page_count: number | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  completed_at: string | null;
  expires_at: string;
  error_code: string | null;
};

type CatalogDownloadResponse = {
  success?: boolean;
  signedUrl?: string;
  filename?: string;
  expiresIn?: number;
  error?: string;
};

const mapExport = (row: CatalogExportRow): SellerStoreCatalogExport => ({
  id: row.id,
  status: row.status,
  priceMode: row.price_mode,
  coverAlignment: row.cover_alignment || 'center',
  catalogTitle: row.catalog_title,
  catalogSubtitle: row.catalog_subtitle,
  announcementIds: Array.isArray(row.announcement_ids) ? row.announcement_ids : [],
  fileSizeBytes: row.file_size_bytes,
  pageCount: row.page_count,
  attempts: row.attempts,
  maxAttempts: row.max_attempts,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  expiresAt: row.expires_at,
  errorCode: row.error_code,
});

const FRIENDLY_ERRORS: Record<string, string> = {
  CATALOG_EXPORT_AUTH_REQUIRED: 'Entre novamente na sua conta para gerar o catálogo.',
  CATALOG_EXPORT_STORE_PLAN_REQUIRED: 'Sua Loja Parceira precisa estar ativa para gerar catálogos.',
  CATALOG_EXPORT_RUNTIME_DISABLED: 'O gerador de catálogos está temporariamente indisponível.',
  CATALOG_EXPORT_ANNOUNCEMENT_LIMIT: 'Selecione entre 1 e 200 anúncios ativos.',
  CATALOG_EXPORT_DUPLICATE_ANNOUNCEMENT: 'A seleção contém anúncios repetidos.',
  CATALOG_EXPORT_ANNOUNCEMENT_NOT_ELIGIBLE: 'Um dos anúncios não está mais ativo. Atualize a seleção e tente novamente.',
  CATALOG_EXPORT_CONCURRENCY_LIMIT: 'Você já possui duas gerações em andamento. Aguarde uma delas terminar.',
  CATALOG_EXPORT_DAILY_LIMIT: 'O limite diário de 20 catálogos foi atingido. Tente novamente mais tarde.',
  CATALOG_EXPORT_INVALID_TITLE: 'Use um título entre 3 e 120 caracteres.',
  CATALOG_EXPORT_INVALID_SUBTITLE: 'Use um subtítulo entre 3 e 240 caracteres.',
  CATALOG_EXPORT_INVALID_COVER_ALIGNMENT: 'Escolha um enquadramento válido para a imagem da capa.',
  CATALOG_EXPORT_ALREADY_PROCESSING: 'Este catálogo já está sendo processado e não pode mais ter a capa alterada.',
  CATALOG_EXPORT_ALIGNMENT_CONFLICT: 'Já existe um catálogo igual na fila com outro enquadramento. Cancele-o antes de gerar uma nova versão.',
};

export const getSellerStoreCatalogErrorMessage = (error: unknown, fallback: string): string => {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : String(error || '');
  const matchedCode = Object.keys(FRIENDLY_ERRORS).find((code) => raw.includes(code));
  return matchedCode ? FRIENDLY_ERRORS[matchedCode] : fallback;
};

export const isTrustedCatalogDownloadUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    const configuredHost = new URL(import.meta.env.VITE_SUPABASE_URL).hostname;
    return parsed.protocol === 'https:' && parsed.hostname === configuredHost;
  } catch {
    return false;
  }
};

export const getEffectiveCatalogStatus = (
  catalog: Pick<SellerStoreCatalogExport, 'status' | 'expiresAt'>,
  now = Date.now(),
): SellerStoreCatalogExportStatus => (
  catalog.status === 'ready' && Date.parse(catalog.expiresAt) <= now ? 'expired' : catalog.status
);

export const useSellerStoreCatalog = (enabled: boolean, ownerUserId: string | null | undefined) => {
  const [exports, setExports] = useState<SellerStoreCatalogExport[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [busyExportId, setBusyExportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRuntimeEnabled, setIsRuntimeEnabled] = useState(false);

  const refresh = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!enabled || !ownerUserId) {
      setExports([]);
      setIsRuntimeEnabled(false);
      setIsLoading(false);
      return [];
    }

    if (!options.silent) setIsRefreshing(true);
    const [exportsResult, availabilityResult] = await Promise.all([
      supabase.rpc('list_my_seller_store_catalog_exports_v2', { p_limit: 12 }),
      supabase.rpc('get_seller_store_catalog_availability'),
    ]);
    const { data, error: fetchError } = exportsResult;

    if (fetchError) {
      const message = getSellerStoreCatalogErrorMessage(fetchError, 'Não foi possível carregar seus catálogos.');
      setError(message);
      if (!options.silent) setIsRefreshing(false);
      setIsLoading(false);
      throw new Error(message);
    }

    const mapped = ((data as unknown as CatalogExportRow[]) || []).map(mapExport);
    setExports(mapped);
    const availability = Array.isArray(availabilityResult.data)
      ? availabilityResult.data[0]
      : availabilityResult.data;
    setIsRuntimeEnabled(!availabilityResult.error && availability?.processing_enabled === true);
    setError(null);
    setIsLoading(false);
    if (!options.silent) setIsRefreshing(false);
    return mapped;
  }, [enabled, ownerUserId]);

  const pollExports = useEffectEvent(() => {
    void refresh({ silent: true }).catch(() => undefined);
  });

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const hasOpenExports = useMemo(
    () => exports.some((item) => item.status === 'queued' || item.status === 'processing'),
    [exports],
  );

  useEffect(() => {
    if (!enabled || !hasOpenExports) return undefined;
    const intervalId = window.setInterval(() => pollExports(), 5_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') pollExports();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, hasOpenExports]);

  const createExport = useCallback(async (input: {
    announcementIds: string[];
    catalogTitle: string;
    catalogSubtitle?: string | null;
    priceMode: SellerStoreCatalogPriceMode;
    coverAlignment: SellerStoreCatalogCoverAlignment;
  }) => {
    setIsCreating(true);
    setError(null);
    try {
      const { data, error: createError } = await supabase.rpc('request_seller_store_catalog_export_v2', {
        p_announcement_ids: input.announcementIds,
        p_catalog_title: input.catalogTitle.trim(),
        p_catalog_subtitle: input.catalogSubtitle?.trim() || null,
        p_price_mode: input.priceMode,
        p_cover_alignment: input.coverAlignment,
      });
      if (createError) throw createError;
      const exportId = String(data || '');
      if (!exportId) throw new Error('CATALOG_EXPORT_CREATE_FAILED');
      await refresh({ silent: true });
      return exportId;
    } catch (createError) {
      const message = getSellerStoreCatalogErrorMessage(createError, 'Não foi possível iniciar a geração do catálogo.');
      setError(message);
      throw new Error(message);
    } finally {
      setIsCreating(false);
    }
  }, [refresh]);

  const cancelExport = useCallback(async (exportId: string) => {
    setBusyExportId(exportId);
    try {
      const { data, error: cancelError } = await supabase.rpc('cancel_seller_store_catalog_export', {
        p_export_id: exportId,
      });
      if (cancelError) throw cancelError;
      if (data !== true) throw new Error('CATALOG_EXPORT_NOT_QUEUED');
      await refresh({ silent: true });
    } catch (cancelError) {
      throw new Error(getSellerStoreCatalogErrorMessage(cancelError, 'Este catálogo já começou a ser processado e não pode mais ser cancelado.'));
    } finally {
      setBusyExportId(null);
    }
  }, [refresh]);

  const prepareDownload = useCallback(async (exportId: string) => {
    setBusyExportId(exportId);
    try {
      const { data, error: downloadError } = await supabase.functions.invoke<CatalogDownloadResponse>(
        'seller-store-catalog-download',
        { body: { exportId } },
      );
      if (downloadError) throw downloadError;
      if (!data?.success || !data.signedUrl || !isTrustedCatalogDownloadUrl(data.signedUrl)) {
        throw new Error(data?.error || 'CATALOG_EXPORT_INVALID_DOWNLOAD');
      }
      return { signedUrl: data.signedUrl, filename: data.filename || 'catalogo-agro-bw.pdf' };
    } catch (downloadError) {
      throw new Error(getSellerStoreCatalogErrorMessage(downloadError, 'Não foi possível preparar o download. Atualize a página e tente novamente.'));
    } finally {
      setBusyExportId(null);
    }
  }, []);

  return {
    exports,
    isLoading,
    isRefreshing,
    isCreating,
    busyExportId,
    error,
    isRuntimeEnabled,
    hasOpenExports,
    refresh,
    createExport,
    cancelExport,
    prepareDownload,
  };
};
