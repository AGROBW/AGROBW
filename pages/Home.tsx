import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AdSlider from '../components/AdSlider';
import HeroSearch from '../components/HeroSearch';
import AdCard from '../components/AdCard';
import QuotationTicker from '../components/QuotationTicker';
import NewsGrid from '../components/NewsGrid';
import HomeAdsCarousel from '../components/HomeAdsCarousel';
import { CATEGORIES } from '../constants';
import { usePublicAds } from '../src/hooks/useAds';
import { useLayout } from '../src/contexts/LayoutContext';

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
      Array.isArray(ad.images) &&
      ad.images[0] &&
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

const Home: React.FC = () => {
  const { ads, isLoading: adsLoading } = usePublicAds();
  const { settings } = useLayout();

  const hasActiveHomeHighlight = (ad: any) =>
    Boolean(ad.highlightHome && (!ad.highlightHomeUntil || new Date(ad.highlightHomeUntil) > new Date()));
  const hasActiveCategoryHighlight = (ad: any) =>
    Boolean(ad.highlightCategory && (!ad.highlightCategoryUntil || new Date(ad.highlightCategoryUntil) > new Date()));

  const highlightedAds = ads
    .filter((ad) => hasActiveHomeHighlight(ad))
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

  const recentAds = ads
    .filter((ad) => !hasActiveHomeHighlight(ad) && !hasActiveCategoryHighlight(ad))
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: settings.backgroundColor }}>
      <QuotationTicker />
      <AdSlider />
      <HeroSearch />

      <section className="py-16 max-w-7xl mx-auto px-4 w-full">
        <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Categorias em Destaque</h2>
            <p className="text-slate-500 max-w-xl text-sm">
              Navegue pelos setores mais movimentados do agronegócio e encontre exatamente o que sua produção precisa.
            </p>
          </div>
          <Link to="/categorias" className="font-semibold flex items-center gap-2 hover:underline text-sm" style={{ color: settings.primaryColor }}>
            Ver todas as categorias
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              to={`/anuncios?categoria=${cat.slug}`}
              className="group min-w-[200px] flex-shrink-0 rounded-xl border border-slate-100 bg-white p-4 text-center flex flex-col items-center transition-all"
            >
              <div className="mb-3 text-slate-600 transition-colors group-hover:opacity-90" style={{ color: 'var(--brand-muted)' }}>
                {cat.icon}
              </div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1 transition-colors group-hover:opacity-90" style={{ color: 'var(--brand-text)' }}>
                {cat.name}
              </h3>
              <p className="text-xs text-slate-400">{cat.count} anúncios</p>
            </Link>
          ))}
        </div>
      </section>

      <HomeAdsCarousel
        title="Anúncios em Destaque"
        subtitle="As melhores ofertas verificadas da nossa rede"
        eyebrow="Seleção Especial"
        centeredHeader
        items={highlightedAds}
        isLoading={adsLoading}
        emptyMessage="Nenhum anúncio em destaque no momento."
        skeletonCount={4}
        sectionClassName="py-16 w-full border-y"
        sectionStyle={{
          backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 6%, white)`,
          borderColor: `color-mix(in srgb, ${settings.primaryColor} 18%, white)`,
        }}
        renderItem={(ad) =>
          isAdValid(ad) ? (
            <AdCardErrorBoundary>
              <AdCard ad={ad} />
            </AdCardErrorBoundary>
          ) : (
            <AdFallbackCard />
          )
        }
      />

      <NewsGrid />

      <HomeAdsCarousel
        title="Publicados Recentemente"
        subtitle="Atualizado há poucos minutos"
        items={recentAds}
        isLoading={adsLoading}
        emptyMessage="Nenhum anúncio publicado recentemente."
        skeletonCount={8}
        sectionClassName="py-16 w-full"
        footer={
          <Link to="/anuncios" className="inline-block px-8 h-10 leading-10 rounded-lg font-semibold text-center text-white" style={{ backgroundColor: settings.secondaryColor }}>
            Ver Mais Anúncios
          </Link>
        }
        renderItem={(ad) =>
          isAdValid(ad) ? (
            <AdCardErrorBoundary>
              <AdCard ad={ad} />
            </AdCardErrorBoundary>
          ) : (
            <AdFallbackCard />
          )
        }
      />

      <section className="relative overflow-hidden py-16" style={{ backgroundColor: settings.secondaryColor }}>
        <div
          className="absolute top-0 right-0 h-full w-1/3 translate-x-20 skew-x-12 opacity-50"
          style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 30%, ${settings.secondaryColor})` }}
        />
        <div className="relative z-10 mx-auto max-w-7xl px-4">
          <div className="flex flex-col items-center gap-12 lg:flex-row">
            <div className="flex-1 text-center text-white lg:text-left">
              <h2 className="mb-4 text-xl font-semibold leading-tight">Pronto para fechar o melhor negócio do ano?</h2>
              <p className="mb-6 text-sm opacity-90" style={{ color: 'rgba(255,255,255,0.82)' }}>
                Junte-se a mais de 10.000 produtores rurais que já utilizam a BWAGRO para comprar e vender com segurança e rapidez.
              </p>
              <div className="flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
                <Link to="/anunciar" className="h-10 rounded-lg px-6 text-sm font-semibold leading-10 transition-all" style={{ backgroundColor: settings.accentColor, color: settings.secondaryColor }}>
                  Anunciar Agora Grátis
                </Link>
                <Link to="/planos" className="h-10 rounded-lg border border-white/20 bg-white/10 px-6 text-sm font-semibold leading-10 text-white backdrop-blur-md transition-all hover:bg-white/20">
                  Conhecer Planos Premium
                </Link>
              </div>
            </div>
            <div className="hidden flex-1 lg:block">
              <div className="rounded-xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: settings.primaryColor }}>
                      1
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Crie seu anúncio</h4>
                      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.72)' }}>Em menos de 2 minutos seu produto está online.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: settings.primaryColor }}>
                      2
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Receba propostas</h4>
                      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.72)' }}>Compradores reais entrarão em contato direto.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: settings.primaryColor }}>
                      3
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">Feche o negócio</h4>
                      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.72)' }}>Venda com a melhor margem do mercado.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="h-px w-full" style={{ backgroundColor: settings.accentColor }} />
    </div>
  );
};

export default Home;
