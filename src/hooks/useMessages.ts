import { useState, useEffect } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Chat, Message, LeadStatus } from '../../types'
import { LEAD_STATUS } from '../../constants/status'

const isAnnouncementFrozen = (status?: string | null, expiresAt?: string | null) => {
  if (status === 'EXPIRED') return true
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= Date.now()
}

export const useChats = (announcementId?: string | null) => {
  const { user } = useAuth()
  const [chats, setChats] = useState<Chat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchChats = async () => {
    if (!user) {
      setChats([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    
    // Construir query base
    let query = supabase
      .from('chats_full') // Usar a VIEW criada no schema
      .select('*')
      .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`);
    
    // Adicionar filtro de anúncio se fornecido
    if (announcementId) {
      query = query.eq('announcement_id', announcementId);
    }
    
    // Ordenar por última mensagem
    query = query.order('last_message_time', { ascending: false });

    const { data, error } = await query;

    if (error) {
      setError(error.message)
      console.error('Erro ao buscar chats:', error)
    } else {
      const mappedChats: Chat[] = data.map(chat => ({
        id: chat.id,
        adId: chat.announcement_id,
        adTitle: chat.ad_title,
        adPrice: parseFloat(chat.ad_price) || 0,
        adImage: chat.ad_image,
        adStatus: chat.announcement_status,
        adExpiresAt: chat.announcement_expires_at,
        adExpiredAt: chat.announcement_expired_at,
        adDeletionScheduledAt: chat.announcement_deletion_scheduled_at,
        isFrozen: isAnnouncementFrozen(chat.announcement_status, chat.announcement_expires_at),
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
      
      // Debug: Log dos chats mapeados
      console.log('[useChats] Total de chats:', mappedChats.length);
      if (mappedChats.length > 0) {
        console.log('[useChats] Primeiro chat mapeado:', mappedChats[0]);
        console.log('[useChats] Preço do primeiro chat:', mappedChats[0].adPrice);
      }
      
      setChats(mappedChats)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchChats()
  }, [user, announcementId])

  return { chats, isLoading, error, refreshChats: fetchChats }
}

export const useMessages = (chatId: string | null) => {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  /**
   * Marca todas as mensagens de um chat como lidas e atualiza os contadores
   */
  const markAsRead = async (targetChatId: string) => {
    if (!user) return;

    try {
      // 1. Buscar informações do chat para determinar o papel do usuário
      const { data: chatData, error: chatError } = await supabase
        .from('chats')
        .select('seller_id, buyer_id, unread_count_seller, unread_count_buyer')
        .eq('id', targetChatId)
        .single();

      if (chatError || !chatData) {
        console.error('[markAsRead] Erro ao buscar chat:', chatError);
        return;
      }

      const isSeller = chatData.seller_id === user.id;
      const isBuyer = chatData.buyer_id === user.id;

      if (!isSeller && !isBuyer) {
        console.warn('[markAsRead] Usuário não é participante do chat');
        return;
      }

      // 2. Marcar mensagens como lidas (apenas as recebidas)
      const { error: messagesError } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('chat_id', targetChatId)
        .neq('sender_id', user.id)
        .eq('is_read', false);

      if (messagesError) {
        console.error('[markAsRead] Erro ao marcar mensagens como lidas:', messagesError);
      }

      // 3. Zerar o contador apropriado no chat
      const updateField = isSeller ? 'unread_count_seller' : 'unread_count_buyer';
      const { error: chatUpdateError } = await supabase
        .from('chats')
        .update({ [updateField]: 0 })
        .eq('id', targetChatId);

      if (chatUpdateError) {
        console.error('[markAsRead] Erro ao atualizar contador do chat:', chatUpdateError);
      }

      console.log(`[markAsRead] Chat ${targetChatId} marcado como lido para ${isSeller ? 'vendedor' : 'comprador'}`);
    } catch (err) {
      console.error('[markAsRead] Erro inesperado:', err);
    }
  };

  useEffect(() => {
    if (!chatId || !user) {
      setMessages([])
      setIsLoading(false)
      return
    }

    const fetchMessages = async () => {
      setIsLoading(true)
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
      } else {
        const mappedMessages: Message[] = data.map(msg => ({
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

        // Marcar mensagens como lidas automaticamente ao selecionar o chat
        await markAsRead(chatId);
      }
      setIsLoading(false)
    }

    fetchMessages()

    // Configurar Realtime
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
          // Buscar dados do usuário que enviou
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

          setMessages(prev => [...prev, newMessage])

          // Marcar como lida automaticamente se não for do próprio usuário
          if (payload.new.sender_id !== user.id) {
            await markAsRead(chatId);
          }
        }
      )
      .subscribe()

    setChannel(newChannel)

    return () => {
      newChannel.unsubscribe()
    }
  }, [chatId, user])

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
      return false
    }

    // Marcar pendências como lidas ao enviar nova mensagem
    await markAsRead(chatId);

    return true
  }

  return { messages, isLoading, error, sendMessage, markAsRead }
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

    fetchLeadStatus()
  }, [chatId, user])

  const unlockLead = async (): Promise<{ success: boolean; message: string }> => {
    if (!chatId || !user) {
      return { success: false, message: 'Dados inválidos' }
    }

    // Verificar créditos do usuário
    const { data: userData } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (!userData || userData.credits < 5) {
      return { success: false, message: 'Créditos insuficientes' }
    }

    // Atualizar status do lead (o trigger deduzirá os créditos automaticamente)
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
