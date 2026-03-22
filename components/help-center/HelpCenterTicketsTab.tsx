import React, { useMemo, useState } from 'react';
import { Lock, MessageSquare } from 'lucide-react';
import { SupportTicket, SupportTicketMessage, SupportTicketStatus } from '../../types';

type HelpCenterTicketsTabProps = {
  tickets: SupportTicket[];
  messages: SupportTicketMessage[];
  selectedTicketId: string | null;
  setSelectedTicketId: (ticketId: string) => void;
  onReply: (ticketId: string, text: string) => Promise<{ success: boolean; message?: string }>;
  isLoading: boolean;
  isMessagesLoading: boolean;
};

const statusLabel: Record<SupportTicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_user: 'Aguardando voce',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

const statusClass: Record<SupportTicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  waiting_user: 'bg-orange-100 text-orange-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-200 text-slate-700',
};

const HelpCenterTicketsTab: React.FC<HelpCenterTicketsTabProps> = ({
  tickets,
  messages,
  selectedTicketId,
  setSelectedTicketId,
  onReply,
  isLoading,
  isMessagesLoading,
}) => {
  const [reply, setReply] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [selectedTicketId, tickets]
  );

  const isTicketClosed = selectedTicket
    ? selectedTicket.status === 'resolved' || selectedTicket.status === 'closed'
    : false;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || !reply.trim()) return;
    setIsSubmitting(true);
    const result = await onReply(selectedTicket.id, reply);
    if (result.success) {
      setReply('');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Meus tickets</h2>
        </div>

        <div className="max-h-[680px] overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-slate-500">Carregando tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Voce ainda nao abriu nenhum ticket.</div>
          ) : (
            tickets.map((ticket) => {
              const isLockedTicket = ticket.status === 'resolved' || ticket.status === 'closed';
              return (
              <button
                key={ticket.id}
                onClick={() => setSelectedTicketId(ticket.id)}
                className={`w-full text-left px-5 py-4 border-b border-slate-100 transition-colors ${
                  selectedTicketId === ticket.id
                    ? isLockedTicket
                      ? 'bg-slate-100'
                      : 'bg-green-50'
                    : isLockedTicket
                      ? 'bg-slate-50 hover:bg-slate-100'
                      : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{ticket.subject}</p>
                      {isLockedTicket && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                          <Lock className="h-3 w-3" />
                          Encerrado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(ticket.lastMessageAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${statusClass[ticket.status]}`}>
                    {statusLabel[ticket.status]}
                  </span>
                </div>
              </button>
              );
            })
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col min-h-[680px]">
        {selectedTicket ? (
          <>
            <div className="px-6 py-5 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-base font-bold text-slate-900">{selectedTicket.subject}</h3>
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${statusClass[selectedTicket.status]}`}>
                  {statusLabel[selectedTicket.status]}
                </span>
                {isTicketClosed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                    <Lock className="h-3 w-3" />
                    Ticket encerrado
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-2">{selectedTicket.description}</p>
              {isTicketClosed && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Ticket encerrado</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Este atendimento foi finalizado pelo suporte e nao aceita novas respostas.
                  </p>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-slate-50">
              {isMessagesLoading ? (
                <div className="text-sm text-slate-500">Carregando conversa...</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-slate-500">Nenhuma mensagem ainda.</div>
              ) : (
                messages.map((message) => {
                  const isUser = message.senderType === 'user';
                  return (
                    <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        isUser ? 'bg-green-700 text-white' : 'bg-white border border-slate-200 text-slate-900'
                      }`}>
                        <p className="text-xs font-semibold mb-1 opacity-80">{message.senderName}</p>
                        <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                        <p className={`text-[11px] mt-2 ${isUser ? 'text-green-100' : 'text-slate-400'}`}>
                          {new Date(message.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleSubmit} className="p-5 border-t border-slate-200 bg-white">
              <div className="flex gap-3">
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  rows={3}
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600/20"
                  placeholder={isTicketClosed ? 'Ticket encerrado pelo suporte.' : 'Escreva sua resposta para o suporte...'}
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
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-10 text-center">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-slate-700">Selecione um ticket</p>
              <p className="text-sm text-slate-500 mt-2">Escolha um atendimento para acompanhar a conversa com o suporte.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HelpCenterTicketsTab;
