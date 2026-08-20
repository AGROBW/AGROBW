
import React, { useState } from 'react';
import { ChevronDown, MapPin, Search, Store } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../constants';
import { useLayout } from '../src/contexts/LayoutContext';
import { logPopularSearch, usePopularSearches } from '../src/hooks/usePopularSearches';

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const HeroSearch: React.FC = () => {
  const { settings } = useLayout();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [state, setState] = useState('');
  const { popularSearches } = usePopularSearches();

  const handleSearch = (term?: string) => {
    const searchTerm = (term ?? query).trim();
    const params = new URLSearchParams();

    if (searchTerm) {
      params.set('q', searchTerm);
      void logPopularSearch(searchTerm);
    }

    if (category) params.set('categoria', category);
    if (state) params.set('estado', state);

    const search = params.toString();
    navigate(search ? `/anuncios?${search}` : '/anuncios');
  };

  return (
    <section className="relative z-30 mx-auto w-full max-w-7xl px-4 lg:-mt-24">
      <div
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)]"
      >
        <div className="flex items-center gap-7 border-b border-slate-200 px-5 pt-4 sm:px-7">
          <button
            type="button"
            className="relative flex h-11 items-center gap-2 text-sm font-semibold text-slate-900"
            aria-current="page"
          >
            <Search className="h-4 w-4" strokeWidth={2} />
            Buscar produtos
            <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full" style={{ backgroundColor: settings.primaryColor }} />
          </button>
          <Link
            to="/lojas-parceiras"
            className="flex h-11 items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            <Store className="h-4 w-4" strokeWidth={1.8} />
            Buscar lojas
          </Link>
        </div>

        <div className="p-4 sm:p-6">
          <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-[minmax(0,1.45fr)_minmax(190px,0.75fr)_minmax(170px,0.65fr)_150px]">
            <label className="relative flex min-h-16 items-center border-b border-slate-200 px-4 lg:border-b-0 lg:border-r">
              <Search className="mr-3 h-5 w-5 flex-none text-slate-400" strokeWidth={1.8} />
              <span className="sr-only">Produto procurado</span>
              <input
                type="text"
                placeholder="Trator, colheitadeira, gado, fazenda..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSearch();
                  }
                }}
                className="h-12 w-full border-0 bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
              />
            </label>

            <label className="relative flex min-h-16 items-center border-b border-slate-200 px-4 lg:border-b-0 lg:border-r">
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Categoria</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-1 w-full appearance-none border-0 bg-transparent p-0 pr-6 text-sm font-semibold text-slate-700 outline-none focus:ring-0"
                >
                  <option value="">Todas as categorias</option>
                  {CATEGORIES.map((item) => (
                    <option key={item.id} value={item.slug}>{item.name}</option>
                  ))}
                </select>
              </span>
              <ChevronDown className="pointer-events-none h-4 w-4 text-slate-400" strokeWidth={1.8} />
            </label>

            <label className="relative flex min-h-16 items-center border-b border-slate-200 px-4 lg:border-b-0 lg:border-r">
              <MapPin className="mr-3 h-5 w-5 flex-none text-slate-400" strokeWidth={1.8} />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Localização</span>
                <select
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                  className="mt-1 w-full appearance-none border-0 bg-transparent p-0 pr-6 text-sm font-semibold text-slate-700 outline-none focus:ring-0"
                >
                  <option value="">Todo o Brasil</option>
                  {BRAZILIAN_STATES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </span>
              <ChevronDown className="pointer-events-none h-4 w-4 text-slate-400" strokeWidth={1.8} />
            </label>

            <div className="p-2.5">
              <button
                type="button"
                onClick={() => handleSearch()}
                className="flex h-full min-h-11 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-bold text-white transition hover:brightness-95"
                style={{ backgroundColor: settings.primaryColor }}
              >
                Buscar
                <Search className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </div>
          </div>

          {popularSearches.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Buscas populares</span>
              {popularSearches.slice(0, 7).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleSearch(tag)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export default HeroSearch;
