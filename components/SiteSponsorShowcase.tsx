import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Eye, MousePointerClick, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../src/contexts/AuthContext';
import { useLayout } from '../src/contexts/LayoutContext';
import { supabase } from '../src/lib/supabaseClient';
import { ensureSiteAnalyticsSessionId, getSiteAnalyticsDeviceType } from '../src/lib/siteAnalyticsSession';
import { detectUserState } from '../src/utils/geoLocation';

type PublicSiteSponsor = {
  id: string;
  company_name: string;
  segment: string;
  logo_url: string | null;
  banner_url: string | null;
  target_type: 'site' | 'whatsapp';
  target_url: string | null;
  slot_position: number | null;
};

const normalizeExternalUrl = (url?: string | null) => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const buildSponsorDestination = (sponsor: PublicSiteSponsor) => {
  if (!sponsor.target_url) return null;

  if (sponsor.target_type === 'whatsapp') {
    const digitsOnly = sponsor.target_url.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
      return `https://wa.me/${digitsOnly}`;
    }
  }

  return normalizeExternalUrl(sponsor.target_url);
};

const SiteSponsorShowcase: React.FC = () => {
  const { user } = useAuth();
  const { settings } = useLayout();
  const [sponsors, setSponsors] = useState<PublicSiteSponsor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const sessionId = useMemo(() => ensureSiteAnalyticsSessionId(), []);
  const trackedSignatureRef = useRef<string>('');

  useEffect(() => {
    let isMounted = true;

    const loadSponsors = async () => {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_public_active_site_sponsors');

      if (error) {
        console.error('[SiteSponsorShowcase] Erro ao carregar patrocinadores ativos:', error);
        if (isMounted) {
          setSponsors([]);
          setIsLoading(false);
        }
        return;
      }

      if (!isMounted) return;
      setSponsors(((data as PublicSiteSponsor[] | null) || []).filter((row) => buildSponsorDestination(row)));
      setIsLoading(false);
    };

    void loadSponsors();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const visibleIds = sponsors.map((sponsor) => sponsor.id);
    const signature = `site-sponsors:${visibleIds.join('|')}`;

    if (!visibleIds.length || trackedSignatureRef.current === signature) {
      return;
    }

    trackedSignatureRef.current = signature;

    void Promise.all(
      sponsors.map((sponsor) =>
        supabase.rpc('record_site_sponsor_impression', {
          p_sponsor_id: sponsor.id,
          p_session_id: sessionId,
          p_page_path: '/',
          p_slot_position: sponsor.slot_position,
          p_user_id: user?.id ?? null,
          p_user_city: user?.cidade ?? null,
          p_user_state: user?.estado ?? null,
          p_device_type: getSiteAnalyticsDeviceType(),
        }),
      ),
    ).catch((error) => {
      console.error('[SiteSponsorShowcase] Erro ao registrar impressões de patrocinadores:', error);
    });
  }, [sessionId, sponsors, user?.cidade, user?.estado, user?.id]);

  const handleSponsorClick = async (sponsor: PublicSiteSponsor) => {
    const destination = buildSponsorDestination(sponsor);
    if (!destination) {
      toast.error('O link deste patrocinador está indisponível no momento.');
      return;
    }

    const fallbackState = !user?.estado ? await detectUserState() : null;

    void (async () => {
      const { error } = await supabase.rpc('record_site_sponsor_click', {
        p_sponsor_id: sponsor.id,
        p_session_id: sessionId,
        p_page_path: '/',
        p_slot_position: sponsor.slot_position,
        p_user_id: user?.id ?? null,
        p_user_city: user?.cidade ?? null,
        p_user_state: user?.estado ?? fallbackState ?? null,
        p_device_type: getSiteAnalyticsDeviceType(),
      });

      if (error) {
        console.error('[SiteSponsorShowcase] Erro ao registrar clique de patrocinador:', error);
      }
    })();

    window.open(destination, '_blank', 'noopener,noreferrer');
  };

  if (!isLoading && sponsors.length === 0) {
    return null;
  }

  return (
    <section
      className="w-full border-y py-10"
      style={{
        backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 4%, white)`,
        borderColor: `color-mix(in srgb, ${settings.primaryColor} 14%, white)`,
      }}
    >
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" />
              Vitrine Premium
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Marcas em destaque no agro</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Espaços premium ocupados por marcas parceiras em segmentos estratégicos da plataforma.
            </p>
          </div>
          <div className="inline-flex items-center gap-5 text-xs font-bold text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="h-4 w-4 text-emerald-600" />
              Impressões rastreadas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MousePointerClick className="h-4 w-4 text-emerald-600" />
              Cliques monitorados
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="h-36 animate-pulse bg-slate-100" />
                  <div className="space-y-3 p-5">
                    <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
                    <div className="h-10 w-full animate-pulse rounded-2xl bg-slate-100" />
                  </div>
                </div>
              ))
            : sponsors.map((sponsor) => (
                <article
                  key={sponsor.id}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-transform hover:-translate-y-0.5"
                >
                  <div className="relative h-40 overflow-hidden bg-slate-100">
                    {sponsor.banner_url ? (
                      <img
                        src={sponsor.banner_url}
                        alt={sponsor.company_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(135deg, ${settings.secondaryColor} 0%, ${settings.primaryColor} 100%)`,
                        }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/10 to-transparent" />
                    <div className="absolute left-4 top-4 inline-flex rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">
                      Vaga {sponsor.slot_position ?? '-'}
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 flex items-end gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                        {sponsor.logo_url ? (
                          <img src={sponsor.logo_url} alt={sponsor.company_name} className="h-full w-full object-contain p-2" />
                        ) : (
                          <span className="text-sm font-black text-slate-700">{sponsor.company_name.slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black text-white">{sponsor.company_name}</p>
                        <p className="truncate text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">
                          {sponsor.segment}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    <button
                      type="button"
                      onClick={() => void handleSponsorClick(sponsor)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-slate-800"
                    >
                      Conhecer patrocinador
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}
        </div>
      </div>
    </section>
  );
};

export default SiteSponsorShowcase;
