import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Copy,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usePaymentSettings } from '../../src/hooks/usePaymentSettings';
import { useWebhookLogs } from '../../src/hooks/useWebhookLogs';
import WhatsappNotificationsSection from '../../components/admin/integrations/WhatsappNotificationsSection';

const IntegrationsManagement: React.FC = () => {
  const {
    settings,
    isLoading: settingsLoading,
    fetchSettings,
    updateSettings,
  } = usePaymentSettings();
  const {
    logs,
    isLoading: logsLoading,
    page: logsPage,
    pageSize: logsPageSize,
    total: logsTotal,
    totalPages: logsTotalPages,
    fetchLogs,
    goToPage: goToLogsPage,
    deleteLogs,
  } = useWebhookLogs();

  const [formData, setFormData] = useState({
    asaas_api_key: '',
    asaas_webhook_token: '',
    is_production: false,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingLogs, setDeletingLogs] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const asaasWebhookUrl = useMemo(
    () => (supabaseUrl ? `${supabaseUrl}/functions/v1/webhook-asaas` : ''),
    [supabaseUrl]
  );

  useEffect(() => {
    if (!settings) return;

    setFormData({
      asaas_api_key: '',
      asaas_webhook_token: '',
      is_production: settings.is_production || false,
    });
  }, [settings]);

  const handleChange = (field: keyof typeof formData, value: string | boolean) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      const { error } = await updateSettings({
        asaas_api_key: formData.asaas_api_key,
        asaas_webhook_token: formData.asaas_webhook_token,
        is_production: formData.is_production,
      });

      if (error) {
        toast.error(`Erro ao salvar: ${error}`);
        return;
      }

      toast.success('Configurações do Asaas salvas com sucesso.');
      await fetchSettings();
      setFormData((current) => ({
        ...current,
        asaas_api_key: '',
        asaas_webhook_token: '',
      }));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyWebhookUrl = async () => {
    if (!asaasWebhookUrl) {
      toast.error('A URL do webhook ainda não está disponível neste ambiente.');
      return;
    }

    await navigator.clipboard.writeText(asaasWebhookUrl);
    toast.success('URL do webhook do Asaas copiada.');
  };

  const handleDeleteOldLogs = async () => {
    if (!window.confirm('Deseja remover os logs de webhook com mais de 30 dias?')) {
      return;
    }

    setDeletingLogs(true);
    try {
      const { error, count } = await deleteLogs(30);
      if (error) {
        toast.error(`Erro ao deletar logs: ${error}`);
        return;
      }

      toast.success(`${count} log(s) removido(s) com sucesso.`);
    } finally {
      setDeletingLogs(false);
    }
  };

  const formatDate = (value: string | null | undefined) =>
    value
      ? new Date(value).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '-';

  const formatPayload = (payload: unknown) => {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  };

  if (settingsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Gateway de pagamento
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">Integração Asaas</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          A plataforma foi preparada para operar com o Asaas como gateway único. Cadastre a API Key
          da sua conta e o token de autenticação do webhook para ativar checkout, recorrência e
          conciliação automática.
        </p>
      </section>

      <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">API Key</p>
                <p className="text-sm font-semibold text-slate-900">
                  {settings?.asaas_api_key_configured ? 'Configurada' : 'Pendente'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Token do webhook</p>
                <p className="text-sm font-semibold text-slate-900">
                  {settings?.asaas_webhook_token_configured ? 'Configurado' : 'Pendente'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ambiente</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formData.is_production ? 'Produção' : 'Sandbox'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">API Key do Asaas</span>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={formData.asaas_api_key}
                onChange={(event) => handleChange('asaas_api_key', event.target.value)}
                placeholder={settings?.asaas_api_key_configured ? 'API Key já configurada' : '$aact_hmlg_... ou $aact_prod_...'}
                className="h-12 w-full rounded-xl border border-slate-200 px-4 pr-12 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((current) => !current)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500"
                aria-label={showApiKey ? 'Ocultar chave' : 'Exibir chave'}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <span className="text-xs text-slate-500">
              Use a chave de sandbox com prefixo <code>$aact_hmlg_</code> e a de produção com prefixo <code>$aact_prod_</code>.
            </span>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Token do webhook</span>
            <div className="relative">
              <input
                type={showWebhookToken ? 'text' : 'password'}
                value={formData.asaas_webhook_token}
                onChange={(event) => handleChange('asaas_webhook_token', event.target.value)}
                placeholder={settings?.asaas_webhook_token_configured ? 'Token já configurado' : 'Token enviado no header asaas-access-token'}
                className="h-12 w-full rounded-xl border border-slate-200 px-4 pr-12 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowWebhookToken((current) => !current)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500"
                aria-label={showWebhookToken ? 'Ocultar token' : 'Exibir token'}
              >
                {showWebhookToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <span className="text-xs text-slate-500">
              Configure o mesmo valor no campo de autenticação do webhook do Asaas. Ele será validado no header <code>asaas-access-token</code>.
            </span>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Ambiente</span>
            <select
              value={formData.is_production ? 'production' : 'sandbox'}
              onChange={(event) => handleChange('is_production', event.target.value === 'production')}
              className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm"
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Produção</option>
            </select>
          </label>

          <div className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Webhook do Asaas</span>
            <div className="flex h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 px-4">
              <span className="truncate text-sm text-slate-600">{asaasWebhookUrl || 'URL indisponível'}</span>
              <button
                type="button"
                onClick={handleCopyWebhookUrl}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
            <span className="text-xs text-slate-500">
              Use essa URL ao criar o webhook do Asaas e selecione os eventos de checkout, cobrança e assinatura.
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar configuração
          </button>
          <button
            type="button"
            onClick={() => void fetchSettings()}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Checklist do Asaas</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start gap-3">
                {settings?.asaas_api_key_configured ? (
                  <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
                )}
                <span>API Key salva no painel admin</span>
              </div>
              <div className="flex items-start gap-3">
                {settings?.asaas_webhook_token_configured ? (
                  <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
                )}
                <span>Token de autenticação do webhook salvo e igual ao configurado no Asaas</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                <span>URL do webhook apontando para <code>/functions/v1/webhook-asaas</code></span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                <span>Eventos recomendados: <code>PAYMENT_CREATED</code>, <code>PAYMENT_CONFIRMED</code>, <code>PAYMENT_RECEIVED</code>, <code>PAYMENT_OVERDUE</code>, <code>PAYMENT_DELETED</code>, <code>SUBSCRIPTION_CREATED</code>, <code>SUBSCRIPTION_UPDATED</code> e <code>SUBSCRIPTION_DELETED</code>.</span>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Status da integração</p>
            <p className="mt-1">
              {settings?.asaas_api_key_configured && settings?.asaas_webhook_token_configured
                ? 'Pronta para testes de checkout e webhook.'
                : 'Preencha a API Key e o token do webhook para ativar o fluxo do Asaas.'}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Logs de webhook</h3>
            <p className="mt-1 text-sm text-slate-500">
              Auditoria dos eventos recebidos do gateway de pagamento.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void fetchLogs()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={handleDeleteOldLogs}
              disabled={deletingLogs}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingLogs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Limpar antigos
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {logsLoading ? (
            <div className="flex h-40 items-center justify-center text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Nenhum log encontrado.
            </div>
          ) : (
            logs.map((log) => (
              <article key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                        {log.provider}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {log.event_type || 'Evento sem tipo'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Recebido em {formatDate(log.received_at)} • Processado em {formatDate(log.processed_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        log.processed
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {log.processed ? 'Processado' : 'Pendente'}
                    </span>
                    {typeof log.status_code === 'number' && (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        HTTP {log.status_code}
                      </span>
                    )}
                  </div>
                </div>

                {log.error_message ? (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {log.error_message}
                  </div>
                ) : null}

                <details className="mt-4 rounded-xl border border-slate-200 bg-white">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
                    Ver payload
                  </summary>
                  <pre className="overflow-x-auto border-t border-slate-200 px-4 py-4 text-xs text-slate-700">
                    {formatPayload(log.payload)}
                  </pre>
                </details>
              </article>
            ))
          )}

          {!logsLoading && logsTotal > logsPageSize ? (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row">
              <p className="text-xs text-slate-500">
                Mostrando {(logsPage - 1) * logsPageSize + 1}–{Math.min(logsPage * logsPageSize, logsTotal)} de {logsTotal} logs
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void goToLogsPage(logsPage - 1)}
                  disabled={logsPage <= 1}
                  className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-xs font-medium text-slate-500">
                  Página {logsPage} de {logsTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => void goToLogsPage(logsPage + 1)}
                  disabled={logsPage >= logsTotalPages}
                  className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <WhatsappNotificationsSection />
    </div>
  );
};

export default IntegrationsManagement;
