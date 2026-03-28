import { useState, useEffect, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { endAppSync, startAppSync } from '../lib/appSyncStatus'
import { subscribeToCountsRefresh } from '../lib/countSync'
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
  const retryTimeoutRef = useRef<number | null>(null)

  const clearRetry = () => {
    if (retryTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }

  const scheduleRetry = () => {
    if (typeof window === 'undefined' || retryTimeoutRef.current !== null) return

    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null
      startAppSync()
      void Promise.all([fetchMessagesCount(), fetchNotificationsCount()]).finally(() => {
        endAppSync()
      })
    }, 5000)
  }

  const fetchMessagesCount = async () => {
    if (!user) {
      setMessagesCount(0)
      return
    }

    try {
      const { data, error } = await supabase
        .from('chats')
        .select('unread_count_seller, unread_count_buyer, seller_id, buyer_id')
        .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)

      if (error) throw error

      const totalUnread = (data || []).reduce((sum, chat) => {
        if (chat.seller_id === user.id) {
          return sum + (chat.unread_count_seller || 0)
        }
        if (chat.buyer_id === user.id) {
          return sum + (chat.unread_count_buyer || 0)
        }
        return sum
      }, 0)

      setMessagesCount(totalUnread)
      clearRetry()
    } catch (error) {
      console.error('Erro ao buscar contador de mensagens:', error)
      setMessagesCount(0)
      scheduleRetry()
    }
  }

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
      clearRetry()
    } catch (error) {
      console.error('Erro ao buscar contador de notificações:', error)
      setNotificationsCount(0)
      scheduleRetry()
    }
  }

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

    void fetchCounts()

    return () => clearRetry()
  }, [user?.id])

  useEffect(() => {
    if (!user) return

    let chatsChannel: RealtimeChannel | null = null

    chatsChannel = supabase
      .channel('chats_count_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats',
          filter: `seller_id=eq.${user.id}`
        },
        () => {
          void fetchMessagesCount()
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
        () => {
          void fetchMessagesCount()
        }
      )
      .subscribe()

    return () => {
      if (chatsChannel) {
        supabase.removeChannel(chatsChannel)
      }
    }
  }, [user?.id])

  useEffect(() => {
    if (!user) return

    let notificationsChannel: RealtimeChannel | null = null

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
        () => {
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
        () => {
          void fetchNotificationsCount()
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
        () => {
          void fetchNotificationsCount()
        }
      )
      .subscribe()

    return () => {
      if (notificationsChannel) {
        supabase.removeChannel(notificationsChannel)
      }
    }
  }, [user?.id])

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return

    const handleOnline = () => {
      startAppSync()
      void Promise.all([fetchMessagesCount(), fetchNotificationsCount()]).finally(() => {
        endAppSync()
      })
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return

    return subscribeToCountsRefresh(() => {
      startAppSync()
      void Promise.all([fetchMessagesCount(), fetchNotificationsCount()]).finally(() => {
        endAppSync()
      })
    })
  }, [user?.id])

  return {
    messagesCount,
    notificationsCount,
    isLoading
  }
}
