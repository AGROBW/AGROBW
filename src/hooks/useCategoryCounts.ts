import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES } from '../../constants';
import { supabase } from '../lib/supabaseClient';
import { getCategoryGroupKey } from '../lib/categoryHierarchy';

export const useCategoryCounts = () => {
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [hasLoadedRealCounts, setHasLoadedRealCounts] = useState(false);

  const fallbackCounts = useMemo(
    () =>
      CATEGORIES.reduce<Record<string, number>>((acc, category) => {
        acc[getCategoryGroupKey(category.slug)] = category.count;
        return acc;
      }, {}),
    []
  );

  useEffect(() => {
    const loadCategoryCounts = async () => {
      try {
        const { data, error } = await supabase
          .from('announcements')
          .select('category_slug, expires_at')
          .eq('status', 'ACTIVE');

        if (error) {
          throw error;
        }

        const nextCounts = (data || []).reduce<Record<string, number>>((acc, announcement) => {
          if (
            announcement.expires_at &&
            new Date(announcement.expires_at).getTime() <= Date.now()
          ) {
            return acc;
          }

          const categoryKey = getCategoryGroupKey(announcement.category_slug);

          if (!categoryKey) {
            return acc;
          }

          acc[categoryKey] = (acc[categoryKey] || 0) + 1;
          return acc;
        }, {});

        setCategoryCounts(nextCounts);
        setHasLoadedRealCounts(true);
      } catch (error) {
        console.error('[useCategoryCounts] Erro ao carregar contagem real das categorias:', error);
      }
    };

    void loadCategoryCounts();
  }, []);

  const getCountForCategory = (slug: string) => {
    const key = getCategoryGroupKey(slug);

    if (hasLoadedRealCounts) {
      return categoryCounts[key] ?? 0;
    }

    return fallbackCounts[key] ?? 0;
  };

  return {
    categoryCounts,
    getCountForCategory,
    hasLoadedRealCounts,
  };
};
