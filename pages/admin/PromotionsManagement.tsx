import React, { useEffect, useMemo, useState } from 'react';
import { Gift, PauseCircle, PlayCircle, RefreshCw, Save, Search, Ticket, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';
import { RESOURCE_TYPES, useAdminAudit } from '../../src/hooks/useAdminAudit';

type PromotionStatus = 'active' | 'paused' | 'expired';
type DurationUnit = 'days' | 'months' | 'years';
type GrantMode = 'replace_active' | 'extend_same_plan';

interface PlanOption {
  id: string;
  name: string;
  monthly_price: number;
}

interface PromotionCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  plan_id: string;
  duration_amount: number;
  duration_unit: DurationUnit;
  max_redemptions: number | null;
  max_redemptions_per_user: number;
  starts_on: string | null;
  expires_on: string | null;
  status: PromotionStatus;
  grant_mode: GrantMode;
  redeemed_count: number;
  internal_notes: string | null;
  created_at: string;
  plans?: {
    name: string;
  } | null;
}

interface PromotionRedemption {
  id: string;
  status: string;
  period_start: string;
  period_end: string;
  redeemed_at: string;
  users?: {
    name: string;
    email: string;
  } | null;
  plans?: {
    name: string;
  } | null;
  promotion_plan_codes?: {
    code: string;
    name: string;
  } | null;
}

const emptyForm = {
  id: null as string | null,
  code: '',
  name: '',
  description: '',
  planId: '',
  durationAmount: 1,
  durationUnit: 'months' as DurationUnit,
  maxRedemptions: '',
  maxRedemptionsPerUser: 1,
  startsAt: '',
  expiresAt: '',
  status: 'active' as PromotionStatus,
  grantMode: 'replace_active' as GrantMode,
  internalNotes: '',
};

const formatDateTime = (value: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toDateOnlyOrNull = (value: string) => {
  if (!value) return null;
  return value.slice(0, 10);
};

const generateCode = () => {
  const token =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `AGRO-${token.toUpperCase()}`;
};

const PromotionsManagement: React.FC = () => {
  const { logAction } = useAdminAudit();
  const [codes, setCodes] = useState<PromotionCode[]>([]);
  const [redemptions, setRedemptions] = useState<PromotionRedemption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PromotionStatus>('all');

  const filteredCodes = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    return codes.filter((code) => {
      const matchesStatus = statusFilter === 'all' || code.status === statusFilter;
      const matchesSearch =
        !normalized ||
        `${code.code} ${code.name} ${code.description || ''} ${code.plans?.name || ''}`.toLowerCase().includes(normalized);

      return matchesStatus && matchesSearch;
    });
  }, [codes, searchTerm, statusFilter]);

  const activeCodesCount = codes.filter((code) => code.status === 'active').length;
  const totalRedemptions = codes.reduce((sum, code) => sum + (code.redeemed_count || 0), 0);

  const loadData = async () => {
    setLoading(true);

    try {
      const [plansResult, codesResult, redemptionsResult] = await Promise.all([
        supabase
          .from('plans')
          .select('id,name,monthly_price')
          .eq('is_active', true)
          .order('position', { ascending: true }),
        supabase
          .from('promotion_plan_codes')
          .select('*, plans(name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('promotion_plan_redemptions')
          .select('*, users(name,email), plans(name), promotion_plan_codes(code,name)')
          .order('redeemed_at', { ascending: false })
          .limit(50),
      ]);

      if (plansResult.error) throw plansResult.error;
      if (codesResult.error) throw codesResult.error;
      if (redemptionsResult.error) throw redemptionsResult.error;

      const planRows = (plansResult.data || []) as PlanOption[];
      setPlans(planRows);
      setCodes((codesResult.data || []) as PromotionCode[]);
      setRedemptions((redemptionsResult.data || []) as PromotionRedemption[]);

      if (!form.planId && planRows[0]?.id) {
        setForm((current) => ({ ...current, planId: planRows[0].id }));
      }
    } catch (error) {
      console.error('[PromotionsManagement] Erro ao carregar promocoes:', error);
      toast.error('Não foi possível carregar as promoções.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const resetForm = () => {
    setForm({
      ...emptyForm,
      code: generateCode(),
      planId: plans[0]?.id || '',
    });
  };

  useEffect(() => {
    if (!form.code) {
      resetForm();
    }
  }, [plans]);

  const fillFormFromCode = (code: PromotionCode) => {
    setForm({
      id: code.id,
      code: code.code,
      name: code.name,
      description: code.description || '',
      planId: code.plan_id,
      durationAmount: code.duration_amount,
      durationUnit: code.duration_unit,
      maxRedemptions: code.max_redemptions ? String(code.max_redemptions) : '',
      maxRedemptionsPerUser: code.max_redemptions_per_user,
      startsAt: code.starts_on || '',
      expiresAt: code.expires_on || '',
      status: code.status,
      grantMode: code.grant_mode,
      internalNotes: code.internal_notes || '',
    });
  };

  const saveCode = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.planId) {
      toast.error('Preencha código, nome e plano promocional.');
      return;
    }

    if (form.expiresAt && form.startsAt && form.expiresAt <= form.startsAt) {
      toast.error('A data final precisa ser maior que a data inicial.');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        plan_id: form.planId,
        duration_amount: Math.max(1, Number(form.durationAmount) || 1),
        duration_unit: form.durationUnit,
        max_redemptions: form.maxRedemptions ? Math.max(1, Number(form.maxRedemptions) || 1) : null,
        max_redemptions_per_user: Math.max(1, Number(form.maxRedemptionsPerUser) || 1),
        starts_on: toDateOnlyOrNull(form.startsAt),
        expires_on: toDateOnlyOrNull(form.expiresAt),
        status: form.status,
        grant_mode: form.grantMode,
        internal_notes: form.internalNotes.trim() || null,
      };

      const result = form.id
        ? await supabase
            .from('promotion_plan_codes')
            .update(payload)
            .eq('id', form.id)
            .select('id')
            .single()
        : await supabase
            .from('promotion_plan_codes')
            .insert(payload)
            .select('id')
            .single();

      if (result.error) throw result.error;

      await logAction({
        action: form.id ? 'UPDATE_PROMOTION_CODE' : 'CREATE_PROMOTION_CODE',
        resourceType: RESOURCE_TYPES.SYSTEM,
        resourceId: result.data?.id || form.id,
        newValue: payload,
        reason: form.id ? `Código promocional ${payload.code} atualizado` : `Código promocional ${payload.code} criado`,
      });

      toast.success(form.id ? 'Código promocional atualizado.' : 'Código promocional criado.');
      resetForm();
      await loadData();
    } catch (error: any) {
      console.error('[PromotionsManagement] Erro ao salvar codigo:', error);
      toast.error(error.message || 'Não foi possível salvar o código.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (code: PromotionCode) => {
    const nextStatus: PromotionStatus = code.status === 'active' ? 'paused' : 'active';

    try {
      const { error } = await supabase
        .from('promotion_plan_codes')
        .update({ status: nextStatus })
        .eq('id', code.id);

      if (error) throw error;

      await logAction({
        action: nextStatus === 'active' ? 'ACTIVATE_PROMOTION_CODE' : 'PAUSE_PROMOTION_CODE',
        resourceType: RESOURCE_TYPES.SYSTEM,
        resourceId: code.id,
        oldValue: { status: code.status },
        newValue: { status: nextStatus },
        reason: `Status do código ${code.code} alterado para ${nextStatus}`,
      });

      toast.success(nextStatus === 'active' ? 'Código ativado.' : 'Código pausado.');
      await loadData();
    } catch (error: any) {
      console.error('[PromotionsManagement] Erro ao alterar status:', error);
      toast.error(error.message || 'Não foi possível alterar o status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">Promoções</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Códigos promocionais de plano</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Crie códigos que liberam planos por período determinado e acompanhe quem resgatou cada benefício.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Gift className="h-6 w-6 text-emerald-600" />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Códigos ativos</p>
          <p className="mt-1 text-3xl font-black text-slate-900">{activeCodesCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Ticket className="h-6 w-6 text-amber-600" />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Total de códigos</p>
          <p className="mt-1 text-3xl font-black text-slate-900">{codes.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Users className="h-6 w-6 text-sky-600" />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Resgates realizados</p>
          <p className="mt-1 text-3xl font-black text-slate-900">{totalRedemptions}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">{form.id ? 'Editar código' : 'Novo código'}</h2>
              <p className="text-sm text-slate-500">Defina o plano, duração e limites de resgate.</p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Limpar
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Código</span>
                <input
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="AGRO-2026"
                />
              </label>
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, code: generateCode() }))}
                className="self-end rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Gerar
              </button>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Nome da promoção</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Ex: Feira Agro 30 dias"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Descrição</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                className="min-h-[76px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Uso interno ou descrição da campanha."
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Plano concedido</span>
                <select
                  value={form.planId}
                  onChange={(event) => setForm((current) => ({ ...current, planId: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PromotionStatus }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="active">Ativo</option>
                  <option value="paused">Pausado</option>
                  <option value="expired">Expirado</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Duração</span>
                <input
                  type="number"
                  min={1}
                  value={form.durationAmount}
                  onChange={(event) => setForm((current) => ({ ...current, durationAmount: Math.max(1, Number(event.target.value) || 1) }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Unidade</span>
                <select
                  value={form.durationUnit}
                  onChange={(event) => setForm((current) => ({ ...current, durationUnit: event.target.value as DurationUnit }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="days">Dia(s)</option>
                  <option value="months">Mês(es)</option>
                  <option value="years">Ano(s)</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Limite total</span>
                <input
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(event) => setForm((current) => ({ ...current, maxRedemptions: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Ilimitado"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Por usuário</span>
                <input
                  type="number"
                  min={1}
                  value={form.maxRedemptionsPerUser}
                  onChange={(event) => setForm((current) => ({ ...current, maxRedemptionsPerUser: Math.max(1, Number(event.target.value) || 1) }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Modo de concessão</span>
              <select
                value={form.grantMode}
                onChange={(event) => setForm((current) => ({ ...current, grantMode: event.target.value as GrantMode }))}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="replace_active">Substituir plano ativo</option>
                <option value="extend_same_plan">Estender se já estiver no mesmo plano</option>
              </select>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Início de validade</span>
                <input
                  type="date"
                  value={form.startsAt}
                  onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Fim de validade</span>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Observação interna</span>
              <textarea
                value={form.internalNotes}
                onChange={(event) => setForm((current) => ({ ...current, internalNotes: event.target.value }))}
                className="min-h-[76px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Ex: código distribuído em evento, parceria ou ação comercial."
              />
            </label>

            <button
              type="button"
              onClick={() => void saveCode()}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar código'}
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar código, campanha ou plano..."
                  className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | PromotionStatus)}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="paused">Pausados</option>
                <option value="expired">Expirados</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-black text-slate-900">Códigos cadastrados</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Código</th>
                    <th className="px-5 py-3">Plano</th>
                    <th className="px-5 py-3">Benefício</th>
                    <th className="px-5 py-3">Uso</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">Carregando...</td>
                    </tr>
                  ) : filteredCodes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">Nenhum código encontrado.</td>
                    </tr>
                  ) : (
                    filteredCodes.map((code) => (
                      <tr key={code.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-900">{code.code}</p>
                          <p className="mt-1 text-xs text-slate-500">{code.name}</p>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-700">{code.plans?.name || 'Plano removido'}</td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {code.duration_amount} {code.duration_unit === 'days' ? 'dia(s)' : code.duration_unit === 'years' ? 'ano(s)' : 'mês(es)'}
                          <p className="mt-1 text-xs text-slate-400">{code.grant_mode === 'replace_active' ? 'Substitui plano ativo' : 'Estende mesmo plano'}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {code.redeemed_count}
                          {code.max_redemptions ? ` / ${code.max_redemptions}` : ' / ilimitado'}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                              code.status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : code.status === 'paused'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {code.status === 'active' ? 'Ativo' : code.status === 'paused' ? 'Pausado' : 'Expirado'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => fillFormFromCode(code)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleStatus(code)}
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              title={code.status === 'active' ? 'Pausar' : 'Ativar'}
                            >
                              {code.status === 'active' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">Últimos resgates</h2>
          <p className="mt-1 text-sm text-slate-500">Veja quem resgatou códigos promocionais e qual plano está usando.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Usuário</th>
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">Período</th>
                <th className="px-5 py-3">Resgate</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {redemptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">
                    Nenhum resgate realizado ainda.
                  </td>
                </tr>
              ) : (
                redemptions.map((redemption) => (
                  <tr key={redemption.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{redemption.users?.name || 'Usuário removido'}</p>
                      <p className="mt-1 text-xs text-slate-500">{redemption.users?.email || 'Sem e-mail'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900">{redemption.promotion_plan_codes?.code || '-'}</p>
                      <p className="mt-1 text-xs text-slate-500">{redemption.promotion_plan_codes?.name || ''}</p>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-700">{redemption.plans?.name || '-'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {formatDateTime(redemption.period_start)} até {formatDateTime(redemption.period_end)}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDateTime(redemption.redeemed_at)}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                        {redemption.status === 'redeemed' ? 'Resgatado' : redemption.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default PromotionsManagement;
