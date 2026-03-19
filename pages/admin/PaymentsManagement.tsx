import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Receipt, Save, Search, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';

type InvoiceStatus = 'pending' | 'available' | 'failed' | 'not_applicable';
type FiscalAutomationStatus = 'not_requested' | 'queued' | 'processing' | 'issued' | 'failed' | 'manual';

interface AdminPaymentRecord {
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

const normalizeRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] || null : value;
};

const invoiceStatusOptions: Array<{ value: InvoiceStatus; label: string }> = [
  { value: 'pending', label: 'Em emissao' },
  { value: 'available', label: 'Disponivel' },
  { value: 'failed', label: 'Falha' },
  { value: 'not_applicable', label: 'Nao aplicavel' },
];

const statusBadgeClass: Record<InvoiceStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  available: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  not_applicable: 'bg-slate-100 text-slate-500',
};

const fiscalAutomationBadgeClass: Record<FiscalAutomationStatus, string> = {
  not_requested: 'bg-slate-100 text-slate-500',
  queued: 'bg-blue-100 text-blue-700',
  processing: 'bg-amber-100 text-amber-700',
  issued: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  manual: 'bg-violet-100 text-violet-700',
};

const fiscalAutomationLabel: Record<FiscalAutomationStatus, string> = {
  not_requested: 'Nao solicitado',
  queued: 'Na fila',
  processing: 'Processando',
  issued: 'Emitido',
  failed: 'Falhou',
  manual: 'Manual',
};

const PaymentsManagement: React.FC = () => {
  const { logAction } = useAdminAudit();
  const [payments, setPayments] = useState<AdminPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [selectedPayment, setSelectedPayment] = useState<AdminPaymentRecord | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>('pending');
  const [invoiceIssuedAt, setInvoiceIssuedAt] = useState('');
  const [invoiceExternalUrl, setInvoiceExternalUrl] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPayments = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('payments')
      .select(`
        id,
        user_id,
        plan_id,
        provider_payment_id,
        amount,
        currency,
        status,
        payment_method,
        paid_at,
        created_at,
        invoice_number,
        invoice_pdf_url,
        invoice_storage_path,
        invoice_xml_url,
        invoice_status,
        invoice_issued_at,
        invoice_notes,
        fiscal_provider,
        fiscal_external_id,
        fiscal_status,
        fiscal_last_attempt_at,
        fiscal_error_message,
        users(name, email),
        plans(name)
      `)
      .order('paid_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PaymentsManagement] Erro ao carregar pagamentos:', error);
      toast.error('Erro ao carregar pagamentos');
      setPayments([]);
      setLoading(false);
      return;
    }

    const normalizedPayments: AdminPaymentRecord[] = ((data || []) as any[]).map((payment) => ({
      ...payment,
      users: normalizeRelation(payment.users),
      plans: normalizeRelation(payment.plans),
    }));

    setPayments(normalizedPayments);
    setLoading(false);
  };

  useEffect(() => {
    loadPayments();
  }, []);

  useEffect(() => {
    if (!selectedPayment) {
      setInvoiceNumber('');
      setInvoiceStatus('pending');
      setInvoiceIssuedAt('');
      setInvoiceExternalUrl('');
      setInvoiceNotes('');
      setUploadFile(null);
      return;
    }

    setInvoiceNumber(selectedPayment.invoice_number || '');
    setInvoiceStatus(selectedPayment.invoice_status || 'pending');
    setInvoiceIssuedAt(selectedPayment.invoice_issued_at ? selectedPayment.invoice_issued_at.slice(0, 10) : '');
    setInvoiceExternalUrl(selectedPayment.invoice_pdf_url || '');
    setInvoiceNotes(selectedPayment.invoice_notes || '');
    setUploadFile(null);
  }, [selectedPayment]);

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const matchesStatus = statusFilter === 'all' || payment.invoice_status === statusFilter;
      const haystack = [
        payment.users?.name,
        payment.users?.email,
        payment.provider_payment_id,
        payment.invoice_number,
        payment.plans?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !searchTerm || haystack.includes(searchTerm.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [payments, searchTerm, statusFilter]);

  const formatCurrency = (amount: number, currency = 'BRL') =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
    }).format(amount || 0);

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return 'Nao informado';
    }

    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSignedInvoiceUrl = async (storagePath: string) => {
    const { data, error } = await supabase.storage
      .from('fiscal_documents')
      .createSignedUrl(storagePath, 60 * 15);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  };

  const handleOpenInvoice = async (payment: AdminPaymentRecord) => {
    try {
      if (payment.invoice_storage_path) {
        const signedUrl = await getSignedInvoiceUrl(payment.invoice_storage_path);
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      if (payment.invoice_pdf_url) {
        window.open(payment.invoice_pdf_url, '_blank', 'noopener,noreferrer');
        return;
      }

      toast.error('Nenhum documento fiscal anexado a este pagamento.');
    } catch (error) {
      console.error('[PaymentsManagement] Erro ao abrir nota fiscal:', error);
      toast.error('Nao foi possivel abrir a nota fiscal.');
    }
  };

  const uploadInvoiceFile = async (payment: AdminPaymentRecord) => {
    if (!uploadFile) {
      return {
        storagePath: payment.invoice_storage_path,
      };
    }

    if (uploadFile.type !== 'application/pdf') {
      throw new Error('Envie a nota fiscal em PDF.');
    }

    const storagePath = `${payment.user_id}/${payment.id}/nota-fiscal.pdf`;
    const { error } = await supabase.storage
      .from('fiscal_documents')
      .upload(storagePath, uploadFile, {
        upsert: true,
        contentType: 'application/pdf',
      });

    if (error) {
      throw error;
    }

    return { storagePath };
  };

  const handleSaveInvoice = async () => {
    if (!selectedPayment) {
      return;
    }

    if (invoiceStatus === 'available' && !uploadFile && !invoiceExternalUrl && !selectedPayment.invoice_storage_path) {
      toast.error('Para marcar como disponivel, anexe o PDF ou informe um link externo.');
      return;
    }

    setSaving(true);

    try {
      const previousValue = {
        invoice_number: selectedPayment.invoice_number,
        invoice_status: selectedPayment.invoice_status,
        invoice_pdf_url: selectedPayment.invoice_pdf_url,
        invoice_storage_path: selectedPayment.invoice_storage_path,
        invoice_issued_at: selectedPayment.invoice_issued_at,
        invoice_notes: selectedPayment.invoice_notes,
      };

      const { storagePath } = await uploadInvoiceFile(selectedPayment);

      const updatePayload = {
        invoice_number: invoiceNumber || null,
        invoice_status: invoiceStatus,
        invoice_pdf_url: invoiceExternalUrl || null,
        invoice_storage_path: storagePath || null,
        invoice_issued_at: invoiceIssuedAt ? new Date(`${invoiceIssuedAt}T12:00:00`).toISOString() : null,
        invoice_notes: invoiceNotes || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('payments')
        .update(updatePayload)
        .eq('id', selectedPayment.id);

      if (error) {
        throw error;
      }

      if (invoiceStatus === 'available') {
        await supabase.from('notifications').insert({
          user_id: selectedPayment.user_id,
          type: 'SYSTEM',
          title: 'Nota fiscal disponivel',
          content: 'Sua nota fiscal ja esta pronta para download na central financeira.',
          link: '/#/minha-conta/financeiro',
        });
      }

      await logAction({
        action: ADMIN_ACTIONS.UPDATE_FISCAL_DOCUMENT,
        resourceType: RESOURCE_TYPES.PAYMENT,
        resourceId: selectedPayment.id,
        oldValue: previousValue,
        newValue: updatePayload,
        reason: 'Documento fiscal anexado ou atualizado no backoffice financeiro',
      });

      toast.success('Documento fiscal atualizado com sucesso.');
      await loadPayments();
      setSelectedPayment(null);
    } catch (error: any) {
      console.error('[PaymentsManagement] Erro ao salvar nota fiscal:', error);
      toast.error(error.message || 'Erro ao salvar documento fiscal.');
    } finally {
      setSaving(false);
    }
  };

  const handleIssueNfse = async (payment: AdminPaymentRecord) => {
    try {
      setSaving(true);

      const { data, error } = await supabase.functions.invoke('issue-nfse', {
        method: 'POST',
        body: { paymentId: payment.id },
      });

      if (error) {
        let responseBody = null;
        const errorWithContext = error as any;

        if (errorWithContext?.context) {
          try {
            responseBody = await errorWithContext.context.json();
          } catch {
            try {
              responseBody = await errorWithContext.context.text();
            } catch {
              responseBody = null;
            }
          }
        }

        console.error('[PaymentsManagement] Corpo da resposta da issue-nfse:', responseBody);
        throw error;
      }

      if (data?.issued) {
        toast.success('NFS-e emitida com sucesso.');
      } else if (data?.skipped) {
        toast.info('Automacao fiscal desativada nas configuracoes.');
      } else if (data?.alreadyIssued) {
        toast.info('Este pagamento ja possui NFS-e emitida.');
      } else {
        toast.success('Solicitacao de emissao enviada ao provedor fiscal.');
      }

      await loadPayments();
    } catch (error: any) {
      console.error('[PaymentsManagement] Erro ao emitir NFS-e:', error);
      toast.error(error.message || 'Nao foi possivel emitir a NFS-e.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <Receipt className="w-5 h-5" strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Financeiro & Notas Fiscais</h1>
          <p className="text-sm text-slate-500">
            Anexe documentos fiscais aos pagamentos e libere o download seguro para o usuario.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por usuario, e-mail, pagamento ou numero da nota"
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | InvoiceStatus)}
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

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr,0.95fr] gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pagamentos</p>
              <h2 className="text-lg font-semibold text-slate-900">{filteredPayments.length} registro(s)</h2>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[760px] overflow-y-auto">
            {loading ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500">Carregando pagamentos...</div>
            ) : filteredPayments.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500">Nenhum pagamento encontrado.</div>
            ) : (
              filteredPayments.map((payment) => (
                <button
                  key={payment.id}
                  onClick={() => setSelectedPayment(payment)}
                  className={`w-full text-left px-6 py-4 transition-colors ${
                    selectedPayment?.id === payment.id ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {payment.users?.name || 'Usuario sem nome'} · {payment.plans?.name || 'Plano'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {payment.users?.email || 'sem e-mail'} · MP {payment.provider_payment_id}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Pago em {formatDateTime(payment.paid_at || payment.created_at)}</p>
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

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          {selectedPayment ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pagamento selecionado</p>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {selectedPayment.users?.name || 'Usuario'} · {selectedPayment.plans?.name || 'Plano'}
                  </h2>
                  <p className="text-sm text-slate-500">Transacao {selectedPayment.provider_payment_id}</p>
                </div>
                <button
                  onClick={() => setSelectedPayment(null)}
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
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status da cobranca</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900 capitalize">{selectedPayment.status.replace('_', ' ')}</p>
                  <p className="text-xs text-slate-500 mt-1">{selectedPayment.payment_method || 'Mercado Pago'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Automacao fiscal</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${fiscalAutomationBadgeClass[selectedPayment.fiscal_status || 'not_requested']}`}>
                      {fiscalAutomationLabel[selectedPayment.fiscal_status || 'not_requested']}
                    </span>
                    <span className="text-xs text-slate-500">
                      {selectedPayment.fiscal_provider || 'Sem provedor'} {selectedPayment.fiscal_external_id ? `· Doc ${selectedPayment.fiscal_external_id}` : ''}
                    </span>
                  </div>
                  {selectedPayment.fiscal_error_message && (
                    <p className="mt-2 text-xs text-rose-600">{selectedPayment.fiscal_error_message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Numero da nota fiscal</label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(event) => setInvoiceNumber(event.target.value)}
                    className="mt-2 w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Ex.: NF-2026-000123"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status fiscal</label>
                    <select
                      value={invoiceStatus}
                      onChange={(event) => setInvoiceStatus(event.target.value as InvoiceStatus)}
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
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Data de emissao</label>
                    <input
                      type="date"
                      value={invoiceIssuedAt}
                      onChange={(event) => setInvoiceIssuedAt(event.target.value)}
                      className="mt-2 w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Link externo da nota fiscal</label>
                  <input
                    type="url"
                    value={invoiceExternalUrl}
                    onChange={(event) => setInvoiceExternalUrl(event.target.value)}
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
                        ? 'Se enviar outro arquivo, ele substituira o atual.'
                        : 'Apenas PDF. O arquivo ficara privado e liberado via URL assinada.'}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Observacoes internas</label>
                  <textarea
                    value={invoiceNotes}
                    onChange={(event) => setInvoiceNotes(event.target.value)}
                    rows={4}
                    className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Ex.: NF emitida manualmente pelo ERP em 19/03."
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>Usuario</span>
                  <span className="font-semibold text-slate-900">{selectedPayment.users?.email || 'Nao informado'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Pagamento aprovado em</span>
                  <span className="font-semibold text-slate-900">{formatDateTime(selectedPayment.paid_at || selectedPayment.created_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Documento atual</span>
                  <span className="font-semibold text-slate-900">{selectedPayment.invoice_number || 'Sem numero cadastrado'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Ultima tentativa fiscal</span>
                  <span className="font-semibold text-slate-900">{formatDateTime(selectedPayment.fiscal_last_attempt_at)}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleIssueNfse(selectedPayment)}
                  disabled={saving}
                  className="h-11 px-5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  <Receipt className="w-4 h-4" strokeWidth={1.8} />
                  Reprocessar NFS-e
                </button>
                <button
                  onClick={handleSaveInvoice}
                  disabled={saving}
                  className="h-11 px-5 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  <Save className="w-4 h-4" strokeWidth={1.8} />
                  {saving ? 'Salvando...' : 'Salvar documento fiscal'}
                </button>

                <button
                  onClick={() => handleOpenInvoice(selectedPayment)}
                  className="h-11 px-5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" strokeWidth={1.8} />
                  Abrir documento atual
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
                Escolha um registro na lista ao lado para anexar a nota fiscal, marcar emissao e liberar o download para o usuario.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentsManagement;
