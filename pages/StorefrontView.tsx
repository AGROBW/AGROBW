import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Facebook, Link as LinkIcon, Mail, MessageCircle, Search, Share2, ShieldCheck, SlidersHorizontal, Store, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import AdCard from '../components/AdCard';
import SeoHead from '../components/SeoHead';
import StructuredData from '../components/StructuredData';
import { usePublicSellerStore } from '../src/hooks/useSellerStore';
import { useAuth } from '../src/contexts/AuthContext';
import { buildAbsoluteSiteUrl } from '../src/lib/siteConfig';

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
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [conditionFilter, setConditionFilter] = useState<'all' | 'novo' | 'seminovo' | 'usado'>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'pronta_entrega' | 'sob_encomenda' | 'consultar_estoque'
  >('all');
  const [sortBy, setSortBy] = useState<'store_order' | 'recent' | 'price_asc' | 'price_desc' | 'views'>('store_order');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isShareOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(event.target as Node)) {
        setIsShareOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsShareOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isShareOpen]);

  const categoryOptions = useMemo(() => {
    const options = new Map<string, string>();

    announcements.forEach((announcement) => {
      const slug = announcement.categorySlug?.trim() || announcement.categoryId?.trim();
      if (!slug) return;

      const label = announcement.subCategoryLabel?.trim() || slug.replace(/[-_]+/g, ' ');
      options.set(slug, label);
    });

    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
  }, [announcements]);

  const filteredAnnouncements = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const minPriceValue = Number(minPrice.replace(',', '.'));
    const maxPriceValue = Number(maxPrice.replace(',', '.'));

    const filtered = announcements.filter((announcement) => {
      const matchesSearch =
        !normalizedSearch ||
        [announcement.title, announcement.description, announcement.subCategoryLabel, announcement.categorySlug]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      const announcementCategory = announcement.categorySlug || announcement.categoryId;
      const matchesCategory = categoryFilter === 'all' || announcementCategory === categoryFilter;
      const matchesMinPrice = !minPrice || (!Number.isNaN(minPriceValue) && announcement.price >= minPriceValue);
      const matchesMaxPrice = !maxPrice || (!Number.isNaN(maxPriceValue) && announcement.price <= maxPriceValue);
      const matchesCondition = conditionFilter === 'all' || announcement.productCondition === conditionFilter;
      const matchesAvailability = availabilityFilter === 'all' || announcement.availability === availabilityFilter;

      return matchesSearch && matchesCategory && matchesMinPrice && matchesMaxPrice && matchesCondition && matchesAvailability;
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'store_order') {
        const leftOrder = left.storeDisplayOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.storeDisplayOrder ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      }
      if (sortBy === 'price_asc') return left.price - right.price;
      if (sortBy === 'price_desc') return right.price - left.price;
      if (sortBy === 'views') return (right.views || 0) - (left.views || 0);
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [announcements, availabilityFilter, categoryFilter, conditionFilter, maxPrice, minPrice, searchTerm, sortBy]);

  const clearFilters = () => {
    setSearchTerm('');
    setMinPrice('');
    setMaxPrice('');
    setCategoryFilter('all');
    setConditionFilter('all');
    setAvailabilityFilter('all');
    setSortBy('store_order');
  };

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    minPrice.trim().length > 0 ||
    maxPrice.trim().length > 0 ||
    categoryFilter !== 'all' ||
    conditionFilter !== 'all' ||
    availabilityFilter !== 'all' ||
    sortBy !== 'store_order';

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
            Categoria
          </label>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
          >
            <option value="all">Todas</option>
            {categoryOptions.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
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
            onChange={(event) => setSortBy(event.target.value as 'store_order' | 'recent' | 'price_asc' | 'price_desc' | 'views')}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
          >
            <option value="store_order">Ordem da loja</option>
            <option value="recent">Mais recentes</option>
            <option value="price_asc">Menor preço</option>
            <option value="price_desc">Maior preço</option>
            <option value="views">Mais vistos</option>
          </select>
        </div>
      </div>
    </div>
  );

  const shareUrl = useMemo(
    () => (store ? buildAbsoluteSiteUrl(`/loja/${store.slug}`) : ''),
    [store],
  );
  const shareTitle = store ? `${store.storeName} | Loja Parceira AGRO BW` : '';

  const shareTargets = useMemo(() => {
    if (!store || !shareUrl) return [];

    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedTitle = encodeURIComponent(shareTitle);

    return [
      store.websiteUrl
        ? { id: 'site', label: 'Site da loja', href: store.websiteUrl, icon: LinkIcon, color: '#16a34a' }
        : null,
      { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, icon: Facebook, color: '#1877F2' },
      { id: 'x', label: 'X', href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`, icon: X, color: '#0f172a' },
      { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`, icon: MessageCircle, color: '#25D366' },
      { id: 'email', label: 'E-mail', href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`, icon: Mail, color: '#64748b' },
    ].filter(Boolean) as Array<{
      id: string;
      label: string;
      href: string;
      icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
      color: string;
    }>;
  }, [store, shareUrl, shareTitle]);

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setShareCopied(false);
    }
  };

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
        <SeoHead
          title="Loja nao encontrada"
          description="A loja parceira solicitada nao esta disponivel na AGRO BW."
          canonicalPath={slug ? `/loja/${slug}` : '/lojas-parceiras'}
          noIndex
        />
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

  const storeSummaryCard = (
    <div className="rounded-[1.8rem] border border-[#f59e0b]/20 bg-[#0f172a]/94 p-4 text-white shadow-xl shadow-[#0f172a]/30 backdrop-blur-md md:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex h-24 w-28 items-center justify-center overflow-hidden rounded-[1.25rem] bg-white shadow-lg md:w-32">
            {store.logoUrl ? (
              <img src={store.logoUrl} alt={store.storeName} decoding="async" className="h-full w-full object-contain p-3" />
            ) : (
              <ShieldCheck className="h-10 w-10 text-[#ff7a18]" strokeWidth={1.5} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-black text-white md:text-3xl">{store.storeName}</h2>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              <span className="inline-flex whitespace-nowrap items-center gap-1.5 rounded-full border border-[#16a34a]/35 bg-[#16a34a]/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#bbf7d0]">
                <Store className="h-3 w-3" strokeWidth={1.5} />
                Loja Parceira
              </span>
            </div>
            <div className="relative mt-4 inline-block" ref={shareRef}>
              <button
                type="button"
                onClick={() => setIsShareOpen((prev) => !prev)}
                aria-haspopup="true"
                aria-expanded={isShareOpen}
                className="inline-flex items-center gap-2 rounded-full border border-[#16a34a]/40 bg-[#16a34a] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#15803d]"
              >
                <Share2 className="h-4 w-4" strokeWidth={2} />
                Compartilhar
              </button>

              {isShareOpen ? (
                <div className="absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2">
                  <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-2 py-2 shadow-xl shadow-black/15">
                    {shareTargets.map((target) => {
                      const Icon = target.icon;

                      return (
                        <a
                          key={target.id}
                          href={target.href}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={target.label}
                          title={target.label}
                          onClick={() => setIsShareOpen(false)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-slate-100"
                          style={{ color: target.color }}
                        >
                          <Icon className="h-5 w-5" strokeWidth={2} />
                        </a>
                      );
                    })}

                    <span className="mx-0.5 h-6 w-px bg-slate-200" aria-hidden="true" />

                    <button
                      type="button"
                      onClick={handleCopyShareLink}
                      aria-label={shareCopied ? 'Link copiado' : 'Copiar link'}
                      title={shareCopied ? 'Link copiado' : 'Copiar link'}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
                      style={shareCopied ? { color: '#16a34a' } : undefined}
                    >
                      {shareCopied ? <Check className="h-5 w-5" strokeWidth={2.4} /> : <Copy className="h-5 w-5" strokeWidth={2} />}
                    </button>
                  </div>
                  <div className="absolute left-1/2 top-full -mt-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white" aria-hidden="true" />
                </div>
              ) : null}
            </div>

          </div>
        </div>
      </div>
    </div>
  );

  const storefrontDescription =
    store.description?.trim() ||
    `Conheca a loja ${store.storeName}, veja anuncios disponiveis e negocie oportunidades no agronegocio pela AGRO BW.`;

  const storefrontStructuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Início',
          item: buildAbsoluteSiteUrl('/'),
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Lojas parceiras',
          item: buildAbsoluteSiteUrl('/lojas-parceiras'),
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: store.storeName,
          item: buildAbsoluteSiteUrl(`/loja/${store.slug}`),
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: store.storeName,
      description: storefrontDescription,
      url: buildAbsoluteSiteUrl(`/loja/${store.slug}`),
      image: store.coverUrl || store.logoUrl || undefined,
      telephone: store.whatsapp || undefined,
    },
  ];

  return (
    <div className="bg-[#f5f7fb] pb-16">
      <SeoHead
        title={`${store.storeName} | Loja parceira`}
        description={storefrontDescription.slice(0, 160)}
        canonicalPath={`/loja/${store.slug}`}
        image={store.coverUrl || store.logoUrl || null}
      />
      <StructuredData id="storefront" data={storefrontStructuredData} />
      <section
        className="relative overflow-hidden"
        style={{
          backgroundImage: store.coverUrl
            ? `linear-gradient(90deg, rgba(9, 15, 25, 0.36) 0%, rgba(9, 15, 25, 0.28) 24%, rgba(9, 15, 25, 0.14) 48%, rgba(9, 15, 25, 0.08) 72%, rgba(9, 15, 25, 0.18) 100%), url(${store.coverUrl})`
            : 'linear-gradient(110deg, #f7f7f7 0%, #fff1e9 42%, #ff7a18 100%)',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: `${typeof store.coverPositionX === 'number' ? store.coverPositionX : 50}% ${typeof store.coverPositionY === 'number' ? store.coverPositionY : 50}%`,
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.02)_36%,rgba(255,255,255,0)_68%)]" />

        <div className="relative h-[240px] px-3 md:px-0" />
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
            <div className="space-y-5">
              {storeSummaryCard}
              {filterPanel}
            </div>
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

            <div className="flex-1 overflow-y-auto pb-4 space-y-4">
              {storeSummaryCard}
              {filterPanel}
            </div>

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
