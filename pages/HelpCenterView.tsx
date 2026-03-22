import React, { useState } from 'react';
import toast from 'react-hot-toast';
import HelpCenterQuickHelpTab from '../components/help-center/HelpCenterQuickHelpTab';
import HelpCenterTicketsTab from '../components/help-center/HelpCenterTicketsTab';
import HelpCenterNewTicketTab from '../components/help-center/HelpCenterNewTicketTab';
import { useSupportTickets } from '../src/hooks/useSupportTickets';

type HelpCenterTab = 'quick' | 'tickets' | 'new';

const HelpCenterView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<HelpCenterTab>('quick');
  const {
    tickets,
    messages,
    selectedTicketId,
    setSelectedTicketId,
    isLoading,
    isMessagesLoading,
    createTicket,
    addMessage,
  } = useSupportTickets('user');

  const tabs: Array<{ id: HelpCenterTab; label: string }> = [
    { id: 'quick', label: 'Ajuda Rapida' },
    { id: 'tickets', label: 'Meus Tickets' },
    { id: 'new', label: 'Novo Ticket' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h1 className="text-xl font-bold text-slate-900">Central de Ajuda</h1>
        <p className="text-sm text-slate-500 mt-2">
          Encontre respostas rapidas, acompanhe atendimentos e abra um novo ticket quando precisar falar com o suporte.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`h-10 px-4 rounded-xl text-sm font-semibold border transition-colors ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'quick' && (
        <HelpCenterQuickHelpTab
          onOpenMyTickets={() => setActiveTab('tickets')}
          onOpenNewTicket={() => setActiveTab('new')}
        />
      )}

      {activeTab === 'tickets' && (
        <HelpCenterTicketsTab
          tickets={tickets}
          messages={messages}
          selectedTicketId={selectedTicketId}
          setSelectedTicketId={setSelectedTicketId}
          onReply={async (ticketId, text) => {
            const result = await addMessage(ticketId, text);
            if (!result.success) {
              toast.error(result.message || 'Nao foi possivel responder o ticket');
            }
            return result;
          }}
          isLoading={isLoading}
          isMessagesLoading={isMessagesLoading}
        />
      )}

      {activeTab === 'new' && (
        <HelpCenterNewTicketTab
          onCreateTicket={async (input) => {
            const result = await createTicket(input);
            if (result.success) {
              toast.success('Ticket aberto com sucesso');
              setActiveTab('tickets');
            } else {
              toast.error(result.message || 'Nao foi possivel abrir o ticket');
            }
            return result;
          }}
        />
      )}
    </div>
  );
};

export default HelpCenterView;
