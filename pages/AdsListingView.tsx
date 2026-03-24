
import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { CATEGORIES } from '../constants';
import AdCard from '../components/AdCard';
import { usePublicAds } from '../src/hooks/useAds';

const AdsListingView: React.FC = () => {
  const location = useLocation();

  // Extrair filtros da URL
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const catSlug = searchParams.get('categoria');
  const subSlug = searchParams.get('sub');
  const queryTerm = searchParams.get('q')?.trim() || '';

  // Encontrar o nome da categoria para o título
  const activeCategory = useMemo(() => 
    CATEGORIES.find(c => c.slug === catSlug), [catSlug]
  );

  // Lógica de Filtragem
  const { ads, isLoading } = usePublicAds({
    category: catSlug || undefined,
    search: queryTerm || undefined
  });

  const filteredAds = useMemo(() => {
    const normalizedSub = subSlug?.replace('-', ' ').toLowerCase();
    return ads.filter(ad => {
      const subMatch = !normalizedSub || ad.title.toLowerCase().includes(normalizedSub);
      return subMatch;
    });
  }, [ads, subSlug]);

  const sortedAds = useMemo(() => {
    const now = Date.now();
    const isHomeHighlightActive = (ad: typeof filteredAds[number]) =>
      Boolean(ad.highlightHome && (!ad.highlightHomeUntil || new Date(ad.highlightHomeUntil).getTime() > now));
    const isCategoryHighlightActive = (ad: typeof filteredAds[number]) =>
      Boolean(ad.highlightCategory && (!ad.highlightCategoryUntil || new Date(ad.highlightCategoryUntil).getTime() > now));

    return [...filteredAds].sort((a, b) => {
      const aHome = isHomeHighlightActive(a) ? 1 : 0;
      const bHome = isHomeHighlightActive(b) ? 1 : 0;
      const aCategory = isCategoryHighlightActive(a) ? 1 : 0;
      const bCategory = isCategoryHighlightActive(b) ? 1 : 0;

      if (catSlug) {
        if (aCategory !== bCategory) {
          return bCategory - aCategory;
        }

        if (aHome !== bHome) {
          return bHome - aHome;
        }
      } else {
        if (aHome !== bHome) {
          return bHome - aHome;
        }

        if (aCategory !== bCategory) {
          return bCategory - aCategory;
        }
      }

      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [filteredAds, catSlug]);

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-400 font-bold uppercase tracking-widest mb-2">
                <span className="text-green-600">BWAGRO</span>
                <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                <span>Classificados</span>
              </div>
              <h1 className="text-4xl font-black text-slate-900 font-display">
                {queryTerm ? `Resultados para "${queryTerm}"` : activeCategory ? activeCategory.name : 'Todos os Anúncios'}
                {subSlug && <span className="text-green-600 block text-lg font-bold mt-1">Subcategoria: {subSlug.replace('-', ' ')}</span>}
                {!subSlug && queryTerm && activeCategory && <span className="text-green-600 block text-lg font-bold mt-1">Categoria: {activeCategory.name}</span>}
              </h1>
            </div>
            
            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-gray-100">
              <span className="text-xs font-bold text-slate-500 ml-4">{sortedAds.length} resultados encontrados</span>
               <select className="bg-white border-none rounded-xl text-sm font-bold text-slate-700 py-2.5 px-4 shadow-sm focus:ring-2 focus:ring-green-500 outline-none">
                 <option>Mais Recentes</option>
                 <option>Menor Preço</option>
                 <option>Maior Preço</option>
                 <option>Mais Vistos</option>
               </select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-12">
        {isLoading ? (
          /* Loading State */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white rounded-xl h-72 animate-pulse border border-slate-100"></div>
            ))}
          </div>
        ) : sortedAds.length > 0 ? (
          /* Results Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {sortedAds.map(ad => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-xl p-10 text-center border border-dashed border-slate-200">
             <div className="mx-auto mb-4 w-10 h-10 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center">
               <Search className="w-5 h-5" strokeWidth={1.5} />
             </div>
             <h3 className="text-xl font-semibold text-slate-800 mb-2">Nenhum anúncio encontrado</h3>
             <p className="text-slate-500 mb-6 text-sm">Tente ajustar seus filtros ou navegar por outras categorias.</p>
             <button 
              onClick={() => window.history.back()}
              className="bg-slate-900 text-white px-6 h-10 rounded-lg font-semibold hover:bg-green-700 transition-all"
             >
               Voltar para a busca
             </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdsListingView;
