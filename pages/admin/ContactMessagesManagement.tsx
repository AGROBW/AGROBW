import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, MessageSquare, Search, Send, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';

type ContactMessageStatus = 'new' | 'in_progress' | 'resolved' | 'archived';

interface ContactMessageRow {
  id: string;
  requester_user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  recipient_email: string | null;
  source_page: string;
  status: ContactMessageStatus;
  admin_notes: string | null;
  handled_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<ContactMessageStatus, string> = {
  new: 'Nova',
  in_progress: 'Em atendimento',
  resolved: 'Resolvida',
  archived: 'Arquivada',
};

const STATUS_STYLES: Record<ContactMessageStatus, string> = {
  new: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-700',
  resolved: 'border-sky-200 bg-sky-50 text-sky-700',
  archived: 'border-slate-200 bg-slate-100 text-slate-600',
};

const formatDateTime = (value: string | null) => {
  if (!value) return 'Sem dados';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const ContactMessagesManagement: React.FC = () => {
  const PAGE_SIZE = 5;
  const [messages, setMessages] = useState<ContactMessageRow[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ContactMessageStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDispatchingEmails, setIsDispatchingEmails] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  const loadMessages = async () => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('contact_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setMessages((data || []) as ContactMessageRow[]);
      setSelectedMessageId((current) => current ?? data?.[0]?.id ?? null);
    } catch (error: any) {
      console.error('[ContactMessagesManagement] Erro ao carregar mensagens:', error);
      toast.error('Nao foi possivel carregar as mensagens de contato.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMessages();
  }, []);

  const filteredMessages = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return messages.filter((message) => {
      if (statusFilter !== 'all' && message.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        message.name,
        message.email,
        message.phone || '',
        message.subject || '',
        message.message,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [messages, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / PAGE_SIZE));

  const paginatedMessages = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredMessages.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredMessages]);

  const selectedMessage =
    paginatedMessages.find((message) => message.id === selectedMessageId) ||
    filteredMessages.find((message) => message.id === selectedMessageId) ||
    messages.find((message) => message.id === selectedMessageId) ||
    null;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!paginatedMessages.length) {
      return;
    }

    const selectedInCurrentPage = paginatedMessages.some((message) => message.id === selectedMessageId);

    if (!selectedInCurrentPage) {
      setSelectedMessageId(paginatedMessages[0].id);
    }
  }, [paginatedMessages, selectedMessageId]);

  useEffect(() => {
    setNotesDraft(selectedMessage?.admin_notes || '');
  }, [selectedMessage?.id, selectedMessage?.admin_notes]);

  const summary = useMemo(() => {
    const countBy = (status: ContactMessageStatus) => messages.filter((message) => message.status === status).length;

    return {
      total: messages.length,
      newCount: countBy('new'),
      inProgressCount: countBy('in_progress'),
      resolvedCount: countBy('resolved'),
    };
  }, [messages]);

  const handleUpdateMessage = async (updates: Partial<ContactMessageRow>) => {
    if (!selectedMessage) return;

    try {
      setIsSaving(true);

      const payload: Partial<ContactMessageRow> = {
        ...updates,
      };

      if (updates.status === 'resolved' && !selectedMessage.resolved_at) {
        payload.resolved_at = new Date().toISOString();
      }

      if (updates.status && updates.status !== 'resolved') {
        payload.resolved_at = null;
      }

      const { data, error } = await supabase
        .from('contact_messages')
        .update(payload)
        .eq('id', selectedMessage.id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      setMessages((current) =>
        current.map((message) => (message.id === selectedMessage.id ? (data as ContactMessageRow) : message)),
      );

      toast.success('Mensagem atualizada com sucesso.');
    } catch (error) {
      console.error('[ContactMessagesManagement] Erro ao atualizar mensagem:', error);
      toast.error('Nao foi possivel atualizar a mensagem.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleProcessPendingEmails = async () => {
    try {
      setIsDispatchingEmails(true);

      const { data, error } = await supabase.functions.invoke('send-contact-form-emails', {
        body: { limit: 10 },
      });

      if (error) {
        throw error;
      }

      toast.success(
        `Fila processada: ${data?.sentCount ?? 0} enviado(s), ${data?.failedCount ?? 0} falha(s), ${data?.skippedCount ?? 0} ignorado(s).`,
      );
    } catch (error: any) {
      console.error('[ContactMessagesManagement] Erro ao processar fila de e-mails:', error);
      toast.error(error?.message || 'Nao foi possivel processar a fila de e-mails agora.');
    } finally {
      setIsDispatchingEmails(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Mensagens de contato</h1>
            <p className="mt-2 text-sm text-slate-500">
              Acompanhe tudo o que foi enviado pelo formulario publico de Fale Conosco e organize o retorno da equipe.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleProcessPendingEmails()}
            disabled={isDispatchingEmails}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDispatchingEmails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isDispatchingEmails ? 'Processando fila...' : 'Processar e-mails pendentes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Total</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Novas</p>
          <p className="mt-3 text-3xl font-black text-emerald-800">{summary.newCount}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Em atendimento</p>
          <p className="mt-3 text-3xl font-black text-amber-800">{summary.inProgressCount}</p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Resolvidas</p>
          <p className="mt-3 text-3xl font-black text-sky-800">{summary.resolvedCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar por nome, e-mail ou assunto"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | ContactMessageStatus)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
                >
                  <option value="all">Todos</option>
                  <option value="new">Novas</option>
                  <option value="in_progress">Em atendimento</option>
                  <option value="resolved">Resolvidas</option>
                  <option value="archived">Arquivadas</option>
                </select>
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Resultados</p>
                <p className="mt-2 text-lg font-black text-slate-900">{filteredMessages.length}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex max-h-[620px] min-h-[620px] flex-col">
            {isLoading ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
                Carregando mensagens...
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                Nenhuma mensagem encontrada para os filtros atuais.
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {paginatedMessages.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() => setSelectedMessageId(message.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selectedMessage?.id === message.id
                          ? 'border-emerald-300 bg-emerald-50/60 shadow-[0_18px_40px_-32px_rgba(16,185,129,0.75)]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{message.name}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{message.email}</p>
                        </div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${STATUS_STYLES[message.status]}`}>
                          {STATUS_LABELS[message.status]}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-slate-600">{message.subject || message.message}</p>
                      <p className="mt-3 text-xs font-semibold text-slate-400">{formatDateTime(message.created_at)}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                      Pagina {currentPage} de {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={currentPage === 1}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={currentPage === totalPages}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Proxima
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          {selectedMessage ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-black text-slate-900">{selectedMessage.subject || 'Mensagem sem assunto'}</h2>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${STATUS_STYLES[selectedMessage.status]}`}>
                      {STATUS_LABELS[selectedMessage.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Recebida em {formatDateTime(selectedMessage.created_at)}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleUpdateMessage({ status: 'in_progress' })}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Marcar em atendimento
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleUpdateMessage({ status: 'resolved' })}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Marcar resolvida
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Mail className="h-4 w-4" />
                    <p className="text-xs font-black uppercase tracking-[0.16em]">Contato</p>
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-900">{selectedMessage.email}</p>
                  <p className="mt-1 text-sm text-slate-500">{selectedMessage.phone || 'Telefone nao informado'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <MessageSquare className="h-4 w-4" />
                    <p className="text-xs font-black uppercase tracking-[0.16em]">Origem</p>
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-900">Fale Conosco</p>
                  <p className="mt-1 text-sm text-slate-500">{selectedMessage.recipient_email || 'Sem destinatario configurado'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <UserCheck className="h-4 w-4" />
                    <p className="text-xs font-black uppercase tracking-[0.16em]">Atendimento</p>
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-900">
                    {selectedMessage.status === 'resolved'
                      ? `Resolvida em ${formatDateTime(selectedMessage.resolved_at)}`
                      : 'Ainda sem fechamento'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Ultima atualizacao em {formatDateTime(selectedMessage.updated_at)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Mensagem recebida</p>
                </div>
                <div className="px-5 py-5">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{selectedMessage.message}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">Observacoes internas</span>
                  <textarea
                    rows={5}
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    placeholder="Registre encaminhamentos, historico de retorno ou observacoes da equipe."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
                  />
                </label>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleUpdateMessage({ admin_notes: notesDraft })}
                    className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Salvar observacoes
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleUpdateMessage({ status: 'archived' })}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Arquivar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
              <div className="max-w-sm px-6">
                <p className="text-lg font-black text-slate-900">Selecione uma mensagem</p>
                <p className="mt-2 text-sm text-slate-500">
                  Quando um contato chegar pelo formulario publico, ele aparecera aqui para leitura e tratamento da equipe.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ContactMessagesManagement;
