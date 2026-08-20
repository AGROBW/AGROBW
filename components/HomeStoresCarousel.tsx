import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLayout } from '../src/contexts/LayoutContext';
import { usePublicSellerStoresCatalog } from '../src/hooks/useSellerStore';

const getStoreInitials = (name: string) => {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'AG';

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
};

const StoreSkeleton = () => (
  <div className="h-36 min-w-[155px] animate-pulse rounded-2xl border border-slate-100 bg-white shadow-sm sm:min-w-[180px]" />
);

const HomeStoresCarousel: React.FC = () => {
  const { stores, isLoading } = usePublicSellerStoresCatalog();
  const { settings } = useLayout();
  const visibleStores = stores.slice(0, 8);

  if (!isLoading && visibleStores.length === 0) {
    return null;
  }

  return (
    <section className="w-full bg-white py-8 lg:py-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: settings.primaryColor }}>
              Marcas presentes no agro
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Lojas Parceiras</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Empresas que vendem com mais presença e uma vitrine própria na AGRO BW.
            </p>
          </div>
          <Link
            to="/lojas-parceiras"
            className="inline-flex items-center gap-2 text-sm font-semibold transition hover:underline"
            style={{ color: settings.primaryColor }}
          >
            Ver todas as lojas
            <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
          </Link>
        </div>

        <div className="mt-8 flex gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {isLoading
            ? Array.from({ length: 7 }).map((_, index) => <StoreSkeleton key={index} />)
            : visibleStores.map((store) => (
                <Link
                  key={store.id}
                  to={`/loja/${store.slug}`}
                  className="group flex h-36 min-w-[155px] flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-4 text-center shadow-[0_18px_45px_-36px_rgba(15,23,42,0.45)] transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-[0_24px_55px_-34px_rgba(15,23,42,0.4)] sm:min-w-[180px]"
                  aria-label={`Abrir loja ${store.storeName}`}
                >
                  {store.logoUrl ? (
                    <img
                      src={store.logoUrl}
                      alt={store.storeName}
                      className="max-h-14 max-w-[118px] object-contain transition duration-300 group-hover:scale-105 sm:max-w-[132px]"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-black text-emerald-700 transition group-hover:bg-emerald-100">
                      {getStoreInitials(store.storeName)}
                    </div>
                  )}
                  <span className="mt-3 line-clamp-2 text-xs font-semibold leading-4 text-slate-700">
                    {store.storeName}
                  </span>
                </Link>
              ))}
        </div>

        <div className="mt-2 flex justify-start">
          <Link
            to="/planos"
            className="inline-flex items-center gap-2 text-sm font-semibold transition hover:underline"
            style={{ color: settings.secondaryColor }}
          >
            Crie hoje sua Loja Parceira
            <ArrowRight className="h-4 w-4" strokeWidth={1.7} />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HomeStoresCarousel;
