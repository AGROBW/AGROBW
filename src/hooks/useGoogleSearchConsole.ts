import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';
import type { AnalyticsPeriod } from './useAdminSiteAnalytics';

export type GoogleSearchMetric = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GoogleSearchConsoleData = {
  property: string;
  period: { startDate: string; endDate: string; dataDelayDays: number };
  summary: GoogleSearchMetric;
  comparison: {
    available: boolean;
    period: { startDate: string; endDate: string; dataDelayDays: number };
    previous: GoogleSearchMetric | null;
    changes: {
      clicksPercent: number | null;
      impressionsPercent: number | null;
      ctrPoints: number;
      position: number | null;
    } | null;
  };
  opportunities: Array<{
    kind: 'quick-win' | 'low-ctr' | 'declining';
    target: string;
    title: string;
    detail: string;
    priority: 'high' | 'medium';
  }>;
  indexMonitor: {
    checkedAt: string;
    checked: number;
    healthy: number;
    attention: number;
    critical: number;
    partial: boolean;
    items: Array<{
      url: string;
      type: 'announcement' | 'news' | 'store';
      label: string;
      health: 'healthy' | 'attention' | 'critical';
      issueCode: string | null;
      issue: string;
      verdict: string;
      coverageState: string | null;
      lastCrawlTime: string | null;
      googleCanonical: string | null;
      userCanonical: string | null;
    }>;
  };
  series: Array<GoogleSearchMetric & { date: string }>;
  topQueries: Array<GoogleSearchMetric & { query: string }>;
  topPages: Array<GoogleSearchMetric & { page: string }>;
  devices: Array<GoogleSearchMetric & { device: string }>;
  countries: Array<GoogleSearchMetric & { country: string }>;
  searchAppearances: Array<GoogleSearchMetric & { appearance: string }>;
  searchTypes: Array<{ type: string; label: string; metric: GoogleSearchMetric }>;
  sitemaps: Array<{
    path: string;
    type: string | null;
    isPending: boolean;
    isSitemapsIndex: boolean;
    lastSubmitted: string | null;
    lastDownloaded: string | null;
    warnings: number;
    errors: number;
    contents: Array<{ type: string | null; submitted: number; indexed: number }>;
  }>;
  partial: boolean;
  fetchedAt: string;
};

export type GoogleUrlInspection = {
  url: string;
  inspectionResultLink: string | null;
  index: {
    verdict: string;
    coverageState: string | null;
    robotsTxtState: string | null;
    indexingState: string | null;
    lastCrawlTime: string | null;
    pageFetchState: string | null;
    googleCanonical: string | null;
    userCanonical: string | null;
    crawledAs: string | null;
    sitemap: string[];
    referringUrls: string[];
  };
  mobile: { verdict: string };
  richResults: { verdict: string; detectedItems: Array<{ richResultType: string | null; items: number }> };
};

export type GooglePageSpeedResult = {
  url: string;
  finalUrl: string;
  strategy: 'mobile' | 'desktop';
  analyzedAt: string;
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  lab: { lcpMs: number | null; cls: number | null; tbtMs: number | null; fcpMs: number | null; speedIndexMs: number | null };
  field: {
    source: 'page' | 'origin' | 'none';
    overallCategory: string | null;
    lcp: { value: number | null; category: string | null } | null;
    inp: { value: number | null; category: string | null } | null;
    cls: { value: number | null; category: string | null } | null;
  };
  recommendations: Array<{ id: string; title: string; displayValue: string | null; savingsMs: number; savingsBytes: number }>;
  warnings: string[];
};

type FunctionResponse = GoogleSearchConsoleData & {
  success: boolean;
  error?: string;
};

export const useGoogleSearchConsole = (periodDays: AnalyticsPeriod) => {
  const [data, setData] = useState<GoogleSearchConsoleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sua sessão precisa ser renovada.');

      const { data: response, error: invokeError } = await supabase.functions.invoke<FunctionResponse>(
        'google-search-console',
        {
          body: { action: 'overview', periodDays },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (invokeError) throw invokeError;
      if (!response?.success) throw new Error(response?.error || 'Consulta indisponível.');
      if (requestId !== requestIdRef.current) return;

      const { success: _success, error: _error, ...payload } = response;
      setData(payload);
    } catch (caughtError) {
      if (requestId !== requestIdRef.current) return;
      const message = caughtError instanceof Error ? caughtError.message : 'Consulta indisponível.';
      appError('[useGoogleSearchConsole] Erro ao consultar métricas', { error: caughtError });
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [periodDays]);

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  return { data, isLoading, error, refresh };
};

export const inspectGoogleSearchUrl = async (inspectionUrl: string) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sua sessão precisa ser renovada.');

  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    inspection?: GoogleUrlInspection;
    error?: string;
  }>('google-search-console', {
    body: { action: 'inspect-url', inspectionUrl },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    const errorWithContext = error as typeof error & { context?: Response };
    if (errorWithContext.context) {
      const responseBody = await errorWithContext.context.clone().json().catch(() => null) as { error?: string } | null;
      if (responseBody?.error) throw new Error(responseBody.error);
    }
    throw error;
  }
  if (!data?.success || !data.inspection) throw new Error(data?.error || 'Não foi possível inspecionar esta URL.');
  return data.inspection;
};

export const runGooglePageSpeed = async (url: string, strategy: 'mobile' | 'desktop') => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sua sessão precisa ser renovada.');

  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    pageSpeed?: GooglePageSpeedResult;
    error?: string;
  }>('google-search-console', {
    body: { action: 'pagespeed', url, strategy },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) {
    const errorWithContext = error as typeof error & { context?: Response };
    if (errorWithContext.context) {
      const responseBody = await errorWithContext.context.clone().json().catch(() => null) as { error?: string } | null;
      if (responseBody?.error) throw new Error(responseBody.error);
    }
    throw error;
  }
  if (!data?.success || !data.pageSpeed) throw new Error(data?.error || 'Não foi possível analisar esta página.');
  return data.pageSpeed;
};
