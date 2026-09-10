import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ensureSiteAnalyticsSessionId, getSiteAnalyticsDeviceType } from '../lib/siteAnalyticsSession';
import { describeSiteAnalyticsPage } from '../lib/siteAnalyticsPage';
import { debugLog } from '../utils/debugLog';

const HEARTBEAT_INTERVAL_MS = 60_000;

const logTrackingError = (scope: string, error: unknown) => {
  debugLog(`[SiteAnalytics] ${scope}`, error);
};

export const useSiteAnalyticsTracking = ({
  pathname,
  userId,
  isAdminArea,
  userCity,
  userState,
}: {
  pathname: string;
  userId?: string | null;
  isAdminArea: boolean;
  userCity?: string | null;
  userState?: string | null;
}) => {
  const sessionId = useMemo(() => ensureSiteAnalyticsSessionId(), []);
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId || isAdminArea || typeof window === 'undefined') return;

    const page = describeSiteAnalyticsPage(pathname);

    const touchPresence = async () => {
      await supabase.rpc('touch_site_presence', {
        p_session_id: sessionId,
        p_user_id: userId ?? null,
        p_current_path: pathname,
        p_page_type: page.pageType,
        p_page_label: page.pageLabel,
        p_device_type: getSiteAnalyticsDeviceType(),
        p_is_admin_area: false,
        p_user_city: userCity ?? null,
        p_user_state: userState ?? null,
      });
    };

    if (lastTrackedPathRef.current !== pathname) {
      lastTrackedPathRef.current = pathname;

      void supabase.rpc('record_site_page_view', {
        p_session_id: sessionId,
        p_user_id: userId ?? null,
        p_page_path: pathname,
        p_page_type: page.pageType,
        p_page_label: page.pageLabel,
        p_entity_id: page.entityId,
        p_entity_key: page.entityKey,
        p_referrer: document.referrer || null,
        p_user_agent: navigator.userAgent || null,
        p_device_type: getSiteAnalyticsDeviceType(),
        p_is_admin_area: false,
        p_user_city: userCity ?? null,
        p_user_state: userState ?? null,
      }).then(({ error }) => {
        if (error) {
          logTrackingError('Falha ao registrar visualizacao de pagina', error);
        }
      });
    }

    void touchPresence().catch((error) => {
      logTrackingError('Falha ao atualizar presenca', error);
    });

    const interval = window.setInterval(() => {
      void touchPresence().catch((error) => {
        logTrackingError('Falha ao atualizar presenca no intervalo', error);
      });
    }, HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isAdminArea, pathname, sessionId, userCity, userId, userState]);
};
