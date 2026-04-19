import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Retorna um map de { slug -> image_url } para os 6 grupos principais.
 * Imagens são gerenciadas pelo admin em CategoriesManagement → upload por grupo.
 */
export function useCategoryGroupImages(): Record<string, string> {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase
      .from('category_group_images')
      .select('slug, image_url')
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((row) => {
          if (row.image_url) map[row.slug] = row.image_url;
        });
        setImages(map);
      });
  }, []);

  return images;
}
