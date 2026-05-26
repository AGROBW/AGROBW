import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ensureSiteAnalyticsSessionId, getSiteAnalyticsDeviceType } from '../lib/siteAnalyticsSession';

const HEARTBEAT_INTERVAL_MS = 60_000;
const isDevelopment = import.meta.env.DEV;

const logTrackingError = (scope: string, error: unknown) => {
  if (!isDevelopment) return;
  console.warn(`[SiteAnalytics] ${scope}`, error);
};

const describePage = (pathname: string) => {
  const normalized = pathname || '/';

  if (normalized.startsWith('/anuncio/')) {
    return {
      pageType: 'announcement',
      pageLabel: 'Detalhe do anúncio',
      entityId: normalized.split('/')[2] || null,
      entityKey: null,
    };
  }

  if (normalized.startsWith('/loja/')) {
    return {
      pageType: 'storefront',
      pageLabel: 'Loja parceira',
      entityId: null,
      entityKey: normalized.split('/')[2] || null,
    };
  }

  if (normalized.startsWith('/noticias/')) {
    return {
      pageType: 'news_article',
      pageLabel: 'Notícia',
      entityId: null,
      entityKey: normalized.split('/')[2] || null,
    };
  }

  const staticMap: Record<string, { pageType: string; pageLabel: string }> = {
    '/': { pageType: 'home', pageLabel: 'Home' },
    '/anuncios': { pageType: 'ads_listing', pageLabel: 'Listagem de anúncios' },
    '/categorias': { pageType: 'categories', pageLabel: 'Categorias' },
    '/planos': { pageType: 'pricing', pageLabel: 'Planos' },
    '/lojas-parceiras': { pageType: 'partner_stores', pageLabel: 'Lojas parceiras' },
    '/contato': { pageType: 'contact', pageLabel: 'Contato' },
    '/quem-somos': { pageType: 'about', pageLabel: 'Quem somos' },
    '/privacidade': { pageType: 'privacy', pageLabel: 'Privacidade' },
    '/politica-de-cookies': { pageType: 'cookies_policy', pageLabel: 'Politica de cookies' },
    '/politica-de-precos': { pageType: 'pricing_policy', pageLabel: 'Politica de precos' },
    '/termos-de-uso': { pageType: 'terms', pageLabel: 'Termos de uso' },
    '/noticias': { pageType: 'news_listing', pageLabel: 'Notícias' },
    '/login': { pageType: 'login', pageLabel: 'Login' },
    '/cadastro': { pageType: 'register', pageLabel: 'Cadastro' },
  };

  if (normalized.startsWith('/minha-conta')) {
    return {
      pageType: 'account',
      pageLabel: 'Minha conta',
      entityId: null,
      entityKey: null,
    };
  }

  return {
    pageType: staticMap[normalized]?.pageType || 'page',
    pageLabel: staticMap[normalized]?.pageLabel || normalized,
    entityId: null,
    entityKey: null,
  };
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

    const page = describePage(pathname);

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
