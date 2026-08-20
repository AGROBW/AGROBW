import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Handshake, MessageCircleMore, SquarePen } from 'lucide-react';
import AdSlider from '../components/AdSlider';
import HeroSearch from '../components/HeroSearch';
import AdCard from '../components/AdCard';
import QuotationTicker from '../components/QuotationTicker';
import NewsGrid from '../components/NewsGrid';
import HomeAdsCarousel from '../components/HomeAdsCarousel';
import HomeStoresCarousel from '../components/HomeStoresCarousel';
import SeoHead from '../components/SeoHead';
import { HOME_SEO_TITLE_BASE, HOME_SEO_DESCRIPTION } from '../server/home-seo.mjs';
import StructuredData from '../components/StructuredData';
import { CATEGORIES } from '../constants';
import { usePublicAds } from '../src/hooks/useAds';
import { useLayout } from '../src/contexts/LayoutContext';
import { supabase } from '../src/lib/supabaseClient';
import { isTimestampActive, syncTrustedTime } from '../src/lib/trustedTime';
import { buildAbsoluteSiteUrl } from '../src/lib/siteConfig';
import { appWarn } from '../src/utils/appLogger';
import { Ad } from '../types';

class AdCardErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const isAdValid = (ad: any) => {
  return Boolean(
    ad &&
      ad.id &&
      ad.title &&
      typeof ad.price === 'number' &&
      ad.location &&
      ad.location.city &&
      ad.location.state
  );
};

const AdFallbackCard = () => (
  <div className="bg-white rounded-xl border border-slate-100 p-5 h-full flex flex-col justify-between">
    <div>
      <div className="w-full h-36 bg-slate-100 rounded-lg mb-4" />
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Anúncio indisponível</h3>
      <p className="text-xs text-slate-500">Estamos atualizando este conteúdo. Tente novamente em instantes.</p>
    </div>
    <div className="mt-4">
      <div className="w-full h-10 bg-slate-100 rounded-lg" />
    </div>
  </div>
);

const getDailyRotationSeed = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
};

const getDeterministicRotationScore = (ad: any, seed: string) => {
  const source = `${seed}:${ad?.id || ''}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return hash;
};

type ShowcaseStatsRow = {
  announcement_id: string;
  impressions_last_7_days: number;
  last_seen_at: string | null;
};

const Home: React.FC = () => {
  const { ads, isLoading: adsLoading } = usePublicAds();
  const { settings } = useLayout();
  const dailyRotationSeed = getDailyRotationSeed();
  const [homeShowcaseStats, setHomeShowcaseStats] = useState<Record<string, ShowcaseStatsRow>>({});
  const [requestRotationSeed] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const impressionSignatureRef = useRef<string>('');

  const hasActiveHomeHighlight = (ad: any) =>
    Boolean(ad.highlightHome && isTimestampActive(ad.highlightHomeUntil));
  const hasActiveCategoryHighlight = (ad: any) =>
    Boolean(ad.highlightCategory && isTimestampActive(ad.highlightCategoryUntil));

  const highlightedAdsBase = useMemo(
    () => ads.filter((ad) => hasActiveHomeHighlight(ad)),
    [ads]
  );

  useEffect(() => {
    let cancelled = false;

    const loadHomeShowcaseStats = async () => {
      await syncTrustedTime();

      if (highlightedAdsBase.length === 0) {
        setHomeShowcaseStats({});
        return;
      }

      const { data, error } = await supabase.rpc('get_home_showcase_impression_stats', {
        p_announcement_ids: highlightedAdsBase.map((ad) => ad.id),
      });

      if (error) {
        appWarn('[Home] Nao foi possivel carregar estatisticas da vitrine home', { error });
        if (!cancelled) {
          setHomeShowcaseStats({});
        }
        return;
      }

      if (cancelled) return;

      const statsMap = ((data as ShowcaseStatsRow[] | null) || []).reduce<Record<string, ShowcaseStatsRow>>(
        (accumulator, row) => {
          accumulator[row.announcement_id] = {
            announcement_id: row.announcement_id,
            impressions_last_7_days: Number(row.impressions_last_7_days ?? 0),
            last_seen_at: row.last_seen_at ?? null,
          };
          return accumulator;
        },
        {}
      );

      setHomeShowcaseStats(statsMap);
    };

    void loadHomeShowcaseStats();

    return () => {
      cancelled = true;
    };
  }, [highlightedAdsBase]);

  const highlightedAds = useMemo(() => {
    return [...highlightedAdsBase].sort((a: Ad, b: Ad) => {
      const aStats = homeShowcaseStats[a.id];
      const bStats = homeShowcaseStats[b.id];
      const aImpressions = aStats?.impressions_last_7_days ?? 0;
      const bImpressions = bStats?.impressions_last_7_days ?? 0;

      if (aImpressions !== bImpressions) {
        return aImpressions - bImpressions;
      }

      const aLastSeen = aStats?.last_seen_at ? new Date(aStats.last_seen_at).getTime() : 0;
      const bLastSeen = bStats?.last_seen_at ? new Date(bStats.last_seen_at).getTime() : 0;

      if (aLastSeen !== bLastSeen) {
        return aLastSeen - bLastSeen;
      }

      const scoreA = getDeterministicRotationScore(a, `${dailyRotationSeed}:${requestRotationSeed}`);
      const scoreB = getDeterministicRotationScore(b, `${dailyRotationSeed}:${requestRotationSeed}`);

      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }

      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [highlightedAdsBase, homeShowcaseStats, dailyRotationSeed, requestRotationSeed]);

  useEffect(() => {
    const visibleIds = highlightedAds.map((ad) => ad.id);
    const signature = `home:${visibleIds.join('|')}`;

    if (visibleIds.length === 0 || impressionSignatureRef.current === signature) {
      return;
    }

    impressionSignatureRef.current = signature;

    void supabase.from('home_showcase_impressions').insert(
      highlightedAds.map((ad) => ({
        announcement_id: ad.id,
      }))
    );
  }, [highlightedAds]);

  const recentAds = ads
    .filter((ad) => !hasActiveHomeHighlight(ad) && !hasActiveCategoryHighlight(ad))
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: settings.backgroundColor }}>
      <SeoHead
        title={HOME_SEO_TITLE_BASE}
        description={HOME_SEO_DESCRIPTION}
        canonicalPath="/"
      />
      <StructuredData
        id="home-website"
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'AGRO BW',
            url: buildAbsoluteSiteUrl('/'),
            potentialAction: {
              '@type': 'SearchAction',
              target: `${buildAbsoluteSiteUrl('/anuncios')}?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'AGRO BW',
            url: buildAbsoluteSiteUrl('/'),
            contactPoint: {
              '@type': 'ContactPoint',
              contactType: 'customer support',
              email: 'suporte@agrobw.com.br',
            },
          },
        ]}
      />
      <QuotationTicker />
      <AdSlider />
      <HeroSearch />

      <section
        className="mx-auto w-full max-w-7xl px-4 pb-10 pt-6 lg:pb-12 lg:pt-8"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(22,163,74,0.06), transparent 42%)',
        }}
      >
        <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: settings.primaryColor }}>
              Encontre mais rápido
            </span>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Explore por categoria</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Navegue pelos principais setores do agro e encontre oportunidades em poucos cliques.
            </p>
          </div>
          <Link to="/categorias" className="font-semibold flex items-center gap-2 hover:underline text-sm" style={{ color: settings.primaryColor }}>
            Ver todas as categorias
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              to={`/anuncios?categoria=${cat.slug}`}
              className="group flex min-h-36 flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-4 text-center shadow-[0_18px_45px_-36px_rgba(15,23,42,0.45)] transition duration-300 hover:-translate-y-1 hover:border-green-200 hover:shadow-[0_24px_50px_-32px_rgba(15,23,42,0.35)]"
            >
              <div
                className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl transition group-hover:scale-105"
                style={{
                  color: settings.primaryColor,
                  backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 9%, white)`,
                }}
              >
                {cat.icon}
              </div>
              <h3 className="text-sm font-bold text-slate-800 transition-colors group-hover:opacity-90">
                {cat.name}
              </h3>
            </Link>
          ))}
        </div>
      </section>

      <HomeAdsCarousel
        title="Anúncios em Destaque"
        subtitle="Oportunidades com maior visibilidade na plataforma"
        eyebrow="Seleção especial"
        headerAction={
          <Link to="/anuncios" className="inline-flex items-center gap-2 text-sm font-semibold hover:underline" style={{ color: settings.primaryColor }}>
            Ver todos os destaques
            <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
          </Link>
        }
        items={highlightedAds}
        isLoading={adsLoading}
        emptyMessage="Nenhum anúncio em destaque no momento."
        skeletonCount={6}
        density="compact"
        sectionClassName="w-full border-y py-8 lg:py-10"
        sectionStyle={{
          backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 6%, white)`,
          borderColor: `color-mix(in srgb, ${settings.primaryColor} 18%, white)`,
        }}
        renderItem={(ad) =>
          isAdValid(ad) ? (
            <AdCardErrorBoundary>
              <AdCard ad={ad} highlightDisplayMode="home" variant="compact" />
            </AdCardErrorBoundary>
          ) : (
            <AdFallbackCard />
          )
        }
      />

      <HomeAdsCarousel
        title="Publicados Recentemente"
        subtitle="Os anúncios mais novos que chegaram à plataforma"
        eyebrow="Novidades do marketplace"
        items={recentAds}
        isLoading={adsLoading}
        emptyMessage="Nenhum anúncio publicado recentemente."
        skeletonCount={8}
        sectionClassName="w-full py-8 lg:py-10"
        density="compact"
        footer={
          <Link to="/anuncios" className="inline-block px-8 h-10 leading-10 rounded-lg font-semibold text-center text-white" style={{ backgroundColor: settings.secondaryColor }}>
            Ver Mais Anúncios
          </Link>
        }
        renderItem={(ad) =>
          isAdValid(ad) ? (
            <AdCardErrorBoundary>
              <AdCard ad={ad} variant="compact" />
            </AdCardErrorBoundary>
          ) : (
            <AdFallbackCard />
          )
        }
      />

      <HomeStoresCarousel />

      <NewsGrid />

      <section
        className="relative overflow-hidden py-9 lg:py-10"
        style={{
          backgroundColor: settings.secondaryColor,
          backgroundImage: `radial-gradient(circle at 80% 20%, color-mix(in srgb, ${settings.primaryColor} 36%, transparent), transparent 28%), linear-gradient(110deg, color-mix(in srgb, ${settings.secondaryColor} 94%, black), color-mix(in srgb, ${settings.primaryColor} 38%, ${settings.secondaryColor}))`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: 'linear-gradient(30deg, transparent 12%, white 12.5%, transparent 13%, transparent 37%, white 37.5%, transparent 38%)', backgroundSize: '72px 72px' }}
        />
        <div className="relative z-10 mx-auto max-w-7xl px-4">
          <div className="grid items-center gap-9 lg:grid-cols-[1.05fr_1.7fr_auto] lg:gap-10">
            <div className="text-center text-white lg:text-left">
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300">Comece agora</span>
              <h2 className="mt-2 text-2xl font-black leading-tight">Tem algo para vender no agro?</h2>
              <p className="mt-3 text-sm leading-6 text-white/75">
                Publique gratuitamente e encontre compradores de todo o Brasil.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: SquarePen, title: 'Crie seu anúncio', description: 'Cadastre em poucos minutos' },
                { icon: MessageCircleMore, title: 'Receba contatos', description: 'Negocie diretamente' },
                { icon: Handshake, title: 'Feche o negócio', description: 'Venda com segurança' },
              ].map(({ icon: Icon, title, description }, index) => (
                <div key={title} className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm sm:flex-col sm:text-center lg:bg-transparent lg:p-2">
                  {index < 2 ? <div className="absolute left-[calc(50%+28px)] top-7 hidden h-px w-[calc(100%-56px)] bg-white/20 sm:block" /> : null}
                  <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-emerald-300">
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{title}</h3>
                    <p className="mt-1 text-xs text-white/60">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:flex-col">
              <Link
                to="/anunciar"
                className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-7 text-sm font-black shadow-lg transition hover:-translate-y-0.5"
                style={{ backgroundColor: settings.accentColor, color: settings.secondaryColor }}
              >
                Anunciar Grátis
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>
              <Link to="/planos" className="text-center text-xs font-semibold text-white/65 transition hover:text-white">
                Conhecer planos
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};

export default Home;
