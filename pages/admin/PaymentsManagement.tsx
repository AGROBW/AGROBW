import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Receipt, Settings2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import PaymentsOverviewTab from '../../components/admin/payments/PaymentsOverviewTab';
import PaymentsInvoicesTab from '../../components/admin/payments/PaymentsInvoicesTab';
import PaymentsActionsTab from '../../components/admin/payments/PaymentsActionsTab';
import PaymentsBoostersTab from '../../components/admin/payments/PaymentsBoostersTab';
import {
  AdminPaymentRecord,
  InvoiceStatus,
  invoiceStatusOptions,
} from '../../components/admin/payments/types';

const normalizeRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] || null : value;
};

type FinanceTab = 'overview' | 'invoices' | 'actions' | 'boosters';

const PaymentsManagement: React.FC = () => {
  const { logAction } = useAdminAudit();
  const [activeTab, setActiveTab] = useState<FinanceTab>('overview');
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
      return 'Não informado';
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
      toast.error('Não foi possível abrir a nota fiscal.');
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
      toast.error('Para marcar como disponível, anexe o PDF ou informe um link externo.');
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
          title: 'Nota fiscal disponível',
          content: 'Sua nota fiscal já está pronta para download na central financeira.',
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
        toast.info('Automação fiscal desativada nas configurações.');
      } else if (data?.alreadyIssued) {
        toast.info('Este pagamento já possui NFS-e emitida.');
      } else {
        toast.success('Solicitação de emissão enviada ao provedor fiscal.');
      }

      await loadPayments();
    } catch (error: any) {
      console.error('[PaymentsManagement] Erro ao emitir NFS-e:', error);
      toast.error(error.message || 'Não foi possível emitir a NFS-e.');
    } finally {
      setSaving(false);
    }
  };

  const handleRefundPayment = async (payment: AdminPaymentRecord) => {
    const confirmed = window.confirm(
      `Confirmar estorno/cancelamento deste registro?\n\nPagamento: ${payment.provider_payment_id}\nUsuário: ${payment.users?.name || 'Usuário'}`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);

    try {
      const newNotes = [payment.invoice_notes, 'Estorno/cancelamento registrado manualmente pelo financeiro admin.']
        .filter(Boolean)
        .join('\n');

      const updatePayload = {
        status: 'refunded',
        invoice_status: payment.invoice_status === 'available' ? 'failed' : payment.invoice_status,
        invoice_notes: newNotes || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('payments')
        .update(updatePayload)
        .eq('id', payment.id);

      if (error) {
        throw error;
      }

      await logAction({
        action: ADMIN_ACTIONS.REFUND_PAYMENT,
        resourceType: RESOURCE_TYPES.PAYMENT,
        resourceId: payment.id,
        oldValue: {
          status: payment.status,
          invoice_status: payment.invoice_status,
          invoice_notes: payment.invoice_notes,
        },
        newValue: updatePayload,
        reason: 'Estorno/cancelamento manual registrado no backoffice financeiro',
      });

      toast.success('Estorno registrado com sucesso.');
      await loadPayments();
      setSelectedPayment(null);
    } catch (error: any) {
      console.error('[PaymentsManagement] Erro ao registrar estorno:', error);
      toast.error(error.message || 'Não foi possível registrar o estorno.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: FinanceTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Resumo', icon: <BarChart3 className="w-4 h-4" strokeWidth={1.8} /> },
    { id: 'invoices', label: 'Notas Emitidas', icon: <Receipt className="w-4 h-4" strokeWidth={1.8} /> },
    { id: 'actions', label: 'Ações Fiscais', icon: <Settings2 className="w-4 h-4" strokeWidth={1.8} /> },
    { id: 'boosters', label: 'Boosters', icon: <Sparkles className="w-4 h-4" strokeWidth={1.8} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <Receipt className="w-5 h-5" strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Financeiro & Notas Fiscais</h1>
          <p className="text-sm text-slate-500">
            Acompanhe o resumo fiscal, consulte todas as notas emitidas e execute ações operacionais com auditoria.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-2 inline-flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`h-10 px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <PaymentsOverviewTab payments={payments} formatCurrency={formatCurrency} />
      )}

      {activeTab === 'invoices' && (
        <PaymentsInvoicesTab
          loading={loading}
          payments={filteredPayments}
          selectedPayment={selectedPayment}
          onSelectPayment={(payment) => {
            setSelectedPayment(payment);
            setActiveTab('actions');
          }}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          formatCurrency={formatCurrency}
          formatDateTime={formatDateTime}
        />
      )}

      {activeTab === 'actions' && (
        <PaymentsActionsTab
          selectedPayment={selectedPayment}
          saving={saving}
          invoiceNumber={invoiceNumber}
          onInvoiceNumberChange={setInvoiceNumber}
          invoiceStatus={invoiceStatus}
          onInvoiceStatusChange={setInvoiceStatus}
          invoiceIssuedAt={invoiceIssuedAt}
          onInvoiceIssuedAtChange={setInvoiceIssuedAt}
          invoiceExternalUrl={invoiceExternalUrl}
          onInvoiceExternalUrlChange={setInvoiceExternalUrl}
          invoiceNotes={invoiceNotes}
          onInvoiceNotesChange={setInvoiceNotes}
          uploadFile={uploadFile}
          onUploadFileChange={setUploadFile}
          onCloseSelection={() => setSelectedPayment(null)}
          onIssueNfse={handleIssueNfse}
          onSaveInvoice={handleSaveInvoice}
          onOpenInvoice={handleOpenInvoice}
          onRefundPayment={handleRefundPayment}
          formatCurrency={formatCurrency}
          formatDateTime={formatDateTime}
        />
      )}

      {activeTab === 'boosters' && <PaymentsBoostersTab />}
    </div>
  );
};

export default PaymentsManagement;
