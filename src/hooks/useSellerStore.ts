import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ad, SellerStore } from '../../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

type SellerStoreInput = {
  storeName: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  whatsapp?: string;
  email?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  city?: string;
  state?: string;
  isActive?: boolean;
};

type SellerStoreRow = {
  id: string;
  user_id: string;
  slug: string;
  store_name: string;
  description?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  city?: string | null;
  state?: string | null;
  is_active: boolean;
  is_store_feature_enabled?: boolean | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};

const mapStoreRow = (row: SellerStoreRow): SellerStore => ({
  id: row.id,
  userId: row.user_id,
  slug: row.slug,
  storeName: row.store_name,
  description: row.description,
  logoUrl: row.logo_url,
  coverUrl: row.cover_url,
  whatsapp: row.whatsapp,
  email: row.email,
  facebookUrl: row.facebook_url,
  instagramUrl: row.instagram_url,
  linkedinUrl: row.linkedin_url,
  websiteUrl: row.website_url,
  city: row.city,
  state: row.state,
  isActive: row.is_active,
  isStoreFeatureEnabled: !!row.is_store_feature_enabled,
  isVerified: row.is_verified,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAnnouncement = (ad: any): Ad => ({
  id: ad.id,
  title: ad.title,
  description: ad.description,
  price: parseFloat(ad.unit_price || ad.price),
  location: {
    city: ad.city,
    state: ad.state,
    cep: ad.cep,
  },
  categoryId: ad.category_id,
  categorySlug: ad.categories?.slug,
  subCategoryId: ad.sub_category_id || undefined,
  subCategoryLabel: ad.sub_category_label || undefined,
  images: ad.images || [],
  userId: ad.user_id,
  status: ad.status as Ad['status'],
  views: ad.views || 0,
  isPremium: ad.is_premium || false,
  createdAt: ad.created_at,
  expiresAt: ad.expires_at,
  expiredAt: ad.expired_at,
  deletionScheduledAt: ad.deletion_scheduled_at,
  whatsapp: ad.whatsapp,
  highlightCategory: ad.highlight_category || false,
  highlightCategoryUntil: ad.highlight_category_until,
  highlightHome: ad.highlight_home || false,
  highlightHomeUntil: ad.highlight_home_until,
});

export const slugifyStoreValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const normalizeExternalUrl = (value?: string | null) => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return null;

  if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue;

  return `https://${trimmedValue.replace(/^\/+/, '')}`;
};

export const useMySellerStore = () => {
  const { user } = useAuth();
  const [store, setStore] = useState<SellerStore | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStore = useCallback(async () => {
    if (!user?.id) {
      setStore(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('seller_stores')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('[useMySellerStore] Erro ao buscar loja:', fetchError);
      setError(fetchError.message);
      setStore(null);
    } else {
      setStore(data ? mapStoreRow(data as SellerStoreRow) : null);
    }

    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void fetchStore();
  }, [fetchStore]);

  const saveStore = useCallback(
    async (input: SellerStoreInput, hasStoreAccess: boolean) => {
      if (!user?.id) {
        throw new Error('Você precisa estar logado para salvar sua loja.');
      }

      if (!hasStoreAccess) {
        throw new Error('Seu plano atual não inclui a Loja Oficial.');
      }

      setIsSaving(true);
      setError(null);

      const normalizedSlug = slugifyStoreValue(input.slug || input.storeName);
      if (!normalizedSlug) {
        setIsSaving(false);
        throw new Error('Informe um nome válido para gerar o endereço da loja.');
      }

      const payload = {
        user_id: user.id,
        slug: normalizedSlug,
        store_name: input.storeName.trim(),
        description: input.description?.trim() || null,
        logo_url: input.logoUrl?.trim() || null,
        cover_url: input.coverUrl?.trim() || null,
        whatsapp: input.whatsapp?.trim() || user.whatsapp || user.phone || null,
        email: input.email?.trim() || user.email || null,
        facebook_url: normalizeExternalUrl(input.facebookUrl),
        instagram_url: normalizeExternalUrl(input.instagramUrl),
        linkedin_url: normalizeExternalUrl(input.linkedinUrl),
        website_url: normalizeExternalUrl(input.websiteUrl),
        city: input.city?.trim() || user.cidade || null,
        state: input.state?.trim() || user.estado || null,
        is_active: input.isActive ?? true,
      };

      const operation = store
        ? supabase.from('seller_stores').update(payload).eq('id', store.id).select('*').single()
        : supabase.from('seller_stores').insert(payload).select('*').single();

      const { data, error: saveError } = await operation;

      if (saveError) {
        console.error('[useMySellerStore] Erro ao salvar loja:', saveError);
        setError(saveError.message);
        setIsSaving(false);
        throw new Error(saveError.message);
      }

      const mappedStore = mapStoreRow(data as SellerStoreRow);
      setStore(mappedStore);
      setIsSaving(false);
      return mappedStore;
    },
    [store, user]
  );

  return {
    store,
    isLoading,
    isSaving,
    error,
    refresh: fetchStore,
    saveStore,
  };
};

export const usePublicSellerStore = (slug: string | undefined) => {
  const [store, setStore] = useState<SellerStore | null>(null);
  const [announcements, setAnnouncements] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setStore(null);
      setAnnouncements([]);
      setError('Loja não encontrada.');
      setIsLoading(false);
      return;
    }

    const fetchStore = async () => {
      setIsLoading(true);
      setError(null);

      const { data: storeRow, error: storeError } = await supabase
        .from('seller_stores')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .eq('is_store_feature_enabled', true)
        .maybeSingle();

      if (storeError) {
        console.error('[usePublicSellerStore] Erro ao buscar loja:', storeError);
        setError(storeError.message);
        setStore(null);
        setAnnouncements([]);
        setIsLoading(false);
        return;
      }

      if (!storeRow) {
        setError('Loja não encontrada ou indisponível.');
        setStore(null);
        setAnnouncements([]);
        setIsLoading(false);
        return;
      }

      const { data: adsData, error: adsError } = await supabase
        .from('announcements')
        .select('*, categories (name, slug)')
        .eq('user_id', storeRow.user_id)
        .eq('status', 'ACTIVE')
        .order('highlight_home', { ascending: false })
        .order('highlight_category', { ascending: false })
        .order('created_at', { ascending: false });

      if (adsError) {
        console.error('[usePublicSellerStore] Erro ao buscar anúncios da loja:', adsError);
        setError(adsError.message);
        setStore(null);
        setAnnouncements([]);
        setIsLoading(false);
        return;
      }

      setStore(mapStoreRow(storeRow as SellerStoreRow));
      setAnnouncements((adsData || []).map(mapAnnouncement));
      setIsLoading(false);
    };

    void fetchStore();
  }, [slug]);

  const locationLabel = useMemo(() => {
    if (!store) return '';
    return [store.city, store.state].filter(Boolean).join(' - ');
  }, [store]);

  return {
    store,
    announcements,
    isLoading,
    error,
    locationLabel,
  };
};
