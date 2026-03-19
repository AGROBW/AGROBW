import React from 'react';
import { Link } from 'react-router-dom';
import { Newspaper } from 'lucide-react';
import NewsCard from './NewsCard';
import { useNews } from '../src/hooks/useNews';

const NewsGrid: React.FC = () => {
  const { news, isLoading } = useNews();

  return (
    <section className="border-y border-slate-200/40 bg-slate-50/50 py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-10 flex flex-col items-center justify-between text-center md:flex-row md:text-left">
          <div>
            <h2 className="flex items-center justify-center gap-2 text-xl font-semibold text-slate-900 md:justify-start">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100 text-green-700">
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
            className="mt-6 border-b border-slate-900 pb-1 text-sm font-semibold uppercase tracking-widest text-slate-900 transition-all hover:border-green-700 hover:text-green-700 md:mt-0"
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
