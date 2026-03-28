import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, FilterX, Search, SlidersHorizontal } from 'lucide-react';
import { CATEGORIES } from '../constants';
import AdCard from '../components/AdCard';
import HomeAdsCarousel from '../components/HomeAdsCarousel';
import { usePublicAds } from '../src/hooks/useAds';
import {
  getCategoryHierarchyChildren,
  getCategoryGroupBySlug,
  matchesHierarchyChild,
} from '../src/lib/categoryHierarchy';
import { Ad } from '../types';

type SortOption = 'recent' | 'low-price' | 'high-price' | 'views';

const isHighlightActive = (value?: boolean, until?: string | null) =>
  Boolean(value) && (!until || new Date(until).getTime() > Date.now());

const getDailyRotationSeed = (categorySeed: string) => {
  const now = new Date();
  return `${categorySeed}:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
};

const getDeterministicRotationScore = (ad: Ad, seed: string) => {
  const source = `${seed}:${ad.id}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return hash;
};

const AdsListingView: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const catSlug = params.get('categoria') || '';
  const subSlug = params.get('subcategoria') || '';
  const queryTerm = params.get('q') || '';

  const categoryInfo = useMemo(
    () => CATEGORIES.find((category) => category.slug === catSlug) || null,
    [catSlug]
  );
  const categoryGroup = useMemo(() => getCategoryGroupBySlug(catSlug), [catSlug]);
  const hierarchyChildren = useMemo(() => getCategoryHierarchyChildren(catSlug), [catSlug]);
  const dailyRotationSeed = useMemo(
    () => getDailyRotationSeed(categoryGroup?.slug || catSlug || 'classificados'),
    [categoryGroup?.slug, catSlug]
  );

  const [searchTerm, setSearchTerm] = useState(queryTerm);
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [childSlugFilter, setChildSlugFilter] = useState(subSlug);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const { ads, isLoading, error } = usePublicAds({
    category: catSlug || undefined,
    search: queryTerm || undefined,
  });

  const filteredAds = useMemo(() => {
    return ads.filter((ad) => {
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const haystack = [ad.title, ad.description, ad.subCategoryLabel, ad.location.city]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) {
          return false;
        }
      }

      if (childSlugFilter) {
        const selectedChild = hierarchyChildren.find((child) => child.slug === childSlugFilter);
        if (selectedChild && !matchesHierarchyChild(selectedChild, ad)) {
          return false;
        }
      }

      if (stateFilter && ad.location.state !== stateFilter) {
        return false;
      }

      if (cityFilter && ad.location.city !== cityFilter) {
        return false;
      }

      const numericMin = minPrice ? Number(minPrice) : null;
      const numericMax = maxPrice ? Number(maxPrice) : null;

      if (numericMin !== null && !Number.isNaN(numericMin) && ad.price < numericMin) {
        return false;
      }

      if (numericMax !== null && !Number.isNaN(numericMax) && ad.price > numericMax) {
        return false;
      }

      return true;
    });
  }, [ads, searchTerm, childSlugFilter, hierarchyChildren, stateFilter, cityFilter, minPrice, maxPrice]);

  const highlightedAds = useMemo(() => {
    return [...filteredAds]
      .filter(
        (ad) =>
          isHighlightActive(ad.highlightHome, ad.highlightHomeUntil) ||
          isHighlightActive(ad.highlightCategory, ad.highlightCategoryUntil)
      )
      .sort((a, b) => {
        const aHome = isHighlightActive(a.highlightHome, a.highlightHomeUntil) ? 1 : 0;
        const bHome = isHighlightActive(b.highlightHome, b.highlightHomeUntil) ? 1 : 0;
        if (aHome !== bHome) return bHome - aHome;

        const aCategory = isHighlightActive(a.highlightCategory, a.highlightCategoryUntil) ? 1 : 0;
        const bCategory = isHighlightActive(b.highlightCategory, b.highlightCategoryUntil) ? 1 : 0;
        if (aCategory !== bCategory) return bCategory - aCategory;

        const scoreA = getDeterministicRotationScore(a, dailyRotationSeed);
        const scoreB = getDeterministicRotationScore(b, dailyRotationSeed);
        if (scoreA !== scoreB) return scoreA - scoreB;

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [dailyRotationSeed, filteredAds]);

  const regularAdsBase = useMemo(() => {
    const highlightedIds = new Set(highlightedAds.map((ad) => ad.id));
    return filteredAds.filter((ad) => !highlightedIds.has(ad.id));
  }, [filteredAds, highlightedAds]);

  const regularAds = useMemo(() => {
    const nextAds = [...regularAdsBase];

    if (sortBy === 'low-price') {
      nextAds.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'high-price') {
      nextAds.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'views') {
      nextAds.sort((a, b) => b.views - a.views);
    } else {
      nextAds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return nextAds;
  }, [regularAdsBase, sortBy]);

  const stateOptions = useMemo(
    () =>
      Array.from(new Set(ads.map((ad) => ad.location.state).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      ),
    [ads]
  );

  const cityOptions = useMemo(() => {
    return Array.from(
      new Set(
        ads
          .filter((ad) => !stateFilter || ad.location.state === stateFilter)
          .map((ad) => ad.location.city)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [ads, stateFilter]);

  const clearFilters = () => {
    setSearchTerm(queryTerm);
    setStateFilter('');
    setCityFilter('');
    setMinPrice('');
    setMaxPrice('');
    setChildSlugFilter(subSlug);
    setSortBy('recent');
  };

  const filtersContent = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-900">
          <SlidersHorizontal className="w-4 h-4" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em]">Filtros</h2>
        </div>
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
        >
          <FilterX className="w-3.5 h-3.5" />
          Limpar
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Buscar
          </span>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-3">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Marca, modelo ou palavra-chave"
              className="w-full bg-transparent text-sm text-slate-700 outline-none"
            />
          </div>
        </label>

        {hierarchyChildren.length > 0 && (
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Subcategoria
            </span>
            <select
              value={childSlugFilter}
              onChange={(event) => setChildSlugFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none"
            >
              <option value="">Todas</option>
              {hierarchyChildren.map((child) => (
                <option key={child.slug} value={child.slug}>
                  {child.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Estado
          </span>
          <select
            value={stateFilter}
            onChange={(event) => {
              setStateFilter(event.target.value);
              setCityFilter('');
            }}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none"
          >
            <option value="">Todos</option>
            {stateOptions.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Cidade
          </span>
          <select
            value={cityFilter}
            onChange={(event) => setCityFilter(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none"
          >
            <option value="">Todas</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Preço mín.
            </span>
            <input
              type="number"
              min="0"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              placeholder="0"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Preço máx.
            </span>
            <input
              type="number"
              min="0"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="Sem limite"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => setMobileFiltersOpen(false)}
          className="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white lg:hidden"
        >
          Aplicar filtros
        </button>
      </div>
    </>
  );

  const renderHighlightCard = (ad: Ad) => (
    <AdCard
      ad={ad}
      highlightDisplayMode={isHighlightActive(ad.highlightHome, ad.highlightHomeUntil) ? 'home' : 'category'}
    />
  );

  return (
    <div className="bg-slate-50 min-h-screen py-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          <Link to="/" className="text-green-600">
            BWAGRO
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span>Classificados</span>
        </div>

        <div className="mt-3 flex flex-col gap-4 border-b border-slate-200 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">
              {categoryGroup?.name || categoryInfo?.name || 'Classificados'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              {categoryGroup
                ? `Explore os anúncios de ${categoryGroup.name} e refine por subcategoria, localização e faixa de preço.`
                : 'Encontre oportunidades e filtre os anúncios com mais precisão.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
              <span className="font-semibold text-slate-900">
                {filteredAds.length}
              </span>{' '}
              resultados encontrados
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortOption)}
                className="bg-transparent text-sm font-medium text-slate-700 outline-none"
              >
                <option value="recent">Mais recentes</option>
                <option value="low-price">Menor preço</option>
                <option value="high-price">Maior preço</option>
                <option value="views">Mais vistos</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {highlightedAds.length > 0 && (
        <div className="mt-10">
          <HomeAdsCarousel
            title="Destaques da categoria"
            subtitle="Anúncios premium com prioridade de exposição nesta vitrine."
            items={highlightedAds}
            isLoading={isLoading}
            emptyMessage="Nenhum destaque disponível nesta categoria no momento."
            eyebrow="Vitrine premium"
            sectionClassName="pb-2"
            renderItem={(item) => renderHighlightCard(item)}
          />
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 mt-10">
        <div className="mb-5 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Abrir filtros
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="hidden h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:block">
            {filtersContent}
          </aside>

          <section>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Todos os anúncios</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Abaixo ficam os resultados normais, separados da vitrine destacada.
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={`listing-skeleton-${index}`}
                    className="h-[360px] animate-pulse rounded-2xl border border-slate-200 bg-white"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700">
                Não foi possível carregar esta categoria agora. {error}
              </div>
            ) : regularAds.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {regularAds.map((ad) => (
                  <AdCard key={ad.id} ad={ad} highlightDisplayMode="none" />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-8 py-14 text-center">
                <p className="text-lg font-semibold text-slate-800">Nenhum anúncio encontrado</p>
                <p className="mt-2 text-sm text-slate-500">
                  Ajuste os filtros para ampliar a busca ou explore outra categoria.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar filtros"
            onClick={() => setMobileFiltersOpen(false)}
            className="absolute inset-0 bg-slate-950/45"
          />
          <div className="absolute inset-y-0 left-0 w-full max-w-sm overflow-y-auto bg-white p-5 shadow-2xl">
            {filtersContent}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdsListingView;
