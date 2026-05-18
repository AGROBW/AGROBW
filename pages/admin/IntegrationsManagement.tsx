import React, { useEffect, useState } from 'react';
import {
  Save,
  CheckCircle,
  AlertCircle,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Globe,
  Lock,
  Key,
} from 'lucide-react';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePaymentSettings } from '../../src/hooks/usePaymentSettings';
import { useWebhookLogs } from '../../src/hooks/useWebhookLogs';
import toast from 'react-hot-toast';

const IntegrationsManagement: React.FC = () => {
  const { user } = useAuth();
  const {
    settings,
    isLoading: settingsLoading,
    fetchSettings,
    updateSettings,
    testConnection,
  } = usePaymentSettings();
  const {
    logs,
    isLoading: logsLoading,
    fetchLogs,
    deleteLogs,
  } = useWebhookLogs();

  const [formData, setFormData] = useState({
    mp_access_token: '',
    mp_public_key: '',
    mp_webhook_secret: '',
    is_production: false,
  });
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const webhookUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/webhook-mercadopago` : '';

  useEffect(() => {
    if (!settings) {
      return;
    }

    setFormData({
      mp_access_token: '',
      mp_public_key: settings.mp_public_key || '',
      mp_webhook_secret: '',
      is_production: settings.is_production || false,
    });
  }, [settings]);

  const handleChange = (field: string, value: any) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user?.id) {
      toast.error('Você precisa estar logado.');
      return;
    }

    setSaving(true);
    setTestResult(null);

    try {
      const { error } = await updateSettings(formData);

      if (error) {
        toast.error(`Erro ao salvar: ${error}`);
        return;
      }

      toast.success('Configurações salvas com sucesso.');
      await fetchSettings();
    } catch (err) {
      console.error('Erro ao salvar configurações de pagamento:', err);
      toast.error('Erro inesperado ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const result = await testConnection();

      if (result.success) {
        const accountInfo = result.data?.email || result.data?.nickname || result.data?.id || 'Conta válida';
        setTestResult({
          success: true,
          message: 'Conexão estabelecida com sucesso.',
          data: result.data,
        });
        toast.success(`Conexão OK - ${accountInfo}`);
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Falha na conexão.',
        });
        toast.error(result.error || 'Falha na conexão.');
      }
    } catch (err) {
      console.error('Erro ao testar conexão com Mercado Pago:', err);
      toast.error('Erro ao testar a conexão.');
      setTestResult({
        success: false,
        message: 'Erro ao conectar.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCopyWebhookURL = async () => {
    if (!webhookUrl) {
      toast.error('URL do webhook indisponível neste ambiente.');
      return;
    }

    await navigator.clipboard.writeText(webhookUrl);
    toast.success('URL copiada para a área de transferência.');
  };

  const handleDeleteOldLogs = async () => {
    if (!confirm('Deletar logs com mais de 30 dias? Esta ação não pode ser desfeita.')) {
      return;
    }

    setDeleting(true);

    try {
      const { error, count } = await deleteLogs(30);

      if (error) {
        toast.error(`Erro ao deletar logs: ${error}`);
        return;
      }

      toast.success(`${count} log(s) deletado(s) com sucesso.`);
    } catch (err) {
      console.error('Erro ao deletar logs antigos:', err);
      toast.error('Erro ao deletar logs.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatPayload = (payload: any) => {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  };

  if (settingsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-2xl font-bold text-gray-900">Integrações de Pagamento</h2>
        <p className="text-gray-600">
          Configure o Mercado Pago de forma segura e acompanhe os webhooks recebidos.
        </p>
      </div>

      <form onSubmit={handleSave} className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Key className="h-5 w-5 text-blue-600" />
            Credenciais do Mercado Pago
          </h3>
          <div className="flex items-center gap-2">
            <Globe className={formData.is_production ? 'h-4 w-4 text-green-600' : 'h-4 w-4 text-orange-500'} />
            <span className={`text-sm font-semibold ${formData.is_production ? 'text-green-600' : 'text-orange-500'}`}>
              {formData.is_production ? 'Produção' : 'Sandbox'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              <Lock className="mr-1 inline h-4 w-4 text-red-600" />
              Access Token
            </label>
            <div className="flex gap-2">
              <input
                type={showAccessToken ? 'text' : 'password'}
                value={formData.mp_access_token}
                onChange={(e) => handleChange('mp_access_token', e.target.value)}
                placeholder={
                  settings?.mp_access_token_configured
                    ? 'Já configurado no servidor. Preencha apenas para trocar.'
                    : 'APP_USR-XXXXXXXXXXXXXXXXXXXXXXXXXXXX'
                }
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-green-500"
              />
              <button
                type="button"
                onClick={() => setShowAccessToken((current) => !current)}
                className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50"
              >
                {showAccessToken ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              O valor atual não é devolvido ao navegador. Preencha este campo apenas para substituir o token salvo.
            </p>
            {settings?.mp_access_token_configured && (
              <p className="mt-1 text-xs font-semibold text-green-700">Access Token atualmente configurado no servidor.</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Public Key</label>
            <input
              type="text"
              value={formData.mp_public_key}
              onChange={(e) => handleChange('mp_public_key', e.target.value)}
              placeholder="APP_USR-XXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-green-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Chave pública usada no fluxo cliente de checkout.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              <Lock className="mr-1 inline h-4 w-4 text-red-600" />
              Webhook Secret
            </label>
            <div className="flex gap-2">
              <input
                type={showWebhookSecret ? 'text' : 'password'}
                value={formData.mp_webhook_secret}
                onChange={(e) => handleChange('mp_webhook_secret', e.target.value)}
                placeholder={
                  settings?.mp_webhook_secret_configured
                    ? 'Já configurado no servidor. Preencha apenas para trocar.'
                    : 'Secret para validar webhooks'
                }
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-green-500"
              />
              <button
                type="button"
                onClick={() => setShowWebhookSecret((current) => !current)}
                className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50"
              >
                {showWebhookSecret ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              O valor atual não é devolvido ao navegador. Preencha este campo apenas para substituir o secret salvo.
            </p>
            {settings?.mp_webhook_secret_configured && (
              <p className="mt-1 text-xs font-semibold text-green-700">Webhook Secret atualmente configurado no servidor.</p>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4">
            <input
              id="is_production"
              type="checkbox"
              checked={formData.is_production}
              onChange={(e) => handleChange('is_production', e.target.checked)}
              className="h-4 w-4 rounded text-green-600 focus:ring-green-500"
            />
            <label htmlFor="is_production" className="flex-1">
              <div className="font-semibold text-gray-900">Ambiente de Produção</div>
              <div className="text-sm text-gray-600">
                Marque esta opção apenas quando estiver usando credenciais reais de produção.
              </div>
            </label>
          </div>

          {testResult && (
            <div
              className={`flex items-start gap-3 rounded-lg border p-4 ${
                testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              )}
              <div className="flex-1">
                <div className={`font-semibold ${testResult.success ? 'text-green-900' : 'text-red-900'}`}>
                  {testResult.success ? 'Conexão estabelecida' : 'Falha na conexão'}
                </div>
                <div className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {testResult.message}
                </div>
                {testResult.success && testResult.data && (
                  <div className="mt-2 rounded border border-green-200 bg-white p-2 font-mono text-xs text-gray-700">
                    <div>ID: {testResult.data.id}</div>
                    <div>Email: {testResult.data.email}</div>
                    <div>Nickname: {testResult.data.nickname}</div>
                    <div>País: {testResult.data.country_id}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {testing ? 'Verificando...' : 'Verificar Conexão'}
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
          <Globe className="h-5 w-5 text-purple-600" />
          URL do Webhook
        </h3>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              URL para configurar no Mercado Pago
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={webhookUrl}
                readOnly
                className="flex-1 rounded-lg border border-gray-300 bg-slate-50 px-4 py-2 font-mono text-sm text-gray-700"
              />
              <button
                type="button"
                onClick={handleCopyWebhookURL}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Configure esta URL no painel do Mercado Pago em Desenvolvedores → Webhooks.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fetchLogs()}
              disabled={logsLoading}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
            >
              <RefreshCw className={`h-4 w-4 ${logsLoading ? 'animate-spin' : ''}`} />
              Atualizar Logs
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Logs de Webhooks ({logs.length})
          </h3>
          <button
            type="button"
            onClick={handleDeleteOldLogs}
            disabled={deleting}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Limpar Logs Antigos (30+ dias)
          </button>
        </div>

        {logsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <AlertCircle className="mx-auto mb-3 h-12 w-12 opacity-50" />
            <p>Nenhum webhook recebido ainda.</p>
            <p className="mt-1 text-sm">Os eventos reais do Mercado Pago aparecerão aqui quando forem recebidos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b-2 border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Provider</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Evento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Processado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(log.received_at)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-800">
                        {log.provider}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">{log.event_type || '-'}</td>
                    <td className="px-4 py-3">
                      {log.status_code && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                            log.status_code >= 200 && log.status_code < 300
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {log.status_code}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.processed ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Sim
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Não
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <details className="cursor-pointer">
                        <summary className="text-sm text-blue-600 hover:underline">Ver JSON</summary>
                        <pre className="mt-2 max-w-md overflow-x-auto rounded bg-slate-800 p-3 text-xs text-green-400">
                          {formatPayload(log.payload)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntegrationsManagement;
