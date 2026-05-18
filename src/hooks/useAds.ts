import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Ad } from '../../types'
import { getCategoryGroupBySlug, getGroupCategorySlugs } from '../lib/categoryHierarchy'
import { isTimestampExpired, syncTrustedTime } from '../lib/trustedTime'
import { appError, appWarn } from '../utils/appLogger'

const USER_ADS_SELECT = `
  id,
  title,
  description,
  price,
  unit_price,
  price_negotiable,
  product_condition,
  availability,
  accepts_trade,
  has_warranty,
  warranty_details,
  has_invoice,
  city,
  state,
  cep,
  category_id,
  category_slug,
  sub_category_id,
  sub_category_label,
  images,
  video_url,
  video_storage_path,
  video_duration_seconds,
  video_size_bytes,
  user_id,
  status,
  views,
  is_premium,
  created_at,
  expires_at,
  expired_at,
  rejected_at,
  rejection_reason,
  deletion_scheduled_at,
  whatsapp,
  highlight_category,
  highlight_category_until,
  highlight_home,
  highlight_home_until
`

const USER_ADS_SELECT_FALLBACK = `
  id,
  title,
  description,
  price,
  unit_price,
  price_negotiable,
  product_condition,
  availability,
  accepts_trade,
  has_warranty,
  warranty_details,
  has_invoice,
  city,
  state,
  cep,
  category_id,
  category_slug,
  sub_category_id,
  sub_category_label,
  images,
  video_url,
  video_storage_path,
  video_duration_seconds,
  video_size_bytes,
  user_id,
  status,
  views,
  is_premium,
  created_at,
  expires_at,
  expired_at,
  deletion_scheduled_at,
  whatsapp,
  highlight_category,
  highlight_category_until,
  highlight_home,
  highlight_home_until
`

const PUBLIC_ADS_SELECT = `
  id,
  title,
  description,
  price,
  unit_price,
  price_negotiable,
  product_condition,
  availability,
  accepts_trade,
  has_warranty,
  warranty_details,
  has_invoice,
  city,
  state,
  cep,
  category_id,
  category_slug,
  sub_category_id,
  sub_category_label,
  images,
  video_url,
  video_storage_path,
  video_duration_seconds,
  video_size_bytes,
  user_id,
  status,
  views,
  is_premium,
  created_at,
  updated_at,
  expires_at,
  expired_at,
  deletion_scheduled_at,
  whatsapp,
  highlight_category,
  highlight_category_until,
  highlight_home,
  highlight_home_until,
  community_reports_count,
  community_reported_to_review_at,
  community_report_reasons,
  seller:vendedores_publicos!user_id (name, avatar, document_verified, cidade, estado)
`

const ADMIN_ADS_SELECT = `
  id,
  title,
  description,
  price,
  unit_price,
  price_negotiable,
  product_condition,
  availability,
  accepts_trade,
  has_warranty,
  warranty_details,
  has_invoice,
  city,
  state,
  cep,
  category_id,
  category_slug,
  sub_category_id,
  sub_category_label,
  images,
  video_url,
  video_storage_path,
  video_duration_seconds,
  video_size_bytes,
  user_id,
  status,
  views,
  is_premium,
  created_at,
  expires_at,
  expired_at,
  deletion_scheduled_at,
  whatsapp,
  highlight_category,
  highlight_category_until,
  highlight_home,
  highlight_home_until
`

const SINGLE_AD_SELECT = `
  id,
  title,
  description,
  price,
  unit_price,
  price_negotiable,
  product_condition,
  availability,
  accepts_trade,
  has_warranty,
  warranty_details,
  has_invoice,
  city,
  state,
  cep,
  category_id,
  category_slug,
  sub_category_id,
  sub_category_label,
  images,
  video_url,
  video_storage_path,
  video_duration_seconds,
  video_size_bytes,
  user_id,
  status,
  views,
  is_premium,
  created_at,
  expires_at,
  expired_at,
  deletion_scheduled_at,
  whatsapp,
  health_score,
  community_reports_count,
  community_reported_to_review_at,
  community_report_reasons,
  highlight_category,
  highlight_category_until,
  highlight_home,
  highlight_home_until,
  announcement_technical_details (label, value, icon_name)
`

const getEffectiveAdStatus = (status: string, expiresAt?: string | null) => {
  if ((status === 'ACTIVE' || status === 'active') && isTimestampExpired(expiresAt)) {
    return 'EXPIRED';
  }

  return status;
};

const HIGHLIGHT_COOLDOWN_DAYS = 15;

const getHighlightCooldownAvailableAfter = (highlight: { expires_at?: string | null; applied_at?: string | null }) => {
  const baseValue = highlight.expires_at || highlight.applied_at;

  if (!baseValue) {
    return null;
  }

  const baseDate = new Date(baseValue);

  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }

  const availableAfter = new Date(baseDate);
  availableAfter.setDate(availableAfter.getDate() + HIGHLIGHT_COOLDOWN_DAYS);
  return availableAfter.toISOString();
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

export const adminDeleteAnnouncementWithNotification = async (
  announcementId: string,
  reason: string,
) => {
  const { data, error } = await supabase.rpc('admin_delete_announcement_with_notification', {
    p_announcement_id: announcementId,
    p_reason: reason,
  });

  if (error) {
    throw error;
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Falha ao excluir anuncio com notificacao');
  }

  return data;
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
      const fetchUserAnnouncements = async () => {
        const primaryResult = await supabase
          .from('announcements')
          .select(USER_ADS_SELECT)
          .eq('user_id', user.id)
          .order('highlight_category', { ascending: false })
          .order('highlight_home', { ascending: false })
          .order('created_at', { ascending: false })

        if (!primaryResult.error) {
          return primaryResult
        }

        const missingRejectedColumns =
          /rejected_at|rejection_reason/i.test(primaryResult.error.message || '')

        if (!missingRejectedColumns) {
          return primaryResult
        }

        appWarn('[useUserAds] Consulta completa falhou; usando fallback compativel para anuncios do usuario', {
          userId: user.id,
          error: primaryResult.error,
        })

        return supabase
          .from('announcements')
          .select(USER_ADS_SELECT_FALLBACK)
          .eq('user_id', user.id)
          .order('highlight_category', { ascending: false })
          .order('highlight_home', { ascending: false })
          .order('created_at', { ascending: false })
      }

      const [{ data, error }, { data: editRequests, error: pendingEditRequestsError }] = await Promise.all([
        fetchUserAnnouncements(),
        supabase
          .from('announcement_edit_requests')
          .select('announcement_id,status,rejection_reason,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
      ])

      if (error) {
        setError(error.message)
        appError('Erro ao buscar anuncios do usuário', error, { userId: user.id })
      } else {
        const announcementIds = Array.from(new Set((data || []).map((ad: any) => ad.id).filter(Boolean)))
        const latestHighlightHistoryByAnnouncement = new Map<string, {
          categoryAvailableAfter?: string | null
          homeAvailableAfter?: string | null
        }>()

        if (announcementIds.length > 0) {
          const { data: highlightHistory, error: highlightHistoryError } = await supabase
            .from('announcement_highlights_history')
            .select('announcement_id,highlight_type,applied_at,expires_at')
            .in('announcement_id', announcementIds)
            .in('highlight_type', ['category', 'home'])
            .order('applied_at', { ascending: false })

          if (highlightHistoryError) {
            appWarn('[useUserAds] Erro ao buscar historico de cooldown de destaques', {
              userId: user.id,
              error: highlightHistoryError,
              announcementCount: announcementIds.length,
            })
          } else {
            const seenHighlightKeys = new Set<string>()

            for (const item of (highlightHistory || []) as any[]) {
              if (!item?.announcement_id || !item?.highlight_type) continue

              const historyKey = `${item.announcement_id}:${item.highlight_type}`
              if (seenHighlightKeys.has(historyKey)) continue
              seenHighlightKeys.add(historyKey)

              const current = latestHighlightHistoryByAnnouncement.get(item.announcement_id) || {}
              const availableAfter = getHighlightCooldownAvailableAfter(item)

              if (item.highlight_type === 'category') {
                current.categoryAvailableAfter = availableAfter
              }

              if (item.highlight_type === 'home') {
                current.homeAvailableAfter = availableAfter
              }

              latestHighlightHistoryByAnnouncement.set(item.announcement_id, current)
            }
          }
        }

        if (pendingEditRequestsError && pendingEditRequestsError.code !== 'PGRST205') {
          appError('Erro ao buscar edicoes pendentes do usuario', pendingEditRequestsError, { userId: user.id })
        }

        const latestEditRequestByAnnouncement = new Map<string, { status: 'pending' | 'approved' | 'rejected'; rejection_reason?: string | null }>()

        for (const item of (editRequests || []) as any[]) {
          if (!item?.announcement_id || latestEditRequestByAnnouncement.has(item.announcement_id)) continue
          latestEditRequestByAnnouncement.set(item.announcement_id, {
            status: item.status,
            rejection_reason: item.rejection_reason || null,
          })
        }

        const mappedAds: Ad[] = data.map(ad => {
          const latestHighlightState = latestHighlightHistoryByAnnouncement.get(ad.id)

          return ({
          id: ad.id,
          title: ad.title,
          description: ad.description,
          price: parseFloat(ad.unit_price || ad.price),
          priceNegotiable: !!(ad.price_negotiable ?? ad.accepts_trade),
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
          rejectedAt: (('rejected_at' in ad ? (ad as any).rejected_at : null) as string | null),
          rejectionReason: ((('rejection_reason' in ad ? (ad as any).rejection_reason : null) || null) as string | null),
          deletionScheduledAt: ad.deletion_scheduled_at,
          whatsapp: ad.whatsapp,
          highlightCategory: ad.highlight_category || false,
          highlightCategoryUntil: ad.highlight_category_until,
          highlightCategoryAvailableAfter: latestHighlightState?.categoryAvailableAfter || null,
          highlightHome: ad.highlight_home || false,
          highlightHomeUntil: ad.highlight_home_until,
          highlightHomeAvailableAfter: latestHighlightState?.homeAvailableAfter || null,
          latestEditRequestStatus: latestEditRequestByAnnouncement.get(ad.id)?.status || null,
          latestEditRejectionReason: latestEditRequestByAnnouncement.get(ad.id)?.rejection_reason || null,
        })})
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
        .select(PUBLIC_ADS_SELECT)
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
            appWarn('[usePublicAds] Categoria nao encontrada para slug', { categorySlug: filters.category, error: categoryError })
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
        appError('Erro ao buscar anuncios públicos', error, { filters })
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
            appWarn('[usePublicAds] Erro ao buscar lojas oficiais para listagem', { error: storesError, announcementCount: announcementIds.length })
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
            appWarn('[usePublicAds] Erro ao buscar sinais publicos de plano para ranking', { error: planSignalsError, announcementCount: announcementIds.length })
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
            appWarn('[usePublicAds] Erro ao buscar sinais publicos de engajamento recente para ranking', { error: engagementSignalsError, announcementCount: announcementIds.length })
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
          priceNegotiable: !!(ad.price_negotiable ?? ad.accepts_trade),
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
        .select(ADMIN_ADS_SELECT)
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
          priceNegotiable: !!(ad.price_negotiable ?? ad.accepts_trade),
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
      appWarn('[Views] ID invalido', { adId })
      setError('ID de anuncio invalido')
      setIsLoading(false)
      return
    }

    const fetchAd = async () => {
      setIsLoading(true)
      await syncTrustedTime()

      const { data: adData, error: adError } = await supabase
        .from('announcements')
        .select(SINGLE_AD_SELECT)
        .eq('id', adId)
        .maybeSingle()

      if (adError) {
        setError(adError.message)
        appError('Erro ao buscar anuncio', adError, { adId })
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
      let sellerStoreData: { slug: string; store_name: string; logo_url?: string | null; is_verified?: boolean } | null = null

      if (adData?.user_id) {
        const [
          { data: sellerList, error: sellerError },
          { data: storeRow, error: storeError },
        ] = await Promise.all([
          supabase
            .from('vendedores_publicos')
            .select('name, avatar, document_verified, cidade, estado, business_description')
            .eq('id', adData.user_id),
          supabase
            .from('seller_stores')
            .select('slug, store_name, logo_url, is_verified')
            .eq('user_id', adData.user_id)
            .eq('is_active', true)
            .eq('is_store_feature_enabled', true)
            .eq('is_paused_due_to_plan', false)
            .maybeSingle(),
        ])

        if (!sellerError && sellerList && sellerList.length > 0) {
          sellerData = sellerList[0]
        } else if (sellerError) {
          appError('[useAd] Erro ao buscar vendedor', sellerError, { adId, sellerId: adData.user_id })
        }

        if (!storeError && storeRow) {
          sellerStoreData = storeRow as { slug: string; store_name: string; logo_url?: string | null; is_verified?: boolean }
        } else if (storeError) {
          appWarn('[useAd] Nao foi possivel buscar loja do vendedor', { adId, sellerId: adData.user_id, error: storeError })
        }
      }

      const data = { ...adData, seller: sellerData, sellerStore: sellerStoreData }

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
        priceNegotiable: !!(data.price_negotiable ?? data.accepts_trade),
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
        categorySlug: data.category_slug,
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
        const { error: viewError } = await supabase.rpc('increment_ad_views', { ad_id: adId })

        if (viewError) {
          appError('[Views] Erro ao incrementar views', viewError, { adId })
        } else {
          sessionStorage.setItem(viewKey, 'true')
        }
      }

      setIsLoading(false)
    }

    fetchAd()
  }, [adId])

  return { ad, isLoading, error }
}
