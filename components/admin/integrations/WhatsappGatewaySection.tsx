import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MessageCircleMore,
  Save,
  Send,
  ServerCog,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useWhatsappGatewaySettings } from '../../../src/hooks/useWhatsappGatewaySettings';
import { useWhatsappGatewayActions } from '../../../src/hooks/useWhatsappGatewayActions';
import {
  normalizeWhatsappGatewayBaseUrl,
  normalizeWhatsappPhone,
  validateWhatsappGatewaySettings,
} from '../../../src/lib/whatsappGateway';
import type { WhatsappGatewaySettingsDraft } from '../../../src/lib/whatsappGateway';

const EMPTY_FORM: WhatsappGatewaySettingsDraft = {
  base_url: '',
  send_path: '/api/v1/messages',
  health_path: '/api/v1/health',
  auth_type: 'bearer',
  auth_secret: '',
  default_recipient_phone: '',
  is_enabled: false,
};

const WhatsappGatewaySection: React.FC = () => {
  const { settings, isLoading, error, fetchSettings, updateSettings } = useWhatsappGatewaySettings();
  const { runningAction, lastResult, runAction } = useWhatsappGatewayActions();
  const [formData, setFormData] = useState<WhatsappGatewaySettingsDraft>(EMPTY_FORM);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setFormData({
      base_url: settings.base_url || '',
      send_path: settings.send_path || EMPTY_FORM.send_path,
      health_path: settings.health_path || EMPTY_FORM.health_path,
      auth_type: settings.auth_type || 'bearer',
      auth_secret: '',
      default_recipient_phone: settings.default_recipient_phone || '',
      is_enabled: settings.is_enabled,
    });
  }, [settings]);

  const handleChange = <Field extends keyof WhatsappGatewaySettingsDraft>(
    field: Field,
    value: WhatsappGatewaySettingsDraft[Field],
  ) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationErrors = validateWhatsappGatewaySettings(formData, {
      authSecretConfigured: settings?.auth_secret_configured,
    });

    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    setSaving(true);
    try {
      const safeUpdate = {
        base_url: normalizeWhatsappGatewayBaseUrl(formData.base_url),
        send_path: formData.send_path,
        health_path: formData.health_path,
        auth_type: formData.auth_type,
        auth_secret: formData.auth_secret,
        default_recipient_phone: normalizeWhatsappPhone(formData.default_recipient_phone),
        is_enabled: formData.is_enabled,
      };
      const { error: updateError } = await updateSettings(safeUpdate);

      if (updateError) {
        toast.error(`Erro ao salvar: ${updateError}`);
        return;
      }

      toast.success('Configuracao da Central WhatsApp salva.');
      setFormData((current) => ({ ...current, auth_secret: '' }));
      await fetchSettings();
    } finally {
      setSaving(false);
    }
  };

  const handleGatewayAction = async (action: 'health' | 'test_message') => {
    const result = await runAction(action);
    if (result.success) {
      toast.success(action === 'health' ? 'Gateway respondeu com sucesso.' : 'Mensagem de teste aceita pelo gateway.');
    } else {
      toast.error(result.error || 'Nao foi possivel testar o gateway.');
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <div className="border-b border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_65%,#f0fdfa_100%)] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Gateway unificado</p>
            <h2 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
              <MessageCircleMore className="h-6 w-6 text-emerald-600" /> Central WhatsApp
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Configura a ponte externa para alertas administrativos e avisos de novos contatos aos anunciantes.
              Os envios ativos usam fila duravel, retentativas e fallback controlado para a integracao oficial.
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
            {settings?.is_enabled ? 'Central em operacao' : 'Aguardando ativacao'}
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="p-6">
        {error ? (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <ServerCog className="h-5 w-5 text-emerald-600" />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Provedor</p>
            <p className="mt-1 text-sm font-bold text-slate-900">Gateway externo</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <KeyRound className="h-5 w-5 text-sky-600" />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Credencial</p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {settings?.auth_secret_configured ? 'Configurada' : 'Pendente'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            {settings?.is_enabled ? (
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-slate-500" />
            )}
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {settings?.is_enabled ? 'Ativada' : 'Desativada'}
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <label className="space-y-2 lg:col-span-2">
            <span className="text-sm font-semibold text-slate-700">URL publica da API</span>
            <input
              type="url"
              value={formData.base_url}
              onChange={(event) => handleChange('base_url', event.target.value)}
              placeholder="https://whatsapp-api.seudominio.com"
              className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
            <span className="block text-xs text-slate-500">Somente HTTPS publico. Enderecos locais ou de rede privada sao recusados.</span>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Endpoint de envio</span>
            <input
              type="text"
              value={formData.send_path}
              onChange={(event) => handleChange('send_path', event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Endpoint de saude</span>
            <input
              type="text"
              value={formData.health_path}
              onChange={(event) => handleChange('health_path', event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Autenticacao</span>
            <select
              value={formData.auth_type}
              onChange={(event) => handleChange('auth_type', event.target.value as WhatsappGatewaySettingsDraft['auth_type'])}
              className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm"
            >
              <option value="bearer">Bearer token</option>
              <option value="hmac_sha256">Assinatura HMAC-SHA256</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Numero administrativo de destino</span>
            <input
              type="tel"
              value={formData.default_recipient_phone}
              onChange={(event) => handleChange('default_recipient_phone', event.target.value)}
              placeholder="5564999999999"
              className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm"
            />
          </label>

          <label className="space-y-2 lg:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Credencial da API</span>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={formData.auth_secret}
                onChange={(event) => handleChange('auth_secret', event.target.value)}
                placeholder={settings?.auth_secret_configured ? 'Credencial configurada (deixe vazio para manter)' : 'Informe o token ou segredo HMAC'}
                autoComplete="new-password"
                className="h-12 w-full rounded-xl border border-slate-200 px-4 pr-12 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowSecret((current) => !current)}
                aria-label={showSecret ? 'Ocultar credencial' : 'Exibir credencial'}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <span className="block text-xs text-slate-500">A credencial e somente para escrita e nunca retorna ao navegador depois de salva.</span>
          </label>
        </div>

        <label className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <input
            type="checkbox"
            checked={formData.is_enabled}
            onChange={(event) => handleChange('is_enabled', event.target.checked)}
            className="h-5 w-5 rounded border-slate-300 accent-emerald-600"
          />
          <span className="text-sm font-semibold text-slate-700">Ativar o gateway externo quando a API estiver disponivel</span>
          {formData.is_enabled ? <CheckCircle className="ml-auto h-5 w-5 text-emerald-600" /> : null}
        </label>

        <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Activity className="h-4 w-4 text-sky-600" /> Diagnostico server-side
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Os testes usam a ultima configuracao salva. A credencial permanece no servidor e o envio vai somente para o numero administrativo configurado.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleGatewayAction('health')}
                disabled={Boolean(runningAction) || !settings?.base_url || !settings?.auth_secret_configured}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-white px-4 text-sm font-bold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runningAction === 'health' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Testar conexao
              </button>
              <button
                type="button"
                onClick={() => void handleGatewayAction('test_message')}
                disabled={Boolean(runningAction) || !settings?.base_url || !settings?.auth_secret_configured || !settings?.default_recipient_phone}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runningAction === 'test_message' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar mensagem de teste
              </button>
            </div>
          </div>

          {lastResult ? (
            <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
              lastResult.success
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}>
              {lastResult.success
                ? <CheckCircle className="mt-0.5 h-4 w-4 flex-none" />
                : <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />}
              <span>
                {lastResult.success ? 'Operacao concluida pelo gateway.' : lastResult.error}
                {lastResult.requestId ? ` Protocolo: ${lastResult.requestId}.` : ''}
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving || Boolean(error)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Central WhatsApp
          </button>
        </div>
      </form>
    </section>
  );
};

export default WhatsappGatewaySection;
