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
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Anuncio indisponivel</h3>
      <p className="text-xs text-slate-500">Estamos atualizando este conteudo. Tente novamente em instantes.</p>
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
  const hasAnyActiveHighlight = (ad: any) => hasActiveHomeHighlight(ad) || hasActiveCategoryHighlight(ad);

  const highlightedAds = ads
    .filter((ad) => hasAnyActiveHighlight(ad))
    .sort((a, b) => {
      const homePriorityA = hasActiveHomeHighlight(a) ? 1 : 0;
      const homePriorityB = hasActiveHomeHighlight(b) ? 1 : 0;
      if (homePriorityA !== homePriorityB) {
        return homePriorityB - homePriorityA;
      }
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

  const recentAds = ads
    .filter((ad) => !hasAnyActiveHighlight(ad))
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
              Navegue pelos setores mais movimentados do agronegocio e encontre exatamente o que sua producao precisa.
            </p>
          </div>
          <Link to="/categorias" className="font-semibold flex items-center gap-2 hover:underline text-sm" style={{ color: settings.primaryColor }}>
            Ver todas as categorias
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              to={`/anuncios?categoria=${cat.slug}`}
              className="group bg-white p-4 rounded-xl border border-slate-100 transition-all text-center flex flex-col items-center"
            >
              <div className="mb-3 text-slate-600 transition-colors group-hover:opacity-90" style={{ color: 'var(--brand-muted)' }}>
                {cat.icon}
              </div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1 transition-colors group-hover:opacity-90" style={{ color: 'var(--brand-text)' }}>
                {cat.name}
              </h3>
              <p className="text-xs text-slate-400">{cat.count} anuncios</p>
            </Link>
          ))}
        </div>
      </section>

      <HomeAdsCarousel
        title="Anuncios em Destaque"
        subtitle="As melhores ofertas verificadas da nossa rede"
        eyebrow="Selecao Especial"
        centeredHeader
        items={highlightedAds}
        isLoading={adsLoading}
        emptyMessage="Nenhum anuncio em destaque no momento."
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
        subtitle="Atualizado ha poucos minutos"
        items={recentAds}
        isLoading={adsLoading}
        emptyMessage="Nenhum anuncio publicado recentemente."
        skeletonCount={8}
        sectionClassName="py-16 w-full"
        footer={
          <Link to="/anuncios" className="inline-block px-8 h-10 leading-10 rounded-lg font-semibold text-center text-white" style={{ backgroundColor: settings.secondaryColor }}>
            Ver Mais Anuncios
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

      <section className="py-16 relative overflow-hidden" style={{ backgroundColor: settings.secondaryColor }}>
        <div
          className="absolute top-0 right-0 w-1/3 h-full skew-x-12 transform translate-x-20 opacity-50"
          style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 30%, ${settings.secondaryColor})` }}
        />
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 text-white text-center lg:text-left">
              <h2 className="text-xl font-semibold mb-4 leading-tight">Pronto para fechar o melhor negocio do ano?</h2>
              <p className="text-sm mb-6 opacity-90" style={{ color: 'rgba(255,255,255,0.82)' }}>
                Junte-se a mais de 10.000 produtores rurais que ja utilizam a BWAGRO para comprar e vender com seguranca e rapidez.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/anunciar" className="px-6 h-10 leading-10 rounded-lg font-semibold text-sm transition-all" style={{ backgroundColor: settings.accentColor, color: settings.secondaryColor }}>
                  Anunciar Agora Gratis
                </Link>
                <Link to="/planos" className="bg-white/10 backdrop-blur-md text-white border border-white/20 px-6 h-10 leading-10 rounded-lg font-semibold text-sm hover:bg-white/20 transition-all">
                  Conhecer Planos Premium
                </Link>
              </div>
            </div>
            <div className="flex-1 hidden lg:block">
              <div className="bg-white/10 backdrop-blur-xl p-6 rounded-xl border border-white/10">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: settings.primaryColor }}>
                      1
                    </div>
                    <div>
                      <h4 className="text-white font-semibold text-sm">Crie seu anuncio</h4>
                      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.72)' }}>Em menos de 2 minutos seu produto esta online.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: settings.primaryColor }}>
                      2
                    </div>
                    <div>
                      <h4 className="text-white font-semibold text-sm">Receba propostas</h4>
                      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.72)' }}>Compradores reais entrarao em contato direto.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: settings.primaryColor }}>
                      3
                    </div>
                    <div>
                      <h4 className="text-white font-semibold text-sm">Feche o negocio</h4>
                      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.72)' }}>Venda com a melhor margem do mercado.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
