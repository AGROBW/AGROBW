import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type AnalyticsPeriod = 7 | 15 | 30;

export interface SiteAnalyticsSummary {
  totalPageViews: number;
  uniqueVisitors: number;
  loggedInVisitors: number;
  onlineUsers: number;
  onlineLoggedUsers: number;
}

export interface SiteAnalyticsSeriesPoint {
  bucketDate: string;
  pageViews: number;
  uniqueVisitors: number;
}

export interface SiteAnalyticsTopPage {
  pagePath: string;
  pageLabel: string | null;
  pageType: string;
  views: number;
  uniqueVisitors: number;
}

export interface SiteAnalyticsTopAnnouncement {
  announcementId: string;
  announcementTitle: string | null;
  views: number;
  uniqueVisitors: number;
}

export interface SiteAnalyticsTopStore {
  storeSlug: string;
  storeName: string | null;
  views: number;
  uniqueVisitors: number;
}

export interface SiteAnalyticsPresenceItem {
  sessionId: string;
  userId: string | null;
  userName: string | null;
  currentPath: string;
  pageLabel: string | null;
  pageType: string;
  deviceType: string | null;
  lastSeenAt: string;
}

export interface SiteAnalyticsDeviceBreakdownItem {
  deviceType: string;
  views: number;
  uniqueVisitors: number;
}

export interface SiteAnalyticsSourceBreakdownItem {
  sourceLabel: string;
  views: number;
  uniqueVisitors: number;
}

export interface SiteAnalyticsTopSearchItem {
  term: string;
  searchCount: number;
}

export interface SiteAnalyticsGeoBreakdownItem {
  state: string;
  city: string;
  views: number;
  uniqueVisitors: number;
}

const defaultSummary: SiteAnalyticsSummary = {
  totalPageViews: 0,
  uniqueVisitors: 0,
  loggedInVisitors: 0,
  onlineUsers: 0,
  onlineLoggedUsers: 0,
};

export const useAdminSiteAnalytics = (period: AnalyticsPeriod) => {
  const [summary, setSummary] = useState<SiteAnalyticsSummary>(defaultSummary);
  const [series, setSeries] = useState<SiteAnalyticsSeriesPoint[]>([]);
  const [topPages, setTopPages] = useState<SiteAnalyticsTopPage[]>([]);
  const [topAnnouncements, setTopAnnouncements] = useState<SiteAnalyticsTopAnnouncement[]>([]);
  const [topStores, setTopStores] = useState<SiteAnalyticsTopStore[]>([]);
  const [livePresence, setLivePresence] = useState<SiteAnalyticsPresenceItem[]>([]);
  const [deviceBreakdown, setDeviceBreakdown] = useState<SiteAnalyticsDeviceBreakdownItem[]>([]);
  const [sourceBreakdown, setSourceBreakdown] = useState<SiteAnalyticsSourceBreakdownItem[]>([]);
  const [topSearches, setTopSearches] = useState<SiteAnalyticsTopSearchItem[]>([]);
  const [geoBreakdown, setGeoBreakdown] = useState<SiteAnalyticsGeoBreakdownItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const [
      summaryResult,
      seriesResult,
      pagesResult,
      announcementsResult,
      storesResult,
      liveResult,
      deviceResult,
      sourceResult,
      searchesResult,
      geoResult,
    ] =
      await Promise.all([
        supabase.rpc('get_site_analytics_summary', { p_period_days: period }),
        supabase.rpc('get_site_analytics_time_series', { p_period_days: period }),
        supabase.rpc('get_site_analytics_top_pages', { p_period_days: period, p_limit: 10 }),
        supabase.rpc('get_site_analytics_top_announcements', { p_period_days: period, p_limit: 10 }),
        supabase.rpc('get_site_analytics_top_stores', { p_period_days: period, p_limit: 10 }),
        supabase.rpc('get_site_analytics_live_presence', { p_limit: 12 }),
        supabase.rpc('get_site_analytics_device_breakdown', { p_period_days: period }),
        supabase.rpc('get_site_analytics_source_breakdown', { p_period_days: period }),
        supabase.rpc('get_site_analytics_top_searches', { p_period_days: period, p_limit: 10 }),
        supabase.rpc('get_site_analytics_geo_breakdown', { p_period_days: period, p_limit: 10 }),
      ]);

    const errors = [
      summaryResult.error,
      seriesResult.error,
      pagesResult.error,
      announcementsResult.error,
      storesResult.error,
      liveResult.error,
      deviceResult.error,
      sourceResult.error,
      searchesResult.error,
      geoResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error('[useAdminSiteAnalytics] erro parcial ao carregar analytics:', errors);
      setError('Algumas metricas nao foram carregadas. Rode o SQL de analytics consolidado e atualize a pagina.');
    }

    const summaryRow = summaryResult.data?.[0];

    setSummary({
      totalPageViews: Number(summaryRow?.total_page_views ?? 0),
      uniqueVisitors: Number(summaryRow?.unique_visitors ?? 0),
      loggedInVisitors: Number(summaryRow?.logged_in_visitors ?? 0),
      onlineUsers: Number(summaryRow?.online_users ?? 0),
      onlineLoggedUsers: Number(summaryRow?.online_logged_users ?? 0),
    });

    setSeries(
      (seriesResult.data || []).map((item: any) => ({
        bucketDate: item.bucket_date,
        pageViews: Number(item.page_views ?? 0),
        uniqueVisitors: Number(item.unique_visitors ?? 0),
      }))
    );

    setTopPages(
      (pagesResult.data || []).map((item: any) => ({
        pagePath: item.page_path,
        pageLabel: item.page_label ?? null,
        pageType: item.page_type,
        views: Number(item.views ?? 0),
        uniqueVisitors: Number(item.unique_visitors ?? 0),
      }))
    );

    setTopAnnouncements(
      (announcementsResult.data || []).map((item: any) => ({
        announcementId: item.announcement_id,
        announcementTitle: item.announcement_title ?? null,
        views: Number(item.views ?? 0),
        uniqueVisitors: Number(item.unique_visitors ?? 0),
      }))
    );

    setTopStores(
      (storesResult.data || []).map((item: any) => ({
        storeSlug: item.store_slug,
        storeName: item.store_name ?? null,
        views: Number(item.views ?? 0),
        uniqueVisitors: Number(item.unique_visitors ?? 0),
      }))
    );

    setLivePresence(
      (liveResult.data || []).map((item: any) => ({
        sessionId: item.session_id,
        userId: item.user_id ?? null,
        userName: item.user_name ?? null,
        currentPath: item.current_path,
        pageLabel: item.page_label ?? null,
        pageType: item.page_type,
        deviceType: item.device_type ?? null,
        lastSeenAt: item.last_seen_at,
      }))
    );

    setDeviceBreakdown(
      (deviceResult.data || []).map((item: any) => ({
        deviceType: item.device_type,
        views: Number(item.views ?? 0),
        uniqueVisitors: Number(item.unique_visitors ?? 0),
      }))
    );

    setSourceBreakdown(
      (sourceResult.data || []).map((item: any) => ({
        sourceLabel: item.source_label,
        views: Number(item.views ?? 0),
        uniqueVisitors: Number(item.unique_visitors ?? 0),
      }))
    );

    setTopSearches(
      (searchesResult.data || []).map((item: any) => ({
        term: item.term,
        searchCount: Number(item.search_count ?? 0),
      }))
    );

    setGeoBreakdown(
      (geoResult.data || []).map((item: any) => ({
        state: item.state,
        city: item.city,
        views: Number(item.views ?? 0),
        uniqueVisitors: Number(item.unique_visitors ?? 0),
      }))
    );

    setIsLoading(false);
  }, [period]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    summary,
    series,
    topPages,
    topAnnouncements,
    topStores,
    livePresence,
    deviceBreakdown,
    sourceBreakdown,
    topSearches,
    geoBreakdown,
    isLoading,
    error,
    refresh: fetchAnalytics,
  };
};
