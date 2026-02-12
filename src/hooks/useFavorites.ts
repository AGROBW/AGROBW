import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Favorite } from '../types'

export const useFavorites = () => {
  const { user } = useAuth()
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFavorites = async () => {
    if (!user) {
      setFavorites([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const { data, error } = await supabase
      .from('favorites')
      .select(`
        *,
        announcements (
          id,
          title,
          description,
          price,
          city,
          state,
          cep,
          category_id,
          images,
          user_id,
          status,
          views,
          is_premium,
          created_at,
          whatsapp
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      console.error('Erro ao buscar favoritos:', error)
    } else {
      const mappedFavorites: Favorite[] = data
        .filter(fav => fav.announcements) // Filtrar favoritos com anúncios deletados
        .map(fav => ({
          id: fav.id,
          userId: fav.user_id,
          adId: fav.announcement_id,
          ad: {
            id: fav.announcements.id,
            title: fav.announcements.title,
            description: fav.announcements.description,
            price: parseFloat(fav.announcements.price),
            location: {
              city: fav.announcements.city,
              state: fav.announcements.state,
              cep: fav.announcements.cep
            },
            categoryId: fav.announcements.category_id,
            images: fav.announcements.images || [],
            userId: fav.announcements.user_id,
            status: fav.announcements.status,
            views: fav.announcements.views || 0,
            isPremium: fav.announcements.is_premium || false,
            createdAt: fav.announcements.created_at,
            whatsapp: fav.announcements.whatsapp
          },
          priceAtFavorite: parseFloat(fav.price_at_favorite),
          favoritedAt: fav.created_at
        }))
      setFavorites(mappedFavorites)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchFavorites()
  }, [user])

  const toggleFavorite = async (adId: string, currentPrice: number) => {
    if (!user) return { success: false, message: 'Usuário não autenticado' }

    const existing = favorites.find(fav => fav.adId === adId)

    if (existing) {
      // Remover favorito
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('id', existing.id)

      if (error) {
        console.error('Erro ao remover favorito:', error)
        return { success: false, message: 'Erro ao remover favorito' }
      }

      await fetchFavorites()
      return { success: true, message: 'Removido dos favoritos' }
    } else {
      // Adicionar favorito
      const { error } = await supabase
        .from('favorites')
        .insert({
          user_id: user.id,
          announcement_id: adId,
          price_at_favorite: currentPrice
        })

      if (error) {
        console.error('Erro ao adicionar favorito:', error)
        return { success: false, message: 'Erro ao adicionar favorito' }
      }

      await fetchFavorites()
      return { success: true, message: 'Adicionado aos favoritos' }
    }
  }

  const isFavorited = (adId: string): boolean => {
    return favorites.some(fav => fav.adId === adId)
  }

  return {
    favorites,
    isLoading,
    error,
    toggleFavorite,
    isFavorited,
    refreshFavorites: fetchFavorites
  }
}
