import { useState, useEffect, useRef, useCallback } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { endAppSync, startAppSync } from '../lib/appSyncStatus'
import { emitCountsRefresh } from '../lib/countSync'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseUnauthorizedError } from '../lib/supabaseAuthGuard'
import { Chat, Message, LeadStatus } from '../../types'
import { LEAD_STATUS } from '../../constants/status'
import { toast } from 'sonner'

const getChatFreezeState = (
  status?: string | null,
  expiresAt?: string | null,
  leadContactExpiresAt?: string | null
) => {
  if (status === 'EXPIRED') {
    return {
      isFrozen: true,
      freezeReason: 'announcement_expired' as const,
      isLeadContactExpired: false
    }
  }

  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return {
      isFrozen: true,
      freezeReason: 'announcement_expired' as const,
      isLeadContactExpired: false
    }
  }

  if (leadContactExpiresAt && new Date(leadContactExpiresAt).getTime() <= Date.now()) {
    return {
      isFrozen: true,
      freezeReason: 'lead_contact_expired' as const,
      isLeadContactExpired: true
    }
  }

  return {
    isFrozen: false,
    freezeReason: null,
    isLeadContactExpired: false
  }
}

export const useChats = (announcementId?: string | null) => {
  const { user } = useAuth()
  const [chats, setChats] = useState<Chat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const retryTimeoutRef = useRef<number | null>(null)
  const isFetchingRef = useRef(false)

  const clearRetry = () => {
    if (retryTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }

  const fetchChats = async (silent = false) => {
    if (!user) {
      setChats([])
      setIsLoading(false)
      return
    }

    if (isFetchingRef.current) {
      return
    }

    isFetchingRef.current = true

    try {
      if (!silent) {
        setIsLoading(true)
      } else {
        startAppSync()
      }

      let query = supabase
        .from('chats_full')
        .select('*')
        .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)

      if (announcementId) {
        query = query.eq('announcement_id', announcementId)
      }

      query = query.order('last_message_time', { ascending: false })

      const { data, error } = await query

      if (error) {
        if (isSupabaseUnauthorizedError(error)) {
          clearRetry()
          setError('Sessão expirada')
          setChats([])
          console.warn('[useChats] Sessão expirada ao buscar conversas.')
          return
        }

        setError(error.message)
        console.error('Erro ao buscar chats:', error)
        if (typeof window !== 'undefined' && retryTimeoutRef.current === null) {
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null
            void fetchChats(true)
          }, 5000)
        }
      } else {
        clearRetry()
        setError(null)
        const mappedChats: Chat[] = (data || []).map(chat => ({
          ...getChatFreezeState(
            chat.announcement_status,
            chat.announcement_expires_at,
            chat.lead_contact_expires_at
          ),
          direction: chat.buyer_id === user.id ? 'sent' : 'received',
          id: chat.id,
          adId: chat.announcement_id,
          adTitle: chat.ad_title,
          adPrice: parseFloat(chat.ad_price) || 0,
          adImage: chat.ad_image,
          adStatus: chat.announcement_status,
          adExpiresAt: chat.announcement_expires_at,
          adExpiredAt: chat.announcement_expired_at,
          adDeletionScheduledAt: chat.announcement_deletion_scheduled_at,
          leadContactExpiresAt: chat.lead_contact_expires_at,
          sellerId: chat.seller_id,
          sellerName: chat.seller_name,
          buyerId: chat.buyer_id,
          buyerName: chat.buyer_name,
          lastMessage: chat.last_message || '',
          lastMessageTime: chat.last_message_time || chat.created_at,
          unreadCount: chat.unread_count || 0,
          status: chat.status,
          createdAt: chat.created_at
        }))

        setChats(mappedChats)
      }
    } finally {
      setIsLoading(false)
      if (silent) {
        endAppSync()
      }

      isFetchingRef.current = false
    }
  }

  useEffect(() => {
    void fetchChats()
    return () => clearRetry()
  }, [user?.id, announcementId])

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return

    const handleOnline = () => {
      void fetchChats(true)
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [user?.id, announcementId])

  useEffect(() => {
    if (!user?.id) return

    const chatsChannel = supabase
      .channel(`chat-list:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats',
          filter: `seller_id=eq.${user.id}`
        },
        () => {
          void fetchChats(true)
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
          void fetchChats(true)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        () => {
          void fetchChats(true)
          emitCountsRefresh()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void fetchChats(true)
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[useChats] Realtime instável, sincronizando a lista de conversas em segundo plano.')
          void fetchChats(true)
        }
      })

    return () => {
      chatsChannel.unsubscribe()
    }
  }, [user?.id, announcementId])

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void fetchChats(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    const intervalId = window.setInterval(() => {
      void fetchChats(true)
    }, 5000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [user?.id, announcementId])

  return { chats, isLoading, error, refreshChats: fetchChats }
}

export const useMessages = (chatId: string | null) => {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const retryTimeoutRef = useRef<number | null>(null)

  const mapMessages = useCallback((data: any[] | null | undefined): Message[] => {
    return (data || []).map(msg => ({
      id: msg.id,
      chatId: msg.chat_id,
      senderId: msg.sender_id,
      senderName: msg.users?.name || 'Usuário',
      content: msg.content,
      timestamp: msg.created_at,
      isRead: msg.is_read,
      senderAvatar: msg.users?.avatar,
      isFiltered: msg.is_filtered
    }))
  }, [])

  const clearRetry = () => {
    if (retryTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }

  const markAsRead = async (targetChatId: string) => {
    if (!user) return

    try {
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .select('seller_id, buyer_id, unread_count_seller, unread_count_buyer')
        .eq('id', targetChatId)
        .single()

      if (chatError || !chatData) {
        console.error('[markAsRead] Erro ao buscar chat:', chatError)
        return
      }

      const isSeller = chatData.seller_id === user.id
      const isBuyer = chatData.buyer_id === user.id

      if (!isSeller && !isBuyer) {
        console.warn('[markAsRead] Usuário não é participante do chat')
        return
      }

      const { error: messagesError } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('chat_id', targetChatId)
        .neq('sender_id', user.id)
        .eq('is_read', false)

      if (messagesError) {
        console.error('[markAsRead] Erro ao marcar mensagens como lidas:', messagesError)
      }

      const updateField = isSeller ? 'unread_count_seller' : 'unread_count_buyer'
      const { error: chatUpdateError } = await supabase
        .from('chats')
        .update({ [updateField]: 0 })
        .eq('id', targetChatId)

      if (chatUpdateError) {
        console.error('[markAsRead] Erro ao atualizar contador do chat:', chatUpdateError)
      } else {
        emitCountsRefresh()
      }
    } catch (err) {
      console.error('[markAsRead] Erro inesperado:', err)
    }
  }

  useEffect(() => {
    if (!chatId || !user) {
      setMessages([])
      setIsLoading(false)
      return
    }

    const fetchMessages = async (silent = false) => {
      if (!silent) {
        setIsLoading(true)
      } else {
        startAppSync()
      }

      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          users (name, avatar)
        `)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })

      if (error) {
        if (isSupabaseUnauthorizedError(error)) {
          clearRetry()
          setError('Sessão expirada')
          console.warn('[useMessages] Sessão expirada ao buscar mensagens.')
          setIsLoading(false)
          if (silent) {
            endAppSync()
          }
          return
        }

        setError(error.message)
        console.error('Erro ao buscar mensagens:', error)
        if (typeof window !== 'undefined' && retryTimeoutRef.current === null) {
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null
            void fetchMessages(true)
          }, 5000)
        }
      } else {
        clearRetry()
        setError(null)
        setMessages(mapMessages(data))
        await markAsRead(chatId)
      }

      setIsLoading(false)
      if (silent) {
        endAppSync()
      }
    }

    void fetchMessages()

    const newChannel = supabase
      .channel(`messages:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        async (payload) => {
          const { data: userData } = await supabase
            .from('users')
            .select('name, avatar')
            .eq('id', payload.new.sender_id)
            .single()

          const newMessage: Message = {
            id: payload.new.id,
            chatId: payload.new.chat_id,
            senderId: payload.new.sender_id,
            senderName: userData?.name || 'Usuário',
            content: payload.new.content,
            timestamp: payload.new.created_at,
            isRead: payload.new.is_read,
            senderAvatar: userData?.avatar,
            isFiltered: payload.new.is_filtered
          }

          setMessages(prev => {
            if (prev.some(message => message.id === newMessage.id)) {
              return prev
            }

            return [...prev, newMessage]
          })

          if (payload.new.sender_id !== user.id) {
            await markAsRead(chatId)
          }

          void fetchMessages(true)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        () => {
          void fetchMessages(true)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        () => {
          void fetchMessages(true)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void fetchMessages(true)
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[useMessages] Realtime instável, sincronizando o chat em segundo plano.')
          void fetchMessages(true)
        }
      })

    setChannel(newChannel)

    const intervalId = typeof window !== 'undefined'
      ? window.setInterval(() => {
          void fetchMessages(true)
        }, 5000)
      : null

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void fetchMessages(true)
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    return () => {
      clearRetry()
      if (intervalId !== null && typeof window !== 'undefined') {
        window.clearInterval(intervalId)
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      newChannel.unsubscribe()
    }
  }, [chatId, user?.id, mapMessages])

  useEffect(() => {
    if (typeof window === 'undefined' || !chatId || !user?.id) return

    const handleOnline = () => {
      setIsLoading(true)
      startAppSync()
      void supabase
        .from('messages')
        .select(`
          *,
          users (name, avatar)
        `)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
        .then(async ({ data, error }) => {
          if (error) {
            if (isSupabaseUnauthorizedError(error)) {
              clearRetry()
              setError('Sessão expirada')
              setIsLoading(false)
              endAppSync()
              return
            }

            setError(error.message)
            setIsLoading(false)
            endAppSync()
            return
          }

          clearRetry()
          setError(null)
          setMessages(mapMessages(data))
          await markAsRead(chatId)
          setIsLoading(false)
          endAppSync()
        })
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [chatId, user?.id, mapMessages])

  const sendMessage = async (content: string): Promise<boolean> => {
    if (!chatId || !user || !content.trim()) return false

    const trimmedContent = content.trim()
    const optimisticMessageId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const optimisticMessage: Message = {
      id: optimisticMessageId,
      chatId,
      senderId: user.id,
      senderName: user.name || 'Usuário',
      content: trimmedContent,
      timestamp: new Date().toISOString(),
      isRead: false,
      senderAvatar: user.avatar || undefined,
      isFiltered: false,
      isPending: true
    }

    setMessages(prev => [...prev, optimisticMessage])

    const { data, error } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        sender_id: user.id,
        content: trimmedContent,
        is_read: false,
        is_filtered: false
      })
      .select('id, chat_id, sender_id, content, created_at, is_read, is_filtered')
      .single()

    if (error) {
      setMessages(prev => prev.filter(message => message.id !== optimisticMessageId))
      console.error('Erro ao enviar mensagem:', error)
      if (
        error.message?.includes('Novo contato bloqueado por plano inativo') ||
        error.message?.includes('Prazo de contato do lead expirado')
      ) {
        toast.error('Novo contato bloqueado', {
          description: 'Este interessado chegou fora da vigencia do seu plano pago. Renove ou faca upgrade para liberar a resposta.'
        })
      } else if (error.message?.includes('Anuncio expirado')) {
        toast.error('Anuncio expirado', {
          description: 'Este anuncio nao aceita mais novas mensagens.'
        })
      } else {
        toast.error('Não foi possível enviar a mensagem.', {
          description: 'Tente novamente em instantes.'
        })
      }
      return false
    }

    if (data) {
      setMessages(prev =>
        prev.map(message =>
          message.id === optimisticMessageId
            ? {
                id: data.id,
                chatId: data.chat_id,
                senderId: data.sender_id,
                senderName: user.name || 'Usuário',
                content: data.content,
                timestamp: data.created_at,
                isRead: data.is_read,
                senderAvatar: user.avatar || undefined,
                isFiltered: data.is_filtered,
                isPending: false
              }
            : message
        )
      )
    }

    await markAsRead(chatId)
    emitCountsRefresh()
    return true
  }

  return { messages, isLoading, error, sendMessage, markAsRead, channel }
}

export const useLeadStatus = (chatId: string | null) => {
  const { user } = useAuth()
  const [leadStatus, setLeadStatus] = useState<LeadStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!chatId || !user) {
      setIsLoading(false)
      return
    }

    const fetchLeadStatus = async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('status')
        .eq('chat_id', chatId)
        .single()

      if (error) {
        console.error('Erro ao buscar status do lead:', error)
      } else if (data) {
        setLeadStatus(data.status)
      }
      setIsLoading(false)
    }

    void fetchLeadStatus()
  }, [chatId, user?.id])

  const unlockLead = async (): Promise<{ success: boolean; message: string }> => {
    if (!chatId || !user) {
      return { success: false, message: 'Dados inválidos' }
    }

    const { data: userData } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (!userData || userData.credits < 5) {
      return { success: false, message: 'Créditos insuficientes' }
    }

    const { error } = await supabase
      .from('leads')
      .update({ status: LEAD_STATUS.CONTACTED })
      .eq('chat_id', chatId)

    if (error) {
      console.error('Erro ao desbloquear lead:', error)
      return { success: false, message: 'Erro ao desbloquear lead' }
    }

    setLeadStatus(LEAD_STATUS.CONTACTED)
    return { success: true, message: 'Lead desbloqueado com sucesso!' }
  }

  return { leadStatus, isLoading, unlockLead }
}
