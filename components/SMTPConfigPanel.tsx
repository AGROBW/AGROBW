import React, { useEffect, useState } from 'react';
import { Mail, Server, Lock, Eye, EyeOff, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { SMTPConfig } from '../types';
import { getSMTPConfig, saveSMTPConfig, validateSMTPConfig, testSMTPConnection, sendTestEmail } from '../services/emailService';

export const SMTPConfigPanel: React.FC = () => {
  const [config, setConfig] = useState<Partial<SMTPConfig>>({
    id: 'smtp_config_1',
    host: '',
    port: 587,
    user: '',
    password: '',
    encryption: 'TLS',
    fromEmail: '',
    fromName: 'AGRO BW',
    isActive: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const stored = await getSMTPConfig();
      if (stored) {
        setConfig(stored);
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erro ao carregar configuracao SMTP',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    const validation = validateSMTPConfig(config);

    if (!validation.valid) {
      setMessage({
        type: 'error',
        text: validation.errors.join(', '),
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      await saveSMTPConfig(config as SMTPConfig);
      setMessage({
        type: 'success',
        text: 'Configuracoes SMTP salvas com sucesso no painel.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erro ao salvar configuracao SMTP',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setMessage(null);

    try {
      const result = await testSMTPConnection();
      setMessage({
        type: result.success ? 'success' : 'error',
        text: result.message,
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erro ao testar conexao SMTP',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      setMessage({
        type: 'error',
        text: 'Digite um e-mail valido para teste',
      });
      return;
    }

    setIsTesting(true);
    setMessage(null);

    try {
      const result = await sendTestEmail(testEmail);
      setMessage({
        type: result.success ? 'success' : 'error',
        text: result.message,
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erro ao enviar e-mail de teste',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-xl font-bold text-slate-900">Configuracao SMTP</h2>
        <p className="text-sm text-slate-600">
          Configure o servidor de e-mail para envio de notificacoes automaticas da plataforma.
        </p>
      </div>

      {message && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 ${
            message.type === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-700" strokeWidth={1.5} />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-700" strokeWidth={1.5} />
          )}
          <p className={`text-sm ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
            {message.text}
          </p>
        </div>
      )}

      <div className="space-y-5 rounded-lg border bg-white p-6">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-500">Carregando configuracao SMTP...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  <Server className="mr-1.5 inline h-4 w-4" strokeWidth={1.5} />
                  Host SMTP
                </label>
                <input
                  type="text"
                  value={config.host}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="h-10 w-full rounded-lg border px-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Porta</label>
                <input
                  type="number"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value, 10) || 0 })}
                  placeholder="587"
                  className="h-10 w-full rounded-lg border px-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Usuario (E-mail)</label>
                <input
                  type="email"
                  value={config.user}
                  onChange={(e) => setConfig({ ...config, user: e.target.value })}
                  placeholder="seu-email@exemplo.com"
                  className="h-10 w-full rounded-lg border px-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  <Lock className="mr-1.5 inline h-4 w-4" strokeWidth={1.5} />
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    placeholder="••••••••"
                    className="h-10 w-full rounded-lg border px-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Tipo de Criptografia</label>
              <div className="flex gap-4">
                {(['SSL', 'TLS', 'NONE'] as const).map((type) => (
                  <label key={type} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="encryption"
                      value={type}
                      checked={config.encryption === type}
                      onChange={(e) => setConfig({ ...config, encryption: e.target.value as SMTPConfig['encryption'] })}
                      className="h-4 w-4 text-green-700 focus:ring-green-700"
                    />
                    <span className="text-sm text-slate-700">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  <Mail className="mr-1.5 inline h-4 w-4" strokeWidth={1.5} />
                  E-mail do Remetente
                </label>
                <input
                  type="email"
                  value={config.fromEmail}
                  onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
                  placeholder="notificacoes@bwagro.com.br"
                  className="h-10 w-full rounded-lg border px-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Nome do Remetente</label>
                <input
                  type="text"
                  value={config.fromName}
                  onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                  placeholder="AGRO BW"
                  className="h-10 w-full rounded-lg border px-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 border-t pt-3">
              <input
                type="checkbox"
                id="isActive"
                checked={config.isActive}
                onChange={(e) => setConfig({ ...config, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-700"
              />
              <label htmlFor="isActive" className="cursor-pointer text-sm font-medium text-slate-700">
                Ativar envio de e-mails
              </label>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={isSaving || isLoading}
          className="flex h-10 items-center gap-2 rounded-lg bg-green-700 px-6 font-semibold text-white transition-colors hover:bg-green-800 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              Salvando...
            </>
          ) : (
            'Salvar Configuracoes'
          )}
        </button>

        <button
          onClick={() => void handleTest()}
          disabled={isTesting || isLoading}
          className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-6 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {isTesting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              Testando...
            </>
          ) : (
            <>
              <Server className="h-4 w-4" strokeWidth={1.5} />
              Testar Conexao
            </>
          )}
        </button>
      </div>

      <div className="rounded-lg border bg-slate-50 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Enviar E-mail de Teste</h3>
        <div className="flex gap-3">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="Digite um e-mail para teste"
            className="h-10 flex-1 rounded-lg border px-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
          />
          <button
            onClick={() => void handleSendTestEmail()}
            disabled={isTesting || !testEmail || isLoading}
            className="flex h-10 items-center gap-2 rounded-lg bg-slate-700 px-6 font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            <Mail className="h-4 w-4" strokeWidth={1.5} />
            Enviar Teste
          </button>
        </div>
      </div>
    </div>
  );
};
