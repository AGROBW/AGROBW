import React from 'react';
import { toast } from 'sonner';
import { useSupportTickets } from '../../src/hooks/useSupportTickets';
import SupportTicketsTable from '../../components/admin/support/SupportTicketsTable';
import SupportTicketConversationPanel from '../../components/admin/support/SupportTicketConversationPanel';

const SupportTicketsManagement: React.FC = () => {
  const {
    tickets,
    messages,
    selectedTicketId,
    setSelectedTicketId,
    isLoading,
    isMessagesLoading,
    addMessage,
    updateTicketStatus,
  } = useSupportTickets('admin');

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h1 className="text-2xl font-black text-slate-900">Suporte</h1>
        <p className="text-sm text-slate-500 mt-2">
          Acompanhe a fila de tickets e responda os atendimentos da Central de Ajuda.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
        {isLoading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500 xl:col-span-2">
            Carregando tickets...
          </div>
        ) : (
          <>
            <SupportTicketsTable
              tickets={tickets}
              selectedTicketId={selectedTicketId}
              onSelect={setSelectedTicketId}
            />
            <SupportTicketConversationPanel
              ticket={selectedTicket}
              messages={messages}
              isMessagesLoading={isMessagesLoading}
              onReply={async (ticketId, text) => {
                const result = await addMessage(ticketId, text);
                if (!result.success) {
                  toast.error(result.message || 'Nao foi possivel responder o ticket');
                } else {
                  toast.success('Resposta enviada');
                }
                return result;
              }}
              onUpdateStatus={async (ticketId, status) => {
                const result = await updateTicketStatus(ticketId, status);
                if (!result.success) {
                  toast.error(result.message || 'Nao foi possivel atualizar o ticket');
                } else {
                  toast.success('Status atualizado');
                }
                return result;
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default SupportTicketsManagement;
