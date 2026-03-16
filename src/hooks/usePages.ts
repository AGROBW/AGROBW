import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface InstitutionalPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  is_published: boolean;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePageData {
  title: string;
  slug: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
  is_published?: boolean;
}

export const usePages = () => {
  const [pages, setPages] = useState<InstitutionalPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPages = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('institutional_pages')
        .select('*')
        .order('updated_at', { ascending: false });

      if (fetchError) throw fetchError;

      setPages(data || []);
    } catch (err: any) {
      console.error('[usePages] Erro ao carregar páginas:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPublishedPages = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('institutional_pages')
        .select('*')
        .eq('is_published', true)
        .order('title', { ascending: true });

      if (fetchError) throw fetchError;

      setPages(data || []);
    } catch (err: any) {
      console.error('[usePages] Erro ao carregar páginas publicadas:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getPageBySlug = async (slug: string): Promise<InstitutionalPage | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('institutional_pages')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // Página não encontrada
          return null;
        }
        throw fetchError;
      }

      return data;
    } catch (err: any) {
      console.error(`[usePages] Erro ao buscar página ${slug}:`, err);
      return null;
    }
  };

  const createPage = async (pageData: CreatePageData, userId: string) => {
    try {
      const { data, error: insertError } = await supabase
        .from('institutional_pages')
        .insert([{
          ...pageData,
          last_updated_by: userId
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchPages();
      return { data, error: null };
    } catch (err: any) {
      console.error('[usePages] Erro ao criar página:', err);
      return { data: null, error: err.message };
    }
  };

  const updatePage = async (id: string, updates: Partial<InstitutionalPage>, userId: string) => {
    try {
      const { data, error: updateError } = await supabase
        .from('institutional_pages')
        .update({
          ...updates,
          last_updated_by: userId
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      await fetchPages();
      return { data, error: null };
    } catch (err: any) {
      console.error('[usePages] Erro ao atualizar página:', err);
      return { data: null, error: err.message };
    }
  };

  const deletePage = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('institutional_pages')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      await fetchPages();
      return { error: null };
    } catch (err: any) {
      console.error('[usePages] Erro ao deletar página:', err);
      return { error: err.message };
    }
  };

  const togglePublished = async (id: string, currentStatus: boolean, userId: string) => {
    return updatePage(id, { is_published: !currentStatus }, userId);
  };

  const validateSlug = (slug: string): { valid: boolean; error?: string } => {
    // Remover espaços e converter para minúsculas
    const cleanSlug = slug.trim().toLowerCase();

    // Validar formato
    if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
      return {
        valid: false,
        error: 'Slug deve conter apenas letras minúsculas, números e hífens'
      };
    }

    // Validar slugs reservados
    const reservedSlugs = ['admin', 'api', 'auth', 'dashboard', 'login', 'register', 'settings', 'p', 'pages'];
    if (reservedSlugs.includes(cleanSlug)) {
      return {
        valid: false,
        error: 'Este slug está reservado pelo sistema'
      };
    }

    // Validar tamanho
    if (cleanSlug.length < 3) {
      return {
        valid: false,
        error: 'Slug deve ter no mínimo 3 caracteres'
      };
    }

    if (cleanSlug.length > 100) {
      return {
        valid: false,
        error: 'Slug deve ter no máximo 100 caracteres'
      };
    }

    return { valid: true };
  };

  const generateSlug = (title: string): string => {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '-') // Substitui espaços por hífens
      .replace(/-+/g, '-') // Remove hífens duplos
      .replace(/^-|-$/g, ''); // Remove hífens do início/fim
  };

  useEffect(() => {
    fetchPages();
  }, []);

  return {
    pages,
    isLoading,
    error,
    fetchPages,
    fetchPublishedPages,
    getPageBySlug,
    createPage,
    updatePage,
    deletePage,
    togglePublished,
    validateSlug,
    generateSlug
  };
};
