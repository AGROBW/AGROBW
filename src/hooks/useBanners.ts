import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { appError, appWarn } from '../utils/appLogger';

export interface HomeBanner {
  id: string;
  badge_text: string;
  title: string;
  subtitle: string;
  button_text: string;
  button_link: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useBanners = () => {
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBanners = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('home_banners')
        .select('*')
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;

      setBanners(data || []);
    } catch (err: any) {
      appError('[useBanners] Erro ao carregar banners', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActiveBanners = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('home_banners')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;

      setBanners(data || []);
    } catch (err: any) {
      appError('[useBanners] Erro ao carregar banners ativos', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const createBanner = async (banner: Omit<HomeBanner, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error: insertError } = await supabase
        .from('home_banners')
        .insert([banner])
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchBanners();
      return { data, error: null };
    } catch (err: any) {
      appError('[useBanners] Erro ao criar banner', err, { title: banner.title });
      return { data: null, error: err.message };
    }
  };

  const updateBanner = async (id: string, updates: Partial<HomeBanner>) => {
    try {
      const { data, error: updateError } = await supabase
        .from('home_banners')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      await fetchBanners();
      return { data, error: null };
    } catch (err: any) {
      appError('[useBanners] Erro ao atualizar banner', err, { bannerId: id });
      return { data: null, error: err.message };
    }
  };

  const deleteBanner = async (id: string, imageUrl?: string) => {
    try {
      // Deletar imagem do storage se houver
      if (imageUrl && imageUrl.includes('supabase.co/storage')) {
        const path = imageUrl.split('/banners/')[1];
        if (path) {
          const { error: storageError } = await supabase.storage
            .from('banners')
            .remove([path]);

          if (storageError) {
          appWarn('[useBanners] Erro ao deletar imagem do storage', { bannerId: id, error: storageError });
          }
        }
      }

      // Deletar registro do banco
      const { error: deleteError } = await supabase
        .from('home_banners')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      await fetchBanners();
      return { error: null };
    } catch (err: any) {
      appError('[useBanners] Erro ao deletar banner', err, { bannerId: id });
      return { error: err.message };
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    return updateBanner(id, { is_active: !currentStatus });
  };

  const reorderBanners = async (bannersToReorder: { id: string; sort_order: number }[]) => {
    try {
      const promises = bannersToReorder.map(({ id, sort_order }) =>
        supabase
          .from('home_banners')
          .update({ sort_order })
          .eq('id', id)
      );

      await Promise.all(promises);
      await fetchBanners();
      return { error: null };
    } catch (err: any) {
      appError('[useBanners] Erro ao reordenar banners', err, { count: banners.length });
      return { error: err.message };
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  return {
    banners,
    isLoading,
    error,
    fetchBanners,
    fetchActiveBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    toggleActive,
    reorderBanners
  };
};
