import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { CATEGORIES } from '../constants';
import { supabase } from '../src/lib/supabaseClient';
import { getGroupCategorySlugs } from '../src/lib/categoryHierarchy';

const CategoriesView: React.FC = () => {
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

  const groupedCategorySlugs = useMemo<Record<string, string[]>>(
    () => ({
      animais: getGroupCategorySlugs('animais'),
      'maquinas-equipamentos': getGroupCategorySlugs('maquinas-equipamentos'),
      'fertilizantes-agricolas': getGroupCategorySlugs('fertilizantes-agricolas'),
      'imoveis-rurais': getGroupCategorySlugs('imoveis-rurais'),
      servicos: getGroupCategorySlugs('servicos'),
      sementes: getGroupCategorySlugs('sementes'),
    }),
    []
  );

  useEffect(() => {
    const loadCategoryCounts = async () => {
      try {
        const { data, error } = await supabase
          .from('announcements')
          .select('category_slug')
          .eq('status', 'ACTIVE');

        if (error) throw error;

        const countsBySlug = (data || []).reduce<Record<string, number>>((acc, announcement) => {
          const slug = announcement.category_slug;
          if (!slug) return acc;
          acc[slug] = (acc[slug] || 0) + 1;
          return acc;
        }, {});

        const nextCounts = Object.entries(groupedCategorySlugs).reduce<Record<string, number>>((acc, [groupSlug, sourceSlugs]) => {
          acc[groupSlug] = sourceSlugs.reduce((total, slug) => total + (countsBySlug[slug] || 0), 0);
          return acc;
        }, {});

        setCategoryCounts(nextCounts);
      } catch (error) {
        console.error('[CategoriesView] Erro ao carregar contagem real das categorias:', error);
      }
    };

    void loadCategoryCounts();
  }, [groupedCategorySlugs]);

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      <div className="bg-white border-b border-slate-100 mb-8">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="flex items-center gap-2 text-sm text-slate-400 font-medium mb-4">
            <Link to="/" className="hover:text-green-700 transition-colors">Início</Link>
            <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-slate-900 font-semibold">Categorias</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Explore o <span className="text-green-700">Mercado Rural</span>
          </h1>
          <p className="text-slate-500 mt-3 text-sm max-w-2xl leading-relaxed">
            Encontre tudo o que você precisa navegando por nossas categorias especializadas. Conectamos vendedores e compradores em todos os setores do agronegócio.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              className="bg-white rounded-xl border border-slate-100 transition-all duration-300 group overflow-hidden flex flex-col"
            >
              <div className="p-5 pb-3">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-slate-50 w-12 h-12 flex items-center justify-center rounded-xl group-hover:bg-green-50 transition-colors duration-300">
                    {cat.icon}
                  </div>
                  <span className="bg-green-100 text-green-700 text-[10px] font-semibold px-3 py-1 rounded-lg uppercase tracking-widest">
                    {categoryCounts[cat.slug] ?? 0} Anúncios
                  </span>
                </div>
                <h2 className="text-sm font-semibold text-slate-900 group-hover:text-green-700 transition-colors mb-2">
                  {cat.name}
                </h2>
                <div className="w-10 h-1 bg-green-600 rounded-full group-hover:w-16 transition-all duration-300" />
              </div>

              <div className="px-5 flex-grow">
                <ul className="space-y-2 mt-4">
                  {cat.subcategories?.map((sub, idx) => {
                    const subSlug = sub.toLowerCase().replace(/\s+/g, '-');
                    return (
                      <li key={idx}>
                        <Link
                          to={`/anuncios?categoria=${cat.slug}&sub=${subSlug}`}
                          className="text-slate-500 hover:text-green-700 text-sm font-medium flex items-center justify-between group/item py-1"
                        >
                          {sub}
                          <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all" strokeWidth={1.5} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="p-5 pt-4">
                <Link
                  to={`/anuncios?categoria=${cat.slug}`}
                  className="block w-full text-center h-10 leading-10 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-green-700 transition-all"
                >
                  Ver Tudo em {cat.name}
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-green-900 rounded-xl p-6 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="absolute top-0 right-0 w-1/4 h-full bg-white/5 skew-x-12 translate-x-10" />
          <div className="relative z-10 text-white max-w-xl text-center md:text-left">
            <h3 className="text-xl font-semibold mb-3">Não encontrou o que procurava?</h3>
            <p className="text-green-100 text-sm opacity-90">
              Nossa equipe está pronta para ajudar você a encontrar o animal, máquina ou insumo ideal para sua produção.
            </p>
          </div>
          <div className="relative z-10 flex gap-4 w-full md:w-auto">
            <button className="flex-grow md:flex-grow-0 bg-white text-green-900 px-6 h-10 rounded-lg font-semibold hover:bg-green-50 transition-all">
              Falar com Consultor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoriesView;
