import { useState, useEffect } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

interface NotificationCounts {
  messagesCount: number
  notificationsCount: number
  isLoading: boolean
}

export const useNotificationsCount = (): NotificationCounts => {
  const { user } = useAuth()
  const [messagesCount, setMessagesCount] = useState(0)
  const [notificationsCount, setNotificationsCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  // Função para buscar contador de mensagens não lidas
  const fetchMessagesCount = async () => {
    if (!user) {
      setMessagesCount(0)
      return
    }

    try {
      // Buscar soma de unread_count dos chats do usuário
      const { data, error } = await supabase
        .from('chats')
        .select('unread_count_seller, unread_count_buyer, seller_id, buyer_id')
        .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)

      if (error) throw error

      // Somar apenas o contador correto baseado no papel do usuário em cada chat
      const totalUnread = data.reduce((sum, chat) => {
        if (chat.seller_id === user.id) {
          return sum + (chat.unread_count_seller || 0)
        } else if (chat.buyer_id === user.id) {
          return sum + (chat.unread_count_buyer || 0)
        }
        return sum
      }, 0)

      setMessagesCount(totalUnread)
    } catch (error) {
      console.error('Erro ao buscar contador de mensagens:', error)
      setMessagesCount(0)
    }
  }

  // Função para buscar contador de notificações não lidas
  const fetchNotificationsCount = async () => {
    if (!user) {
      setNotificationsCount(0)
      return
    }

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)

      if (error) throw error

      setNotificationsCount(count || 0)
    } catch (error) {
      console.error('Erro ao buscar contador de notificações:', error)
      setNotificationsCount(0)
    }
  }

  // Buscar contadores iniciais
  useEffect(() => {
    if (!user) {
      setMessagesCount(0)
      setNotificationsCount(0)
      setIsLoading(false)
      return
    }

    const fetchCounts = async () => {
      setIsLoading(true)
      await Promise.all([fetchMessagesCount(), fetchNotificationsCount()])
      setIsLoading(false)
    }

    fetchCounts()
  }, [user])

  // Setup Realtime para chats
  useEffect(() => {
    if (!user) return

    let chatsChannel: RealtimeChannel | null = null

    const setupChatsRealtime = async () => {
      chatsChannel = supabase
        .channel('chats_count_changes')
        .on(
          'postgres_changes',
          {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'chats',
            filter: `seller_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[useNotificationsCount] Chat mudou (seller):', payload)
            fetchMessagesCount()
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chats',
            filter: `buyer_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[useNotificationsCount] Chat mudou (buyer):', payload)
            fetchMessagesCount()
          }
        )
        .subscribe()
    }

    setupChatsRealtime()

    return () => {
      if (chatsChannel) {
        supabase.removeChannel(chatsChannel)
      }
    }
  }, [user])

  // Setup Realtime para notifications
  useEffect(() => {
    if (!user) return

    let notificationsChannel: RealtimeChannel | null = null

    const setupNotificationsRealtime = async () => {
      notificationsChannel = supabase
        .channel('notifications_count_changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[useNotificationsCount] Nova notificação inserida:', payload)
            // Incrementar diretamente para resposta imediata
            setNotificationsCount(prev => prev + 1)
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[useNotificationsCount] Notificação atualizada:', payload)
            // Refetch para garantir precisão
            fetchNotificationsCount()
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[useNotificationsCount] Notificação deletada:', payload)
            fetchNotificationsCount()
          }
        )
        .subscribe()
    }

    setupNotificationsRealtime()

    return () => {
      if (notificationsChannel) {
        supabase.removeChannel(notificationsChannel)
      }
    }
  }, [user])

  return {
    messagesCount,
    notificationsCount,
    isLoading
  }
}
