import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Ad } from '../../types'
import { getCategoryGroupBySlug, getGroupCategorySlugs } from '../lib/categoryHierarchy'
import { isTimestampExpired, syncTrustedTime } from '../lib/trustedTime'

const getEffectiveAdStatus = (status: string, expiresAt?: string | null) => {
  if ((status === 'ACTIVE' || status === 'active') && isTimestampExpired(expiresAt)) {
    return 'EXPIRED';
  }

  return status;
};

export const deleteAnnouncementWithRelations = async (announcementId: string) => {
  const { data, error } = await supabase.functions.invoke('delete-announcement', {
    method: 'POST',
    body: {
      announcementId,
    },
  });

  if (error) {
    const isFunctionMissing =
      error.message?.includes('404') ||
      error.name === 'FunctionsHttpError';

    if (isFunctionMissing) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('delete_announcement_with_relations', {
        p_announcement_id: announcementId,
      });

      if (rpcError) {
        throw rpcError;
      }

      if (!rpcData?.success) {
        throw new Error(rpcData?.details || rpcData?.error || 'Falha ao excluir anuncio');
      }

      return;
    }

    try {
      const errorBody = await error.context?.json?.();
      throw new Error(errorBody?.details || errorBody?.error || error.message);
    } catch {
      throw error;
    }
  }

  if (!data?.success) {
    throw new Error(data?.details || data?.error || 'Falha ao excluir anuncio');
  }
};

// Hook para buscar anuncios do usuario
export const useUserAds = () => {
  const { user } = useAuth()
  const [ads, setAds] = useState<Ad[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setAds([])
      setIsLoading(false)
      return
    }

    const fetchAds = async () => {
      setIsLoading(true)
      await syncTrustedTime()
      const [{ data, error }, { data: editRequests, error: pendingEditRequestsError }] = await Promise.all([
        supabase
          .from('announcements')
          .select(`
            *,
            categories (name, slug)
          `)
          .eq('user_id', user.id)
          .order('highlight_category', { ascending: false })
          .order('highlight_home', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('announcement_edit_requests')
          .select('announcement_id,status,rejection_reason,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
      ])

      if (error) {
        setError(error.message)
        console.error('Erro ao buscar anuncios:', error)
      } else {
        if (pendingEditRequestsError && pendingEditRequestsError.code !== 'PGRST205') {
          console.error('Erro ao buscar edicoes pendentes do usuario:', pendingEditRequestsError)
        }

        const latestEditRequestByAnnouncement = new Map<string, { status: 'pending' | 'approved' | 'rejected'; rejection_reason?: string | null }>()

        for (const item of (editRequests || []) as any[]) {
          if (!item?.announcement_id || latestEditRequestByAnnouncement.has(item.announcement_id)) continue
          latestEditRequestByAnnouncement.set(item.announcement_id, {
            status: item.status,
            rejection_reason: item.rejection_reason || null,
          })
        }

        const mappedAds: Ad[] = data.map(ad => ({
          id: ad.id,
          title: ad.title,
          description: ad.description,
          price: parseFloat(ad.unit_price || ad.price),
          priceNegotiable: !!ad.accepts_trade,
          productCondition: ad.product_condition || undefined,
          availability: ad.availability || undefined,
          acceptsTrade: !!ad.accepts_trade,
          hasWarranty: !!ad.has_warranty,
          warrantyDetails: ad.warranty_details || undefined,
          hasInvoice: !!ad.has_invoice,
          location: {
            city: ad.city,
            state: ad.state,
            cep: ad.cep
          },
          categoryId: ad.category_id,
          categorySlug: ad.categories?.slug,
          subCategoryId: ad.sub_category_id || undefined,
          subCategoryLabel: ad.sub_category_label || undefined,
          images: ad.images || [],
          videoUrl: ad.video_url || undefined,
          videoStoragePath: ad.video_storage_path || undefined,
          videoDurationSeconds: ad.video_duration_seconds || undefined,
          videoSizeBytes: ad.video_size_bytes || undefined,
          userId: ad.user_id,
          status: (
            latestEditRequestByAnnouncement.get(ad.id)?.status === 'pending'
              ? 'PENDING'
              : getEffectiveAdStatus(ad.status, ad.expires_at)
          ) as Ad['status'],
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
          latestEditRequestStatus: latestEditRequestByAnnouncement.get(ad.id)?.status || null,
          latestEditRejectionReason: latestEditRequestByAnnouncement.get(ad.id)?.rejection_reason || null,
        }))
        setAds(mappedAds)
      }
      setIsLoading(false)
    }

    fetchAds()
  }, [user])

  return { ads, isLoading, error }
}

// Hook para buscar anuncios publicos (listagem geral)
export const usePublicAds = (filters?: {
  category?: string
  search?: string
  minPrice?: number
  maxPrice?: number
  state?: string
}) => {
  const [ads, setAds] = useState<Ad[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAds = async () => {
      setIsLoading(true)
      await syncTrustedTime()

      let query = supabase
        .from('announcements')
        .select(`
          *,
          categories (name, slug),
          seller:vendedores_publicos!user_id (name, avatar, document_verified, cidade, estado)
        `)
        .eq('status', 'ACTIVE')

      if (filters?.category) {
        const groupedSlugs = getGroupCategorySlugs(filters.category)

        if (groupedSlugs.length > 0) {
          query = query.in('category_slug', groupedSlugs)
        } else {
          const { data: category, error: categoryError } = await supabase
            .from('categories')
            .select('id')
            .eq('slug', filters.category)
            .maybeSingle()

          if (categoryError) {
            console.warn('[usePublicAds] Categoria nao encontrada para slug:', filters.category, categoryError)
          }

          if (category) {
            query = query.eq('category_id', category.id)
          } else if (!getCategoryGroupBySlug(filters.category)) {
            query = query.eq('category_slug', filters.category)
          }
        }
      }

      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
      }

      if (filters?.minPrice !== undefined) {
        query = query.gte('price', filters.minPrice)
      }

      if (filters?.maxPrice !== undefined) {
        query = query.lte('price', filters.maxPrice)
      }

      if (filters?.state) {
        query = query.eq('state', filters.state)
      }

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) {
        setError(error.message)
        console.error('Erro ao buscar anuncios:', error)
      } else {
        const announcementIds = Array.from(new Set((data || []).map((ad: any) => ad.id).filter(Boolean)))
        const sellerIds = Array.from(new Set((data || []).map((ad: any) => ad.user_id).filter(Boolean)))
        const storeMap = new Map<string, { slug: string; storeName: string; logoUrl?: string; isVerified?: boolean }>()
        const planMap = new Map<string, { monthlyPrice: number; position: number | null; planName: string | null }>()
        const engagementMap = new Map<string, {
          recentViews: number
          recentUniqueVisitors: number
          recentLeads: number
          lastEngagementAt: string | null
        }>()

        const requests: Array<any> = []

        if (sellerIds.length > 0) {
          requests.push(
            supabase
              .from('seller_stores')
              .select('user_id, slug, store_name, logo_url, is_verified')
              .eq('is_active', true)
              .eq('is_store_feature_enabled', true)
              .eq('is_paused_due_to_plan', false)
              .in('user_id', sellerIds),
            supabase.rpc('get_public_active_plan_signals', {
              p_user_ids: sellerIds,
            })
          )
        } else {
          requests.push(Promise.resolve({ data: [], error: null }), Promise.resolve({ data: [], error: null }))
        }

        if (announcementIds.length > 0) {
          requests.push(
            supabase.rpc('get_public_announcement_engagement_signals', {
              p_announcement_ids: announcementIds,
              p_period_days: 14,
            })
          )
        } else {
          requests.push(Promise.resolve({ data: [], error: null }))
        }

        if (requests.length > 0) {
          const [
            { data: storesData, error: storesError },
            { data: planSignalsData, error: planSignalsError },
            { data: engagementSignalsData, error: engagementSignalsError },
          ] = await Promise.all(requests)

          if (storesError) {
            console.warn('[usePublicAds] Erro ao buscar lojas oficiais para listagem:', storesError)
          } else {
            for (const store of storesData || []) {
              storeMap.set(store.user_id, {
                slug: store.slug,
                storeName: store.store_name,
                logoUrl: store.logo_url || undefined,
                isVerified: !!store.is_verified,
              })
            }
          }

          if (planSignalsError) {
            console.warn('[usePublicAds] Erro ao buscar sinais publicos de plano para ranking:', planSignalsError)
          } else {
            for (const signal of (planSignalsData as Array<any>) || []) {
              if (!signal?.user_id) continue
              planMap.set(signal.user_id, {
                monthlyPrice: Number(signal.monthly_price || 0),
                position: signal.plan_position ?? null,
                planName: signal.plan_name || null,
              })
            }
          }

          if (engagementSignalsError) {
            console.warn('[usePublicAds] Erro ao buscar sinais publicos de engajamento recente para ranking:', engagementSignalsError)
          } else {
            for (const signal of (engagementSignalsData as Array<any>) || []) {
              if (!signal?.announcement_id) continue

              const lastViewedAt = signal.last_viewed_at || null
              const lastLeadAt = signal.last_lead_at || null
              const lastEngagementAt = [lastViewedAt, lastLeadAt]
                .filter(Boolean)
                .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null

              engagementMap.set(signal.announcement_id, {
                recentViews: Number(signal.views_last_period || 0),
                recentUniqueVisitors: Number(signal.unique_visitors_last_period || 0),
                recentLeads: Number(signal.leads_last_period || 0),
                lastEngagementAt,
              })
            }
          }
        }

        const mappedAds: Ad[] = data.map(ad => ({
          id: ad.id,
          title: ad.title,
          description: ad.description,
          price: parseFloat(ad.unit_price || ad.price),
          priceNegotiable: !!ad.accepts_trade,
          productCondition: ad.product_condition || undefined,
          availability: ad.availability || undefined,
          acceptsTrade: !!ad.accepts_trade,
          hasWarranty: !!ad.has_warranty,
          warrantyDetails: ad.warranty_details || undefined,
          hasInvoice: !!ad.has_invoice,
          location: {
            city: ad.city,
            state: ad.state,
            cep: ad.cep
          },
          categoryId: ad.category_id,
          categorySlug: ad.categories?.slug,
          subCategoryId: ad.sub_category_id || undefined,
          subCategoryLabel: ad.sub_category_label || undefined,
          images: ad.images || [],
          videoUrl: ad.video_url || undefined,
          videoStoragePath: ad.video_storage_path || undefined,
          videoDurationSeconds: ad.video_duration_seconds || undefined,
          videoSizeBytes: ad.video_size_bytes || undefined,
          userId: ad.user_id,
          status: getEffectiveAdStatus(ad.status, ad.expires_at) as Ad['status'],
          views: ad.views || 0,
          isPremium: ad.is_premium || false,
          createdAt: ad.created_at,
          updatedAt: ad.updated_at || ad.created_at,
          expiresAt: ad.expires_at,
          expiredAt: ad.expired_at,
          deletionScheduledAt: ad.deletion_scheduled_at,
          whatsapp: ad.whatsapp,
          highlightCategory: ad.highlight_category || false,
          highlightCategoryUntil: ad.highlight_category_until,
          highlightHome: ad.highlight_home || false,
          highlightHomeUntil: ad.highlight_home_until,
          sellerPlanMonthlyPrice: planMap.get(ad.user_id)?.monthlyPrice || 0,
          sellerPlanPosition: planMap.get(ad.user_id)?.position ?? null,
          sellerPlanName: planMap.get(ad.user_id)?.planName || null,
          recentViews: engagementMap.get(ad.id)?.recentViews || 0,
          recentUniqueVisitors: engagementMap.get(ad.id)?.recentUniqueVisitors || 0,
          recentLeads: engagementMap.get(ad.id)?.recentLeads || 0,
          lastEngagementAt: engagementMap.get(ad.id)?.lastEngagementAt || null,
          communityReportsCount: ad.community_reports_count || 0,
          communityReportedToReviewAt: ad.community_reported_to_review_at || null,
          communityReportReasons: Array.isArray(ad.community_report_reasons) ? ad.community_report_reasons : [],
          seller: ad.seller
            ? {
                ...(Array.isArray(ad.seller) ? ad.seller[0] : ad.seller),
                store: storeMap.get(ad.user_id)
              }
            : undefined
        }))
        setAds(mappedAds.filter((ad) => ad.status === 'ACTIVE'))
      }
      setIsLoading(false)
    }

    fetchAds()
  }, [filters?.category, filters?.search, filters?.minPrice, filters?.maxPrice, filters?.state])

  return { ads, isLoading, error }
}

// Hook para buscar todos os anuncios (admin)
export const useAllAds = () => {
  const [ads, setAds] = useState<Ad[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true)
      await syncTrustedTime()
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('highlight_category', { ascending: false })
        .order('highlight_home', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        setError(error.message)
        setAds([])
      } else {
        const mapped: Ad[] = (data || []).map(ad => ({
          id: ad.id,
          title: ad.title,
          description: ad.description,
          price: parseFloat(ad.unit_price || ad.price),
          priceNegotiable: !!ad.accepts_trade,
          productCondition: ad.product_condition || undefined,
          availability: ad.availability || undefined,
          acceptsTrade: !!ad.accepts_trade,
          hasWarranty: !!ad.has_warranty,
          warrantyDetails: ad.warranty_details || undefined,
          hasInvoice: !!ad.has_invoice,
          location: {
            city: ad.city,
            state: ad.state,
            cep: ad.cep
          },
          categoryId: ad.category_id,
          categorySlug: ad.category_slug,
          subCategoryId: ad.sub_category_id || undefined,
          subCategoryLabel: ad.sub_category_label || undefined,
          images: ad.images || [],
          videoUrl: ad.video_url || undefined,
          videoStoragePath: ad.video_storage_path || undefined,
          videoDurationSeconds: ad.video_duration_seconds || undefined,
          videoSizeBytes: ad.video_size_bytes || undefined,
          userId: ad.user_id,
          status: getEffectiveAdStatus(ad.status, ad.expires_at) as Ad['status'],
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
          highlightHomeUntil: ad.highlight_home_until
        }))
        setAds(mapped)
      }
      setIsLoading(false)
    }

    fetchAll()
  }, [])

  return { ads, isLoading, error }
}

// Hook para buscar um anuncio especifico
export const useAd = (adId: string | undefined) => {
  const [ad, setAd] = useState<Ad | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!adId) {
      setIsLoading(false)
      return
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(adId)) {
      console.error('[Views] ID invalido:', adId)
      setError('ID de anuncio invalido')
      setIsLoading(false)
      return
    }

    const fetchAd = async () => {
      setIsLoading(true)
      await syncTrustedTime()

      const { data: adData, error: adError } = await supabase
        .from('announcements')
        .select(`
          *,
          categories (name, slug),
          announcement_technical_details (label, value, icon_name)
        `)
        .eq('id', adId)
        .maybeSingle()

      if (adError) {
        setError(adError.message)
        console.error('Erro ao buscar anuncio:', adError)
        setIsLoading(false)
        return
      }

      if (!adData) {
        setAd(null)
        setError('Anúncio não encontrado ou removido')
        setIsLoading(false)
        return
      }

      let sellerData = null
      if (adData?.user_id) {
        console.log('[useAd] Buscando vendedor com ID:', adData.user_id)

        const { data: sellerList, error: sellerError } = await supabase
          .from('vendedores_publicos')
          .select('name, avatar, document_verified, cidade, estado, business_description')
          .eq('id', adData.user_id)

        console.log('[useAd] Resultado da busca:', { sellerList, sellerError })

        if (!sellerError && sellerList && sellerList.length > 0) {
          sellerData = sellerList[0]
          console.log('[useAd] Dados do vendedor encontrados:', sellerData)
        } else if (sellerError) {
          console.error('[useAd] Erro ao buscar vendedor:', sellerError)
        } else {
          console.warn('[useAd] Vendedor nao encontrado na view vendedores_publicos.')
        }
      }

      let sellerStoreData: { slug: string; store_name: string; logo_url?: string | null; is_verified?: boolean } | null = null

      if (adData?.user_id) {
        const { data: storeRow, error: storeError } = await supabase
          .from('seller_stores')
          .select('slug, store_name, logo_url, is_verified')
          .eq('user_id', adData.user_id)
          .eq('is_active', true)
          .eq('is_store_feature_enabled', true)
          .eq('is_paused_due_to_plan', false)
          .maybeSingle()

        if (!storeError && storeRow) {
          sellerStoreData = storeRow as { slug: string; store_name: string; logo_url?: string | null; is_verified?: boolean }
        } else if (storeError) {
          console.warn('[useAd] Nao foi possivel buscar loja do vendedor:', storeError)
        }
      }

      const data = { ...adData, seller: sellerData, sellerStore: sellerStoreData }

      console.log('[useAd] Dados retornados:', data)
      console.log('[useAd] Seller:', data.seller)

      let technicalDetailsArray: any[] = []
      if (data.announcement_technical_details && Array.isArray(data.announcement_technical_details)) {
        technicalDetailsArray = data.announcement_technical_details
          .filter((detail: any) => detail.value && String(detail.value).trim() !== '')
          .map((detail: any) => ({
            label: detail.label,
            value: String(detail.value),
            iconName: detail.icon_name || 'Circle'
          }))
      }

      const mappedAd: Ad = {
        id: data.id,
        title: data.title,
        description: data.description,
        price: parseFloat(data.unit_price || data.price),
        priceNegotiable: !!data.accepts_trade,
        productCondition: data.product_condition || undefined,
        availability: data.availability || undefined,
        acceptsTrade: !!data.accepts_trade,
        hasWarranty: !!data.has_warranty,
        warrantyDetails: data.warranty_details || undefined,
        hasInvoice: !!data.has_invoice,
        location: {
          city: data.city,
          state: data.state,
          cep: data.cep
        },
        categoryId: data.category_id,
        categorySlug: data.categories?.slug,
        subCategoryId: data.sub_category_id || undefined,
        subCategoryLabel: data.sub_category_label || undefined,
        images: data.images || [],
        videoUrl: data.video_url || undefined,
        videoStoragePath: data.video_storage_path || undefined,
        videoDurationSeconds: data.video_duration_seconds || undefined,
        videoSizeBytes: data.video_size_bytes || undefined,
        userId: data.user_id,
        status: getEffectiveAdStatus(data.status, data.expires_at) as Ad['status'],
        views: data.views || 0,
        isPremium: data.is_premium || false,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
        expiredAt: data.expired_at,
        deletionScheduledAt: data.deletion_scheduled_at,
        whatsapp: data.whatsapp,
        technicalDetails: technicalDetailsArray.length > 0 ? technicalDetailsArray : undefined,
        healthScore: data.health_score,
        communityReportsCount: data.community_reports_count || 0,
        communityReportedToReviewAt: data.community_reported_to_review_at || null,
        communityReportReasons: Array.isArray(data.community_report_reasons) ? data.community_report_reasons : [],
        seller: data.seller
          ? {
              ...data.seller,
              store: data.sellerStore
                ? {
                    slug: data.sellerStore.slug,
                    storeName: data.sellerStore.store_name,
                    logoUrl: data.sellerStore.logo_url || undefined,
                    isVerified: data.sellerStore.is_verified || false,
                  }
                : undefined,
            }
          : undefined,
        highlightCategory: data.highlight_category || false,
        highlightCategoryUntil: data.highlight_category_until,
        highlightHome: data.highlight_home || false,
        highlightHomeUntil: data.highlight_home_until
      } as any
      setAd(mappedAd)

      const viewKey = `viewed_ad_${adId}`
      const hasViewed = sessionStorage.getItem(viewKey)

      if (!hasViewed) {
        console.log('[Views] Incrementando visualizacao para:', adId)

        const { error: viewError } = await supabase.rpc('increment_ad_views', { ad_id: adId })

        if (viewError) {
          console.error('[Views] Erro ao incrementar views:', viewError)
        } else {
          sessionStorage.setItem(viewKey, 'true')
          console.log('[Views] Visualizacao incrementada com sucesso')
        }
      } else {
        console.log('[Views] Anuncio ja visualizado nesta sessao')
      }

      setIsLoading(false)
    }

    fetchAd()
  }, [adId])

  return { ad, isLoading, error }
}
