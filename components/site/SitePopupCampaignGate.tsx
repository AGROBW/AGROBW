import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  fetchSitePopupUserStates,
  recordSitePopupEvent,
  syncSitePopupUserState,
  useActiveSitePopups,
} from '../../src/hooks/useSitePopups';
import { SITE_POPUP_SAMPLE_VALUES, renderSitePopupText } from '../../src/lib/sitePopupTemplates';
import { SitePopup } from '../../types';

const AUTH_BLOCKED_PATHS = ['/login', '/cadastro', '/redefinir-senha'];
const SESSION_KEY_STORAGE = 'bwagro-site-popup-session-key';

const getPopupSessionKey = () => {
  const stored = window.sessionStorage.getItem(SESSION_KEY_STORAGE);
  if (stored) return stored;

  const generated = `popup-session:${crypto.randomUUID()}`;
  window.sessionStorage.setItem(SESSION_KEY_STORAGE, generated);
  return generated;
};

const matchesPageScope = (popup: SitePopup, pathname: string) => {
  if (popup.pageScope === 'site') return true;
  if (popup.pageScope === 'home') return pathname === '/';
  if (popup.pageScope === 'plans') return pathname === '/planos';
  if (popup.pageScope === 'custom') return popup.customPath ? pathname === popup.customPath : false;
  return true;
};

const SitePopupCampaignGate: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { popups, isLoading } = useActiveSitePopups();
  const navigate = useNavigate();
  const location = useLocation();
  const [activePopup, setActivePopup] = useState<SitePopup | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const storageKey = useMemo(() => {
    if (!activePopup) return null;
    return `bwagro-site-popup-seen:${activePopup.id}`;
  }, [activePopup]);

  useEffect(() => {
    if (isAuthLoading || isLoading) return;

    if (AUTH_BLOCKED_PATHS.includes(location.pathname)) return;
    let isMounted = true;

    const resolveEligiblePopup = async () => {
      const serverNow = new Date();
      const popupIds = popups.map((popup) => popup.id);
      const userStates = user?.id ? await fetchSitePopupUserStates(popupIds, user.id) : new Map();

      const eligiblePopup =
        popups.find((popup) => {
          if (popup.audience === 'visitors' && user) return false;
          if (popup.audience === 'authenticated' && !user) return false;
          if (!matchesPageScope(popup, location.pathname)) return false;

          if (popup.startsAt && new Date(popup.startsAt) > serverNow) return false;
          if (popup.endsAt && new Date(popup.endsAt) < serverNow) return false;

          const popupStorageKey = `bwagro-site-popup-seen:${popup.id}`;
          if (popup.showOnce && window.localStorage.getItem(popupStorageKey) === 'true') return false;

          if (popup.showOnce && user?.id) {
            const existingState = userStates.get(popup.id);
            if (existingState?.firstSeenAt || existingState?.clickedAt || existingState?.dismissedAt) {
              return false;
            }
          }

          return true;
        }) || null;

      if (!isMounted) return;
      setActivePopup(eligiblePopup);
    };

    void resolveEligiblePopup();

    return () => {
      isMounted = false;
    };
  }, [isAuthLoading, isLoading, popups, user, location.pathname]);

  useEffect(() => {
    if (!activePopup) {
      setIsVisible(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsVisible(true);
      void recordSitePopupEvent(activePopup.id, 'view', location.pathname, getPopupSessionKey());
      if (user?.id) {
        void syncSitePopupUserState(activePopup.id, user.id, 'view');
      }
    }, Math.max(0, activePopup.delaySeconds) * 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activePopup, location.pathname, user?.id]);

  const markAsSeen = () => {
    if (activePopup?.showOnce && storageKey) {
      window.localStorage.setItem(storageKey, 'true');
    }
  };

  const handleClose = () => {
    markAsSeen();
    if (activePopup) {
      void recordSitePopupEvent(activePopup.id, 'dismiss', location.pathname, getPopupSessionKey());
      if (user?.id) {
        void syncSitePopupUserState(activePopup.id, user.id, 'dismiss');
      }
    }
    setIsVisible(false);
  };

  const handlePrimaryAction = () => {
    const destination = activePopup?.primaryButtonLink?.trim();
    markAsSeen();
    if (activePopup) {
      void recordSitePopupEvent(activePopup.id, 'click', location.pathname, getPopupSessionKey());
      if (user?.id) {
        void syncSitePopupUserState(activePopup.id, user.id, 'click');
      }
    }
    setIsVisible(false);

    if (!destination) return;

    if (/^https?:\/\//i.test(destination)) {
      window.location.href = destination;
      return;
    }

    navigate(destination);
  };

  if (!activePopup || !isVisible) {
    return null;
  }

  const previewValues = {
    ...SITE_POPUP_SAMPLE_VALUES,
    nome_usuario: user?.name || SITE_POPUP_SAMPLE_VALUES.nome_usuario,
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
      <div className="relative w-full max-w-xl overflow-hidden rounded-[32px] border border-emerald-100 bg-white shadow-[0_35px_120px_-42px_rgba(15,23,42,0.65)]">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
          aria-label="Fechar pop-up"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="bg-[linear-gradient(135deg,#0f172a_0%,#14532d_100%)] px-6 pb-6 pt-8 text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-100">
            <Sparkles className="h-3.5 w-3.5" />
            Boas-vindas AGRO BW
          </div>
          <h2 className="mt-4 max-w-[28rem] text-3xl font-black leading-tight">
            {renderSitePopupText(activePopup.title, previewValues)}
          </h2>
          <p className="mt-3 max-w-[32rem] text-sm leading-6 text-emerald-50/90">
            {renderSitePopupText(activePopup.message, previewValues)}
          </p>
        </div>

        <div className="space-y-6 px-6 py-6">
          {activePopup.supportText ? (
            <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-950">
              {renderSitePopupText(activePopup.supportText, previewValues)}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-[0_20px_40px_-26px_rgba(22,163,74,0.75)] transition hover:bg-emerald-700"
            >
              {renderSitePopupText(activePopup.primaryButtonLabel, previewValues)}
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              Agora nao
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SitePopupCampaignGate;
