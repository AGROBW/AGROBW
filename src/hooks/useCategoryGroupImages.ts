import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Retorna um map de { slug -> image_url } para os 6 grupos principais.
 * Imagens são gerenciadas pelo admin em CategoriesManagement → upload por grupo.
 */
export function useCategoryGroupImages(): { images: Record<string, string>; isLoading: boolean } {
  const [images, setImages] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const loadImages = async () => {
      const { data, error } = await supabase
        .from('category_group_images')
        .select('slug, image_url');

      if (error) {
        console.error('[useCategoryGroupImages] Erro ao carregar imagens dos grupos:', error);
        if (isActive) {
          setIsLoading(false);
        }
        return;
      }

      if (!data) {
        if (isActive) {
          setIsLoading(false);
        }
        return;
      }

      const map: Record<string, string> = {};
      data.forEach((row) => {
        if (row.image_url) map[row.slug] = row.image_url;
      });

      if (isActive) {
        setImages(map);
        setIsLoading(false);
      }
    };

    void loadImages();

    return () => {
      isActive = false;
    };
  }, []);

  return { images, isLoading };
}
