import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, SlidersHorizontal, Store, X } from 'lucide-react';
import { usePublicSellerStoresCatalog } from '../src/hooks/useSellerStore';

const sortOptions = {
  recent: 'Mais recentes',
  name: 'Nome da loja',
  ads_desc: 'Mais anúncios',
  highlighted_desc: 'Mais destaques',
} as const;

type SortKey = keyof typeof sortOptions;

const conditionLabels: Record<string, string> = {
  novo: 'Novo',
  seminovo: 'Seminovo',
  usado: 'Usado',
};

const availabilityLabels: Record<string, string> = {
  pronta_entrega: 'Pronta entrega',
  sob_encomenda: 'Sob encomenda',
  consultar_estoque: 'Consultar estoque',
};

const PartnerStoresView: React.FC = () => {
  const { stores, isLoading, error } = usePublicSellerStoresCatalog();
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [conditionFilter, setConditionFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [onlyWithAds, setOnlyWithAds] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('recent');

  const stateOptions = useMemo(() => {
    return Array.from(
      new Set(stores.map((store) => store.state?.trim()).filter((value): value is string => Boolean(value)))
    ).sort((left, right) => left.localeCompare(right, 'pt-BR'));
  }, [stores]);

  const categoryOptions = useMemo(() => {
    const categories = new Map<string, string>();
    stores.forEach((store) => {
      store.categoryGroups.forEach((category) => categories.set(category.slug, category.name));
    });

    return Array.from(categories.entries())
      .map(([slug, name]) => ({ slug, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [stores]);

  const conditionOptions = useMemo(() => {
    return Array.from(new Set(stores.flatMap((store) => store.productConditions))).sort((left, right) =>
      (conditionLabels[left] || left).localeCompare(conditionLabels[right] || right, 'pt-BR')
    );
  }, [stores]);

  const availabilityOptions = useMemo(() => {
    return Array.from(new Set(stores.flatMap((store) => store.availabilityOptions))).sort((left, right) =>
      (availabilityLabels[left] || left).localeCompare(availabilityLabels[right] || right, 'pt-BR')
    );
  }, [stores]);

  const filteredStores = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filtered = stores.filter((store) => {
      const matchesSearch =
        !normalizedSearch ||
        [store.storeName, store.city, store.state]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      const matchesState = stateFilter === 'all' || store.state === stateFilter;
      const matchesCategory =
        categoryFilter === 'all' || store.categoryGroups.some((category) => category.slug === categoryFilter);
      const matchesCondition = conditionFilter === 'all' || store.productConditions.includes(conditionFilter);
      const matchesAvailability =
        availabilityFilter === 'all' || store.availabilityOptions.includes(availabilityFilter);
      const matchesActiveAds = !onlyWithAds || store.activeAdsCount > 0;

      return (
        matchesSearch &&
        matchesState &&
        matchesCategory &&
        matchesCondition &&
        matchesAvailability &&
        matchesActiveAds
      );
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'name') return left.storeName.localeCompare(right.storeName, 'pt-BR');
      if (sortBy === 'ads_desc') return right.activeAdsCount - left.activeAdsCount;
      if (sortBy === 'highlighted_desc') return right.highlightedAdsCount - left.highlightedAdsCount;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [availabilityFilter, categoryFilter, conditionFilter, onlyWithAds, searchTerm, sortBy, stateFilter, stores]);

  const clearFilters = () => {
    setSearchTerm('');
    setStateFilter('all');
    setCategoryFilter('all');
    setConditionFilter('all');
    setAvailabilityFilter('all');
    setOnlyWithAds(false);
    setSortBy('recent');
  };

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    stateFilter !== 'all' ||
    categoryFilter !== 'all' ||
    conditionFilter !== 'all' ||
    availabilityFilter !== 'all' ||
    onlyWithAds ||
    sortBy !== 'recent';

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <section className="relative overflow-hidden bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.22),transparent_34%),linear-gradient(135deg,#082f49_0%,#0f172a_45%,#020617_100%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-14">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.28em] text-emerald-200">
              <Store className="h-4 w-4" strokeWidth={1.6} />
              Lojas Parceiras
            </span>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-white md:text-5xl">
              Presença Profissional no Agro
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              Explore lojas com presença institucional, catálogo organizado e identidade própria, tudo para apresentar
              produtos com mais credibilidade e profissionalismo.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-slate-600">
                    <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.9} />
                    Filtros
                  </span>
                  <h2 className="mt-3 text-xl font-black text-slate-900">Explore as lojas</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Busque por empresa e refine por estado, categoria e perfil dos anúncios para encontrar parceiros
                    mais próximos do seu negócio.
                  </p>
                </div>

                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                    Limpar
                  </button>
                ) : null}
              </div>

              <div className="mt-6 space-y-5">
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                    Buscar loja
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      strokeWidth={1.9}
                    />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Nome, cidade ou estado"
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                    Estado
                  </label>
                  <select
                    value={stateFilter}
                    onChange={(event) => setStateFilter(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
                  >
                    <option value="all">Todos</option>
                    {stateOptions.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                    Categoria
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
                  >
                    <option value="all">Todas</option>
                    {categoryOptions.map((category) => (
                      <option key={category.slug} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                    Condição do item
                  </label>
                  <select
                    value={conditionFilter}
                    onChange={(event) => setConditionFilter(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
                  >
                    <option value="all">Todas</option>
                    {conditionOptions.map((condition) => (
                      <option key={condition} value={condition}>
                        {conditionLabels[condition] || condition}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                    Disponibilidade
                  </label>
                  <select
                    value={availabilityFilter}
                    onChange={(event) => setAvailabilityFilter(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
                  >
                    <option value="all">Todas</option>
                    {availabilityOptions.map((availability) => (
                      <option key={availability} value={availability}>
                        {availabilityLabels[availability] || availability}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  <span>Somente lojas com anúncios ativos</span>
                  <input
                    type="checkbox"
                    checked={onlyWithAds}
                    onChange={(event) => setOnlyWithAds(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </label>

                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                    Ordenação
                  </label>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as SortKey)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
                  >
                    {Object.entries(sortOptions).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <div className="flex flex-col gap-3 rounded-[2rem] border border-slate-200 bg-white px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700">Curadoria AGRO BW</p>
                <p className="mt-1 text-sm text-slate-500">
                  Vitrines institucionais prontas para concentrar anúncios, marca e presença comercial.
                </p>
              </div>
              <div className="text-sm text-slate-500">
                Exibindo <span className="font-black text-slate-900">{filteredStores.length}</span> loja(s)
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,210px))] justify-start gap-5">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="animate-pulse space-y-4">
                      <div className="h-36 rounded-[1.5rem] bg-slate-100" />
                      <div className="h-5 w-2/3 rounded bg-slate-100" />
                      <div className="h-4 w-1/2 rounded bg-slate-100" />
                      <div className="h-10 rounded-2xl bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-[2rem] border border-red-100 bg-red-50 px-6 py-8 text-sm text-red-700 shadow-sm">
                Não foi possível carregar as lojas parceiras agora. {error}
              </div>
            ) : filteredStores.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,210px))] justify-start gap-5">
                {filteredStores.map((store) => (
                  <Link
                    key={store.id}
                    to={`/loja/${store.slug}`}
                    className="group flex w-[210px] flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg"
                  >
                    <div className="flex h-[170px] items-center justify-center overflow-hidden rounded-[1.25rem] border border-slate-100 bg-[radial-gradient(circle_at_top,#ffffff_0%,#f8fafc_55%,#eef2f7_100%)] p-5">
                      {store.logoUrl ? (
                        <div className="flex h-full w-full items-center justify-center rounded-[1rem] bg-white/80 p-4">
                          <img
                            src={store.logoUrl}
                            alt={store.storeName}
                            className="h-full w-full max-h-[96px] max-w-[150px] object-contain object-center transition duration-300 group-hover:scale-[1.03]"
                          />
                        </div>
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-[1.25rem] bg-slate-100 text-slate-400">
                          <Store className="h-10 w-10" strokeWidth={1.6} />
                        </div>
                      )}
                    </div>

                    <div className="mt-4 text-center">
                      <h3 className="text-sm font-medium text-slate-500 transition group-hover:text-slate-700">
                        {store.storeName}
                      </h3>
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                        {store.activeAdsCount > 0 ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                            {store.activeAdsCount} anúncio{store.activeAdsCount > 1 ? 's' : ''}
                          </span>
                        ) : null}
                        {store.categoryGroups.slice(0, 1).map((category) => (
                          <span
                            key={category.slug}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500"
                          >
                            {category.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                <h3 className="text-xl font-black text-slate-900">Nenhuma loja encontrada</h3>
                <p className="mt-3 text-sm text-slate-500">
                  Tente ajustar a busca ou remover os filtros para explorar todas as vitrines parceiras.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default PartnerStoresView;
