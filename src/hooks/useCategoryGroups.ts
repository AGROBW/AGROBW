import { useCallback, useEffect, useState } from 'react';
import { resolveCategoryGroups } from '../lib/categoryGroups';
import type { CategoryGroup, CategoryGroupRow } from '../lib/categoryGroups';
import { supabase } from '../lib/supabaseClient';
import { appWarn } from '../utils/appLogger';

interface UseCategoryGroupsOptions {
  includeInactive?: boolean;
}

interface UseCategoryGroupsResult {
  groups: CategoryGroup[];
  isLoading: boolean;
  isFallback: boolean;
  reload: () => void;
}

export function useCategoryGroups(
  options: UseCategoryGroupsOptions = {}
): UseCategoryGroupsResult {
  const includeInactive = options.includeInactive ?? false;
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let isActive = true;

    const loadGroups = async () => {
      setIsLoading(true);

      try {
        const { data, error } = await supabase
          .from('category_groups')
          .select('id, name, slug, sort_order, icon_name, is_active')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });

        if (!isActive) return;

        if (error) {
          appWarn('[useCategoryGroups] Falha ao carregar grupos dinamicos; usando fallback legado.', {
            error,
          });
        }

        const resolved = resolveCategoryGroups(
          error ? null : (data as CategoryGroupRow[] | null) || [],
          { includeInactive }
        );

        setGroups(resolved.groups);
        setIsFallback(resolved.isFallback);
      } catch (error) {
        if (!isActive) return;

        appWarn('[useCategoryGroups] Erro inesperado; usando fallback legado.', { error });
        const resolved = resolveCategoryGroups(null, { includeInactive });
        setGroups(resolved.groups);
        setIsFallback(resolved.isFallback);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void loadGroups();

    return () => {
      isActive = false;
    };
  }, [includeInactive, reloadVersion]);

  const reload = useCallback(() => setReloadVersion((current) => current + 1), []);

  return { groups, isLoading, isFallback, reload };
}
