import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ad, SellerStore } from '../../types';
import { useAuth } from '../contexts/AuthContext';
import { getCategoryGroupBySlug, getCategoryGroupForCategorySlug } from '../lib/categoryHierarchy';
import { supabase } from '../lib/supabaseClient';
import { appError } from '../utils/appLogger';

type SellerStoreInput = {
  storeName: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  coverPositionX?: number;
  coverPositionY?: number;
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

type MySellerStoreAnnouncementRow = {
  id: string;
  title: string;
  description: string;
  price?: string | number | null;
  unit_price?: string | number | null;
  product_condition?: 'novo' | 'seminovo' | 'usado' | null;
  availability?: 'pronta_entrega' | 'sob_encomenda' | 'consultar_estoque' | null;
  accepts_trade?: boolean | null;
  price_negotiable?: boolean | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  category_id: string;
  sub_category_id?: string | null;
  sub_category_label?: string | null;
  images?: string[] | null;
  user_id: string;
  status: string;
  views?: number | null;
  is_premium?: boolean | null;
  created_at: string;
  store_display_order?: number | null;
  expires_at?: string | null;
  expired_at?: string | null;
  deletion_scheduled_at?: string | null;
  whatsapp?: string | null;
  highlight_category?: boolean | null;
  highlight_category_until?: string | null;
  highlight_home?: boolean | null;
  highlight_home_until?: string | null;
  categories?: {
    slug?: string | null;
  } | null;
};

type SellerStoreRow = {
  id: string;
  user_id: string;
  slug: string;
  store_name: string;
  description?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  cover_position_x?: number | null;
  cover_position_y?: number | null;
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
  is_paused_due_to_plan?: boolean | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type PublicSellerStoreCatalogItem = SellerStore & {
  activeAdsCount: number;
  highlightedAdsCount: number;
  categoryGroups: Array<{ slug: string; name: string }>;
  productConditions: string[];
  availabilityOptions: string[];
};

const mapStoreRow = (row: SellerStoreRow): SellerStore => ({
  id: row.id,
  userId: row.user_id,
  slug: row.slug,
  storeName: row.store_name,
  description: row.description,
  logoUrl: row.logo_url,
  coverUrl: row.cover_url,
  coverPositionX: row.cover_position_x,
  coverPositionY: row.cover_position_y,
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
  isPausedDueToPlan: !!row.is_paused_due_to_plan,
  isVerified: row.is_verified,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAnnouncement = (ad: any): Ad => ({
  id: ad.id,
  title: ad.title,
  description: ad.description,
  price: parseFloat(ad.unit_price || ad.price),
  priceNegotiable: !!(ad.price_negotiable ?? ad.accepts_trade),
  productCondition: ad.product_condition || undefined,
  availability: ad.availability || undefined,
  acceptsTrade: !!ad.accepts_trade,
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
  storeDisplayOrder: ad.store_display_order,
  expiresAt: ad.expires_at,
  expiredAt: ad.expired_at,
  deletionScheduledAt: ad.deletion_scheduled_at,
  whatsapp: null, // R3: contato vive em announcement_contacts (owner/admin)
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

const normalizeCoverPosition = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
};

export const useMySellerStore = () => {
  const { user } = useAuth();
  const [store, setStore] = useState<SellerStore | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [storeAnnouncements, setStoreAnnouncements] = useState<Ad[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [isSavingAnnouncementOrder, setIsSavingAnnouncementOrder] = useState(false);
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
      appError('[useMySellerStore] Erro ao buscar loja', fetchError, { userId: user.id });
      setError(fetchError.message);
      setStore(null);
    } else {
      if (data) {
        const mapped = mapStoreRow(data as SellerStoreRow);
        // R3: email vem do contato privado da loja (não da coluna-base)
        const { data: contact } = await supabase
          .from('seller_store_contacts')
          .select('email')
          .eq('store_id', mapped.id)
          .maybeSingle();
        mapped.email = contact?.email ?? null;
        setStore(mapped);
      } else {
        setStore(null);
      }
    }

    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void fetchStore();
  }, [fetchStore]);

  const fetchStoreAnnouncements = useCallback(async () => {
    if (!user?.id) {
      setStoreAnnouncements([]);
      setIsLoadingAnnouncements(false);
      return;
    }

    setIsLoadingAnnouncements(true);

    const { data, error: announcementsError } = await supabase
      .from('announcements')
      .select('id,title,description,price,unit_price,city,state,cep,category_id,sub_category_id,sub_category_label,images,user_id,status,views,is_premium,created_at,store_display_order,expires_at,expired_at,deletion_scheduled_at,highlight_category,highlight_category_until,highlight_home,highlight_home_until,categories(slug)')
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE')
      .order('store_display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (announcementsError) {
      appError('[useMySellerStore] Erro ao buscar anúncios da loja', announcementsError, { userId: user.id });
      setStoreAnnouncements([]);
      setIsLoadingAnnouncements(false);
      return;
    }

    setStoreAnnouncements(((data as MySellerStoreAnnouncementRow[]) || []).map(mapAnnouncement));
    setIsLoadingAnnouncements(false);
  }, [user?.id]);

  useEffect(() => {
    void fetchStoreAnnouncements();
  }, [fetchStoreAnnouncements]);

  const saveStore = useCallback(
    async (input: SellerStoreInput, hasStoreAccess: boolean) => {
      if (!user?.id) {
        throw new Error('Você precisa estar logado para salvar sua loja.');
      }

      if (!hasStoreAccess) {
        throw new Error('Seu plano atual não inclui a Loja Parceira.');
      }

      setIsSaving(true);
      setError(null);

      const normalizedSlug = slugifyStoreValue(input.slug || input.storeName);
      if (!normalizedSlug) {
        setIsSaving(false);
        throw new Error('Informe um nome válido para gerar o endereço da loja.');
      }

      // R3: email da loja é privado (seller_store_contacts), não vai mais no payload base.
      const r3StoreEmail = input.email?.trim() || user.email || null;
      const payload = {
        user_id: user.id,
        slug: normalizedSlug,
        store_name: input.storeName.trim(),
        description: input.description?.trim() || null,
        logo_url: input.logoUrl?.trim() || null,
        cover_url: input.coverUrl?.trim() || null,
        cover_position_x: normalizeCoverPosition(input.coverPositionX),
        cover_position_y: normalizeCoverPosition(input.coverPositionY),
        whatsapp: null,
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
        appError('[useMySellerStore] Erro ao salvar loja', saveError, { userId: user.id, storeId: store?.id || null });
        setError(saveError.message);
        setIsSaving(false);
        throw new Error(saveError.message);
      }

      const mappedStore = mapStoreRow(data as SellerStoreRow);
      // R3: persistir o email no contato privado da loja (RLS dono/admin)
      await supabase
        .from('seller_store_contacts')
        .upsert({ store_id: (data as SellerStoreRow).id, email: r3StoreEmail });
      mappedStore.email = r3StoreEmail;
      setStore(mappedStore);
      setIsSaving(false);
      return mappedStore;
    },
    [store, user]
  );

  const saveAnnouncementOrder = useCallback(
    async (orderedIds: string[]) => {
      if (!user?.id) {
        throw new Error('Você precisa estar logado para organizar a vitrine.');
      }

      setIsSavingAnnouncementOrder(true);

      try {
        const updates = orderedIds.map((announcementId, index) =>
          supabase
            .from('announcements')
            .update({ store_display_order: index + 1 })
            .eq('id', announcementId)
            .eq('user_id', user.id)
        );

        const results = await Promise.all(updates);
        const failed = results.find((result) => result.error);

        if (failed?.error) {
          throw failed.error;
        }

        setStoreAnnouncements((current) => {
          const byId = new Map(current.map((announcement) => [announcement.id, announcement]));
          return orderedIds
            .map((announcementId, index) => {
              const announcement = byId.get(announcementId);
              return announcement
                ? {
                    ...announcement,
                    storeDisplayOrder: index + 1,
                  }
                : null;
            })
            .filter(Boolean) as Ad[];
        });
      } finally {
        setIsSavingAnnouncementOrder(false);
      }
    },
    [user?.id]
  );

  return {
    store,
    isLoading,
    isSaving,
    storeAnnouncements,
    isLoadingAnnouncements,
    isSavingAnnouncementOrder,
    error,
    refresh: fetchStore,
    refreshAnnouncements: fetchStoreAnnouncements,
    saveStore,
    saveAnnouncementOrder,
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
        .eq('is_paused_due_to_plan', false)
        .maybeSingle();

      if (storeError) {
        appError('[usePublicSellerStore] Erro ao buscar loja', storeError, { slug });
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
        .order('store_display_order', { ascending: true, nullsFirst: false })
        .order('highlight_home', { ascending: false })
        .order('highlight_category', { ascending: false })
        .order('created_at', { ascending: false });

      if (adsError) {
        appError('[usePublicSellerStore] Erro ao buscar anúncios da loja', adsError, { slug });
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

export const usePublicSellerStoresCatalog = () => {
  const [stores, setStores] = useState<PublicSellerStoreCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStores = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: storeRows, error: storesError } = await supabase
      .from('seller_stores')
      .select('*')
      .eq('is_active', true)
      .eq('is_store_feature_enabled', true)
      .eq('is_paused_due_to_plan', false)
      .order('updated_at', { ascending: false });

    if (storesError) {
      appError('[usePublicSellerStoresCatalog] Erro ao buscar lojas', storesError);
      setError(storesError.message);
      setStores([]);
      setIsLoading(false);
      return;
    }

    const mappedStores = ((storeRows as SellerStoreRow[]) || []).map(mapStoreRow);
    const userIds = mappedStores.map((store) => store.userId);

    if (userIds.length === 0) {
      setStores([]);
      setIsLoading(false);
      return;
    }

    const { data: announcementsRows, error: announcementsError } = await supabase
      .from('announcements')
      .select('user_id, category_slug, product_condition, availability, highlight_home, highlight_category')
      .in('user_id', userIds)
      .eq('status', 'ACTIVE');

    if (announcementsError) {
      appError('[usePublicSellerStoresCatalog] Erro ao buscar anúncios das lojas', announcementsError, { storesCount: storeRows.length });
      setError(announcementsError.message);
      setStores(
        mappedStores.map((store) => ({
          ...store,
          activeAdsCount: 0,
          highlightedAdsCount: 0,
          categoryGroups: [],
          productConditions: [],
          availabilityOptions: [],
        }))
      );
      setIsLoading(false);
      return;
    }

    const statsByUserId = new Map<
      string,
      {
        activeAdsCount: number;
        highlightedAdsCount: number;
        categoryGroups: Map<string, string>;
        productConditions: Set<string>;
        availabilityOptions: Set<string>;
      }
    >();

    for (const row of announcementsRows || []) {
      const userId = String(row.user_id);
      const current =
        statsByUserId.get(userId) || {
          activeAdsCount: 0,
          highlightedAdsCount: 0,
          categoryGroups: new Map<string, string>(),
          productConditions: new Set<string>(),
          availabilityOptions: new Set<string>(),
        };
      current.activeAdsCount += 1;
      if (row.highlight_home || row.highlight_category) {
        current.highlightedAdsCount += 1;
      }

      const categoryGroup = getCategoryGroupForCategorySlug(row.category_slug) || getCategoryGroupBySlug(row.category_slug);
      if (categoryGroup) {
        current.categoryGroups.set(categoryGroup.slug, categoryGroup.name);
      }

      if (row.product_condition) {
        current.productConditions.add(String(row.product_condition));
      }

      if (row.availability) {
        current.availabilityOptions.add(String(row.availability));
      }

      statsByUserId.set(userId, current);
    }

    setStores(
      mappedStores.map((store) => {
        const stats =
          statsByUserId.get(store.userId) || {
            activeAdsCount: 0,
            highlightedAdsCount: 0,
            categoryGroups: new Map<string, string>(),
            productConditions: new Set<string>(),
            availabilityOptions: new Set<string>(),
          };
        return {
          ...store,
          activeAdsCount: stats.activeAdsCount,
          highlightedAdsCount: stats.highlightedAdsCount,
          categoryGroups: Array.from(stats.categoryGroups.entries())
            .map(([slug, name]) => ({ slug, name }))
            .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
          productConditions: Array.from(stats.productConditions).sort((left, right) => left.localeCompare(right, 'pt-BR')),
          availabilityOptions: Array.from(stats.availabilityOptions).sort((left, right) => left.localeCompare(right, 'pt-BR')),
        };
      })
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchStores();
  }, [fetchStores]);

  return {
    stores,
    isLoading,
    error,
    refresh: fetchStores,
  };
};
