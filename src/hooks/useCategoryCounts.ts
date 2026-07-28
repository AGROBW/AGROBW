import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCategoryGroupKey } from '../lib/categoryHierarchy';
import { isTimestampExpired, syncTrustedTime } from '../lib/trustedTime';
import { appWarn } from '../utils/appLogger';

export const useCategoryCounts = () => {
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [hasLoadedRealCounts, setHasLoadedRealCounts] = useState(false);

  useEffect(() => {
    const loadCategoryCounts = async () => {
      try {
        await syncTrustedTime();

        const { data, error } = await supabase
          .from('announcements')
          .select('category_slug, expires_at')
          .eq('status', 'ACTIVE');

        if (error) {
          throw error;
        }

        const nextCounts = (data || []).reduce<Record<string, number>>((acc, announcement) => {
          if (isTimestampExpired(announcement.expires_at)) {
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
        appWarn('[useCategoryCounts] Nao foi possivel carregar a contagem real das categorias', {
          error,
        });
      }
    };

    void loadCategoryCounts();
  }, []);

  const getCountForCategory = (slug: string) => {
    const key = getCategoryGroupKey(slug);

    if (!hasLoadedRealCounts) {
      return null;
    }

    return categoryCounts[key] ?? 0;
  };

  return {
    categoryCounts,
    getCountForCategory,
    hasLoadedRealCounts,
  };
};
