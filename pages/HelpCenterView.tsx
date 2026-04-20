import React from 'react';
import toast from 'react-hot-toast';
import HelpCenterQuickHelpTab from '../components/help-center/HelpCenterQuickHelpTab';
import HelpCenterTicketsTab from '../components/help-center/HelpCenterTicketsTab';
import HelpCenterNewTicketTab from '../components/help-center/HelpCenterNewTicketTab';
import { useSupportTickets } from '../src/hooks/useSupportTickets';
import { usePersistentState } from '../src/hooks/usePersistentState';

type HelpCenterTab = 'quick' | 'tickets' | 'new';

const HelpCenterView: React.FC = () => {
  const [activeTab, setActiveTab] = usePersistentState<HelpCenterTab>('help-center:active-tab', 'quick');
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
      {/* ── Hero + Tabs unificados ───────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-black text-white">Central de Ajuda</h1>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-400">
                Encontre respostas rapidas, acompanhe atendimentos e abra um novo ticket quando precisar falar com o suporte.
              </p>
            </div>
            <div className="mt-3 flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm sm:mt-0">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-slate-300">Suporte ativo</span>
            </div>
          </div>
        </div>

        <div className="flex border-t border-slate-200">
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 py-3.5 text-sm font-semibold transition-colors ${
                i > 0 ? 'border-l border-slate-200' : ''
              } ${
                activeTab === tab.id
                  ? 'bg-slate-50 text-slate-900'
                  : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {activeTab === tab.id && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-emerald-500" />
              )}
              {tab.label}
            </button>
          ))}
        </div>
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
