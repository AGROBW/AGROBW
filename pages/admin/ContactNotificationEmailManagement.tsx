import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Mail,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useContactNotificationEmailMonitoring } from '../../src/hooks/useContactNotificationEmailMonitoring';

const statusMeta: Record<
  'pending' | 'processing' | 'sent' | 'failed' | 'skipped',
  { label: string; className: string }
> = {
  pending: { label: 'Pendente', className: 'border border-amber-200 bg-amber-50 text-amber-700' },
  processing: { label: 'Processando', className: 'border border-sky-200 bg-sky-50 text-sky-700' },
  sent: { label: 'Enviado', className: 'border border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: 'Falhou', className: 'border border-rose-200 bg-rose-50 text-rose-700' },
  skipped: { label: 'Ignorado', className: 'border border-slate-200 bg-slate-50 text-slate-600' },
};

const kindMeta: Record<'new_message' | 'new_lead', { label: string; className: string }> = {
  new_message: { label: 'Mensagem', className: 'bg-sky-100 text-sky-700' },
  new_lead: { label: 'Lead', className: 'bg-emerald-100 text-emerald-700' },
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const SummaryCard: React.FC<{
  title: string;
  value: number;
  helper: string;
  icon: React.ReactNode;
  accent: string;
}> = ({ title, value, helper, icon, accent }) => (
  <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.3)]">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">{title}</p>
        <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
        <p className="mt-2 text-sm text-slate-500">{helper}</p>
      </div>
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accent}`}>{icon}</div>
    </div>
  </div>
);

const ContactNotificationEmailManagement: React.FC = () => {
  const { summary, jobs, dispatchLogs, isLoading, error, fetchMonitoring, processQueueNow } =
    useContactNotificationEmailMonitoring();
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'sent' | 'failed' | 'skipped'>('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'new_message' | 'new_lead'>('all');
  const [isProcessingNow, setIsProcessingNow] = useState(false);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (statusFilter !== 'all' && job.status !== statusFilter) return false;
      if (kindFilter !== 'all' && job.sourceKind !== kindFilter) return false;
      return true;
    });
  }, [jobs, statusFilter, kindFilter]);

  const handleProcessNow = async () => {
    setIsProcessingNow(true);
    const result = await processQueueNow(25);
    setIsProcessingNow(false);

    if (result.error) {
      toast.error('Nao foi possivel processar a fila de contatos agora.', {
        description: result.error,
      });
      return;
    }

    const data = result.data as
      | {
          processedCount?: number;
          sentCount?: number;
          failedCount?: number;
        }
      | null;

    toast.success('Fila de contatos processada com sucesso.', {
      description: `Processados: ${data?.processedCount ?? 0} | Enviados: ${data?.sentCount ?? 0} | Falhas: ${data?.failedCount ?? 0}`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[30px] border border-slate-200 bg-white px-6 py-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.3)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-sky-700">
            <Mail className="h-3.5 w-3.5" />
            Contatos por E-mail
          </div>
          <h2 className="mt-4 text-2xl font-black text-slate-950">Monitoramento de leads e mensagens</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Acompanhe os e-mails enviados quando um vendedor recebe um novo lead ou uma nova mensagem dentro da plataforma.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void fetchMonitoring()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleProcessNow}
            disabled={isProcessingNow}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#0f172a] px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessingNow ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Processar fila agora
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          Nao foi possivel carregar o monitoramento dos contatos: {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Pendentes" value={summary.pending} helper="Aguardando processamento" icon={<Clock3 className="h-5 w-5 text-amber-700" />} accent="bg-amber-50" />
        <SummaryCard title="Enviados hoje" value={summary.sentToday} helper="Entregas registradas hoje" icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />} accent="bg-emerald-50" />
        <SummaryCard title="Falhas" value={summary.failed} helper="Precisam de revisao" icon={<AlertCircle className="h-5 w-5 text-rose-700" />} accent="bg-rose-50" />
        <SummaryCard title="Ignorados" value={summary.skipped} helper="Sem envio por regra ou dado ausente" icon={<ShieldAlert className="h-5 w-5 text-slate-700" />} accent="bg-slate-100" />
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Fila de envios</p>
            <h3 className="mt-2 text-lg font-black text-slate-950">Ultimos jobs de leads e mensagens</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'processing', 'sent', 'failed', 'skipped'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatusFilter(option)}
                className={`rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-[0.22em] transition ${
                  statusFilter === option ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {option === 'all' ? 'Todos' : statusMeta[option].label}
              </button>
            ))}
            {(['all', 'new_message', 'new_lead'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKindFilter(option)}
                className={`rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-[0.22em] transition ${
                  kindFilter === option ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {option === 'all' ? 'Todos os tipos' : kindMeta[option].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr className="text-left text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                <th className="px-4 py-3">Destinatario</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tentativas</th>
                <th className="px-4 py-3">Fila</th>
                <th className="px-4 py-3">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    {Array.from({ length: 7 }).map((__, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-4">
                        <div className="h-4 animate-pulse rounded-full bg-slate-100" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    Nenhum job encontrado para esse filtro.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr key={job.id} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{job.recipientName || 'Cliente'}</p>
                      <p className="mt-1 text-xs text-slate-500">{job.recipientEmail || 'Sem e-mail valido'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${kindMeta[job.sourceKind].className}`}>
                        {kindMeta[job.sourceKind].label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{job.announcementTitle || 'Anuncio nao encontrado'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {job.senderName ? `Remetente: ${job.senderName}` : 'Sem remetente identificado'}
                      </p>
                      {job.messagePreview ? (
                        <p className="mt-2 line-clamp-2 text-xs text-slate-500">{job.messagePreview}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${statusMeta[job.status].className}`}>
                        {statusMeta[job.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-700">{job.attempts}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      <div>{formatDateTime(job.queuedAt)}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {job.status === 'sent' ? `Enviado em ${formatDateTime(job.sentAt)}` : `Ultima tentativa ${formatDateTime(job.lastAttemptAt)}`}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">
                      {job.lastError ? <span className="line-clamp-2">{job.lastError}</span> : <span className="text-slate-400">Sem ocorrencias</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
        <div className="border-b border-slate-100 pb-5">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Execucoes recentes</p>
          <h3 className="mt-2 text-lg font-black text-slate-950">Log de processamento</h3>
        </div>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-[22px] bg-slate-100" />)
          ) : dispatchLogs.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
              Ainda nao houve execucao registrada para a fila de contatos.
            </div>
          ) : (
            dispatchLogs.map((log) => (
              <div key={log.id} className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-900">
                        {log.triggeredBy === 'cron' ? 'Execucao automatica' : 'Execucao manual do admin'}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${
                          log.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : log.status === 'failed'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Inicio em {formatDateTime(log.startedAt)} | fim em {formatDateTime(log.finishedAt)}
                    </p>
                    {log.notes ? <p className="mt-2 text-sm text-slate-600">{log.notes}</p> : null}
                  </div>

                  <div className="grid min-w-[260px] grid-cols-2 gap-3 text-sm text-slate-600">
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Processados</p>
                      <p className="mt-1 text-lg font-black text-slate-950">{log.processedCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Enviados</p>
                      <p className="mt-1 text-lg font-black text-emerald-700">{log.sentCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Falhas</p>
                      <p className="mt-1 text-lg font-black text-rose-700">{log.failedCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Ignorados</p>
                      <p className="mt-1 text-lg font-black text-slate-700">{log.skippedCount}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
        <div className="border-b border-slate-100 pb-5">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Cobertura da regra</p>
          <h3 className="mt-2 text-lg font-black text-slate-950">Como esses e-mails se comportam</h3>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100">
                <MessageCircle className="h-5 w-5 text-sky-700" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Nova mensagem</p>
                <p className="text-xs text-slate-500">Avisa o destinatario quando a conversa recebe uma nova resposta.</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              A primeira mensagem do comprador nao dispara e-mail de mensagem, porque esse primeiro contato ja e coberto pelo aviso de lead.
            </p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100">
                <Users className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Novo lead</p>
                <p className="text-xs text-slate-500">Avisa o vendedor quando um comprador inicia um novo interesse.</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              O e-mail leva direto para a area de leads, com resumo do anuncio e da mensagem inicial para o vendedor agir rapido.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactNotificationEmailManagement;
