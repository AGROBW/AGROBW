import React, { useState, useEffect } from 'react';
import { 
  Save, 
  CheckCircle, 
  AlertCircle, 
  Copy, 
  Send, 
  Trash2, 
  Eye, 
  EyeOff,
  Loader2,
  RefreshCw,
  Globe,
  Lock,
  Key
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
    testConnection 
  } = usePaymentSettings();
  
  const { 
    logs, 
    isLoading: logsLoading, 
    fetchLogs, 
    simulateWebhook, 
    deleteLogs 
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
  const [simulating, setSimulating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

  // Webhook URL (ajuste conforme seu endpoint)
  const WEBHOOK_URL = 'https://api.bwagro.com.br/webhooks/mercadopago';

  useEffect(() => {
    if (settings) {
      setFormData({
        mp_access_token: settings.mp_access_token || '',
        mp_public_key: settings.mp_public_key || '',
        mp_webhook_secret: settings.mp_webhook_secret || '',
        is_production: settings.is_production || false,
      });
    }
  }, [settings]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return;
    }

    setSaving(true);
    setTestResult(null);

    try {
      const { error } = await updateSettings(formData, user.id);

      if (error) {
        toast.error(`Erro ao salvar: ${error}`);
        return;
      }

      toast.success('Configurações salvas com sucesso!');
      await fetchSettings();
    } catch (err) {
      console.error('Erro ao salvar:', err);
      toast.error('Erro inesperado ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    // Nota: Não precisamos mais validar o Access Token aqui
    // A Edge Function busca o token diretamente do banco de dados (server-side)
    setTesting(true);
    setTestResult(null);

    try {
      const result = await testConnection();

      if (result.success) {
        const accountInfo = result.data?.email || result.data?.nickname || result.data?.id || 'Conta válida';
        setTestResult({
          success: true,
          message: `Conexão estabelecida com sucesso!`,
          data: result.data,
        });
        toast.success(`✅ Conexão OK - ${accountInfo}`);
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Falha na conexão',
        });
        toast.error(`❌ ${result.error || 'Token inválido'}`);
      }
    } catch (err) {
      console.error('Erro ao testar conexão:', err);
      toast.error('Erro ao testar conexão');
      setTestResult({
        success: false,
        message: 'Erro ao conectar',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCopyWebhookURL = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success('URL copiada para a área de transferência!');
  };

  const handleSimulateWebhook = async () => {
    setSimulating(true);

    try {
      const { error, data } = await simulateWebhook();

      if (error) {
        toast.error(`Erro ao simular webhook: ${error}`);
        return;
      }

      toast.success('Webhook simulado com sucesso! Veja na tabela de logs.');
      await fetchLogs();
    } catch (err) {
      console.error('Erro ao simular webhook:', err);
      toast.error('Erro ao simular webhook');
    } finally {
      setSimulating(false);
    }
  };

  const handleDeleteOldLogs = async () => {
    if (!confirm('Deletar logs com mais de 30 dias?\n\nEsta ação não pode ser desfeita.')) {
      return;
    }

    setDeleting(true);

    try {
      const { error, count } = await deleteLogs(30);

      if (error) {
        toast.error(`Erro ao deletar logs: ${error}`);
        return;
      }

      toast.success(`${count} log(s) deletado(s) com sucesso!`);
    } catch (err) {
      console.error('Erro ao deletar logs:', err);
      toast.error('Erro ao deletar logs');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPayload = (payload: any) => {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Título */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Integrações de Pagamento</h2>
        <p className="text-gray-600">
          Configure as credenciais do Mercado Pago e gerencie webhooks de notificação.
        </p>
      </div>

      {/* Credenciais Mercado Pago */}
      <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-600" />
            Credenciais Mercado Pago
          </h3>
          <div className="flex items-center gap-2">
            <Globe className={formData.is_production ? 'w-4 h-4 text-green-600' : 'w-4 h-4 text-orange-500'} />
            <span className={`text-sm font-semibold ${formData.is_production ? 'text-green-600' : 'text-orange-500'}`}>
              {formData.is_production ? 'Produção' : 'Sandbox'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {/* Access Token */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <Lock className="inline w-4 h-4 mr-1 text-red-600" />
              Access Token
            </label>
            <div className="flex gap-2">
              <input
                type={showAccessToken ? 'text' : 'password'}
                value={formData.mp_access_token}
                onChange={(e) => handleChange('mp_access_token', e.target.value)}
                placeholder="APP_USR-XXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowAccessToken(!showAccessToken)}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {showAccessToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Token de acesso da sua aplicação no Mercado Pago (Apps → Suas integrações)
            </p>
          </div>

          {/* Public Key */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Public Key
            </label>
            <input
              type="text"
              value={formData.mp_public_key}
              onChange={(e) => handleChange('mp_public_key', e.target.value)}
              placeholder="APP_USR-XXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Chave pública para pagamentos do lado do cliente
            </p>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <Lock className="inline w-4 h-4 mr-1 text-red-600" />
              Webhook Secret
            </label>
            <div className="flex gap-2">
              <input
                type={showWebhookSecret ? 'text' : 'password'}
                value={formData.mp_webhook_secret}
                onChange={(e) => handleChange('mp_webhook_secret', e.target.value)}
                placeholder="Secret para validar webhooks (opcional)"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {showWebhookSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Secret para validar autenticidade dos webhooks (recomendado)
            </p>
          </div>

          {/* Ambiente */}
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
            <input
              type="checkbox"
              id="is_production"
              checked={formData.is_production}
              onChange={(e) => handleChange('is_production', e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <label htmlFor="is_production" className="flex-1">
              <div className="font-semibold text-gray-900">Ambiente de Produção</div>
              <div className="text-sm text-gray-600">
                Marque esta opção ao usar credenciais de produção (não marque para Sandbox)
              </div>
            </label>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-start gap-3 p-4 rounded-lg ${
              testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              {testResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className={`font-semibold ${testResult.success ? 'text-green-900' : 'text-red-900'}`}>
                  {testResult.success ? 'Conexão Estabelecida' : 'Falha na Conexão'}
                </div>
                <div className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {testResult.message}
                </div>
                {testResult.success && testResult.data && (
                  <div className="mt-2 text-xs font-mono bg-white p-2 rounded border border-green-200 text-gray-700">
                    <div>ID: {testResult.data.id}</div>
                    <div>Email: {testResult.data.email}</div>
                    <div>Nickname: {testResult.data.nickname}</div>
                    <div>País: {testResult.data.country_id}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !formData.mp_access_token}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {testing ? 'Testando...' : 'Verificar Conexão'}
            </button>
          </div>
        </div>
      </form>

      {/* Webhook URL */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-purple-600" />
          URL do Webhook
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              URL para Configurar no Mercado Pago
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={WEBHOOK_URL}
                readOnly
                className="flex-1 px-4 py-2 bg-slate-50 border border-gray-300 rounded-lg font-mono text-sm text-gray-700"
              />
              <button
                type="button"
                onClick={handleCopyWebhookURL}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                <Copy className="w-4 h-4" />
                Copiar
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Configure esta URL no painel do Mercado Pago (Desenvolvedores → Webhooks)
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSimulateWebhook}
              disabled={simulating}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {simulating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {simulating ? 'Simulando...' : 'Simular Webhook'}
            </button>

            <button
              type="button"
              onClick={() => fetchLogs()}
              disabled={logsLoading}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
              Atualizar Logs
            </button>
          </div>
        </div>
      </div>

      {/* Logs de Webhooks */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Logs de Webhooks ({logs.length})
          </h3>
          <button
            type="button"
            onClick={handleDeleteOldLogs}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Limpar Logs Antigos (30+ dias)
          </button>
        </div>

        {logsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum webhook recebido ainda</p>
            <p className="text-sm mt-1">Clique em "Simular Webhook" para criar um log de teste</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Provider</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Evento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Processado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(log.received_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                        {log.provider}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                      {log.event_type || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {log.status_code && (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                          log.status_code >= 200 && log.status_code < 300
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {log.status_code}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.processed ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Sim
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Não
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <details className="cursor-pointer">
                        <summary className="text-sm text-blue-600 hover:underline">Ver JSON</summary>
                        <pre className="mt-2 text-xs bg-slate-800 text-green-400 p-3 rounded overflow-x-auto max-w-md">
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
