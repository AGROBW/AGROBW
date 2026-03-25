import React, { useEffect, useState } from 'react';
import { Plus, Save, Sparkles } from 'lucide-react';
import { supabase } from '../../../src/lib/supabaseClient';
import { toast } from 'sonner';
import { HighlightBoosterPurchaseRecord, HighlightBoosterRecord } from '../../../types';

type BoosterFormState = {
  id?: string;
  name: string;
  description: string;
  monthlyPrice: string;
  categoryCredits: string;
  homeCredits: string;
  isActive: boolean;
  position: string;
  buttonText: string;
  maxPurchasesPer30Days: string;
};

const emptyForm: BoosterFormState = {
  name: '',
  description: '',
  monthlyPrice: '249',
  categoryCredits: '5',
  homeCredits: '5',
  isActive: true,
  position: '1',
  buttonText: 'Comprar booster',
  maxPurchasesPer30Days: '2',
};

const mapBooster = (row: any): HighlightBoosterRecord => ({
  id: row.id,
  name: row.name,
  description: row.description ?? null,
  monthlyPrice: Number(row.monthly_price ?? 0),
  categoryCredits: Number(row.category_credits ?? 0),
  homeCredits: Number(row.home_credits ?? 0),
  maxPurchasesPer30Days: Number(row.max_purchases_per_30_days ?? 2),
  buttonText: row.button_text ?? 'Comprar booster',
  isActive: !!row.is_active,
  position: Number(row.position ?? 0),
});

const mapPurchase = (row: any): HighlightBoosterPurchaseRecord => ({
  id: row.id,
  boosterId: row.booster_id,
  boosterName: row.booster_name,
  amount: Number(row.amount ?? 0),
  status: row.status ?? 'credited',
  categoryCreditsTotal: Number(row.category_credits_total ?? 0),
  categoryCreditsRemaining: Number(row.category_credits_remaining ?? 0),
  homeCreditsTotal: Number(row.home_credits_total ?? 0),
  homeCreditsRemaining: Number(row.home_credits_remaining ?? 0),
  creditedAt: row.credited_at ?? row.created_at,
  createdAt: row.created_at,
  paymentId: row.payment_id ?? null,
  providerPaymentId: row.provider_payment_id ?? null,
});

const parseNumericInput = (value: string, fallback = 0) => {
  const normalized = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=.*\.)/g, '')
    .replace(',', '.')
    .trim();

  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const PaymentsBoostersTab: React.FC = () => {
  const [boosters, setBoosters] = useState<HighlightBoosterRecord[]>([]);
  const [purchases, setPurchases] = useState<HighlightBoosterPurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BoosterFormState>(emptyForm);

  const loadData = async () => {
    setLoading(true);
    const [boostersResult, purchasesResult] = await Promise.all([
      supabase.from('highlight_boosters').select('*').order('position', { ascending: true }),
      supabase
        .from('user_highlight_booster_purchases')
        .select('*, users(name, email)')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (boostersResult.error) {
      console.error('[PaymentsBoostersTab] Erro ao carregar boosters:', boostersResult.error);
      toast.error('Erro ao carregar boosters.');
      setBoosters([]);
    } else {
      setBoosters((boostersResult.data || []).map(mapBooster));
    }

    if (purchasesResult.error) {
      console.error('[PaymentsBoostersTab] Erro ao carregar historico:', purchasesResult.error);
      setPurchases([]);
    } else {
      setPurchases((purchasesResult.data || []).map(mapPurchase));
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleEdit = (booster: HighlightBoosterRecord) => {
    setForm({
      id: booster.id,
      name: booster.name,
      description: booster.description || '',
      monthlyPrice: String(booster.monthlyPrice),
      categoryCredits: String(booster.categoryCredits),
      homeCredits: String(booster.homeCredits),
      isActive: booster.isActive,
      position: String(booster.position),
      buttonText: booster.buttonText,
      maxPurchasesPer30Days: String(booster.maxPurchasesPer30Days),
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Informe o nome do booster.');
      return;
    }

    const monthlyPrice = parseNumericInput(form.monthlyPrice, NaN);
    const categoryCredits = parseNumericInput(form.categoryCredits, NaN);
    const homeCredits = parseNumericInput(form.homeCredits, NaN);
    const position = parseNumericInput(form.position, 1);
    const maxPurchasesPer30Days = parseNumericInput(form.maxPurchasesPer30Days, 2);

    if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
      toast.error('Informe um preço válido para o booster.');
      return;
    }

    if (!Number.isFinite(categoryCredits) || categoryCredits < 0) {
      toast.error('Informe uma quantidade válida de créditos em categoria.');
      return;
    }

    if (!Number.isFinite(homeCredits) || homeCredits < 0) {
      toast.error('Informe uma quantidade válida de créditos na home.');
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      monthly_price: monthlyPrice,
      category_credits: categoryCredits,
      home_credits: homeCredits,
      is_active: form.isActive,
      position,
      button_text: form.buttonText.trim() || 'Comprar booster',
      max_purchases_per_30_days: maxPurchasesPer30Days,
      updated_at: new Date().toISOString(),
    };

    const request = form.id
      ? supabase.from('highlight_boosters').update(payload).eq('id', form.id)
      : supabase.from('highlight_boosters').insert(payload);

    const { error } = await request;

    if (error) {
      console.error('[PaymentsBoostersTab] Erro ao salvar booster:', error);
      toast.error('Nao foi possivel salvar o booster.');
      setSaving(false);
      return;
    }

    toast.success(form.id ? 'Booster atualizado com sucesso.' : 'Booster criado com sucesso.');
    setForm(emptyForm);
    await loadData();
    setSaving(false);
  };

  const totalCreditsRemaining = purchases.reduce(
    (acc, purchase) => {
      acc.category += purchase.categoryCreditsRemaining;
      acc.home += purchase.homeCreditsRemaining;
      return acc;
    },
    { category: 0, home: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr,1.05fr] gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Booster combo</p>
              <h2 className="text-lg font-semibold text-slate-900">Gestao do pacote avulso de destaque</h2>
            </div>
            <button
              onClick={() => setForm(emptyForm)}
              className="h-10 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Novo
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Nome</span>
              <input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Preco</span>
              <input value={form.monthlyPrice} onChange={(e) => setForm((current) => ({ ...current, monthlyPrice: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Creditos categoria</span>
              <input value={form.categoryCredits} onChange={(e) => setForm((current) => ({ ...current, categoryCredits: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Creditos home</span>
              <input value={form.homeCredits} onChange={(e) => setForm((current) => ({ ...current, homeCredits: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Posicao</span>
              <input value={form.position} onChange={(e) => setForm((current) => ({ ...current, position: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Limite / 30 dias</span>
              <input value={form.maxPurchasesPer30Days} onChange={(e) => setForm((current) => ({ ...current, maxPurchasesPer30Days: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm" />
            </label>
          </div>

          <label className="space-y-2 block">
            <span className="text-sm font-medium text-slate-700">Descricao</span>
            <textarea value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} className="min-h-[88px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
          </label>

          <div className="flex items-center justify-between gap-4">
            <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((current) => ({ ...current, isActive: e.target.checked }))} />
              Booster ativo
            </label>

            <button
              onClick={handleSave}
              disabled={saving}
              className="h-11 px-5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : form.id ? 'Salvar alteracoes' : 'Criar booster'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Boosters ativos</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{boosters.filter((item) => item.isActive).length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Saldo categoria</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{totalCreditsRemaining.category}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Saldo home</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{totalCreditsRemaining.home}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-3">Catalogo atual</p>
            <div className="space-y-3">
              {loading ? (
                <div className="text-sm text-slate-500">Carregando boosters...</div>
              ) : boosters.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  Nenhum booster cadastrado ainda.
                </div>
              ) : (
                boosters.map((booster) => (
                  <button
                    key={booster.id}
                    onClick={() => handleEdit(booster)}
                    className="w-full rounded-2xl border border-slate-200 p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="inline-flex items-center gap-2 text-slate-900 font-semibold">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          {booster.name}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{booster.description || 'Sem descricao.'}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${booster.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {booster.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                      <span>R$ {booster.monthlyPrice.toFixed(2)}</span>
                      <span>+{booster.categoryCredits} categoria</span>
                      <span>+{booster.homeCredits} home</span>
                      <span>Limite {booster.maxPurchasesPer30Days}/30 dias</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ultimas compras creditadas</p>
          <h3 className="text-lg font-semibold text-slate-900">Historico operacional do booster</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-500">
                <th className="px-4 py-3 font-semibold">Booster</th>
                <th className="px-4 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 font-semibold">Valor</th>
                <th className="px-4 py-3 font-semibold">Saldo</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhuma compra de booster registrada ainda.</td>
                </tr>
              ) : (
                purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td className="px-4 py-4 font-semibold text-slate-900">{purchase.boosterName}</td>
                    <td className="px-4 py-4 text-slate-500">{new Date(purchase.creditedAt).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-4 text-slate-900 font-semibold">R$ {purchase.amount.toFixed(2)}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {purchase.categoryCreditsRemaining}/{purchase.categoryCreditsTotal} categoria · {purchase.homeCreditsRemaining}/{purchase.homeCreditsTotal} home
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${purchase.status === 'credited' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {purchase.status === 'credited' ? 'Creditado' : purchase.status}
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

export default PaymentsBoostersTab;
