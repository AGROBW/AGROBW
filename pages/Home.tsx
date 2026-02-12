
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import AdSlider from '../components/AdSlider';
import HeroSearch from '../components/HeroSearch';
import AdCard from '../components/AdCard';
import QuotationTicker from '../components/QuotationTicker';
import NewsGrid from '../components/NewsGrid';
import { CATEGORIES } from '../constants';
import { usePublicAds } from '../src/hooks/useAds';

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
    Array.isArray(ad.images) && ad.images[0] &&
    ad.location && ad.location.city && ad.location.state
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
  const premiumAds = ads.filter(ad => ad.isPremium);
  return (
    <div className="flex flex-col min-h-screen">
      {/* Agricultural Quotations Ticker */}
      <QuotationTicker />

      {/* Top Banner Slider */}
      <AdSlider />

      {/* Hero Search Section */}
      <HeroSearch />

      {/* Featured Categories */}
      <section className="py-16 max-w-7xl mx-auto px-4 w-full">
        <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Categorias em Destaque</h2>
            <p className="text-slate-500 max-w-xl text-sm">
              Navegue pelos setores mais movimentados do agronegócio e encontre exatamente o que sua produção precisa.
            </p>
          </div>
          <Link to="/categorias" className="text-green-700 font-semibold flex items-center gap-2 hover:underline text-sm">
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
              <div className="mb-3 text-slate-600 group-hover:text-green-700 transition-colors">
                {cat.icon}
              </div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1 group-hover:text-green-700">{cat.name}</h3>
              <p className="text-xs text-slate-400">{cat.count} anúncios</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Premium Ads Section */}
      <section className="py-16 bg-green-50/50 w-full border-y border-green-100/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <span className="bg-green-100 text-green-700 text-[10px] font-semibold px-3 py-1 rounded-lg uppercase tracking-widest mb-3 inline-block">Seleção Especial</span>
            <h2 className="text-xl font-semibold text-slate-900">Anúncios em Destaque</h2>
            <p className="text-slate-500 mt-2 text-sm">As melhores ofertas verificadas da nossa rede</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {adsLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={`premium-skeleton-${index}`} className="bg-white rounded-xl h-72 animate-pulse border border-slate-100" />
              ))
            ) : premiumAds.length > 0 ? (
              premiumAds.map((ad) => (
                isAdValid(ad) ? (
                  <AdCardErrorBoundary key={ad.id}>
                    <AdCard ad={ad} />
                  </AdCardErrorBoundary>
                ) : (
                  <AdFallbackCard key={`fallback-${ad?.id ?? Math.random()}`} />
                )
              ))
            ) : (
              <div className="col-span-full bg-white rounded-xl p-8 text-center border border-slate-100">
                <p className="text-sm text-slate-500">Nenhum anúncio em destaque no momento.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* NEW: News Section (Mural de Informações) */}
      <NewsGrid />

      {/* Recent Ads Section */}
      <section className="py-16 max-w-7xl mx-auto px-4 w-full">
        <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Publicados Recentemente</h2>
            <p className="text-slate-500 mt-1 text-sm">Atualizado há poucos minutos</p>
          </div>
          <div className="flex gap-2">
            <button className="p-2 rounded-lg border border-slate-200 hover:bg-white transition-all">
               <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button className="p-2 rounded-lg border border-slate-200 hover:bg-white transition-all">
               <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {adsLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={`recent-skeleton-${index}`} className="bg-white rounded-xl h-72 animate-pulse border border-slate-100" />
            ))
          ) : ads.length > 0 ? (
            ads.map((ad) => (
              isAdValid(ad) ? (
                <AdCardErrorBoundary key={ad.id}>
                  <AdCard ad={ad} />
                </AdCardErrorBoundary>
              ) : (
                <AdFallbackCard key={`fallback-${ad?.id ?? Math.random()}`} />
              )
            ))
          ) : (
            <div className="col-span-full bg-white rounded-xl p-8 text-center border border-slate-100">
              <p className="text-sm text-slate-500">Nenhum anúncio publicado recentemente.</p>
            </div>
          )}
        </div>

        <div className="mt-10 text-center">
          <Link to="/anuncios" className="inline-block bg-slate-900 text-white px-8 h-10 leading-10 rounded-lg font-semibold hover:bg-green-700 transition-all text-center">
            Ver Mais Anúncios
          </Link>
        </div>
      </section>

      {/* Newsletter / CTA */}
      <section className="py-16 bg-green-900 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-green-800 skew-x-12 transform translate-x-20 opacity-50"></div>
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 text-white text-center lg:text-left">
              <h2 className="text-xl font-semibold mb-4 leading-tight">Pronto para fechar o melhor negócio do ano?</h2>
              <p className="text-green-100 text-sm mb-6 opacity-90">
                Junte-se a mais de 10.000 produtores rurais que já utilizam a BWAGRO para comprar e vender com segurança e rapidez.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/anunciar" className="bg-yellow-400 text-yellow-950 px-6 h-10 leading-10 rounded-lg font-semibold text-sm hover:bg-yellow-300 transition-all">
                  Anunciar Agora Grátis
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
                    <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center text-white text-sm font-semibold">1</div>
                    <div>
                      <h4 className="text-white font-semibold text-sm">Crie seu anúncio</h4>
                      <p className="text-green-100 text-sm">Em menos de 2 minutos seu produto está online.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center text-white text-sm font-semibold">2</div>
                    <div>
                      <h4 className="text-white font-semibold text-sm">Receba propostas</h4>
                      <p className="text-green-100 text-sm">Compradores reais entrarão em contato direto.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center text-white text-sm font-semibold">3</div>
                    <div>
                      <h4 className="text-white font-semibold text-sm">Feche o negócio</h4>
                      <p className="text-green-100 text-sm">Venda com a melhor margem do mercado.</p>
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
