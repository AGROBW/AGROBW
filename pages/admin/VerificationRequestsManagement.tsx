import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../src/lib/supabaseClient';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { useAuth } from '../../src/contexts/AuthContext';
import { toast } from 'sonner';
import { DocumentReviewStatus } from '../../types';

type VerificationQueueItem = {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  document?: string | null;
  document_path?: string | null;
  document_verified?: boolean | null;
  document_review_status?: DocumentReviewStatus | null;
  document_review_notes?: string | null;
  document_reviewed_at?: string | null;
  document_reviewed_by?: string | null;
  document_last_attempt_at?: string | null;
  document_retry_available_at?: string | null;
  document_last_failure_reason?: string | null;
  cidade?: string | null;
  estado?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const statusMeta: Record<DocumentReviewStatus, { label: string; className: string }> = {
  not_submitted: { label: 'Não enviado', className: 'bg-slate-100 text-slate-600' },
  pending: { label: 'Pendente', className: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejeitado', className: 'bg-rose-100 text-rose-700' },
};

const VerificationRequestsManagement: React.FC = () => {
  const { logAction } = useAdminAudit();
  const { user } = useAuth();
  const [items, setItems] = useState<VerificationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DocumentReviewStatus>('pending');
  const [selectedItem, setSelectedItem] = useState<VerificationQueueItem | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentUrlLoading, setDocumentUrlLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submittingAction, setSubmittingAction] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    void loadRequests();
  }, []);

  useEffect(() => {
    if (!selectedItem?.document_path) {
      setDocumentUrl(null);
      return;
    }

    let cancelled = false;
    const loadPreview = async () => {
      setDocumentUrlLoading(true);
      try {
        const { data: signedData, error: signedError } = await supabase.storage
          .from('verification_docs')
          .createSignedUrl(selectedItem.document_path!, 60 * 60);

        if (!cancelled) {
          if (!signedError && signedData?.signedUrl) {
            setDocumentUrl(signedData.signedUrl);
          } else {
            const { data: publicData } = supabase.storage
              .from('verification_docs')
              .getPublicUrl(selectedItem.document_path!);
            setDocumentUrl(publicData.publicUrl || null);
          }
        }
      } catch (error) {
        console.error('[VerificationRequests] Erro ao carregar documento:', error);
        if (!cancelled) {
          setDocumentUrl(null);
          toast.error('Não foi possível carregar o documento para visualização.');
        }
      } finally {
        if (!cancelled) {
          setDocumentUrlLoading(false);
        }
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [selectedItem?.document_path]);

  useEffect(() => {
    setReviewNotes(selectedItem?.document_review_notes || '');
  }, [selectedItem?.id, selectedItem?.document_review_notes]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id,name,email,avatar,document,document_path,document_verified,document_review_status,document_review_notes,document_reviewed_at,document_reviewed_by,document_last_attempt_at,document_retry_available_at,document_last_failure_reason,cidade,estado,updated_at,created_at')
        .not('document_path', 'is', null)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const normalized = ((data || []) as VerificationQueueItem[]).map((item) => ({
        ...item,
        document_review_status:
          item.document_review_status ||
          (item.document_verified ? 'approved' : 'pending'),
      }));

      setItems(normalized);
      if (selectedItem) {
        const refreshed = normalized.find((item) => item.id === selectedItem.id) || null;
        setSelectedItem(refreshed);
      }
    } catch (error) {
      console.error('[VerificationRequests] Erro ao carregar fila:', error);
      toast.error('Não foi possível carregar a fila de verificações.');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus =
        statusFilter === 'all' || (item.document_review_status || 'pending') === statusFilter;
      const matchesSearch =
        !normalizedSearch ||
        item.name?.toLowerCase().includes(normalizedSearch) ||
        item.email?.toLowerCase().includes(normalizedSearch) ||
        String(item.document || '').toLowerCase().includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [items, searchTerm, statusFilter]);

  const summary = useMemo(() => {
    return {
      pending: items.filter((item) => (item.document_review_status || 'pending') === 'pending').length,
      approved: items.filter((item) => (item.document_review_status || 'pending') === 'approved').length,
      rejected: items.filter((item) => (item.document_review_status || 'pending') === 'rejected').length,
    };
  }, [items]);

  const selectedFileIsPdf = selectedItem?.document_path?.toLowerCase().endsWith('.pdf') ?? false;
  const formatOptionalDateTime = (value?: string | null, fallback = 'Não informado') => {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
  };

  const notifyUser = async (target: VerificationQueueItem, approved: boolean, reason?: string) => {
    const title = approved ? 'Seu selo verificado foi aprovado' : 'Seu documento precisa de ajustes';
    const content = approved
      ? 'A documentação foi aprovada e o selo verificado já está disponível no seu perfil.'
      : `A documentação enviada não foi aprovada.${reason ? ` Motivo: ${reason}` : ''}`;

    const { error } = await supabase.from('notifications').insert({
      user_id: target.id,
      type: 'account_verification',
      title,
      content,
      link: '/minha-conta/perfil',
      is_read: false,
    });

    if (error) {
      console.error('[VerificationRequests] Erro ao criar notificação:', error);
    }
  };

  const handleApprove = async () => {
    if (!selectedItem) return;
    setSubmittingAction('approve');
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('users')
        .update({
          document_verified: true,
          document_review_status: 'approved',
          document_review_notes: null,
          document_reviewed_at: nowIso,
          document_reviewed_by: user?.id || null,
          document_retry_available_at: null,
          document_last_failure_reason: null,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      await notifyUser(selectedItem, true);
      await logAction({
        action: ADMIN_ACTIONS.APPROVE_USER_VERIFICATION,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: selectedItem.id,
        oldValue: {
          document_review_status: selectedItem.document_review_status,
          document_verified: selectedItem.document_verified,
        },
        newValue: {
          document_review_status: 'approved',
          document_verified: true,
        },
        reason: 'Documentação aprovada para selo verificado',
      });

      toast.success('Documentação aprovada com sucesso.');
      await loadRequests();
    } catch (error) {
      console.error('[VerificationRequests] Erro ao aprovar documento:', error);
      toast.error('Não foi possível aprovar a documentação.');
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleReject = async () => {
    if (!selectedItem) return;
    const reason = reviewNotes.trim();
    if (!reason) {
      toast.error('Informe o motivo da rejeição.');
      return;
    }

    setSubmittingAction('reject');
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('users')
        .update({
          document_verified: false,
          document_review_status: 'rejected',
          document_review_notes: reason,
          document_reviewed_at: nowIso,
          document_reviewed_by: user?.id || null,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      await notifyUser(selectedItem, false, reason);
      await logAction({
        action: ADMIN_ACTIONS.REJECT_USER_VERIFICATION,
        resourceType: RESOURCE_TYPES.USER,
        resourceId: selectedItem.id,
        oldValue: {
          document_review_status: selectedItem.document_review_status,
          document_verified: selectedItem.document_verified,
        },
        newValue: {
          document_review_status: 'rejected',
          document_verified: false,
        },
        reason,
      });

      toast.success('Documentação rejeitada e usuário notificado.');
      await loadRequests();
    } catch (error) {
      console.error('[VerificationRequests] Erro ao rejeitar documento:', error);
      toast.error('Não foi possível rejeitar a documentação.');
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.42)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-emerald-700">
              Selo Verificado
            </p>
            <h1 className="text-2xl font-black text-slate-900">Fila de verificação documental</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Analise os documentos enviados pelos usuários, valide o selo verificado e registre o histórico da revisão.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-700">Pendentes</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{summary.pending}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700">Aprovados</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{summary.approved}</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-rose-700">Rejeitados</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{summary.rejected}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.42)]">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por nome, e-mail ou CPF/CNPJ..."
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | DocumentReviewStatus)}
                className="h-12 bg-transparent text-sm outline-none"
              >
                <option value="all">Todos os status</option>
                <option value="pending">Pendentes</option>
                <option value="approved">Aprovados</option>
                <option value="rejected">Rejeitados</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="grid grid-cols-[minmax(0,1.2fr)_180px_180px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
              <span>Usuário</span>
              <span>Status</span>
              <span>Envio</span>
            </div>

            <div className="max-h-[620px] overflow-y-auto">
              {loading ? (
                <div className="px-5 py-10 text-sm text-slate-500">Carregando documentos enviados...</div>
              ) : filteredItems.length === 0 ? (
                <div className="px-5 py-10 text-sm text-slate-500">Nenhuma documentação encontrada para os filtros atuais.</div>
              ) : (
                filteredItems.map((item) => {
                  const status = item.document_review_status || 'pending';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className={`grid w-full grid-cols-[minmax(0,1.2fr)_180px_180px] gap-4 border-b border-slate-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-slate-50 ${
                        selectedItem?.id === item.id ? 'bg-emerald-50/60' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-sm font-black text-slate-600">
                          {item.avatar ? (
                            <img src={item.avatar} alt={item.name} className="h-full w-full object-cover" />
                          ) : (
                            item.name?.charAt(0).toUpperCase() || 'U'
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                          <p className="truncate text-xs text-slate-500">{item.email}</p>
                          <p className="truncate text-xs text-slate-400">{item.document || 'Documento não informado'}</p>
                          {item.document_retry_available_at ? (
                            <p className="truncate text-xs text-amber-700">
                              Nova tentativa em {formatOptionalDateTime(item.document_retry_available_at)}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusMeta[status].className}`}>
                          {statusMeta[status].label}
                        </span>
                      </div>

                      <div className="flex flex-col justify-center text-xs text-slate-500">
                        <span>{item.updated_at ? new Date(item.updated_at).toLocaleDateString('pt-BR') : '--'}</span>
                        <span>{item.updated_at ? new Date(item.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_28px_70px_-48px_rgba(15,23,42,0.42)]">
          {!selectedItem ? (
            <div className="flex h-full min-h-[480px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-8 text-center">
              <FileText className="mb-4 h-10 w-10 text-slate-300" />
              <h2 className="text-lg font-black text-slate-900">Selecione uma documentação</h2>
              <p className="mt-2 max-w-sm text-sm text-slate-500">
                Abra um item da fila para visualizar o arquivo enviado, conferir o CPF/CNPJ e aprovar ou rejeitar o selo verificado.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
                    Documento selecionado
                  </p>
                  <h2 className="mt-2 text-xl font-black text-slate-900">{selectedItem.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedItem.email}</p>
                </div>

                <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${statusMeta[selectedItem.document_review_status || 'pending'].className}`}>
                  {statusMeta[selectedItem.document_review_status || 'pending'].label}
                </span>
              </div>

              <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">CPF / CNPJ</span>
                  <span>{selectedItem.document || 'Não informado'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">Cidade / Estado</span>
                  <span>{selectedItem.cidade && selectedItem.estado ? `${selectedItem.cidade}, ${selectedItem.estado}` : 'Não informado'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">Última revisão</span>
                  <span>
                    {selectedItem.document_reviewed_at
                      ? new Date(selectedItem.document_reviewed_at).toLocaleString('pt-BR')
                      : 'Ainda não revisado'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">Última tentativa</span>
                  <span>{formatOptionalDateTime(selectedItem.document_last_attempt_at, 'Não registrada')}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">Nova tentativa liberada</span>
                  <span>{formatOptionalDateTime(selectedItem.document_retry_available_at, 'Sem bloqueio ativo')}</span>
                </div>
              </div>

              {selectedItem.document_last_failure_reason ? (
                <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <Clock3 className="h-4 w-4" />
                    Última falha automática
                  </div>
                  <p className="mt-2 leading-6">{selectedItem.document_last_failure_reason}</p>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {selectedFileIsPdf ? <FileText className="h-4 w-4 text-rose-500" /> : <ShieldCheck className="h-4 w-4 text-emerald-600" />}
                    Pré-visualização do documento
                  </div>
                  {documentUrl ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir
                      </a>
                      <a
                        href={documentUrl}
                        download
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar
                      </a>
                    </div>
                  ) : null}
                </div>

                <div className="min-h-[340px] bg-white">
                  {documentUrlLoading ? (
                    <div className="flex min-h-[340px] items-center justify-center text-sm text-slate-500">Carregando documento...</div>
                  ) : !documentUrl ? (
                    <div className="flex min-h-[340px] items-center justify-center text-sm text-slate-500">Não foi possível carregar a pré-visualização.</div>
                  ) : selectedFileIsPdf ? (
                    <iframe src={documentUrl} title="Documento de verificação" className="h-[440px] w-full" />
                  ) : (
                    <img src={documentUrl} alt={`Documento enviado por ${selectedItem.name}`} className="h-[440px] w-full object-contain bg-slate-50" />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-[0.22em] text-slate-500">
                  Observações da revisão
                </label>
                <textarea
                  rows={4}
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  placeholder="Descreva o motivo da rejeição ou registre observações úteis para a auditoria."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
                {selectedItem.document_review_notes ? (
                  <p className="text-xs text-slate-500">
                    Última observação registrada: {selectedItem.document_review_notes}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleApprove()}
                  disabled={submittingAction !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {submittingAction === 'approve' ? 'Aprovando...' : 'Aprovar selo'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleReject()}
                  disabled={submittingAction !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  {submittingAction === 'reject' ? 'Rejeitando...' : 'Rejeitar selo'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default VerificationRequestsManagement;

