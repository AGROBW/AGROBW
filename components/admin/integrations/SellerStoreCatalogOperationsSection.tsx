import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getSellerStoreCatalogOperationalTone,
  useSellerStoreCatalogOperations,
} from '../../../src/hooks/useSellerStoreCatalogOperations';

const formatDateTime = (value: string | null) => (
  value ? new Date(value).toLocaleString('pt-BR') : 'Ainda nao registrado'
);

const statusPresentation = {
  running: { label: 'Executando', className: 'bg-sky-50 text-sky-700' },
  succeeded: { label: 'Concluida', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Falhou', className: 'bg-rose-50 text-rose-700' },
  skipped: { label: 'Ignorada', className: 'bg-slate-100 text-slate-600' },
};

const tonePresentation = {
  paused: {
    label: 'Processamento pausado',
    detail: 'Novos pedidos continuam registrados, mas nenhum PDF sera processado.',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
    icon: PauseCircle,
  },
  healthy: {
    label: 'Operacao saudavel',
    detail: 'O worker esta ativo e concluiu uma execucao recentemente.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  attention: {
    label: 'Operacao requer atencao',
    detail: 'Existem falhas recentes. Revise o historico antes de manter o processamento ativo.',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: AlertTriangle,
  },
  waiting: {
    label: 'Aguardando execucao',
    detail: 'O processamento esta ativo, mas ainda nao ha sucesso recente registrado.',
    className: 'border-sky-200 bg-sky-50 text-sky-800',
    icon: Clock3,
  },
};

const SellerStoreCatalogOperationsSection: React.FC = () => {
  const {
    health,
    runs,
    isLoading,
    isSaving,
    error,
    fetchOperations,
    updateRuntime,
  } = useSellerStoreCatalogOperations();
  const [maxBatchSize, setMaxBatchSize] = useState(1);
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [activationConfirmed, setActivationConfirmed] = useState(false);

  useEffect(() => {
    if (!health) return;
    setMaxBatchSize(health.max_batch_size);
    setFailureThreshold(health.failure_threshold);
    if (health.processing_enabled) setActivationConfirmed(false);
  }, [health]);

  const setProcessing = async (enabled: boolean) => {
    if (enabled && !activationConfirmed) {
      toast.error('Confirme a ativacao acompanhada antes de continuar.');
      return;
    }
    const result = await updateRuntime({
      processingEnabled: enabled,
      maxBatchSize,
      failureThreshold,
    });
    if (!result.updated) {
      toast.error(result.error || 'Nao foi possivel atualizar a operacao.');
      return;
    }
    setActivationConfirmed(false);
    toast.success(enabled ? 'Processamento de catalogos ativado.' : 'Processamento de catalogos pausado.');
  };

  const tone = getSellerStoreCatalogOperationalTone(health);
  const presentation = tonePresentation[tone];
  const ToneIcon = presentation.icon;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Minha Loja</p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-bold text-slate-900">
            <FileText className="h-5 w-5 text-emerald-600" /> Operacao dos catalogos PDF
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Ative de forma acompanhada, acompanhe a fila e interrompa o worker sem perder pedidos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchOperations()}
          disabled={isLoading}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar operacao
        </button>
      </div>

      <div className="space-y-6 p-6">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> {error}
          </div>
        ) : null}

        {isLoading && !health ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : health ? (
          <>
            <div className={`flex items-start gap-3 rounded-2xl border p-4 ${presentation.className}`} aria-live="polite">
              <ToneIcon className="mt-0.5 h-5 w-5 flex-none" />
              <div>
                <p className="font-bold">{presentation.label}</p>
                <p className="mt-1 text-sm opacity-90">{presentation.detail}</p>
                {health.paused_reason ? <p className="mt-2 font-mono text-xs">{health.paused_reason}</p> : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ['Na fila', health.queued, 'text-amber-700'],
                ['Processando', health.processing, 'text-sky-700'],
                ['Prontos em 24h', health.ready_24h, 'text-emerald-700'],
                ['Falhas em 24h', health.failed_24h, 'text-rose-700'],
                ['Falhas seguidas', health.consecutive_failures, 'text-orange-700'],
                ['Lote maximo', health.max_batch_size, 'text-slate-800'],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                  <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-5 rounded-2xl border border-slate-200 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <label className="text-sm font-semibold text-slate-700">
                PDFs por execucao
                <select
                  value={maxBatchSize}
                  onChange={(event) => setMaxBatchSize(Number(event.target.value))}
                  disabled={health.processing_enabled || isSaving}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
                >
                  <option value={1}>1 por execucao</option>
                  <option value={2}>2 por execucao</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Pausar apos falhas seguidas
                <select
                  value={failureThreshold}
                  onChange={(event) => setFailureThreshold(Number(event.target.value))}
                  disabled={health.processing_enabled || isSaving}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
                >
                  {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} falhas</option>)}
                </select>
              </label>
              {health.processing_enabled ? (
                <button
                  type="button"
                  onClick={() => void setProcessing(false)}
                  disabled={isSaving}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                  Pausar processamento
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void setProcessing(true)}
                  disabled={isSaving || !activationConfirmed}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  Ativar processamento
                </button>
              )}
            </div>

            {!health.processing_enabled ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={activationConfirmed}
                  onChange={(event) => setActivationConfirmed(event.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-amber-300 accent-emerald-600"
                />
                <span>
                  <strong className="block">Confirmo a ativacao acompanhada</strong>
                  Vou observar as primeiras execucoes e pausar se houver falhas repetidas ou crescimento anormal da fila.
                </span>
              </label>
            ) : null}

            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
              <p className="rounded-xl bg-slate-50 p-3"><strong className="block text-slate-800">Ultimo inicio</strong>{formatDateTime(health.last_started_at)}</p>
              <p className="rounded-xl bg-slate-50 p-3"><strong className="block text-slate-800">Ultimo sucesso</strong>{formatDateTime(health.last_success_at)}</p>
              <p className="rounded-xl bg-slate-50 p-3"><strong className="block text-slate-800">Pedido mais antigo</strong>{formatDateTime(health.oldest_queued_at)}</p>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-600" />
                <h3 className="font-bold text-slate-900">Execucoes recentes</h3>
              </div>
              <p className="mt-1 text-sm text-slate-500">Historico tecnico sem dados comerciais dos anuncios.</p>

              {runs.length === 0 ? (
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma execucao registrada.</p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Inicio</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Resultado</th>
                        <th className="px-4 py-3 font-semibold">Duracao</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {runs.map((run) => {
                        const runStatus = statusPresentation[run.status];
                        return (
                          <tr key={run.id}>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(run.started_at)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${runStatus.className}`}>{runStatus.label}</span>
                              {run.error_code ? <p className="mt-1 font-mono text-[11px] text-rose-600">{run.error_code}</p> : null}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {Number(run.summary.ready || 0)} pronto(s), {Number(run.summary.failed || 0)} falha(s)
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {run.duration_ms === null ? 'Em andamento' : `${(run.duration_ms / 1000).toFixed(1)} s`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="flex items-center gap-2 text-xs text-emerald-700">
              <ShieldCheck className="h-4 w-4" /> Alteracoes exigem uma sessao administrativa valida e sao aplicadas por RPC protegida.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
};

export default SellerStoreCatalogOperationsSection;
