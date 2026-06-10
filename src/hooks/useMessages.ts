import { useState, useEffect, useRef, useCallback } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { endAppSync, startAppSync } from '../lib/appSyncStatus'
import { emitCountsRefresh } from '../lib/countSync'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseUnauthorizedError } from '../lib/supabaseAuthGuard'
import { isTimestampExpired, syncTrustedTime } from '../lib/trustedTime'
import { Chat, Message, LeadStatus } from '../../types'
import { LEAD_STATUS } from '../../constants/status'
import { toast } from 'sonner'
import { appError, appWarn } from '../utils/appLogger'

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

  if (isTimestampExpired(expiresAt)) {
    return {
      isFrozen: true,
      freezeReason: 'announcement_expired' as const,
      isLeadContactExpired: false
    }
  }

  if (isTimestampExpired(leadContactExpiresAt)) {
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

const normalizeDisplayName = (value?: string | null) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue ? trimmedValue : null
}

const getLeadDetailsByChatId = async (chatIds: string[]) => {
  if (chatIds.length === 0) {
    return new Map<string, { contactExpiresAt: string | null; buyerName: string | null }>()
  }

  const { data, error } = await supabase
    .from('leads')
    .select('chat_id, contact_expires_at, buyer_name')
    .in('chat_id', chatIds)

  if (error) {
    throw error
  }

  return new Map<string, { contactExpiresAt: string | null; buyerName: string | null }>(
    (data || []).map((lead) => [
      lead.chat_id as string,
      {
        contactExpiresAt: lead.contact_expires_at as string | null,
        buyerName: normalizeDisplayName(lead.buyer_name)
      }
    ])
  )
}

const getPublicProfileNamesByUserId = async (userIds: string[]) => {
  if (userIds.length === 0) {
    return new Map<string, string | null>()
  }

  const { data, error } = await supabase
    .from('vendedores_publicos')
    .select('id, name')
    .in('id', userIds)

  if (error) {
    throw error
  }

  return new Map<string, string | null>(
    (data || []).map((profile) => [String(profile.id), normalizeDisplayName(profile.name)])
  )
}

const getUnreadCountsByChatId = async (chatIds: string[]) => {
  if (chatIds.length === 0) {
    return new Map<
      string,
      {
        buyerId: string | null
        sellerId: string | null
        unreadCountBuyer: number
        unreadCountSeller: number
      }
    >()
  }

  const { data, error } = await supabase
    .from('chats')
    .select('id, buyer_id, seller_id, unread_count_buyer, unread_count_seller')
    .in('id', chatIds)

  if (error) {
    throw error
  }

  return new Map<
    string,
    {
      buyerId: string | null
      sellerId: string | null
      unreadCountBuyer: number
      unreadCountSeller: number
    }
  >(
    (data || []).map((chat) => [
      String(chat.id),
      {
        buyerId: chat.buyer_id ? String(chat.buyer_id) : null,
        sellerId: chat.seller_id ? String(chat.seller_id) : null,
        unreadCountBuyer: Number(chat.unread_count_buyer || 0),
        unreadCountSeller: Number(chat.unread_count_seller || 0)
      }
    ])
  )
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
      await syncTrustedTime()

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
          appWarn('[useChats] Sessão expirada ao buscar conversas', { userId: user.id })
          return
        }

        setError(error.message)
        appError('Erro ao buscar chats', error, { userId: user.id })
        if (typeof window !== 'undefined' && retryTimeoutRef.current === null) {
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null
            void fetchChats(true)
          }, 5000)
        }
      } else {
        clearRetry()
        setError(null)
        const chatRows = data || []
        let leadDetailsByChat = new Map<string, { contactExpiresAt: string | null; buyerName: string | null }>()
        let unreadCountsByChatId = new Map<
          string,
          {
            buyerId: string | null
            sellerId: string | null
            unreadCountBuyer: number
            unreadCountSeller: number
          }
        >()
        let publicProfileNamesByUserId = new Map<string, string | null>()

        try {
          // Use the lead record itself as the source of truth for contact locking and buyer display name.
          leadDetailsByChat = await getLeadDetailsByChatId(
            chatRows.map((chat) => chat.id).filter(Boolean)
          )
        } catch (leadError) {
          appError('[useChats] Erro ao buscar dados dos leads', leadError, { userId: user.id })
        }

        try {
          // Avoid relying on an outdated chats_full projection for unread counts.
          unreadCountsByChatId = await getUnreadCountsByChatId(
            chatRows.map((chat) => String(chat.id)).filter(Boolean)
          )
        } catch (unreadError) {
          appError('[useChats] Erro ao buscar contadores reais de nao lidas', unreadError, { userId: user.id })
        }

        try {
          publicProfileNamesByUserId = await getPublicProfileNamesByUserId(
            Array.from(
              new Set(
                chatRows
                  .flatMap((chat) => [String(chat.seller_id || ''), String(chat.buyer_id || '')])
                  .filter(Boolean)
              )
            )
          )
        } catch (profileError) {
          appWarn('[useChats] Erro ao buscar perfis publicos para os nomes das conversas', { userId: user.id, error: profileError })
        }

        const mappedChats: Chat[] = chatRows.map(chat => {
          const leadDetails = leadDetailsByChat.get(chat.id)
          const leadContactExpiresAt =
            leadDetails?.contactExpiresAt ?? chat.lead_contact_expires_at ?? null

          const unreadCountEntry = unreadCountsByChatId.get(String(chat.id))
          const unreadCountFromView =
            typeof chat.unread_count === 'number'
              ? chat.unread_count
              : chat.buyer_id === user.id
                ? Number(chat.unread_count_buyer || 0)
                : chat.seller_id === user.id
                  ? Number(chat.unread_count_seller || 0)
                  : 0

          const unreadCount = unreadCountEntry
            ? unreadCountEntry.buyerId === user.id
              ? unreadCountEntry.unreadCountBuyer
              : unreadCountEntry.sellerId === user.id
                ? unreadCountEntry.unreadCountSeller
                : 0
            : unreadCountFromView

          const adTitle = typeof chat.ad_title === 'string' && chat.ad_title.trim()
            ? chat.ad_title
            : 'Anuncio indisponivel'

          const sellerName =
            normalizeDisplayName(chat.seller_name) ||
            publicProfileNamesByUserId.get(String(chat.seller_id)) ||
            (chat.seller_id === user.id ? normalizeDisplayName(user.name) : null) ||
            'Usuario indisponivel'

          const buyerName =
            normalizeDisplayName(chat.buyer_name) ||
            leadDetails?.buyerName ||
            publicProfileNamesByUserId.get(String(chat.buyer_id)) ||
            (chat.buyer_id === user.id ? normalizeDisplayName(user.name) : null) ||
            'Usuario indisponivel'

          return {
          ...getChatFreezeState(
            chat.announcement_status,
            chat.announcement_expires_at,
            leadContactExpiresAt
          ),
          direction: chat.buyer_id === user.id ? 'sent' : 'received',
          id: chat.id,
          adId: chat.announcement_id,
          adTitle,
          adPrice: parseFloat(chat.ad_price) || 0,
          adImage: chat.ad_image || '',
          adStatus: chat.announcement_status,
          adExpiresAt: chat.announcement_expires_at,
          adExpiredAt: chat.announcement_expired_at,
          adDeletionScheduledAt: chat.announcement_deletion_scheduled_at,
          leadContactExpiresAt,
          sellerId: chat.seller_id,
          sellerName,
          buyerId: chat.buyer_id,
          buyerName,
          lastMessage: chat.last_message || '',
          lastMessageTime: chat.last_message_time || chat.created_at,
          unreadCount,
          status: chat.status,
          createdAt: chat.created_at
        }})

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
          appWarn('[useChats] Realtime instável, sincronizando a lista de conversas em segundo plano', { userId: user.id, status })
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

export const useMessages = (chatId: string | null, fallbackOtherUserName?: string) => {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const retryTimeoutRef = useRef<number | null>(null)

  const resolveSenderName = useCallback((senderId: string, rawSenderName?: string | null) => {
    const senderName = normalizeDisplayName(rawSenderName)

    if (senderName && !['Usuário', 'UsuÃ¡rio', 'Usuario'].includes(senderName)) {
      return senderName
    }

    if (senderId === user?.id) {
      return normalizeDisplayName(user?.name) || 'Usuário'
    }

    return normalizeDisplayName(fallbackOtherUserName) || 'Usuário'
  }, [fallbackOtherUserName, user?.id, user?.name])

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

  const mapMessagesWithResolvedNames = useCallback((data: any[] | null | undefined): Message[] => {
    return mapMessages(data).map((message) => ({
      ...message,
      senderName: resolveSenderName(message.senderId, message.senderName)
    }))
  }, [mapMessages, resolveSenderName])

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
        appError('[markAsRead] Erro ao buscar chat', chatError, { chatId, userId: user.id })
        return
      }

      const isSeller = chatData.seller_id === user.id
      const isBuyer = chatData.buyer_id === user.id

      if (!isSeller && !isBuyer) {
        appWarn('[markAsRead] Usuário não é participante do chat', { chatId, userId: user.id })
        return
      }

      const { error: messagesError } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('chat_id', targetChatId)
        .neq('sender_id', user.id)
        .eq('is_read', false)

      if (messagesError) {
          appError('[markAsRead] Erro ao marcar mensagens como lidas', messagesError, { chatId, userId: user.id })
      }

      const updateField = isSeller ? 'unread_count_seller' : 'unread_count_buyer'
      const { error: chatUpdateError } = await supabase
        .from('chats')
        .update({ [updateField]: 0 })
        .eq('id', targetChatId)

      if (chatUpdateError) {
          appError('[markAsRead] Erro ao atualizar contador do chat', chatUpdateError, { chatId, userId: user.id })
      } else {
        emitCountsRefresh()
      }
    } catch (err) {
      appError('[markAsRead] Erro inesperado', err, { chatId, userId: user.id })
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
          appWarn('[useMessages] Sessão expirada ao buscar mensagens', { chatId, userId: user.id })
          setIsLoading(false)
          if (silent) {
            endAppSync()
          }
          return
        }

        setError(error.message)
        appError('Erro ao buscar mensagens', error, { chatId, userId: user.id })
        if (typeof window !== 'undefined' && retryTimeoutRef.current === null) {
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null
            void fetchMessages(true)
          }, 5000)
        }
      } else {
        clearRetry()
        setError(null)
        setMessages(mapMessagesWithResolvedNames(data))
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

          newMessage.senderName = resolveSenderName(payload.new.sender_id, newMessage.senderName)

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
          appWarn('[useMessages] Realtime instável, sincronizando o chat em segundo plano', { chatId, userId: user.id, status })
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
  }, [chatId, user?.id, mapMessagesWithResolvedNames, resolveSenderName])

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
          setMessages(mapMessagesWithResolvedNames(data))
          await markAsRead(chatId)
          setIsLoading(false)
          endAppSync()
        })
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [chatId, user?.id, mapMessagesWithResolvedNames])

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
      appError('Erro ao enviar mensagem', error, { chatId, userId: user?.id || null })
        if (
        error.message?.includes('Novo contato bloqueado por plano inativo') ||
        error.message?.includes('Novo contato bloqueado por vigencia inativa') ||
        error.message?.includes('Prazo de contato do lead expirado')
      ) {
        toast.error('Novo contato bloqueado', {
          description: 'Este interessado chegou quando a conta ja nao estava em um plano elegivel para novos contatos. Renove ou faca upgrade para liberar a resposta.'
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
        appError('Erro ao buscar status do lead', error, { chatId, userId: user.id })
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
      appError('Erro ao desbloquear lead', error, { chatId, userId: user.id })
      return { success: false, message: 'Erro ao desbloquear lead' }
    }

    setLeadStatus(LEAD_STATUS.CONTACTED)
    return { success: true, message: 'Lead desbloqueado com sucesso!' }
  }

  return { leadStatus, isLoading, unlockLead }
}
