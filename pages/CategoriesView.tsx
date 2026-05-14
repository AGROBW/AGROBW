import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { useCategoryCounts } from '../src/hooks/useCategoryCounts';
import { useCategoryGroupImages } from '../src/hooks/useCategoryGroupImages';
import { getCategoryIconComponent } from '../src/lib/categoryVisuals';
import { CATEGORY_HIERARCHY } from '../src/lib/categoryHierarchy';
import { useLayout } from '../src/contexts/LayoutContext';
import SeoHead from '../components/SeoHead';
import StructuredData from '../components/StructuredData';
import { buildAbsoluteSiteUrl } from '../src/lib/siteConfig';

const CATEGORY_IMAGES: Record<string, string> = {
  animais:  'https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=800&q=80',
  maquinas: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=800&q=80',
  insumos:  'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80',
  imoveis:  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80',
  servicos: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=80',
  sementes: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=800&q=80',
};

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=800&q=80';

const CategoriesView: React.FC = () => {
  const { getCountForCategory } = useCategoryCounts();
  const { settings } = useLayout();
  const { images: groupImages, isLoading: groupImagesLoading } = useCategoryGroupImages();

  const totalAds = CATEGORY_HIERARCHY.reduce(
    (sum, cat) => sum + (getCountForCategory(cat.slug) || 0),
    0,
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <SeoHead
        title="Categorias do marketplace rural"
        description="Explore categorias do agronegócio, encontre anúncios por setor e descubra oportunidades no mercado rural."
        canonicalPath="/categorias"
      />
      <StructuredData
        id="categories-breadcrumb"
        data={[
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
                name: 'Categorias',
                item: buildAbsoluteSiteUrl('/categorias'),
              },
            ],
          },
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Categorias do marketplace rural',
            url: buildAbsoluteSiteUrl('/categorias'),
            description: 'Explore categorias do agronegócio e navegue por anúncios rurais.',
          },
        ]}
      />
      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ backgroundColor: settings.secondaryColor }}>
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1800&q=80"
            alt="Agro"
            className="h-full w-full object-cover opacity-20"
          />
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${settings.secondaryColor}f0 0%, ${settings.secondaryColor}cc 100%)` }} />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-16">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-400">
            <Link to="/" className="transition-colors hover:text-white">Início</Link>
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            <span className="font-semibold text-white">Categorias</span>
          </div>
          <div className="max-w-2xl">
            <span
              className="mb-4 inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.28em]"
              style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 18%, transparent)`, color: settings.primaryColor, border: `1px solid color-mix(in srgb, ${settings.primaryColor} 30%, transparent)` }}
            >
              Marketplace Agro
            </span>
            <h1 className="text-4xl font-black leading-tight text-white md:text-5xl">
              Explore o<br />
              <span style={{ color: settings.primaryColor }}>Mercado Rural</span>
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Conectamos vendedores e compradores em todos os setores do agronegócio brasileiro.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
                <p className="text-2xl font-black text-white">{totalAds.toLocaleString('pt-BR')}</p>
                <p className="text-xs font-semibold text-slate-400">anúncios ativos</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
                <p className="text-2xl font-black text-white">{CATEGORY_HIERARCHY.length}</p>
                <p className="text-xs font-semibold text-slate-400">categorias</p>
              </div>
            </div>
          </div>
        </div>
        {/* wave */}
        <div className="relative h-12 w-full">
          <svg viewBox="0 0 1440 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none" style={{ height: 48 }}>
            <path d="M0 48L1440 48L1440 0C1440 0 1080 48 720 48C360 48 0 0 0 0L0 48Z" fill="#f8fafc" />
          </svg>
        </div>
      </section>

      {/* ── GRID DE CATEGORIAS ────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-10">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORY_HIERARCHY.map((categoryGroup) => {
            const Icon = getCategoryIconComponent(undefined, categoryGroup.slug);
            const count = getCountForCategory(categoryGroup.slug) || 0;
            const adminImageUrl = groupImages[categoryGroup.slug];
            const fallbackImageUrl = CATEGORY_IMAGES[categoryGroup.slug] || FALLBACK_IMAGE;
            const imgUrl = adminImageUrl || (!groupImagesLoading ? fallbackImageUrl : null);
            const visibleSubcategories = categoryGroup.children.slice(0, 5);

            return (
              <div
                key={categoryGroup.slug}
                className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_4px_24px_-8px_rgba(15,23,42,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_56px_-16px_rgba(15,23,42,0.2)]"
              >
                {/* imagem de capa */}
                <div className="relative h-44 overflow-hidden">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={categoryGroup.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full animate-pulse bg-[linear-gradient(135deg,#dbeafe_0%,#dcfce7_45%,#e2e8f0_100%)]" />
                  )}
                  {/* overlay gradiente */}
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(180deg, transparent 20%, ${settings.secondaryColor}dd 100%)` }}
                  />
                  {/* ícone + badge no topo */}
                  <div className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/15 backdrop-blur-sm">
                    <Icon className="h-5 w-5 text-white" strokeWidth={1.5} />
                  </div>
                  <span
                    className="absolute right-4 top-4 rounded-xl px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-sm"
                    style={{ backgroundColor: count > 0 ? settings.primaryColor : 'rgba(100,116,139,0.7)' }}
                  >
                    {count} {count === 1 ? 'anúncio' : 'anúncios'}
                  </span>
                  {/* nome da categoria sobre a imagem */}
                  <div className="absolute bottom-4 left-4">
                    <h2 className="text-xl font-black text-white drop-shadow-sm">{categoryGroup.name}</h2>
                    <div className="mt-1.5 h-0.5 w-8 rounded-full" style={{ backgroundColor: settings.primaryColor }} />
                  </div>
                </div>

                {/* subcategorias */}
                <div className="flex flex-grow flex-col px-5 pb-5 pt-4">
                  <ul className="flex-grow space-y-1">
                    {visibleSubcategories.map((subcategory) => (
                      <li key={subcategory.slug}>
                        <Link
                          to={`/anuncios?categoria=${categoryGroup.slug}&subcategoria=${subcategory.slug}`}
                          className="group/item flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900"
                        >
                          <span>{subcategory.name}</span>
                          <ChevronRight
                            className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover/item:translate-x-0 group-hover/item:opacity-100"
                            strokeWidth={1.5}
                            style={{ color: settings.primaryColor }}
                          />
                        </Link>
                      </li>
                    ))}
                    {categoryGroup.children.length > 5 && (
                      <li className="px-3 pt-1 text-xs font-semibold text-slate-400">
                        +{categoryGroup.children.length - 5} subcategorias
                      </li>
                    )}
                  </ul>

                  <Link
                    to={`/anuncios?categoria=${categoryGroup.slug}`}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white transition-all hover:opacity-90"
                    style={{ backgroundColor: settings.primaryColor }}
                  >
                    Ver tudo em {categoryGroup.name}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── CTA BOTTOM ─────────────────────────────────────── */}
        <div className="relative mt-12 overflow-hidden rounded-[2rem]" style={{ backgroundColor: settings.secondaryColor }}>
          <div className="absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=1400&q=80"
              alt=""
              className="h-full w-full object-cover opacity-15"
            />
          </div>
          <div className="relative flex flex-col items-center justify-between gap-6 px-8 py-10 md:flex-row">
            <div className="max-w-xl text-center md:text-left">
              <p className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: settings.primaryColor }}>Precisa de ajuda?</p>
              <h3 className="mt-2 text-2xl font-black text-white">Não encontrou o que procurava?</h3>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                Nossa equipe está pronta para ajudar você a encontrar o animal, máquina ou insumo ideal para sua produção.
              </p>
            </div>
            <Link
              to="/contato"
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-2xl px-7 py-3.5 text-sm font-black text-white transition hover:opacity-90"
              style={{ backgroundColor: settings.primaryColor }}
            >
              Falar com Consultor <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoriesView;
