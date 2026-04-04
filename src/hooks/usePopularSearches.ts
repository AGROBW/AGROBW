import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const FALLBACK_SEARCHES = ['Tratores', 'Gado', 'Fazendas', 'Colheitadeiras', 'Sementes'];

type PopularSearchRow = {
  term: string;
  search_count: number;
};

export const logPopularSearch = async (term: string, source = 'hero_search') => {
  const cleanedTerm = term.trim();

  if (!cleanedTerm) {
    return;
  }

  try {
    await supabase.rpc('log_public_search', {
      p_term: cleanedTerm,
      p_source: source,
    });
  } catch (error) {
    console.warn('[usePopularSearches] Nao foi possivel registrar busca:', error);
  }
};

export const usePopularSearches = () => {
  const [popularSearches, setPopularSearches] = useState<string[]>(FALLBACK_SEARCHES);

  useEffect(() => {
    const loadPopularSearches = async () => {
      try {
        const { data, error } = await supabase.rpc('get_top_public_searches', {
          p_limit: 5,
          p_days: 30,
        });

        if (error) {
          throw error;
        }

        const terms = ((data as PopularSearchRow[] | null) || [])
          .map((row) => row.term?.trim())
          .filter((term): term is string => Boolean(term));

        if (terms.length > 0) {
          setPopularSearches(terms);
        }
      } catch (error) {
        console.warn('[usePopularSearches] Nao foi possivel carregar buscas populares reais:', error);
      }
    };

    void loadPopularSearches();
  }, []);

  return {
    popularSearches,
  };
};
