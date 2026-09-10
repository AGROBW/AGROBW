import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildCategoryGroupCatalog } from '../lib/categoryGroups';
import type { CategoryGroupCatalogCategoryRow } from '../lib/categoryGroups';
import { supabase } from '../lib/supabaseClient';
import { appWarn } from '../utils/appLogger';
import { useCategoryGroups } from './useCategoryGroups';

interface UseCategoryGroupCatalogOptions {
  includeInactive?: boolean;
}

export const useCategoryGroupCatalog = (
  options: UseCategoryGroupCatalogOptions = {}
) => {
  const includeInactive = options.includeInactive ?? false;
  const groupState = useCategoryGroups({ includeInactive });
  const [categoryRows, setCategoryRows] = useState<CategoryGroupCatalogCategoryRow[] | null>();
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let isActive = true;

    const loadCategoryMappings = async () => {
      let query = supabase
        .from('categories')
        .select('name, slug, parent_group_slug, is_active')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      try {
        const { data, error } = await query;
        if (!isActive) return;

        if (error) {
          appWarn('[useCategoryGroupCatalog] Falha ao carregar vinculos; usando compatibilidade legada.', {
            error,
          });
          setCategoryRows(null);
          return;
        }

        setCategoryRows((data as CategoryGroupCatalogCategoryRow[] | null) || []);
      } catch (error) {
        if (!isActive) return;
        appWarn('[useCategoryGroupCatalog] Erro inesperado ao carregar vinculos.', { error });
        setCategoryRows(null);
      }
    };

    void loadCategoryMappings();
    return () => {
      isActive = false;
    };
  }, [includeInactive, reloadVersion]);

  const catalog = useMemo(
    () => buildCategoryGroupCatalog(
      groupState.groups,
      categoryRows ?? null,
      { includeInactive }
    ),
    [categoryRows, groupState.groups, includeInactive]
  );

  const reload = useCallback(() => {
    groupState.reload();
    setReloadVersion((current) => current + 1);
  }, [groupState.reload]);

  return {
    ...catalog,
    isLoading: groupState.isLoading || categoryRows === undefined,
    isFallback: groupState.isFallback || categoryRows === null,
    reload,
  };
};
