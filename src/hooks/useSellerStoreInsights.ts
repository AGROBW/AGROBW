import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';
import type { SellerStoreInsightSourceChannel } from '../lib/sellerStoreInsights/attribution';

export type SellerStoreInsightsPeriod = 7 | 30 | 90;

type MetricComparison = {
  current: number;
  previous: number;
  changePercent: number;
};

export type SellerStoreInsightsData = {
  storeId: string;
  storeSlug: string;
  generatedAt: string;
  period: {
    days: SellerStoreInsightsPeriod;
    timezone: 'America/Sao_Paulo';
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
  };
  summary: {
    storeVisits: number;
    announcementOpens: number;
    contactActions: number;
    conversionRate: number;
    whatsappClicks: number;
    platformContacts: number;
    websiteClicks: number;
    storeShares: number;
    catalogsGenerated: number;
    catalogDownloads: number;
    catalogQrOpens: number;
  };
  comparison: {
    storeVisits: MetricComparison;
    announcementOpens: MetricComparison;
    contactActions: MetricComparison;
    conversionRate: {
      current: number;
      previous: number;
      changePercentagePoints: number;
    };
  };
  sourceCoverage: {
    attributedVisitors: number;
    totalVisitors: number;
  };
  sources: Array<{
    sourceChannel: SellerStoreInsightSourceChannel;
    visitors: number;
    percentage: number;
  }>;
  topAnnouncements: Array<{
    announcementId: string;
    title: string;
    opens: number;
    contacts: number;
    conversionRate: number;
  }>;
  daily: Array<{
    date: string;
    storeVisits: number;
    announcementOpens: number;
    contactActions: number;
  }>;
};

const isInsightsPayload = (value: unknown): value is SellerStoreInsightsData => {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SellerStoreInsightsData>;
  return Boolean(
    payload.storeId &&
    payload.storeSlug &&
    payload.period &&
    payload.summary &&
    payload.comparison &&
    Array.isArray(payload.sources) &&
    Array.isArray(payload.topAnnouncements) &&
    Array.isArray(payload.daily),
  );
};

export const fetchSellerStoreInsights = async (
  periodDays: SellerStoreInsightsPeriod,
  topLimit = 5,
) => {
  const { data, error } = await supabase.rpc('get_my_seller_store_insights', {
    p_period_days: periodDays,
    p_top_limit: topLimit,
  });

  if (error) throw error;
  if (!isInsightsPayload(data)) throw new Error('SELLER_STORE_INSIGHTS_INVALID_RESPONSE');
  return data;
};

export const useSellerStoreInsights = (
  periodDays: SellerStoreInsightsPeriod,
  topLimit = 5,
) => {
  const [data, setData] = useState<SellerStoreInsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchSellerStoreInsights(periodDays, topLimit);
      if (requestIdRef.current === requestId) setData(response);
    } catch (requestError) {
      appError('[SellerStoreInsights] Falha ao carregar dados agregados', requestError, {
        periodDays,
      });
      if (requestIdRef.current === requestId) {
        setData(null);
        setError('Nao foi possivel carregar os indicadores da loja.');
      }
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
  }, [periodDays, topLimit]);

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  return { data, isLoading, error, refresh };
};
