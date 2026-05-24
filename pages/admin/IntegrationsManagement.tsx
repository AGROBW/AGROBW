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
  Search,
  UserPlus,
  X,
  Users,
} from 'lucide-react';
import { useAuth } from '../../src/contexts/AuthContext';
import { usePaymentSettings } from '../../src/hooks/usePaymentSettings';
import { useWebhookLogs } from '../../src/hooks/useWebhookLogs';
import { supabase } from '../../src/lib/supabaseClient';
import toast from 'react-hot-toast';

type StripeRolloutSummary = {
  legacy_paid_customers: number;
  manual_override_count: number;
  stripe_subscription_count: number;
  legacy_subscription_count: number;
};

type StripeRolloutOverride = {
  user_id: string;
  user_name: string;
  user_email: string;
  reason: string | null;
  has_paid_history: boolean;
  created_at: string;
  updated_at: string;
};

type StripeRolloutSearchResult = {
  user_id: string;
  user_name: string;
  user_email: string;
  has_paid_history: boolean;
  already_allowlisted: boolean;
};

const IntegrationsManagement: React.FC = () => {
  const { user } = useAuth();
  const { settings, isLoading: settingsLoading, fetchSettings, updateSettings } = usePaymentSettings();
  const { logs, isLoading: logsLoading, fetchLogs, deleteLogs } = useWebhookLogs();

  const [formData, setFormData] = useState({
    stripe_secret_key: '',
    stripe_publishable_key: '',
    stripe_webhook_secret: '',
    is_production: false,
  });
  const [showStripeSecretKey, setShowStripeSecretKey] = useState(false);
  const [showStripeWebhookSecret, setShowStripeWebhookSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rolloutSummary, setRolloutSummary] = useState<StripeRolloutSummary | null>(null);
  const [rolloutOverrides, setRolloutOverrides] = useState<StripeRolloutOverride[]>([]);
  const [rolloutQuery, setRolloutQuery] = useState('');
  const [rolloutSearchResults, setRolloutSearchResults] = useState<StripeRolloutSearchResult[]>([]);
  const [loadingRolloutOps, setLoadingRolloutOps] = useState(false);
  const [searchingRolloutUsers, setSearchingRolloutUsers] = useState(false);
  const [savingOverrideUserId, setSavingOverrideUserId] = useState<string | null>(null);
  const [removingOverrideUserId, setRemovingOverrideUserId] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const stripeWebhookUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/webhook-stripe` : '';

  useEffect(() => {
    if (!settings) {
      return;
    }

    setFormData({
      stripe_secret_key: '',
      stripe_publishable_key: settings.stripe_publishable_key || '',
      stripe_webhook_secret: '',
      is_production: settings.is_production || false,
    });
  }, [settings]);

  useEffect(() => {
    void fetchRolloutOperations();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchRolloutUsers(rolloutQuery);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [rolloutQuery]);

  const handleChange = (field: keyof typeof formData, value: string | boolean) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const fetchRolloutOperations = async () => {
    setLoadingRolloutOps(true);

    try {
      const [{ data: summaryData, error: summaryError }, { data: overridesData, error: overridesError }] = await Promise.all([
        supabase.rpc('get_stripe_rollout_summary_admin_safe'),
        supabase.rpc('list_stripe_rollout_overrides_admin_safe'),
      ]);

      if (summaryError) {
        throw summaryError;
      }

      if (overridesError) {
        throw overridesError;
      }

      const normalizedSummary = (Array.isArray(summaryData) ? summaryData[0] : summaryData) || null;
      setRolloutSummary(
        normalizedSummary
          ? {
              legacy_paid_customers: normalizedSummary.legacy_paid_customers ?? 0,
              manual_override_count: normalizedSummary.manual_override_count ?? 0,
              stripe_subscription_count: normalizedSummary.stripe_subscription_count ?? 0,
              legacy_subscription_count:
                normalizedSummary.legacy_subscription_count ?? 0,
            }
          : null
      );
      setRolloutOverrides(Array.isArray(overridesData) ? overridesData : []);
    } catch (err) {
      console.error('Erro ao carregar operacao de rollout Stripe:', err);
      toast.error('Nao foi possivel carregar a operacao de rollout Stripe.');
    } finally {
      setLoadingRolloutOps(false);
    }
  };

  const searchRolloutUsers = async (query: string) => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
      setRolloutSearchResults([]);
      return;
    }

    setSearchingRolloutUsers(true);

    try {
      const { data, error } = await supabase.rpc('search_users_for_stripe_rollout_admin_safe', {
        p_query: normalizedQuery,
      });

      if (error) {
        throw error;
      }

      setRolloutSearchResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao buscar usuarios para rollout Stripe:', err);
      toast.error('Nao foi possivel buscar usuarios para a allowlist Stripe.');
    } finally {
      setSearchingRolloutUsers(false);
    }
  };

  const handleAddOverride = async (userId: string) => {
    setSavingOverrideUserId(userId);

    try {
      const { error } = await supabase.rpc('upsert_stripe_rollout_override_admin_safe', {
        p_user_id: userId,
        p_reason: 'Liberacao operacional da migracao Stripe',
      });

      if (error) {
        throw error;
      }

      toast.success('Conta liberada para operar via Stripe.');
      await fetchRolloutOperations();
      await searchRolloutUsers(rolloutQuery);
    } catch (err) {
      console.error('Erro ao liberar conta para Stripe:', err);
      toast.error('Nao foi possivel liberar a conta para Stripe.');
    } finally {
      setSavingOverrideUserId(null);
    }
  };

  const handleRemoveOverride = async (userId: string) => {
    setRemovingOverrideUserId(userId);

    try {
      const { data, error } = await supabase.rpc('delete_stripe_rollout_override_admin_safe', {
        p_user_id: userId,
      });

      if (error) {
        throw error;
      }

      if (!data) {
        toast.error('A conta nao estava mais na allowlist.');
        return;
      }

      toast.success('Conta removida da allowlist Stripe.');
      await fetchRolloutOperations();
      await searchRolloutUsers(rolloutQuery);
    } catch (err) {
      console.error('Erro ao remover conta da allowlist Stripe:', err);
      toast.error('Nao foi possivel remover a conta da allowlist Stripe.');
    } finally {
      setRemovingOverrideUserId(null);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user?.id) {
      toast.error('Voce precisa estar logado.');
      return;
    }

    setSaving(true);

    try {
      const { error } = await updateSettings({
        stripe_secret_key: formData.stripe_secret_key,
        stripe_publishable_key: formData.stripe_publishable_key,
        stripe_webhook_secret: formData.stripe_webhook_secret,
        is_production: formData.is_production,
      });

      if (error) {
        toast.error(`Erro ao salvar: ${error}`);
        return;
      }

      toast.success('Configuracoes Stripe salvas com sucesso.');
      await fetchSettings();
    } catch (err) {
      console.error('Erro ao salvar configuracoes Stripe:', err);
      toast.error('Erro inesperado ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyStripeWebhookURL = async () => {
    if (!stripeWebhookUrl) {
      toast.error('URL do webhook Stripe indisponivel neste ambiente.');
      return;
    }

    await navigator.clipboard.writeText(stripeWebhookUrl);
    toast.success('URL do webhook Stripe copiada.');
  };

  const handleDeleteOldLogs = async () => {
    if (!confirm('Deletar logs com mais de 30 dias? Esta acao nao pode ser desfeita.')) {
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
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-2xl font-bold text-gray-900">Integracoes de Pagamento</h2>
        <p className="text-gray-600">
          A operacao de checkout foi consolidada na Stripe. O legado de pagamentos permanece apenas como historico de auditoria.
        </p>
      </div>

      <form onSubmit={handleSave} className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-xl font-bold text-gray-900">
                <Key className="h-5 w-5 text-violet-600" />
                Etapa 8 da migracao Stripe
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                A Stripe passa a ser o gateway operacional unico. O corte final do legado foi aplicado para novos checkouts, mantendo apenas o historico ja consolidado.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Globe className={formData.is_production ? 'h-4 w-4 text-green-600' : 'h-4 w-4 text-orange-500'} />
              <span className={`text-sm font-semibold ${formData.is_production ? 'text-green-600' : 'text-orange-500'}`}>
                {formData.is_production ? 'Producao' : 'Sandbox'}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="rounded-lg border border-violet-200 bg-white p-4">
              <div className="text-sm font-semibold text-violet-900">Gateway operacional</div>
              <div className="mt-2 text-2xl font-black text-slate-900">Stripe</div>
              <p className="mt-2 text-xs text-slate-500">
                O gateway legado nao participa mais de novos checkouts. Os registros antigos continuam disponiveis apenas em historico, relatorios e auditoria.
              </p>
            </div>

            <label className="flex items-center gap-3 rounded-lg bg-white p-4">
              <input
                id="is_production"
                type="checkbox"
                checked={formData.is_production}
                onChange={(e) => handleChange('is_production', e.target.checked)}
                className="h-4 w-4 rounded text-violet-600 focus:ring-violet-500"
              />
              <span>
                <div className="font-semibold text-gray-900">Ambiente</div>
                <div className="text-sm text-gray-600">
                  {formData.is_production ? 'Credenciais reais' : 'Credenciais de teste'}
                </div>
              </span>
            </label>
          </div>
        </div>

        <section className="space-y-4 rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Key className="h-5 w-5 text-violet-600" />
              Stripe
            </h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${settings?.stripe_secret_key_configured ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
              {settings?.stripe_secret_key_configured ? 'Configurado' : 'Pendente'}
            </span>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              <Lock className="mr-1 inline h-4 w-4 text-red-600" />
              Secret Key
            </label>
            <div className="flex gap-2">
              <input
                type={showStripeSecretKey ? 'text' : 'password'}
                value={formData.stripe_secret_key}
                onChange={(e) => handleChange('stripe_secret_key', e.target.value)}
                placeholder={
                  settings?.stripe_secret_key_configured
                    ? 'Ja configurado no servidor. Preencha apenas para trocar.'
                    : 'sk_live_... ou sk_test_...'
                }
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={() => setShowStripeSecretKey((current) => !current)}
                className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50"
              >
                {showStripeSecretKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Chave secreta usada para checkout, portal do cliente, assinaturas, boosters e conciliacao Stripe.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Publishable Key</label>
            <input
              type="text"
              value={formData.stripe_publishable_key}
              onChange={(e) => handleChange('stripe_publishable_key', e.target.value)}
              placeholder="pk_live_... ou pk_test_..."
              className="w-full rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-violet-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Chave publica usada pelo frontend do checkout Stripe.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              <Lock className="mr-1 inline h-4 w-4 text-red-600" />
              Webhook Secret
            </label>
            <div className="flex gap-2">
              <input
                type={showStripeWebhookSecret ? 'text' : 'password'}
                value={formData.stripe_webhook_secret}
                onChange={(e) => handleChange('stripe_webhook_secret', e.target.value)}
                placeholder={
                  settings?.stripe_webhook_secret_configured
                    ? 'Ja configurado no servidor. Preencha apenas para trocar.'
                    : 'whsec_...'
                }
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={() => setShowStripeWebhookSecret((current) => !current)}
                className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50"
              >
                {showStripeWebhookSecret ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Secret da `webhook-stripe`, responsavel por confirmar pagamentos, renovacoes, cancelamentos e creditos de boosters.
            </p>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 pt-6">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-2 text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar configuracoes Stripe'}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Novos checkouts, renovacoes e boosters operam exclusivamente via Stripe.
        </div>
      </form>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <Users className="h-5 w-5 text-violet-600" />
              Migracao operacional Stripe
            </h3>
            <p className="text-sm text-gray-600">
              A allowlist continua disponivel apenas para acompanhamento fino da migracao historica e auditoria das contas legadas ja processadas.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchRolloutOperations()}
            disabled={loadingRolloutOps}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loadingRolloutOps ? 'animate-spin' : ''}`} />
            Atualizar operacao
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Clientes pagos legados</div>
            <div className="mt-2 text-3xl font-black text-slate-900">{rolloutSummary?.legacy_paid_customers ?? 0}</div>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-600">Allowlist manual</div>
            <div className="mt-2 text-3xl font-black text-violet-700">{rolloutSummary?.manual_override_count ?? 0}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">Assinaturas Stripe ativas</div>
            <div className="mt-2 text-3xl font-black text-emerald-700">{rolloutSummary?.stripe_subscription_count ?? 0}</div>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600">Assinaturas legadas</div>
            <div className="mt-2 text-3xl font-black text-sky-700">{rolloutSummary?.legacy_subscription_count ?? 0}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className="rounded-xl border border-slate-200 p-5">
            <div className="mb-4">
              <h4 className="text-lg font-bold text-gray-900">Liberacoes historicas</h4>
              <p className="mt-1 text-sm text-gray-600">
                Busque por nome ou e-mail para consultar ou manter registros de contas legadas que precisaram de liberacao manual na transicao.
              </p>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={rolloutQuery}
                onChange={(e) => setRolloutQuery(e.target.value)}
                placeholder="Buscar cliente por nome ou e-mail"
                className="w-full rounded-lg border border-gray-300 px-11 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div className="mt-4 space-y-3">
              {searchingRolloutUsers ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando usuarios...
                </div>
              ) : rolloutQuery.trim().length < 2 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                  Digite pelo menos 2 caracteres para localizar contas.
                </div>
              ) : rolloutSearchResults.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                  Nenhuma conta encontrada para este filtro.
                </div>
              ) : (
                rolloutSearchResults.map((result) => (
                  <div key={result.user_id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{result.user_name}</div>
                      <div className="text-sm text-gray-600">{result.user_email}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${result.has_paid_history ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {result.has_paid_history ? 'Conta legada paga' : 'Conta ja nativa em Stripe'}
                        </span>
                        {result.already_allowlisted && (
                          <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            Registro manual existente
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddOverride(result.user_id)}
                      disabled={result.already_allowlisted || savingOverrideUserId === result.user_id}
                      className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingOverrideUserId === result.user_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      Registrar
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 p-5">
            <div className="mb-4">
              <h4 className="text-lg font-bold text-gray-900">Allowlist historica</h4>
              <p className="mt-1 text-sm text-gray-600">
                Esses registros foram mantidos apenas para auditoria da transicao final.
              </p>
            </div>

            <div className="space-y-3">
              {loadingRolloutOps ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando allowlist...
                </div>
              ) : rolloutOverrides.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                  Nenhum registro manual foi mantido na allowlist.
                </div>
              ) : (
                rolloutOverrides.map((override) => (
                  <div key={override.user_id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">{override.user_name}</div>
                        <div className="text-sm text-gray-600">{override.user_email}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${override.has_paid_history ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {override.has_paid_history ? 'Historico pago detectado' : 'Sem historico pago'}
                          </span>
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            Registrado em {formatDate(override.created_at)}
                          </span>
                        </div>
                        {override.reason && (
                          <p className="mt-3 text-sm text-slate-600">{override.reason}</p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveOverride(override.user_id)}
                        disabled={removingOverrideUserId === override.user_id}
                        className="flex items-center justify-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {removingOverrideUserId === override.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
          <Globe className="h-5 w-5 text-violet-600" />
          Endpoint de webhook
        </h3>

        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
          <label className="mb-2 block text-sm font-semibold text-gray-700">Stripe</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={stripeWebhookUrl}
              readOnly
              className="flex-1 rounded-lg border border-violet-200 bg-white px-4 py-2 font-mono text-sm text-gray-700"
            />
            <button
              type="button"
              onClick={handleCopyStripeWebhookURL}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-white hover:bg-violet-700"
            >
              <Copy className="h-4 w-4" />
              Copiar
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Configure este endpoint na Stripe para receber `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed` e eventos de assinatura.
          </p>
        </div>

        <div className="mt-4 flex gap-3">
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
            Limpar logs antigos (30+ dias)
          </button>
        </div>

        {logsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <AlertCircle className="mx-auto mb-3 h-12 w-12 opacity-50" />
            <p>Nenhum webhook recebido ainda.</p>
            <p className="mt-1 text-sm">Os eventos reais da Stripe aparecerao aqui quando forem recebidos.</p>
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
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                        log.provider === 'stripe'
                          ? 'bg-violet-100 text-violet-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
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
                          Nao
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
