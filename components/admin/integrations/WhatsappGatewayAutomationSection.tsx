import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock3, Loader2, RefreshCw, RotateCcw, Save, Workflow } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useWhatsappGatewayQueue,
  type WhatsappGatewayTemplate,
} from '../../../src/hooks/useWhatsappGatewayQueue';

const WhatsappGatewayAutomationSection: React.FC = () => {
  const { templates, summary, recentJobs, isLoading, error, fetchQueue, updateTemplate, retryJob } = useWhatsappGatewayQueue();
  const [drafts, setDrafts] = useState<Record<string, WhatsappGatewayTemplate>>({});
  const [savingType, setSavingType] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(templates.map((template) => [template.event_type, template])));
  }, [templates]);

  const changeTemplate = (
    eventType: string,
    changes: Partial<Pick<WhatsappGatewayTemplate, 'body_template' | 'is_enabled'>>,
  ) => {
    setDrafts((current) => ({
      ...current,
      [eventType]: { ...current[eventType], ...changes },
    }));
  };

  const saveTemplate = async (eventType: string) => {
    const draft = drafts[eventType];
    if (!draft?.body_template.trim()) {
      toast.error('O texto do template nao pode ficar vazio.');
      return;
    }

    setSavingType(eventType);
    try {
      const { error: updateError } = await updateTemplate(draft);
      if (updateError) {
        toast.error(`Erro ao salvar: ${updateError}`);
        return;
      }
      toast.success('Evento automatico atualizado.');
    } finally {
      setSavingType(null);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const result = await retryJob(jobId);
      if (!result.retried) {
        toast.error(result.error || 'Nao foi possivel reenfileirar o envio.');
        return;
      }
      toast.success('Envio devolvido para a fila.');
    } finally {
      setRetryingJobId(null);
    }
  };

  const statusPresentation: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pendente', className: 'bg-amber-50 text-amber-700' },
    processing: { label: 'Processando', className: 'bg-sky-50 text-sky-700' },
    retry: { label: 'Retentativa', className: 'bg-orange-50 text-orange-700' },
    sent: { label: 'Enviado', className: 'bg-emerald-50 text-emerald-700' },
    dead_letter: { label: 'Falha final', className: 'bg-rose-50 text-rose-700' },
    skipped: { label: 'Ignorado', className: 'bg-slate-100 text-slate-600' },
  };
  const editableTemplates = templates.filter(
    (template) => template.event_type !== 'marketing_announcement_campaign',
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Automacoes</p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-bold text-slate-900">
            <Workflow className="h-5 w-5 text-sky-600" /> Eventos e fila de entrega
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Configure quais eventos administrativos entram na fila e personalize seus textos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchQueue()}
          disabled={isLoading}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar fila
        </button>
      </div>

      <div className="p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ['Pendentes', summary.pending_count, 'text-amber-700'],
            ['Processando', summary.processing_count, 'text-sky-700'],
            ['Retentativas', summary.retry_count, 'text-orange-700'],
            ['Enviadas hoje', summary.sent_today_count, 'text-emerald-700'],
            ['Fila de falhas', summary.dead_letter_count, 'text-rose-700'],
            ['Falhas ao criar job (24h)', summary.enqueue_failure_count, 'text-rose-700'],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
              <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {error ? (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" /> {error}
          </div>
        ) : null}

        {isLoading && editableTemplates.length === 0 ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-sky-600" /></div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {editableTemplates.map((template) => {
              const draft = drafts[template.event_type] || template;
              return (
                <article key={template.event_type} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-slate-900">{template.label}</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">{template.event_type}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={draft.is_enabled}
                        onChange={(event) => changeTemplate(template.event_type, { is_enabled: event.target.checked })}
                        className="h-5 w-5 rounded border-slate-300 accent-emerald-600"
                      />
                      Ativo
                    </label>
                  </div>
                  <textarea
                    value={draft.body_template}
                    onChange={(event) => changeTemplate(template.event_type, { body_template: event.target.value })}
                    maxLength={1600}
                    rows={4}
                    className="mt-4 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm leading-6 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                  {draft.allowed_placeholders.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Variaveis permitidas: {draft.allowed_placeholders.map((placeholder) => `{{${placeholder}}}`).join(', ')}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" /> {draft.body_template.length}/1600
                    </span>
                    <button
                      type="button"
                      onClick={() => void saveTemplate(template.event_type)}
                      disabled={savingType === template.event_type}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingType === template.event_type
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Save className="h-3.5 w-3.5" />}
                      Salvar evento
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!error && editableTemplates.length > 0 ? (
          <p className="mt-5 flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle className="h-4 w-4" /> Os links de destino sao acrescentados pelo worker, fora do texto editavel.
          </p>
        ) : null}

        <div className="mt-8 border-t border-slate-200 pt-6">
          <div>
            <h3 className="font-bold text-slate-900">Entregas recentes</h3>
            <p className="mt-1 text-sm text-slate-500">
              Historico operacional sem telefone, credencial ou conteudo da mensagem.
            </p>
          </div>

          {recentJobs.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhum envio registrado pela Central WhatsApp.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Evento</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Tentativas</th>
                    <th className="px-4 py-3 font-semibold">Criado em</th>
                    <th className="px-4 py-3 text-right font-semibold">Acao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {recentJobs.map((job) => {
                    const presentation = statusPresentation[job.status] || statusPresentation.skipped;
                    const canRetry = job.status === 'retry' || job.status === 'dead_letter';
                    return (
                      <tr key={job.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{job.event_label}</p>
                          {job.last_error_code ? (
                            <p className="mt-1 font-mono text-[11px] text-rose-600">
                              {job.last_error_code}{job.last_http_status ? ` (${job.last_http_status})` : ''}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${presentation.className}`}>
                            {presentation.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{job.attempts}/{job.max_attempts}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {new Date(job.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canRetry ? (
                            <button
                              type="button"
                              onClick={() => void handleRetryJob(job.id)}
                              disabled={retryingJobId === job.id}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {retryingJobId === job.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RotateCcw className="h-3.5 w-3.5" />}
                              Reenfileirar
                            </button>
                          ) : <span className="text-xs text-slate-400">Sem acao</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default WhatsappGatewayAutomationSection;
