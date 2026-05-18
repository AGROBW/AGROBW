import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Notification } from '../../types'
import { emitCountsRefresh } from '../lib/countSync'
import { appError } from '../utils/appLogger'

export const useNotifications = () => {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = async () => {
    if (!user) {
      setNotifications([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    
    // TODO: Implementar Infinite Scroll quando usuário tiver 100+ notificações
    // - Buscar apenas 20 por vez inicialmente
    // - Adicionar parâmetro `offset` para paginação
    // - Usar IntersectionObserver no modal para detectar scroll no final
    // - Carregar mais ao atingir o final da lista
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20) // Limite inicial para performance

    if (error) {
      setError(error.message)
      appError('Erro ao buscar notificações', error, { userId: user.id })
    } else {
      const mappedNotifications: Notification[] = data.map(notif => ({
        id: notif.id,
        type: notif.type,
        title: notif.title,
        content: notif.content,
        timestamp: notif.created_at,
        isRead: notif.is_read,
        link: notif.link
      }))
      setNotifications(mappedNotifications)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchNotifications()
  }, [user])

  const markAsRead = async (notificationId: string) => {
    if (!user) return

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)

    if (error) {
      appError('Erro ao marcar notificação como lida', error, { notificationId, userId: user.id })
    } else {
      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId ? { ...notif, isRead: true } : notif
        )
      )
      emitCountsRefresh()
    }
  }

  const markAllAsRead = async () => {
    if (!user) return

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (error) {
      appError('Erro ao marcar todas como lidas', error, { userId: user.id })
    } else {
      setNotifications(prev =>
        prev.map(notif => ({ ...notif, isRead: true }))
      )
      emitCountsRefresh()
    }
  }

  const unreadCount = notifications.filter(n => !n.isRead).length

  return {
    notifications,
    isLoading,
    error,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refreshNotifications: fetchNotifications
  }
}

// Hook para buscar notificações de queda de preço
export const usePriceDropNotifications = () => {
  const { user } = useAuth()
  const [priceDrops, setPriceDrops] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setPriceDrops([])
      setIsLoading(false)
      return
    }

    const fetchPriceDrops = async () => {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('price_drop_notifications')
        .select(`
          *,
          ads (title, images)
        `)
        .eq('user_id', user.id)
        .order('notified_at', { ascending: false })
        .limit(10)

      if (error) {
        appError('Erro ao buscar notificações de preço', error, { userId: user.id })
      } else {
        setPriceDrops(data || [])
      }
      setIsLoading(false)
    }

    fetchPriceDrops()
  }, [user])

  return { priceDrops, isLoading }
}

// Hook para verificar oportunidades (selos de 7 dias)
export const useOpportunities = () => {
  const { user } = useAuth()
  const [opportunities, setOpportunities] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return

    const fetchOpportunities = async () => {
      const { data, error } = await supabase
        .from('opportunities')
        .select('announcement_id')
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())

      if (error) {
        appError('Erro ao buscar oportunidades', error, { userId: user.id })
      } else {
        const adIds = new Set(data.map(opp => opp.announcement_id))
        setOpportunities(adIds)
      }
    }

    fetchOpportunities()
  }, [user])

  const isOpportunity = (adId: string): boolean => {
    return opportunities.has(adId)
  }

  return { isOpportunity, opportunitiesCount: opportunities.size }
}
