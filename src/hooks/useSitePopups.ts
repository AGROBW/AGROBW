import { useCallback, useEffect, useState } from 'react';
import { SitePopup, SitePopupMetrics, SitePopupUserState } from '../../types';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';

const EMPTY_METRICS: SitePopupMetrics = {
  popupId: '',
  views: 0,
  clicks: 0,
  dismissals: 0,
};

const mapSitePopup = (row: any, metrics?: SitePopupMetrics | null): SitePopup => ({
  id: row.id,
  name: row.name,
  title: row.title,
  message: row.message,
  supportText: row.support_text ?? '',
  primaryButtonLabel: row.primary_button_label,
  primaryButtonLink: row.primary_button_link,
  delaySeconds: row.delay_seconds ?? 5,
  isActive: row.is_active ?? false,
  showOnce: row.show_once ?? true,
  audience: row.audience ?? 'visitors',
  pageScope: row.page_scope ?? 'site',
  customPath: row.custom_path ?? null,
  displayOrder: row.display_order ?? 0,
  startsAt: row.starts_at ?? null,
  endsAt: row.ends_at ?? null,
  metrics: metrics ?? null,
  updatedBy: row.updated_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const buildMetricsMap = (rows: any[] | null | undefined) => {
  const metricsMap = new Map<string, SitePopupMetrics>();

  (rows || []).forEach((row) => {
    metricsMap.set(row.popup_id, {
      popupId: row.popup_id,
      views: row.views ?? 0,
      clicks: row.clicks ?? 0,
      dismissals: row.dismissals ?? 0,
    });
  });

  return metricsMap;
};

type SitePopupPayload = Omit<SitePopup, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>;

export const useSitePopups = () => {
  const [popups, setPopups] = useState<SitePopup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPopups = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const [{ data, error }, metricsResult] = await Promise.all([
      supabase.from('site_popups').select('*').order('display_order', { ascending: true }).order('updated_at', { ascending: false }),
      supabase.from('site_popup_metrics').select('*'),
    ]);

    if (error) {
      setError(error.message);
      setPopups([]);
    } else {
      const metricsMap = buildMetricsMap(metricsResult.data);
      setPopups(
        (data || []).map((row) =>
          mapSitePopup(row, metricsMap.get(row.id) ?? { ...EMPTY_METRICS, popupId: row.id }),
        ),
      );
    }

    setIsLoading(false);
  }, []);

  const deactivateOtherPopups = async (currentId?: string | null) => {
    let query = supabase
      .from('site_popups')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('is_active', true);

    if (currentId) {
      query = query.neq('id', currentId);
    }

    const { error } = await query;
    return error;
  };

  const savePopup = async (payload: SitePopupPayload, popupId?: string | null) => {
    const dbPayload = {
      name: payload.name,
      title: payload.title,
      message: payload.message,
      support_text: payload.supportText || null,
      primary_button_label: payload.primaryButtonLabel,
      primary_button_link: payload.primaryButtonLink,
      delay_seconds: payload.delaySeconds,
      is_active: payload.isActive,
      show_once: payload.showOnce,
      audience: payload.audience,
      page_scope: payload.pageScope,
      custom_path: payload.customPath?.trim() || null,
      display_order: payload.displayOrder ?? 0,
      starts_at: payload.startsAt?.trim() || null,
      ends_at: payload.endsAt?.trim() || null,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };

    const query = popupId
      ? supabase.from('site_popups').update(dbPayload).eq('id', popupId)
      : supabase.from('site_popups').insert(dbPayload);

    const { error } = await query;

    if (error) {
      return { error: error.message };
    }

    await fetchPopups();
    return { error: null };
  };

  const togglePopupStatus = async (popupId: string, shouldActivate: boolean) => {
    const { error } = await supabase
      .from('site_popups')
      .update({
        is_active: shouldActivate,
        updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', popupId);

    if (error) {
      return { error: error.message };
    }

    await fetchPopups();
    return { error: null };
  };

  const deletePopup = async (popupId: string) => {
    const { error } = await supabase.from('site_popups').delete().eq('id', popupId);

    if (error) {
      return { error: error.message };
    }

    await fetchPopups();
    return { error: null };
  };

  useEffect(() => {
    void fetchPopups();
  }, [fetchPopups]);

  return {
    popups,
    isLoading,
    error,
    fetchPopups,
    savePopup,
    togglePopupStatus,
    deletePopup,
  };
};

export const recordSitePopupEvent = async (
  popupId: string,
  eventType: 'view' | 'click' | 'dismiss',
  pathname: string,
  sessionKey: string,
) => {
  const { data: authData } = await supabase.auth.getUser();

  const { error } = await supabase.from('site_popup_events').insert({
    popup_id: popupId,
    event_type: eventType,
    path: pathname,
    session_key: sessionKey,
    user_id: authData.user?.id ?? null,
  });

  if (error) {
    appError('[recordSitePopupEvent] Erro ao registrar evento de pop-up', error, {
      popupId,
      eventType,
      pathname,
      sessionKey,
    });
  }
};

export const fetchSitePopupUserStates = async (popupIds: string[], userId: string) => {
  if (!popupIds.length || !userId) {
    return new Map<string, SitePopupUserState>();
  }

  const { data, error } = await supabase
    .from('site_popup_user_states')
    .select('*')
    .eq('user_id', userId)
    .in('popup_id', popupIds);

  if (error) {
    appError('[fetchSitePopupUserStates] Erro ao carregar estado do usuario para pop-ups', error, {
      userId,
      popupIds,
    });
    return new Map<string, SitePopupUserState>();
  }

  const states = new Map<string, SitePopupUserState>();

  (data || []).forEach((row) => {
    states.set(row.popup_id, {
      popupId: row.popup_id,
      userId: row.user_id,
      firstSeenAt: row.first_seen_at ?? null,
      lastSeenAt: row.last_seen_at ?? null,
      dismissedAt: row.dismissed_at ?? null,
      clickedAt: row.clicked_at ?? null,
      seenCount: row.seen_count ?? 0,
    });
  });

  return states;
};

export const syncSitePopupUserState = async (
  popupId: string,
  userId: string,
  eventType: 'view' | 'click' | 'dismiss',
) => {
  if (!popupId || !userId) return;

  const now = new Date().toISOString();
  const { data: existingState, error: existingError } = await supabase
    .from('site_popup_user_states')
    .select('*')
    .eq('popup_id', popupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) {
    appError('[syncSitePopupUserState] Erro ao consultar estado atual do usuario para pop-up', existingError, {
      popupId,
      userId,
      eventType,
    });
    return;
  }

  const nextPayload = existingState
    ? {
        last_seen_at: now,
        seen_count: eventType === 'view' ? (existingState.seen_count ?? 0) + 1 : existingState.seen_count ?? 0,
        clicked_at: eventType === 'click' ? now : existingState.clicked_at ?? null,
        dismissed_at: eventType === 'dismiss' ? now : existingState.dismissed_at ?? null,
        updated_at: now,
      }
    : {
        popup_id: popupId,
        user_id: userId,
        first_seen_at: now,
        last_seen_at: now,
        seen_count: 1,
        clicked_at: eventType === 'click' ? now : null,
        dismissed_at: eventType === 'dismiss' ? now : null,
        updated_at: now,
      };

  const query = existingState
    ? supabase
        .from('site_popup_user_states')
        .update(nextPayload)
        .eq('popup_id', popupId)
        .eq('user_id', userId)
    : supabase.from('site_popup_user_states').insert(nextPayload);

  const { error } = await query;

  if (error) {
    appError('[syncSitePopupUserState] Erro ao sincronizar estado do usuario para pop-up', error, {
      popupId,
      userId,
      eventType,
      hasExistingState: Boolean(existingState),
    });
  }
};

export const useActiveSitePopups = () => {
  const [popups, setPopups] = useState<SitePopup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchActivePopups = async () => {
      setIsLoading(true);

      // Caminho PÚBLICO: lê apenas colunas públicas de popups ativos.
      // NÃO busca site_popup_metrics (analytics admin-only) nem colunas
      // internas (updated_by, name, timestamps).
      const { data, error } = await supabase
        .from('site_popups')
        .select(
          'id, title, message, support_text, primary_button_label, primary_button_link, ' +
            'delay_seconds, is_active, show_once, audience, page_scope, custom_path, ' +
            'display_order, starts_at, ends_at',
        )
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('updated_at', { ascending: false });

      if (!isMounted) return;

      if (error) {
        appError('[useActiveSitePopups] Erro ao carregar pop-ups ativos', error);
        setPopups([]);
      } else {
        // Público não consome métricas → metrics: null.
        setPopups((data || []).map((row) => mapSitePopup(row, null)));
      }

      setIsLoading(false);
    };

    void fetchActivePopups();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    popups,
    isLoading,
  };
};
