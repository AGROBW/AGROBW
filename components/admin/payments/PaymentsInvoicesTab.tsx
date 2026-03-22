import React from 'react';
import { Search } from 'lucide-react';
import { AdminPaymentRecord, InvoiceStatus, invoiceStatusOptions, statusBadgeClass } from './types';

interface PaymentsInvoicesTabProps {
  loading: boolean;
  payments: AdminPaymentRecord[];
  selectedPayment: AdminPaymentRecord | null;
  onSelectPayment: (payment: AdminPaymentRecord) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  statusFilter: 'all' | InvoiceStatus;
  onStatusFilterChange: (value: 'all' | InvoiceStatus) => void;
  formatCurrency: (amount: number, currency?: string) => string;
  formatDateTime: (value?: string | null) => string;
}

const PaymentsInvoicesTab: React.FC<PaymentsInvoicesTabProps> = ({
  loading,
  payments,
  selectedPayment,
  onSelectPayment,
  searchTerm,
  onSearchTermChange,
  statusFilter,
  onStatusFilterChange,
  formatCurrency,
  formatDateTime,
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar por usuário, e-mail, pagamento ou número da nota"
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as 'all' | InvoiceStatus)}
          className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">Todos os status fiscais</option>
          {invoiceStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notas fiscais</p>
          <h2 className="text-lg font-semibold text-slate-900">{payments.length} registro(s)</h2>
        </div>

        <div className="divide-y divide-slate-100 max-h-[760px] overflow-y-auto">
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">Carregando pagamentos...</div>
          ) : payments.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">Nenhum pagamento encontrado.</div>
          ) : (
            payments.map((payment) => (
              <button
                key={payment.id}
                onClick={() => onSelectPayment(payment)}
                className={`w-full text-left px-6 py-4 transition-colors ${
                  selectedPayment?.id === payment.id ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {payment.users?.name || 'Usuário sem nome'} · {payment.plans?.name || 'Plano'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {payment.users?.email || 'sem e-mail'} · MP {payment.provider_payment_id}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Pago em {formatDateTime(payment.paid_at || payment.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(payment.amount, payment.currency)}</p>
                    <span className={`mt-2 inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${statusBadgeClass[payment.invoice_status]}`}>
                      {invoiceStatusOptions.find((option) => option.value === payment.invoice_status)?.label}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentsInvoicesTab;
