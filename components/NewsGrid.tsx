import React from 'react';
import { Link } from 'react-router-dom';
import { Newspaper } from 'lucide-react';
import NewsCard from './NewsCard';
import { useNews } from '../src/hooks/useNews';
import { useLayout } from '../src/contexts/LayoutContext';

const NewsGrid: React.FC = () => {
  const { news, isLoading } = useNews();
  const { settings } = useLayout();

  return (
    <section className="border-y py-16" style={{ borderColor: 'rgba(226,232,240,0.7)', backgroundColor: `color-mix(in srgb, ${settings.backgroundColor} 86%, white)` }}>
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-10 flex flex-col items-center justify-between text-center md:flex-row md:text-left">
          <div>
            <h2 className="flex items-center justify-center gap-2 text-xl font-semibold text-slate-900 md:justify-start">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)`, color: settings.primaryColor }}>
                <Newspaper className="h-4 w-4" strokeWidth={1.5} />
              </span>
              Mural de Informacoes BWAGRO
            </h2>
            <p className="mt-2 max-w-xl text-sm text-slate-500">
              Fique por dentro das principais noticias e tendencias do agronegocio que impactam o seu dia a dia no campo.
            </p>
          </div>
          <Link
            to="/noticias"
            className="mt-6 border-b pb-1 text-sm font-semibold uppercase tracking-widest transition-all md:mt-0"
            style={{ borderColor: settings.secondaryColor, color: settings.secondaryColor }}
          >
            Ver todas as materias
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={`news-skeleton-${index}`} className="h-64 animate-pulse rounded-xl border border-slate-100 bg-white" />
            ))
          ) : news.length === 0 ? (
            <div className="col-span-full rounded-xl border border-slate-100 bg-white p-8 text-center">
              <p className="text-sm text-slate-500">Nenhuma noticia disponivel no momento.</p>
            </div>
          ) : (
            news.map((item) => <NewsCard key={item.id} news={item} />)
          )}
        </div>
      </div>
    </section>
  );
};

export default NewsGrid;
