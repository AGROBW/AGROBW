
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, MapPin, Search, Store } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../constants';
import { useLayout } from '../src/contexts/LayoutContext';
import { logPopularSearch, usePopularSearches } from '../src/hooks/usePopularSearches';

const BRAZILIAN_STATES = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'],
  ['BA', 'Bahia'], ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'],
  ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'],
  ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'],
  ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'],
  ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'],
  ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'], ['SE', 'Sergipe'],
  ['TO', 'Tocantins'],
];

interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface SearchDropdownProps {
  label: string;
  value: string;
  options: DropdownOption[];
  placeholder: string;
  onChange: (value: string) => void;
  leadingIcon?: React.ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
}

const normalizeSearchText = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const SearchDropdown: React.FC<SearchDropdownProps> = ({
  label,
  value,
  options,
  placeholder,
  onChange,
  leadingIcon,
  searchable = false,
  searchPlaceholder = 'Buscar...',
}) => {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const selectedOption = options.find((option) => option.value === value);

  const filteredOptions = useMemo(() => {
    const normalizedTerm = normalizeSearchText(searchTerm.trim());
    if (!normalizedTerm) return options;

    return options.filter((option) =>
      normalizeSearchText(`${option.label} ${option.description || ''} ${option.value}`).includes(normalizedTerm)
    );
  }, [options, searchTerm]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative flex min-h-16 items-center border-b border-slate-200 px-4 lg:border-b-0 lg:border-r ${isOpen ? 'z-50' : 'z-0'}`}>
      {leadingIcon}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => {
          setSearchTerm('');
          setIsOpen((current) => !current);
        }}
        className="group flex min-w-0 flex-1 items-center gap-3 py-2 text-left outline-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</span>
          <span className="mt-1 block truncate text-sm font-semibold text-slate-700">
            {selectedOption?.label || placeholder}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-none text-slate-400 transition duration-200 group-hover:text-emerald-600 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`}
          strokeWidth={1.8}
        />
      </button>

      {isOpen ? (
        <div className="absolute left-2 right-2 top-[calc(100%+8px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.38)] sm:min-w-[260px]">
          {searchable ? (
            <div className="border-b border-slate-100 p-3">
              <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-emerald-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100">
                <Search className="mr-2 h-4 w-4 flex-none text-slate-400" />
                <input
                  autoFocus
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-0"
                />
              </div>
            </div>
          ) : null}

          <div id={listboxId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto p-2">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => selectOption('')}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                !value ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                {leadingIcon || <Search className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold">{placeholder}</span>
              {!value ? <Check className="h-4 w-4 flex-none text-emerald-600" /> : null}
            </button>

            {filteredOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectOption(option.value)}
                  className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    isSelected ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {option.icon ? (
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      {option.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{option.label}</span>
                    {option.description ? <span className="block text-[11px] text-slate-400">{option.description}</span> : null}
                  </span>
                  {isSelected ? <Check className="h-4 w-4 flex-none text-emerald-600" /> : null}
                </button>
              );
            })}

            {filteredOptions.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">Nenhuma opção encontrada.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const HeroSearch: React.FC = () => {
  const { settings } = useLayout();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [state, setState] = useState('');
  const { popularSearches } = usePopularSearches();
  const categoryOptions = useMemo<DropdownOption[]>(
    () => CATEGORIES.map((item) => ({ value: item.slug, label: item.name, icon: item.icon })),
    []
  );
  const stateOptions = useMemo<DropdownOption[]>(
    () => BRAZILIAN_STATES.map(([uf, name]) => ({ value: uf, label: name, description: uf })),
    []
  );

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
      <div className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)]">
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
          <div className="grid overflow-visible rounded-xl border border-slate-200 bg-white lg:grid-cols-[minmax(0,1.45fr)_minmax(190px,0.75fr)_minmax(170px,0.65fr)_150px]">
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

            <SearchDropdown
              label="Categoria"
              value={category}
              options={categoryOptions}
              placeholder="Todas as categorias"
              onChange={setCategory}
            />

            <SearchDropdown
              label="Localização"
              value={state}
              options={stateOptions}
              placeholder="Todo o Brasil"
              onChange={setState}
              leadingIcon={<MapPin className="mr-3 h-5 w-5 flex-none text-slate-400" strokeWidth={1.8} />}
              searchable
              searchPlaceholder="Buscar estado ou UF..."
            />

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
