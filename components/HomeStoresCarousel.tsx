import React from 'react';
import { ArrowRight, Store } from 'lucide-react';
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
  <div className="h-28 min-w-[150px] animate-pulse rounded-2xl border border-slate-100 bg-white shadow-sm sm:min-w-[170px]" />
);

const HomeStoresCarousel: React.FC = () => {
  const { stores, isLoading } = usePublicSellerStoresCatalog();
  const { settings } = useLayout();
  const visibleStores = stores.slice(0, 10);

  if (!isLoading && visibleStores.length === 0) {
    return null;
  }

  return (
    <section className="w-full bg-white py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.32em] text-slate-400">
            Lojas parceiras
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
            Empresas que já estão vendendo com vitrine própria
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            Conheça lojas ativas da plataforma e veja marcas que já posicionam seus produtos com mais presença na AGRO BW.
          </p>
        </div>

        <div className="mt-10 flex gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {isLoading
            ? Array.from({ length: 7 }).map((_, index) => <StoreSkeleton key={index} />)
            : visibleStores.map((store) => (
                <Link
                  key={store.id}
                  to={`/loja/${store.slug}`}
                  className="group flex h-28 min-w-[150px] items-center justify-center rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_16px_45px_-35px_rgba(15,23,42,0.4)] transition hover:-translate-y-1 hover:border-slate-200 hover:shadow-[0_24px_55px_-35px_rgba(15,23,42,0.42)] sm:min-w-[170px]"
                  aria-label={`Abrir loja ${store.storeName}`}
                >
                  {store.logoUrl ? (
                    <img
                      src={store.logoUrl}
                      alt={store.storeName}
                      className="max-h-16 max-w-[120px] object-contain opacity-75 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0 sm:max-w-[132px]"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-sm font-black text-slate-500 transition group-hover:text-slate-900">
                      {getStoreInitials(store.storeName)}
                    </div>
                  )}
                </Link>
              ))}

          {!isLoading && visibleStores.length > 0 ? (
            <Link
              to="/lojas-parceiras"
              className="group flex h-28 min-w-[150px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 text-sm font-bold transition hover:border-slate-300 hover:bg-white sm:min-w-[170px]"
              style={{ color: settings.primaryColor }}
            >
              <span className="inline-flex items-center gap-2">
                Ver mais
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" strokeWidth={1.8} />
              </span>
            </Link>
          ) : null}
        </div>

        <div className="mt-4 flex justify-center">
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
