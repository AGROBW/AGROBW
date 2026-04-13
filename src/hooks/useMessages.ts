import { useState, useEffect, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { endAppSync, startAppSync } from '../lib/appSyncStatus'
import { emitCountsRefresh } from '../lib/countSync'
import { useAuth } from '../contexts/AuthContext'
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
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        () => {
          void fetchChats(true)
          emitCountsRefresh()
        }
      )
      .subscribe()

    return () => {
      chatsChannel.unsubscribe()
    }
  }, [user?.id, announcementId])

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return

    const intervalId = window.setInterval(() => {
      void fetchChats(true)
    }, 15000)

    return () => window.clearInterval(intervalId)
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
        const mappedMessages: Message[] = (data || []).map(msg => ({
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

        setMessages(mappedMessages)
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
        (payload) => {
          setMessages(prev =>
            prev.map(message =>
              message.id === payload.new.id
                ? {
                    ...message,
                    content: payload.new.content,
                    isRead: payload.new.is_read,
                    isFiltered: payload.new.is_filtered
                  }
                : message
            )
          )
        }
      )
      .subscribe()

    setChannel(newChannel)

    return () => {
      clearRetry()
      newChannel.unsubscribe()
    }
  }, [chatId, user?.id])

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
            setError(error.message)
            setIsLoading(false)
            endAppSync()
            return
          }

          clearRetry()
          setError(null)
          setMessages((data || []).map(msg => ({
            id: msg.id,
            chatId: msg.chat_id,
            senderId: msg.sender_id,
            senderName: msg.users?.name || 'Usuário',
            content: msg.content,
            timestamp: msg.created_at,
            isRead: msg.is_read,
            senderAvatar: msg.users?.avatar,
            isFiltered: msg.is_filtered
          })))
          await markAsRead(chatId)
          setIsLoading(false)
          endAppSync()
        })
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [chatId, user?.id])

  const sendMessage = async (content: string): Promise<boolean> => {
    if (!chatId || !user || !content.trim()) return false

    const { error } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        sender_id: user.id,
        content: content.trim(),
        is_read: false,
        is_filtered: false
      })

    if (error) {
      console.error('Erro ao enviar mensagem:', error)
      if (error.message?.includes('Prazo de contato do lead expirado')) {
        toast.error('Prazo de contato expirado', {
          description: 'O prazo de acesso ao lead terminou e esta conversa foi bloqueada.'
        })
      } else if (error.message?.includes('Anuncio expirado')) {
        toast.error('Anuncio expirado', {
          description: 'Este anuncio nao aceita mais novas mensagens.'
        })
      }
      return false
    }

    await markAsRead(chatId)
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
