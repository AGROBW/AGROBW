import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react';
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

const getPopupSessionSeenKey = (popupId: string) => `bwagro-site-popup-session-seen:${popupId}`;
const getPopupDismissedKey = (popupId: string) => `bwagro-site-popup-dismissed:${popupId}`;

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

// Padrão decorativo SVG para o header — linhas agrícolas geométricas
const HeaderPattern: React.FC = () => (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute right-0 top-0 h-full w-56 opacity-[0.07]"
    viewBox="0 0 224 200"
    fill="none"
    preserveAspectRatio="xMaxYMid slice"
  >
    {/* Grade de linhas diagonais */}
    {[0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220].map((x) => (
      <line key={x} x1={x} y1="0" x2={x - 80} y2="200" stroke="white" strokeWidth="1" />
    ))}
    {/* Círculos decorativos */}
    <circle cx="180" cy="40" r="48" stroke="white" strokeWidth="1.5" fill="none" />
    <circle cx="180" cy="40" r="28" stroke="white" strokeWidth="1" fill="none" />
    <circle cx="180" cy="40" r="10" fill="white" fillOpacity="0.4" />
    {/* Losango */}
    <path d="M120 160 L148 132 L176 160 L148 188Z" stroke="white" strokeWidth="1.2" fill="none" />
  </svg>
);

const SitePopupCampaignGate: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { popups, isLoading } = useActiveSitePopups();
  const navigate = useNavigate();
  const location = useLocation();
  const [activePopup, setActivePopup] = useState<SitePopup | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);

  const sessionSeenKey = useMemo(() => {
    if (!activePopup) return null;
    return getPopupSessionSeenKey(activePopup.id);
  }, [activePopup]);

  const dismissedKey = useMemo(() => {
    if (!activePopup) return null;
    return getPopupDismissedKey(activePopup.id);
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
          if (window.localStorage.getItem(getPopupDismissedKey(popup.id)) === 'true') return false;
          if (popup.showOnce && window.sessionStorage.getItem(getPopupSessionSeenKey(popup.id)) === 'true') return false;
          if (user?.id) {
            const existingState = userStates.get(popup.id);
            if (existingState?.dismissedAt) return false;
          }
          return true;
        }) || null;

      if (!isMounted) return;
      setActivePopup(eligiblePopup);
    };

    void resolveEligiblePopup();
    return () => { isMounted = false; };
  }, [isAuthLoading, isLoading, popups, user, location.pathname]);

  useEffect(() => {
    if (!activePopup) {
      setIsVisible(false);
      setIsAnimatingIn(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (activePopup.showOnce) {
        window.sessionStorage.setItem(getPopupSessionSeenKey(activePopup.id), 'true');
      }
      setIsVisible(true);
      // Pequeno delay para acionar a animação de entrada
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsAnimatingIn(true));
      });
      void recordSitePopupEvent(activePopup.id, 'view', location.pathname, getPopupSessionKey());
      if (user?.id) {
        void syncSitePopupUserState(activePopup.id, user.id, 'view');
      }
    }, Math.max(0, activePopup.delaySeconds) * 1000);

    return () => { window.clearTimeout(timeoutId); };
  }, [activePopup, location.pathname, user?.id]);

  const dismissActivePopup = () => {
    if (dismissedKey) {
      window.localStorage.setItem(dismissedKey, 'true');
    }

    if (activePopup) {
      void recordSitePopupEvent(activePopup.id, 'dismiss', location.pathname, getPopupSessionKey());
      if (user?.id) {
        void syncSitePopupUserState(activePopup.id, user.id, 'dismiss');
      }
    }

    setIsAnimatingIn(false);
    setTimeout(() => {
      setIsVisible(false);
      setActivePopup(null);
    }, 280);
  };

  const handleClose = () => {
    dismissActivePopup();
  };

  const handleDecline = () => {
    dismissActivePopup();
  };

  const handlePrimaryAction = () => {
    const destination = activePopup?.primaryButtonLink?.trim();
    if (activePopup) {
      void recordSitePopupEvent(activePopup.id, 'click', location.pathname, getPopupSessionKey());
      if (user?.id) void syncSitePopupUserState(activePopup.id, user.id, 'click');
    }
    setIsAnimatingIn(false);
    setTimeout(() => setIsVisible(false), 200);

    if (!destination) return;
    if (/^https?:\/\//i.test(destination)) {
      window.location.href = destination;
      return;
    }
    navigate(destination);
  };

  if (!activePopup || !isVisible) return null;

  const previewValues = {
    ...SITE_POPUP_SAMPLE_VALUES,
    nome_usuario: user?.name || SITE_POPUP_SAMPLE_VALUES.nome_usuario,
  };

  return (
    <>
      {/* Estilos de animação injetados inline */}
      <style>{`
        @keyframes bwagro-popup-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes bwagro-popup-slide-in {
          from { opacity: 0; transform: translateY(28px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bwagro-popup-slide-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(18px) scale(0.97); }
        }
        .bwagro-popup-card {
          transition: opacity 280ms ease, transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
          opacity: 0;
          transform: translateY(28px) scale(0.96);
        }
        .bwagro-popup-card.in {
          animation: bwagro-popup-slide-in 380ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100000] flex items-center justify-center px-4 py-8"
        style={{
          background: 'rgba(2, 6, 23, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: 'bwagro-popup-backdrop-in 250ms ease forwards',
        }}
      >
        {/* Card */}
        <div
          className={`bwagro-popup-card relative w-full max-w-lg overflow-hidden${isAnimatingIn ? ' in' : ''}`}
          style={{
            borderRadius: 28,
            boxShadow: '0 40px 120px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
            background: '#ffffff',
          }}
        >
          {/* Botão fechar */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-all hover:bg-white/15 hover:text-white"
            aria-label="Fechar pop-up"
          >
            <X className="h-4 w-4" />
          </button>

          {/* ── Header ────────────────────────────────────────────── */}
          <div
            className="relative overflow-hidden px-7 pb-7 pt-7"
            style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d3320 55%, #14532d 100%)' }}
          >
            <HeaderPattern />

            {/* Badge */}
            <div className="relative mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1"
              style={{
                background: 'rgba(52, 211, 153, 0.12)',
                border: '1px solid rgba(52, 211, 153, 0.28)',
              }}>
              <Sparkles className="h-3 w-3 text-emerald-300" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">
                Boas-vindas AGRO BW
              </span>
            </div>

            {/* Título */}
            <h2 className="relative text-[1.65rem] font-black leading-[1.15] tracking-tight text-white">
              {renderSitePopupText(activePopup.title, previewValues)}
            </h2>

            {/* Subtítulo */}
            <p className="relative mt-2.5 text-sm leading-relaxed" style={{ color: 'rgba(167, 243, 208, 0.85)' }}>
              {renderSitePopupText(activePopup.message, previewValues)}
            </p>

            {/* Badge "30 dias grátis" flutuante */}
            <div
              className="relative mt-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
              style={{
                background: 'linear-gradient(90deg, #16a34a, #15803d)',
                boxShadow: '0 8px 24px -6px rgba(22, 163, 74, 0.55)',
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
              <span className="text-xs font-bold text-white">30 dias grátis • sem cartão</span>
            </div>
          </div>

          {/* ── Body ──────────────────────────────────────────────── */}
          <div className="space-y-5 px-7 pb-7 pt-6">
            {/* Caixa de suporte com borda lateral */}
            {activePopup.supportText ? (
              <div
                className="rounded-2xl p-4 text-sm leading-relaxed"
                style={{
                  background: 'linear-gradient(135deg, #f0fdf4, #f7fef9)',
                  border: '1px solid rgba(134, 239, 172, 0.5)',
                  borderLeft: '3px solid #16a34a',
                  color: '#14532d',
                }}
              >
                {renderSitePopupText(activePopup.supportText, previewValues)}
              </div>
            ) : null}

            {/* Ações */}
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              {/* Botão primário */}
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="group inline-flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-white transition-all active:scale-[0.97]"
                style={{
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  boxShadow: '0 12px 32px -8px rgba(22, 163, 74, 0.6)',
                  paddingLeft: '1.5rem',
                  paddingRight: '1.5rem',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 16px 36px -8px rgba(22, 163, 74, 0.75)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 32px -8px rgba(22, 163, 74, 0.6)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                }}
              >
                {renderSitePopupText(activePopup.primaryButtonLabel, previewValues)}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              {/* Botão secundário — só texto */}
              <button
                type="button"
                onClick={handleDecline}
                className="inline-flex items-center justify-center py-3 text-sm font-medium text-slate-400 transition-colors hover:text-slate-600 sm:px-4"
              >
                Não tenho interesse
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SitePopupCampaignGate;
