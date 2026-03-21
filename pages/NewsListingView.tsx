import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useNews } from '../src/hooks/useNews';
import { useLayout } from '../src/contexts/LayoutContext';

const NewsListingView: React.FC = () => {
  const { news, isLoading } = useNews();
  const { settings } = useLayout();

  return (
    <div className="min-h-screen bg-slate-50 py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-10">
          <p className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: settings.primaryColor }}>Noticias BWAGRO</p>
          <h1 className="mt-3 text-4xl font-black text-slate-900">Mural de Informacoes do Agro</h1>
          <p className="mt-3 max-w-2xl text-slate-500">
            Leia analises, tendencias e noticias publicadas com foco no agronegocio brasileiro.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-72 animate-pulse rounded-2xl border border-slate-100 bg-white" />
            ))
          ) : news.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
              Nenhuma materia publicada no momento.
            </div>
          ) : (
            news.map((item) => (
              <Link
                key={item.id}
                to={item.link.replace(/^#/, '')}
                className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all hover:-translate-y-1"
              >
                <div className="h-48 bg-slate-100">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="p-6">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{item.category}</p>
                  <h2 className="mt-3 text-xl font-black text-slate-900">{item.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">{item.summary}</p>
                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-bold" style={{ color: settings.primaryColor }}>
                    Ler materia
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default NewsListingView;
