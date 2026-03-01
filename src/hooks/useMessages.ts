import { useState, useEffect } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Chat, Message } from '../types'

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

        // Marcar mensagens como lidas (apenas as recebidas)
        if (mappedMessages.length > 0) {
          const { error: updateError } = await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('chat_id', chatId)
            .neq('sender_id', user.id)
            .eq('is_read', false);
          
          if (updateError) {
            console.error('Erro ao marcar mensagens como lidas:', updateError);
          }
        }
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

          // Marcar como lida se não for do próprio usuário
          if (payload.new.sender_id !== user.id) {
            await supabase
              .from('messages')
              .update({ is_read: true })
              .eq('id', payload.new.id)
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

    return true
  }

  return { messages, isLoading, error, sendMessage }
}

export const useLeadStatus = (chatId: string | null) => {
  const { user } = useAuth()
  const [leadStatus, setLeadStatus] = useState<'pending' | 'unlocked'>('pending')
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
      .update({ status: 'unlocked' })
      .eq('chat_id', chatId)

    if (error) {
      console.error('Erro ao desbloquear lead:', error)
      return { success: false, message: 'Erro ao desbloquear lead' }
    }

    setLeadStatus('unlocked')
    return { success: true, message: 'Lead desbloqueado com sucesso!' }
  }

  return { leadStatus, isLoading, unlockLead }
}
