import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface PublicCatalogCategory {
  id: string;
  name: string;
  slug: string;
  iconName?: string | null;
  sortOrder: number;
}

export interface PublicCatalogSubcategory {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export const usePublicCategoryCatalog = () => {
  const [categories, setCategories] = useState<PublicCatalogCategory[]>([]);
  const [subcategories, setSubcategories] = useState<PublicCatalogSubcategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setIsLoading(true);

      const [{ data: categoriesData, error: categoriesError }, { data: subcategoriesData, error: subcategoriesError }] =
        await Promise.all([
          supabase
            .from('categories')
            .select('id, name, slug, icon_name, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true }),
          supabase
            .from('category_subcategories')
            .select('id, category_id, name, slug, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true }),
        ]);

      if (categoriesError) {
        console.error('[usePublicCategoryCatalog] Erro ao carregar categorias:', categoriesError);
      }

      if (subcategoriesError) {
        console.error('[usePublicCategoryCatalog] Erro ao carregar subcategorias:', subcategoriesError);
      }

      if (cancelled) return;

      setCategories(
        ((categoriesData as Array<{ id: string; name: string; slug: string; icon_name?: string | null; sort_order?: number | null }> | null) || []).map(
          (category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            iconName: category.icon_name ?? null,
            sortOrder: Number(category.sort_order ?? 0),
          })
        )
      );

      setSubcategories(
        ((subcategoriesData as Array<{ id: string; category_id: string; name: string; slug: string; sort_order?: number | null }> | null) || []).map(
          (subcategory) => ({
            id: subcategory.id,
            categoryId: subcategory.category_id,
            name: subcategory.name,
            slug: subcategory.slug,
            sortOrder: Number(subcategory.sort_order ?? 0),
          })
        )
      );

      setIsLoading(false);
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  const subcategoriesByCategoryId = useMemo(
    () =>
      subcategories.reduce<Record<string, PublicCatalogSubcategory[]>>((accumulator, subcategory) => {
        if (!accumulator[subcategory.categoryId]) {
          accumulator[subcategory.categoryId] = [];
        }
        accumulator[subcategory.categoryId].push(subcategory);
        return accumulator;
      }, {}),
    [subcategories]
  );

  return {
    categories,
    subcategories,
    subcategoriesByCategoryId,
    isLoading,
  };
};

