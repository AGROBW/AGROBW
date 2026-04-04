import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useCategoryCounts } from '../src/hooks/useCategoryCounts';
import { getCategoryIconComponent } from '../src/lib/categoryVisuals';
import { CATEGORY_HIERARCHY } from '../src/lib/categoryHierarchy';

const CategoriesView: React.FC = () => {
  const { getCountForCategory } = useCategoryCounts();

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="mb-8 border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-400">
            <Link to="/" className="transition-colors hover:text-green-700">
              Inicio
            </Link>
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            <span className="font-semibold text-slate-900">Categorias</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Explore o <span className="text-green-700">Mercado Rural</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
            Encontre tudo o que voce precisa navegando por nossas categorias especializadas. Conectamos
            vendedores e compradores em todos os setores do agronegocio.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORY_HIERARCHY.map((categoryGroup) => {
            const Icon = getCategoryIconComponent(undefined, categoryGroup.slug);
            const visibleSubcategories = categoryGroup.children.slice(0, 6);

            return (
              <div
                key={categoryGroup.slug}
                className="group flex min-h-[360px] flex-col overflow-hidden rounded-[1.35rem] border border-slate-100 bg-white px-5 py-5 transition-all duration-300"
              >
                <div className="pb-3">
                  <div className="mb-5 flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-700 transition-colors duration-300 group-hover:bg-green-50 group-hover:text-green-700">
                      <Icon className="h-6 w-6" strokeWidth={1.5} />
                    </div>
                    <span className="rounded-xl bg-green-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-green-700">
                      {getCountForCategory(categoryGroup.slug)} Anuncios
                    </span>
                  </div>
                  <h2 className="mb-2 text-[1.02rem] font-semibold text-slate-900 transition-colors group-hover:text-green-700">
                    {categoryGroup.name}
                  </h2>
                  <div className="h-1 w-8 rounded-full bg-green-600 transition-all duration-300 group-hover:w-12" />
                </div>

                <div className="flex-grow">
                  <ul className="mt-4 space-y-3">
                    {visibleSubcategories.map((subcategory) => (
                      <li key={subcategory.slug}>
                        <Link
                          to={`/anuncios?categoria=${categoryGroup.slug}&subcategoria=${subcategory.slug}`}
                          className="group/item flex items-center justify-between py-0.5 text-[0.96rem] font-medium text-slate-600 hover:text-green-700"
                        >
                          {subcategory.name}
                          <ChevronRight
                            className="-translate-x-2 h-4 w-4 opacity-0 transition-all group-hover/item:translate-x-0 group-hover/item:opacity-100"
                            strokeWidth={1.5}
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-5">
                  <Link
                    to={`/anuncios?categoria=${categoryGroup.slug}`}
                    className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 text-center text-sm font-semibold text-white transition-all hover:bg-green-700"
                  >
                    Ver Tudo em {categoryGroup.name}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative mt-12 flex flex-col items-center justify-between gap-6 overflow-hidden rounded-xl bg-green-900 p-6 md:flex-row">
          <div className="absolute right-0 top-0 h-full w-1/4 translate-x-10 skew-x-12 bg-white/5" />
          <div className="relative z-10 max-w-xl text-center text-white md:text-left">
            <h3 className="mb-3 text-xl font-semibold">Nao encontrou o que procurava?</h3>
            <p className="text-sm text-green-100 opacity-90">
              Nossa equipe esta pronta para ajudar voce a encontrar o animal, maquina ou insumo ideal
              para sua producao.
            </p>
          </div>
          <div className="relative z-10 flex w-full gap-4 md:w-auto">
            <button className="h-10 flex-grow rounded-lg bg-white px-6 font-semibold text-green-900 transition-all hover:bg-green-50 md:flex-grow-0">
              Falar com Consultor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoriesView;
