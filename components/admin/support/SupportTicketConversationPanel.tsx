import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { SupportTicket, SupportTicketMessage, SupportTicketStatus } from '../../../types';

type SupportTicketConversationPanelProps = {
  ticket: SupportTicket | null;
  messages: SupportTicketMessage[];
  isMessagesLoading: boolean;
  onReply: (ticketId: string, text: string) => Promise<{ success: boolean; message?: string }>;
  onUpdateStatus: (ticketId: string, status: SupportTicketStatus) => Promise<{ success: boolean; message?: string }>;
};

const statusLabel: Record<SupportTicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_user: 'Aguardando usuario',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

const SupportTicketConversationPanel: React.FC<SupportTicketConversationPanelProps> = ({
  ticket,
  messages,
  isMessagesLoading,
  onReply,
  onUpdateStatus,
}) => {
  const [reply, setReply] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  if (!ticket) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl min-h-[720px] flex items-center justify-center text-center p-8">
        <div>
          <p className="text-sm font-semibold text-slate-700">Selecione um ticket</p>
          <p className="text-sm text-slate-500 mt-2">Abra um atendimento para responder o usuario.</p>
        </div>
      </div>
    );
  }

  const handleReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reply.trim()) return;
    setIsSubmitting(true);
    const result = await onReply(ticket.id, reply);
    if (result.success) {
      setReply('');
    }
    setIsSubmitting(false);
  };

  const handleStatusChange = async (status: SupportTicketStatus) => {
    setIsUpdatingStatus(true);
    await onUpdateStatus(ticket.id, status);
    setIsUpdatingStatus(false);
  };

  const isTicketClosed = ticket.status === 'resolved' || ticket.status === 'closed';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden min-h-[720px] flex flex-col">
      <div className="px-6 py-5 border-b border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-bold text-slate-900">{ticket.subject}</h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {statusLabel[ticket.status]}
          </span>
          {isTicketClosed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700">
              <Lock className="h-3 w-3" />
              Ticket encerrado
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">{ticket.description}</p>
        {isTicketClosed && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Ticket encerrado</p>
            <p className="text-sm text-slate-500 mt-1">
              Para voltar a responder, altere o status para aberto, em andamento ou aguardando usuario.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {(['open', 'in_progress', 'waiting_user', 'resolved', 'closed'] as SupportTicketStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              disabled={isUpdatingStatus}
              className={`h-9 px-3 rounded-lg text-sm font-semibold border transition-colors ${
                ticket.status === status
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {statusLabel[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-slate-50">
        {isMessagesLoading ? (
          <div className="text-sm text-slate-500">Carregando conversa...</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-slate-500">Nenhuma mensagem registrada.</div>
        ) : (
          messages.map((message) => {
            const isAdmin = message.senderType === 'admin';
            return (
              <div key={message.id} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  isAdmin ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-900'
                }`}>
                  <p className={`text-xs font-semibold mb-1 ${isAdmin ? 'text-slate-200' : 'text-slate-500'}`}>
                    {message.senderName}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                  <p className={`text-[11px] mt-2 ${isAdmin ? 'text-slate-300' : 'text-slate-400'}`}>
                    {new Date(message.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleReply} className="p-5 border-t border-slate-200 bg-white">
        <div className="flex gap-3">
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={3}
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600/20"
            placeholder={isTicketClosed ? 'Ticket encerrado. Reabra o atendimento para responder.' : 'Responder ticket...'}
            disabled={isTicketClosed}
          />
          <button
            type="submit"
            disabled={isSubmitting || !reply.trim() || isTicketClosed}
            className="self-end h-11 px-5 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Enviando...' : 'Responder'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SupportTicketConversationPanel;
