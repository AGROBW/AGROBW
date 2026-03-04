import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Ad } from '../types'

// Hook para buscar anúncios do usuário
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
      const { data, error } = await supabase
        .from('announcements')
        .select(`
          *,
          categories (name, slug)
        `)
        .eq('user_id', user.id)
        .order('highlight_category', { ascending: false })
        .order('highlight_home', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        setError(error.message)
        console.error('Erro ao buscar anúncios:', error)
      } else {
        // Mapear para o formato do tipo Ad
        const mappedAds: Ad[] = data.map(ad => ({
          id: ad.id,
          title: ad.title,
          description: ad.description,
          price: parseFloat(ad.unit_price || ad.price),
          location: {
            city: ad.city,
            state: ad.state,
            cep: ad.cep
          },
          categoryId: ad.category_id,
          categorySlug: ad.categories?.slug,
          images: ad.images || [],
          userId: ad.user_id,
          status: ad.status,
          views: ad.views || 0,
          isPremium: ad.is_premium || false,
          createdAt: ad.created_at,
          whatsapp: ad.whatsapp,
          highlightCategory: ad.highlight_category || false,
          highlightCategoryUntil: ad.highlight_category_until,
          highlightHome: ad.highlight_home || false,
          highlightHomeUntil: ad.highlight_home_until
        }))
        setAds(mappedAds)
      }
      setIsLoading(false)
    }

    fetchAds()
  }, [user])

  return { ads, isLoading, error }
}

// Hook para buscar anúncios públicos (listagem geral)
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
      
      let query = supabase
        .from('announcements')
        .select(`
          *,
          categories (name, slug),
          seller:vendedores_publicos!user_id (name, avatar, document_verified, cidade, estado)
        `)
        .eq('status', 'ACTIVE')

      // Aplicar filtros
      if (filters?.category) {
        const { data: category } = await supabase
          .from('categories')
          .select('id')
          .eq('slug', filters.category)
          .single()
        
        if (category) {
          query = query.eq('category_id', category.id)
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

      query = query
        .order('highlight_category', { ascending: false })
        .order('highlight_home', { ascending: false })
        .order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) {
        setError(error.message)
        console.error('Erro ao buscar anúncios:', error)
      } else {
        const mappedAds: Ad[] = data.map(ad => ({
          id: ad.id,
          title: ad.title,
          description: ad.description,
          price: parseFloat(ad.unit_price || ad.price),
          location: {
            city: ad.city,
            state: ad.state,
            cep: ad.cep
          },
          categoryId: ad.category_id,
          categorySlug: ad.categories?.slug,
          images: ad.images || [],
          userId: ad.user_id,
          status: ad.status,
          views: ad.views || 0,
          isPremium: ad.is_premium || false,
          createdAt: ad.created_at,
          whatsapp: ad.whatsapp,
          highlightCategory: ad.highlight_category || false,
          highlightCategoryUntil: ad.highlight_category_until,
          highlightHome: ad.highlight_home || false,
          highlightHomeUntil: ad.highlight_home_until,
          seller: ad.seller ? (Array.isArray(ad.seller) ? ad.seller[0] : ad.seller) : undefined
        }))
        setAds(mappedAds)
      }
      setIsLoading(false)
    }

    fetchAds()
  }, [filters?.category, filters?.search, filters?.minPrice, filters?.maxPrice, filters?.state])

  return { ads, isLoading, error }
}

// Hook para buscar todos os anúncios (admin)
export const useAllAds = () => {
  const [ads, setAds] = useState<Ad[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true)
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
          location: {
            city: ad.city,
            state: ad.state,
            cep: ad.cep
          },
          categoryId: ad.category_id,
          categorySlug: ad.category_slug,
          images: ad.images || [],
          userId: ad.user_id,
          status: ad.status,
          views: ad.views || 0,
          isPremium: ad.is_premium || false,
          createdAt: ad.created_at,
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

// Hook para buscar um anúncio específico
export const useAd = (adId: string | undefined) => {
  const [ad, setAd] = useState<Ad | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!adId) {
      setIsLoading(false)
      return
    }

    // Validar UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(adId)) {
      console.error('[Views] ID inválido:', adId)
      setError('ID de anúncio inválido')
      setIsLoading(false)
      return
    }

    const fetchAd = async () => {
      setIsLoading(true)
      
      // Buscar anúncio e usuário separadamente para garantir os dados
      const { data: adData, error: adError } = await supabase
        .from('announcements')
        .select(`
          *,
          categories (name, slug),
          announcement_technical_details (label, value, icon_name)
        `)
        .eq('id', adId)
        .single()

      if (adError) {
        setError(adError.message)
        console.error('Erro ao buscar anúncio:', adError)
        setIsLoading(false)
        return
      }

      // Buscar dados do vendedor separadamente usando a view pública
      let sellerData = null
      if (adData?.user_id) {
        console.log('[useAd] Buscando vendedor com ID:', adData.user_id)
        
        const { data: sellerList, error: sellerError } = await supabase
          .from('vendedores_publicos')
          .select('name, avatar, document_verified, cidade, estado')
          .eq('id', adData.user_id)
        
        console.log('[useAd] Resultado da busca:', { sellerList, sellerError })
        
        if (!sellerError && sellerList && sellerList.length > 0) {
          sellerData = sellerList[0]
          console.log('[useAd] Dados do vendedor encontrados:', sellerData)
        } else if (sellerError) {
          console.error('[useAd] Erro ao buscar vendedor:', sellerError)
        } else {
          console.warn('[useAd] Vendedor não encontrado na view vendedores_publicos.')
        }
      }

      const data = { ...adData, seller: sellerData }
      
      console.log('[useAd] Dados retornados:', data)
      console.log('[useAd] Seller:', data.seller)
      
      // Mapear announcement_technical_details (tabela relacional) para technicalDetails array
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
        location: {
          city: data.city,
          state: data.state,
          cep: data.cep
        },
        categoryId: data.category_id,
        categorySlug: data.categories?.slug,
        images: data.images || [],
        userId: data.user_id,
        status: data.status,
        views: data.views || 0,
        isPremium: data.is_premium || false,
        createdAt: data.created_at,
        whatsapp: data.whatsapp,
        technicalDetails: technicalDetailsArray.length > 0 ? technicalDetailsArray : undefined,
        healthScore: data.health_score,
        seller: data.seller || undefined,
        highlightCategory: data.highlight_category || false,
        highlightCategoryUntil: data.highlight_category_until,
        highlightHome: data.highlight_home || false,
        highlightHomeUntil: data.highlight_home_until
      } as any
      setAd(mappedAd)

      // Incrementar views com prevenção de duplicidade
      const viewKey = `viewed_ad_${adId}`
      const hasViewed = sessionStorage.getItem(viewKey)
      
      if (!hasViewed) {
        console.log('[Views] Incrementando visualização para:', adId)
        
        const { error: viewError } = await supabase.rpc('increment_ad_views', { ad_id: adId })
        
        if (viewError) {
          console.error('[Views] Erro ao incrementar views:', viewError)
        } else {
          // Marcar como visualizado na sessão
          sessionStorage.setItem(viewKey, 'true')
          console.log('[Views] Visualização incrementada com sucesso')
        }
      } else {
        console.log('[Views] Anúncio já visualizado nesta sessão')
      }
      
      setIsLoading(false)
    }

    fetchAd()
  }, [adId])

  return { ad, isLoading, error }
}
