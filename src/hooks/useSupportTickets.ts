import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketMessage,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../../types';

type TicketScope = 'user' | 'admin';

type CreateTicketInput = {
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  description: string;
};

const isTicketLocked = (status: SupportTicketStatus) =>
  status === 'resolved' || status === 'closed';

const mapTicket = (ticket: any): SupportTicket => ({
  id: ticket.id,
  userId: ticket.user_id,
  subject: ticket.subject,
  category: ticket.category,
  priority: ticket.priority,
  status: ticket.status,
  description: ticket.description,
  assignedAdminId: ticket.assigned_admin_id,
  lastMessageAt: ticket.last_message_at,
  createdAt: ticket.created_at,
  updatedAt: ticket.updated_at,
  requesterName: ticket.requester?.name ?? null,
  requesterEmail: ticket.requester?.email ?? null,
});

const mapMessage = (message: any): SupportTicketMessage => ({
  id: message.id,
  ticketId: message.ticket_id,
  senderType: message.sender_type,
  senderUserId: message.sender_user_id,
  senderAdminId: message.sender_admin_id,
  senderName: message.sender_name,
  message: message.message,
  createdAt: message.created_at,
});

export const useSupportTickets = (scope: TicketScope = 'user') => {
  const { user, isAdmin } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);

  const fetchTickets = useCallback(async () => {
    if (!user) {
      setTickets([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    let query = supabase
      .from('support_tickets')
      .select(`
        *,
        requester:users!support_tickets_user_id_fkey (
          name,
          email
        )
      `)
      .order('last_message_at', { ascending: false });

    if (scope === 'user') {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar tickets:', error);
      setTickets([]);
      setIsLoading(false);
      return;
    }

    setTickets((data || []).map(mapTicket));
    setIsLoading(false);
  }, [scope, user]);

  const fetchMessages = useCallback(async (ticketId: string | null) => {
    if (!ticketId) {
      setMessages([]);
      return;
    }

    setIsMessagesLoading(true);
    const { data, error } = await supabase
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar mensagens do ticket:', error);
      setMessages([]);
      setIsMessagesLoading(false);
      return;
    }

    setMessages((data || []).map(mapMessage));
    setIsMessagesLoading(false);
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    fetchMessages(selectedTicketId);
  }, [selectedTicketId, fetchMessages]);

  const createTicket = useCallback(async (input: CreateTicketInput) => {
    if (!user) {
      return { success: false, message: 'Usuario nao autenticado' };
    }

    const { data: ticketData, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        subject: input.subject,
        category: input.category,
        priority: input.priority,
        description: input.description,
      })
      .select('id')
      .single();

    if (ticketError || !ticketData) {
      console.error('Erro ao criar ticket:', ticketError);
      return { success: false, message: 'Nao foi possivel abrir o ticket' };
    }

    const senderName = user.name || user.email || 'Usuario';
    const { error: messageError } = await supabase
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticketData.id,
        sender_type: 'user',
        sender_user_id: user.id,
        sender_name: senderName,
        message: input.description,
      });

    if (messageError) {
      console.error('Erro ao criar primeira mensagem do ticket:', messageError);
      return { success: false, message: 'Ticket criado, mas a mensagem inicial falhou' };
    }

    await fetchTickets();
    setSelectedTicketId(ticketData.id);
    return { success: true, ticketId: ticketData.id };
  }, [fetchTickets, user]);

  const notifyTicketUpdate = useCallback(async (
    ticketId: string,
    eventType: 'admin_reply' | 'ticket_resolved'
  ) => {
    try {
      const { error } = await supabase.functions.invoke('notify-support-ticket-update', {
        body: {
          ticketId,
          eventType,
        },
      });

      if (error) {
        console.error('Erro ao notificar atualizacao do ticket:', error);
      }
    } catch (error) {
      console.error('Erro inesperado ao notificar atualizacao do ticket:', error);
    }
  }, []);

  const addMessage = useCallback(async (ticketId: string, text: string) => {
    if (!user || !text.trim()) {
      return { success: false, message: 'Mensagem invalida' };
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, status')
      .eq('id', ticketId)
      .maybeSingle();

    if (ticketError || !ticket) {
      console.error('Erro ao validar ticket antes de responder:', ticketError);
      return { success: false, message: 'Nao foi possivel localizar o ticket' };
    }

    if (isTicketLocked(ticket.status)) {
      return {
        success: false,
        message: 'Este ticket foi encerrado e nao aceita novas mensagens.',
      };
    }

    const payload = scope === 'admin'
      ? {
          ticket_id: ticketId,
          sender_type: 'admin',
          sender_admin_id: user.id,
          sender_name: user.name || user.email || 'Administrador',
          message: text.trim(),
        }
      : {
          ticket_id: ticketId,
          sender_type: 'user',
          sender_user_id: user.id,
          sender_name: user.name || user.email || 'Usuario',
          message: text.trim(),
        };

    const { error } = await supabase
      .from('support_ticket_messages')
      .insert(payload);

    if (error) {
      console.error('Erro ao responder ticket:', error);
      return { success: false, message: 'Nao foi possivel enviar a mensagem' };
    }

    if (scope === 'admin') {
      await notifyTicketUpdate(ticketId, 'admin_reply');
    }

    await fetchMessages(ticketId);
    await fetchTickets();
    return { success: true };
  }, [fetchMessages, fetchTickets, notifyTicketUpdate, scope, user]);

  const updateTicketStatus = useCallback(async (ticketId: string, status: SupportTicketStatus) => {
    if (!user || (scope === 'admin' && !isAdmin)) {
      return { success: false, message: 'Sem permissao' };
    }

    const { error } = await supabase
      .from('support_tickets')
      .update({
        status,
        assigned_admin_id: scope === 'admin' ? user.id : null,
      })
      .eq('id', ticketId);

    if (error) {
      console.error('Erro ao atualizar status do ticket:', error);
      return { success: false, message: 'Nao foi possivel atualizar o ticket' };
    }

    if (scope === 'admin' && status === 'resolved') {
      await notifyTicketUpdate(ticketId, 'ticket_resolved');
    }

    await fetchTickets();
    return { success: true };
  }, [fetchTickets, isAdmin, notifyTicketUpdate, scope, user]);

  return {
    tickets,
    messages,
    selectedTicketId,
    setSelectedTicketId,
    isLoading,
    isMessagesLoading,
    createTicket,
    addMessage,
    updateTicketStatus,
    refreshTickets: fetchTickets,
  };
};
