import React from 'react';
import { Lock } from 'lucide-react';
import { SupportTicket, SupportTicketStatus } from '../../../types';

type SupportTicketsTableProps = {
  tickets: SupportTicket[];
  selectedTicketId: string | null;
  onSelect: (ticketId: string) => void;
};

const statusLabel: Record<SupportTicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_user: 'Aguardando usuario',
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

const SupportTicketsTable: React.FC<SupportTicketsTableProps> = ({
  tickets,
  selectedTicketId,
  onSelect,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200">
        <h2 className="text-sm font-bold text-slate-900">Fila de tickets</h2>
      </div>

      <div className="max-h-[720px] overflow-y-auto">
        {tickets.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">Nenhum ticket encontrado.</div>
        ) : (
          tickets.map((ticket) => {
            const isLockedTicket = ticket.status === 'resolved' || ticket.status === 'closed';

            return (
              <button
                key={ticket.id}
                onClick={() => onSelect(ticket.id)}
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
                      {ticket.requesterName || 'Usuario'} · {ticket.requesterEmail || 'Sem e-mail'}
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
  );
};

export default SupportTicketsTable;
