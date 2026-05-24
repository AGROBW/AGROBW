import React from 'react';
import { ExternalLink, FileText, Receipt, Save, Upload, XCircle } from 'lucide-react';
import {
  AdminPaymentRecord,
  FiscalAutomationStatus,
  InvoiceStatus,
  fiscalAutomationBadgeClass,
  fiscalAutomationLabel,
  invoiceStatusOptions,
} from './types';

interface PaymentsActionsTabProps {
  selectedPayment: AdminPaymentRecord | null;
  saving: boolean;
  invoiceNumber: string;
  onInvoiceNumberChange: (value: string) => void;
  invoiceStatus: InvoiceStatus;
  onInvoiceStatusChange: (value: InvoiceStatus) => void;
  invoiceIssuedAt: string;
  onInvoiceIssuedAtChange: (value: string) => void;
  invoiceExternalUrl: string;
  onInvoiceExternalUrlChange: (value: string) => void;
  invoiceNotes: string;
  onInvoiceNotesChange: (value: string) => void;
  uploadFile: File | null;
  onUploadFileChange: (file: File | null) => void;
  onCloseSelection: () => void;
  onIssueNfse: (payment: AdminPaymentRecord) => void;
  onSaveInvoice: () => void;
  onOpenInvoice: (payment: AdminPaymentRecord) => void;
  onRefundPayment: (payment: AdminPaymentRecord) => void;
  formatCurrency: (amount: number, currency?: string) => string;
  formatDateTime: (value?: string | null) => string;
}

const PaymentsActionsTab: React.FC<PaymentsActionsTabProps> = ({
  selectedPayment,
  saving,
  invoiceNumber,
  onInvoiceNumberChange,
  invoiceStatus,
  onInvoiceStatusChange,
  invoiceIssuedAt,
  onInvoiceIssuedAtChange,
  invoiceExternalUrl,
  onInvoiceExternalUrlChange,
  invoiceNotes,
  onInvoiceNotesChange,
  uploadFile,
  onUploadFileChange,
  onCloseSelection,
  onIssueNfse,
  onSaveInvoice,
  onOpenInvoice,
  onRefundPayment,
  formatCurrency,
  formatDateTime,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      {selectedPayment ? (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ações fiscais</p>
              <h2 className="text-xl font-semibold text-slate-900">
                {selectedPayment.users?.name || 'Usuário'} · {selectedPayment.plans?.name || 'Plano'}
              </h2>
              <p className="text-sm text-slate-500">Transação {selectedPayment.provider_payment_id}</p>
            </div>
            <button
              onClick={onCloseSelection}
              className="w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 inline-flex items-center justify-center"
              title="Fechar"
            >
              <XCircle className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Valor</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(selectedPayment.amount, selectedPayment.currency)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status da cobrança</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 capitalize">{selectedPayment.status.replace('_', ' ')}</p>
              <p className="text-xs text-slate-500 mt-1">
                {selectedPayment.payment_method || (selectedPayment.provider === 'stripe' ? 'Stripe' : 'Gateway externo')}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Automação fiscal</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${fiscalAutomationBadgeClass[selectedPayment.fiscal_status || 'not_requested' as FiscalAutomationStatus]}`}>
                  {fiscalAutomationLabel[selectedPayment.fiscal_status || 'not_requested' as FiscalAutomationStatus]}
                </span>
                <span className="text-xs text-slate-500">
                  {selectedPayment.fiscal_provider || 'Sem provedor'} {selectedPayment.fiscal_external_id ? `· Doc ${selectedPayment.fiscal_external_id}` : ''}
                </span>
              </div>
              {selectedPayment.fiscal_error_message && (
                <p className="mt-2 text-xs text-rose-600">{selectedPayment.fiscal_error_message}</p>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Contexto do gateway</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  selectedPayment.provider === 'stripe'
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {selectedPayment.provider || 'legacy'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-2">
                <div><span className="font-semibold text-slate-800">Payment ID:</span> {selectedPayment.provider_payment_id}</div>
                {selectedPayment.provider_customer_id && (
                  <div><span className="font-semibold text-slate-800">Customer ID:</span> {selectedPayment.provider_customer_id}</div>
                )}
                {selectedPayment.provider_subscription_id && (
                  <div><span className="font-semibold text-slate-800">Subscription ID:</span> {selectedPayment.provider_subscription_id}</div>
                )}
                {selectedPayment.provider_invoice_id && (
                  <div><span className="font-semibold text-slate-800">Invoice ID:</span> {selectedPayment.provider_invoice_id}</div>
                )}
                {selectedPayment.provider_checkout_session_id && (
                  <div className="md:col-span-2"><span className="font-semibold text-slate-800">Checkout Session:</span> {selectedPayment.provider_checkout_session_id}</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Número da nota fiscal</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(event) => onInvoiceNumberChange(event.target.value)}
                className="mt-2 w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Ex.: NF-2026-000123"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status fiscal</label>
                <select
                  value={invoiceStatus}
                  onChange={(event) => onInvoiceStatusChange(event.target.value as InvoiceStatus)}
                  className="mt-2 w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {invoiceStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Data de emissão</label>
                <input
                  type="date"
                  value={invoiceIssuedAt}
                  onChange={(event) => onInvoiceIssuedAtChange(event.target.value)}
                  className="mt-2 w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Link externo da nota fiscal</label>
              <input
                type="url"
                value={invoiceExternalUrl}
                onChange={(event) => onInvoiceExternalUrlChange(event.target.value)}
                className="mt-2 w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Anexar PDF da nota fiscal</label>
              <label className="mt-2 w-full min-h-[92px] border border-dashed border-slate-300 rounded-2xl bg-slate-50 flex flex-col items-center justify-center cursor-pointer hover:border-green-400 transition-colors px-4 text-center">
                <Upload className="w-5 h-5 text-slate-500 mb-2" strokeWidth={1.6} />
                <span className="text-sm font-semibold text-slate-700">
                  {uploadFile ? uploadFile.name : 'Clique para selecionar um PDF'}
                </span>
                <span className="text-xs text-slate-500 mt-1">
                  {selectedPayment.invoice_storage_path
                    ? 'Se enviar outro arquivo, ele substituirá o atual.'
                    : 'Apenas PDF. O arquivo ficará privado e liberado via URL assinada.'}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) => onUploadFileChange(event.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Observações internas</label>
              <textarea
                value={invoiceNotes}
                onChange={(event) => onInvoiceNotesChange(event.target.value)}
                rows={4}
                className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Ex.: NF emitida manualmente pelo ERP em 19/03."
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>Usuário</span>
              <span className="font-semibold text-slate-900">{selectedPayment.users?.email || 'Não informado'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Pagamento aprovado em</span>
              <span className="font-semibold text-slate-900">{formatDateTime(selectedPayment.paid_at || selectedPayment.created_at)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Documento atual</span>
              <span className="font-semibold text-slate-900">{selectedPayment.invoice_number || 'Sem número cadastrado'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Última tentativa fiscal</span>
              <span className="font-semibold text-slate-900">{formatDateTime(selectedPayment.fiscal_last_attempt_at)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onIssueNfse(selectedPayment)}
              disabled={saving}
              className="h-11 px-5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <Receipt className="w-4 h-4" strokeWidth={1.8} />
              Reprocessar NFS-e
            </button>
            <button
              onClick={onSaveInvoice}
              disabled={saving}
              className="h-11 px-5 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" strokeWidth={1.8} />
              {saving ? 'Salvando...' : 'Salvar documento fiscal'}
            </button>

            <button
              onClick={() => onOpenInvoice(selectedPayment)}
              className="h-11 px-5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" strokeWidth={1.8} />
              Abrir documento atual
            </button>

            <button
              onClick={() => onRefundPayment(selectedPayment)}
              disabled={saving || (selectedPayment.status !== 'approved' && selectedPayment.status !== 'in_process')}
              className="h-11 px-5 rounded-xl border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <FileText className="w-4 h-4" strokeWidth={1.8} />
              Registrar estorno
            </button>
          </div>
        </div>
      ) : (
        <div className="h-full min-h-[520px] flex flex-col items-center justify-center text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8" strokeWidth={1.6} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Selecione um pagamento</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-md">
            Escolha um registro para anexar a nota fiscal, reemitir a automação, registrar estorno ou atualizar o histórico financeiro.
          </p>
        </div>
      )}
    </div>
  );
};

export default PaymentsActionsTab;
