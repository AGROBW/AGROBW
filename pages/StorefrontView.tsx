import React, { useMemo, useState } from 'react';
import { Facebook, Instagram, Linkedin, Link as LinkIcon, Search, ShieldCheck, SlidersHorizontal, Store, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import AdCard from '../components/AdCard';
import { usePublicSellerStore } from '../src/hooks/useSellerStore';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatStorePhone = (value?: string | null) => {
  if (!value) return '';

  const digits = value.replace(/\D/g, '');

  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }

  return value;
};

const StorefrontView: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { store, announcements, isLoading, error, locationLabel } = usePublicSellerStore(slug);
  const [searchTerm, setSearchTerm] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [conditionFilter, setConditionFilter] = useState<'all' | 'novo' | 'seminovo' | 'usado'>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'pronta_entrega' | 'sob_encomenda' | 'consultar_estoque'
  >('all');
  const [sortBy, setSortBy] = useState<'recent' | 'price_asc' | 'price_desc' | 'views'>('recent');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const filteredAnnouncements = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const minPriceValue = Number(minPrice.replace(',', '.'));
    const maxPriceValue = Number(maxPrice.replace(',', '.'));

    const filtered = announcements.filter((announcement) => {
      const matchesSearch =
        !normalizedSearch ||
        [announcement.title, announcement.description, announcement.subCategoryLabel]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      const matchesMinPrice = !minPrice || (!Number.isNaN(minPriceValue) && announcement.price >= minPriceValue);
      const matchesMaxPrice = !maxPrice || (!Number.isNaN(maxPriceValue) && announcement.price <= maxPriceValue);
      const matchesCondition = conditionFilter === 'all' || announcement.productCondition === conditionFilter;
      const matchesAvailability = availabilityFilter === 'all' || announcement.availability === availabilityFilter;

      return matchesSearch && matchesMinPrice && matchesMaxPrice && matchesCondition && matchesAvailability;
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'price_asc') return left.price - right.price;
      if (sortBy === 'price_desc') return right.price - left.price;
      if (sortBy === 'views') return (right.views || 0) - (left.views || 0);
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [announcements, availabilityFilter, conditionFilter, maxPrice, minPrice, searchTerm, sortBy]);

  const clearFilters = () => {
    setSearchTerm('');
    setMinPrice('');
    setMaxPrice('');
    setConditionFilter('all');
    setAvailabilityFilter('all');
    setSortBy('recent');
  };

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    minPrice.trim().length > 0 ||
    maxPrice.trim().length > 0 ||
    conditionFilter !== 'all' ||
    availabilityFilter !== 'all' ||
    sortBy !== 'recent';

  const filterPanel = (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-slate-600">
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.9} />
            Filtros
          </span>
          <h3 className="mt-3 text-xl font-black text-slate-900">Refine o catálogo</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Encontre rapidamente os produtos da loja com busca, faixa de preço e detalhes comerciais.
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
            Buscar
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.9} />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Marca, modelo ou palavra-chave"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
            Faixa de preço
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min="0"
              step="0.01"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              placeholder="Mínimo"
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="Máximo"
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
            Condição do item
          </label>
          <select
            value={conditionFilter}
            onChange={(event) => setConditionFilter(event.target.value as 'all' | 'novo' | 'seminovo' | 'usado')}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
          >
            <option value="all">Todas</option>
            <option value="novo">Novo</option>
            <option value="seminovo">Seminovo</option>
            <option value="usado">Usado</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
            Disponibilidade
          </label>
          <select
            value={availabilityFilter}
            onChange={(event) =>
              setAvailabilityFilter(
                event.target.value as 'all' | 'pronta_entrega' | 'sob_encomenda' | 'consultar_estoque'
              )
            }
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
          >
            <option value="all">Todas</option>
            <option value="pronta_entrega">Pronta entrega</option>
            <option value="sob_encomenda">Sob encomenda</option>
            <option value="consultar_estoque">Consultar estoque</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
            Ordenação
          </label>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'recent' | 'price_asc' | 'price_desc' | 'views')}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
          >
            <option value="recent">Mais recentes</option>
            <option value="price_asc">Menor preço</option>
            <option value="price_desc">Maior preço</option>
            <option value="views">Mais vistos</option>
          </select>
        </div>
      </div>
    </div>
  );

  const socialLinks = useMemo(() => {
    if (!store) return [];

    return [
      store.facebookUrl
        ? {
            id: 'facebook',
            label: 'Facebook',
            href: store.facebookUrl,
            icon: Facebook,
            className:
              'border-[#1877F2]/45 bg-[#1877F2]/8 text-[#7db4ff] hover:border-[#1877F2]/75 hover:bg-[#1877F2]/14 hover:text-[#9bc5ff]',
          }
        : null,
      store.instagramUrl
        ? {
            id: 'instagram',
            label: 'Instagram',
            href: store.instagramUrl,
            icon: Instagram,
            className:
              'border-[#E4405F]/45 bg-[#E4405F]/8 text-[#ff8ea2] hover:border-[#E4405F]/75 hover:bg-[#E4405F]/14 hover:text-[#ffadb9]',
          }
        : null,
      store.linkedinUrl
        ? {
            id: 'linkedin',
            label: 'LinkedIn',
            href: store.linkedinUrl,
            icon: Linkedin,
            className:
              'border-[#0A66C2]/45 bg-[#0A66C2]/8 text-[#76b5ff] hover:border-[#0A66C2]/75 hover:bg-[#0A66C2]/14 hover:text-[#96c6ff]',
          }
        : null,
      store.websiteUrl
        ? {
            id: 'site',
            label: 'Site',
            href: store.websiteUrl,
            icon: LinkIcon,
            className:
              'border-emerald-300/35 bg-emerald-300/8 text-emerald-200 hover:border-emerald-200/60 hover:bg-emerald-300/14 hover:text-emerald-100',
          }
        : null,
    ].filter(Boolean) as Array<{
      id: string;
      label: string;
      href: string;
      icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
      className: string;
    }>;
  }, [store]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
        <p className="mt-4 text-sm text-slate-500">Carregando loja...</p>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-3xl font-black text-slate-900">Loja não encontrada</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
          {error || 'A página da loja está indisponível no momento. Confira o endereço informado ou volte para a home da BWAGRO.'}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
        >
          Voltar para a home
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[#f5f7fb] pb-16">
      <section
        className="relative overflow-hidden"
        style={{
          backgroundImage: store.coverUrl
            ? `linear-gradient(90deg, rgba(9, 15, 25, 0.36) 0%, rgba(9, 15, 25, 0.28) 24%, rgba(9, 15, 25, 0.14) 48%, rgba(9, 15, 25, 0.08) 72%, rgba(9, 15, 25, 0.18) 100%), url(${store.coverUrl})`
            : 'linear-gradient(110deg, #f7f7f7 0%, #fff1e9 42%, #ff7a18 100%)',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.02)_36%,rgba(255,255,255,0)_68%)]" />

        <div className="relative min-h-[250px] px-3 py-8 md:min-h-[280px] md:px-0 md:py-10">
          <div className="absolute bottom-2 left-2 w-[calc(100%-1rem)] md:bottom-3 md:left-3 md:w-auto md:max-w-2xl">
            <div className="rounded-r-[1.8rem] rounded-l-[0.35rem] border border-black/10 bg-black/58 p-4 text-white shadow-xl backdrop-blur-md md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="flex h-24 w-28 items-center justify-center overflow-hidden rounded-[1.25rem] bg-white shadow-lg md:w-32">
                    {store.logoUrl ? (
                      <img src={store.logoUrl} alt={store.storeName} className="h-full w-full object-contain p-3" />
                    ) : (
                      <ShieldCheck className="h-10 w-10 text-[#ff7a18]" strokeWidth={1.5} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black text-white md:text-3xl">{store.storeName}</h2>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-emerald-200">
                        <Store className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Loja Oficial
                      </span>
                    </div>
                    {socialLinks.length > 0 ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {socialLinks.map((socialLink) => {
                          const Icon = socialLink.icon;

                          return (
                            <a
                              key={socialLink.id}
                              href={socialLink.href}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={socialLink.label}
                              title={socialLink.label}
                              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${socialLink.className}`}
                            >
                              <Icon className="h-4.5 w-4.5" strokeWidth={1.9} />
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>

              </div>
          </div>
        </div>
      </section>

      <section id="catalogo-loja" className="mx-auto max-w-7xl px-4 pt-10">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.3em] text-emerald-700">
              Catálogo da loja
            </span>
            <h2 className="mt-3 text-3xl font-black text-slate-900">Produtos publicados</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Explore os anúncios ativos da loja com filtros rápidos e uma experiência mais institucional para compradores do agro.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-4 text-sm shadow-sm">
            <span className="text-slate-500">Resultados atuais</span>
            <p className="mt-1 text-2xl font-black text-slate-900">{filteredAnnouncements.length}</p>
          </div>
        </div>

        <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
          <button
            type="button"
            onClick={() => setIsMobileFiltersOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.9} />
            Abrir filtros
            {hasActiveFilters ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-black text-white">
                {[searchTerm, minPrice, maxPrice].filter(Boolean).length +
                  (conditionFilter !== 'all' ? 1 : 0) +
                  (availabilityFilter !== 'all' ? 1 : 0) +
                  (sortBy !== 'recent' ? 1 : 0)}
              </span>
            ) : null}
          </button>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            <span className="font-semibold text-slate-900">{filteredAnnouncements.length}</span> resultados
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
            {filterPanel}
          </aside>

          <div>
            {filteredAnnouncements.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredAnnouncements.map((announcement) => (
                  <AdCard key={announcement.id} ad={announcement} />
                ))}
              </div>
            ) : (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                <h3 className="text-xl font-black text-slate-900">Nenhum anúncio encontrado</h3>
                <p className="mt-3 text-sm text-slate-500">
                  Não encontramos anúncios com esse filtro. Tente ajustar a busca ou trocar a ordenação para explorar melhor o catálogo.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {isMobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar filtros"
            onClick={() => setIsMobileFiltersOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
          />

          <div className="absolute inset-y-0 left-0 flex w-full max-w-sm flex-col bg-[#f5f7fb] p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-lg font-black text-slate-900">Filtros do catálogo</p>
                <p className="mt-1 text-sm text-slate-500">Ajuste sua busca sem apertar a vitrine.</p>
              </div>

              <button
                type="button"
                onClick={() => setIsMobileFiltersOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm"
              >
                <X className="h-4.5 w-4.5" strokeWidth={2} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pb-4">{filterPanel}</div>

            <button
              type="button"
              onClick={() => setIsMobileFiltersOpen(false)}
              className="mt-4 inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700"
            >
              Ver {filteredAnnouncements.length} resultado(s)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StorefrontView;
