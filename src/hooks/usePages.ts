import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { sanitizeRichTextHtml } from '../utils/sanitizeRichTextHtml';
import { appError } from '../utils/appLogger';

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

  const sanitizePageRecord = useCallback((page: InstitutionalPage): InstitutionalPage => ({
    ...page,
    content: sanitizeRichTextHtml(page.content),
  }), []);

  const fetchPages = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('institutional_pages')
        .select('*')
        .order('updated_at', { ascending: false });

      if (fetchError) throw fetchError;

      setPages((data || []).map(sanitizePageRecord));
    } catch (err: any) {
      appError('[usePages] Erro ao carregar páginas', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [sanitizePageRecord]);

  const fetchPublishedPages = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('institutional_pages')
        .select('*')
        .eq('is_published', true)
        .order('title', { ascending: true });

      if (fetchError) throw fetchError;

      setPages((data || []).map(sanitizePageRecord));
    } catch (err: any) {
      appError('[usePages] Erro ao carregar páginas publicadas', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [sanitizePageRecord]);

  const getPageBySlug = useCallback(async (slug: string): Promise<InstitutionalPage | null> => {
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

      return sanitizePageRecord(data);
    } catch (err: any) {
      appError('[usePages] Erro ao buscar página por slug', err, {
        slug,
      });
      return null;
    }
  }, [sanitizePageRecord]);

  const createPage = useCallback(async (pageData: CreatePageData, userId: string) => {
    try {
      const sanitizedPayload = {
        ...pageData,
        content: sanitizeRichTextHtml(pageData.content),
      };

      const { data, error: insertError } = await supabase
        .from('institutional_pages')
        .insert([{
          ...sanitizedPayload,
          last_updated_by: userId
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchPages();
      return { data: data ? sanitizePageRecord(data) : null, error: null };
    } catch (err: any) {
      appError('[usePages] Erro ao criar página', err, {
        slug: pageData.slug,
        title: pageData.title,
        userId,
      });
      return { data: null, error: err.message };
    }
  }, [fetchPages, sanitizePageRecord]);

  const updatePage = useCallback(async (id: string, updates: Partial<InstitutionalPage>, userId: string) => {
    try {
      const sanitizedPayload = {
        ...updates,
        ...(typeof updates.content === 'string'
          ? { content: sanitizeRichTextHtml(updates.content) }
          : {}),
      };

      const { data, error: updateError } = await supabase
        .from('institutional_pages')
        .update({
          ...sanitizedPayload,
          last_updated_by: userId
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      await fetchPages();
      return { data: data ? sanitizePageRecord(data) : null, error: null };
    } catch (err: any) {
      appError('[usePages] Erro ao atualizar página', err, {
        id,
        userId,
      });
      return { data: null, error: err.message };
    }
  }, [fetchPages, sanitizePageRecord]);

  const deletePage = useCallback(async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('institutional_pages')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      await fetchPages();
      return { error: null };
    } catch (err: any) {
      appError('[usePages] Erro ao deletar página', err, {
        id,
      });
      return { error: err.message };
    }
  }, [fetchPages]);

  const togglePublished = useCallback(async (id: string, currentStatus: boolean, userId: string) => {
    return updatePage(id, { is_published: !currentStatus }, userId);
  }, [updatePage]);

  const validateSlug = useCallback((slug: string): { valid: boolean; error?: string } => {
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
  }, []);

  const generateSlug = useCallback((title: string): string => {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '-') // Substitui espaços por hífens
      .replace(/-+/g, '-') // Remove hífens duplos
      .replace(/^-|-$/g, ''); // Remove hífens do início/fim
  }, []);

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
