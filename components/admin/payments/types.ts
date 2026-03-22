export type InvoiceStatus = 'pending' | 'available' | 'failed' | 'not_applicable';
export type FiscalAutomationStatus = 'not_requested' | 'queued' | 'processing' | 'issued' | 'failed' | 'manual';

export interface AdminPaymentRecord {
  id: string;
  user_id: string;
  plan_id: string | null;
  provider_payment_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
  invoice_number: string | null;
  invoice_pdf_url: string | null;
  invoice_storage_path: string | null;
  invoice_xml_url: string | null;
  invoice_status: InvoiceStatus;
  invoice_issued_at: string | null;
  invoice_notes: string | null;
  fiscal_provider: string | null;
  fiscal_external_id: string | null;
  fiscal_status: FiscalAutomationStatus;
  fiscal_last_attempt_at: string | null;
  fiscal_error_message: string | null;
  users: {
    name: string;
    email: string;
  } | null;
  plans: {
    name: string;
  } | null;
}

export const invoiceStatusOptions: Array<{ value: InvoiceStatus; label: string }> = [
  { value: 'pending', label: 'Em emissão' },
  { value: 'available', label: 'Disponível' },
  { value: 'failed', label: 'Falha' },
  { value: 'not_applicable', label: 'Não aplicável' },
];

export const statusBadgeClass: Record<InvoiceStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  available: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  not_applicable: 'bg-slate-100 text-slate-500',
};

export const fiscalAutomationBadgeClass: Record<FiscalAutomationStatus, string> = {
  not_requested: 'bg-slate-100 text-slate-500',
  queued: 'bg-blue-100 text-blue-700',
  processing: 'bg-amber-100 text-amber-700',
  issued: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  manual: 'bg-violet-100 text-violet-700',
};

export const fiscalAutomationLabel: Record<FiscalAutomationStatus, string> = {
  not_requested: 'Não solicitado',
  queued: 'Na fila',
  processing: 'Processando',
  issued: 'Emitido',
  failed: 'Falhou',
  manual: 'Manual',
};
