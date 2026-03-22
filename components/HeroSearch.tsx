
import React, { useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLayout } from '../src/contexts/LayoutContext';

const HeroSearch: React.FC = () => {
  const { settings } = useLayout();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleSearch = (term?: string) => {
    const searchTerm = (term ?? query).trim();
    if (!searchTerm) {
      navigate('/anuncios');
      return;
    }

    navigate(`/anuncios?q=${encodeURIComponent(searchTerm)}`);
  };

  return (
    <div className="relative -mt-12 z-30 max-w-5xl mx-auto px-4">
      {/* Container principal com design de cápsula */}
      <div className="bg-white rounded-xl p-2 border border-slate-100 group transition-all duration-300 focus-within:ring-2" style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}22` }}>
        <div className="flex flex-col md:flex-row items-center gap-2">
          
          {/* Área do Input - Ocupa a maior parte */}
          <div className="flex-grow w-full relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <input 
              type="text" 
              placeholder="O que você está procurando hoje?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              className="w-full bg-slate-50 md:bg-transparent border-none rounded-lg pl-10 pr-4 h-10 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-0 focus:outline-none transition-all"
            />
          </div>

          {/* Botão de Busca - Redesenhado para ser "esticado" e proeminente */}
          <div className="w-full md:w-auto md:min-w-[200px]">
            <button
              type="button"
              onClick={() => handleSearch()}
              className="w-full h-10 text-white font-semibold text-sm px-6 rounded-lg transition-all flex items-center justify-center gap-2 group/btn"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <span>Buscar Agora</span>
              <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Tags de busca rápida com design minimalista */}
      <div className="mt-4 flex flex-wrap justify-center items-center gap-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em]">Principais Buscas:</span>
        <div className="flex flex-wrap justify-center gap-2">
          {['Tratores usados', 'Gado Nelore', 'Fazendas MT', 'Colheitadeiras', 'Sementes'].map((tag) => (
            <button 
              key={tag}
              type="button"
              onClick={() => handleSearch(tag)}
              className="text-xs bg-white border border-slate-100 px-3 py-1 rounded-lg text-slate-600 hover:bg-green-600 hover:text-white hover:border-green-600 transition-all duration-300"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HeroSearch;
