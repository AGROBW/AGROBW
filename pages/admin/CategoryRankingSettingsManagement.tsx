import React, { useEffect, useMemo, useState } from 'react';
import { Info, RefreshCw, Save, SlidersHorizontal, Sparkles, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';

type RankingSettingsForm = {
  id: string | null;
  noveltyBoost48h: number;
  noveltyBoost7d: number;
  freshnessMultiplier: number;
  qualityMultiplier: number;
  engagementMultiplier: number;
  verificationWeight: number;
  homeHighlightWeight: number;
  activePlanBaseWeight: number;
  activePlanPriceMultiplier: number;
  activePlanPriceCap: number;
  stalePenalty7d: number;
  stalePenalty14d: number;
  stalePenalty30d: number;
  sellerRotationLimit: number;
};

const defaultForm: RankingSettingsForm = {
  id: null,
  noveltyBoost48h: 10,
  noveltyBoost7d: 5,
  freshnessMultiplier: 1,
  qualityMultiplier: 1,
  engagementMultiplier: 1,
  verificationWeight: 16,
  homeHighlightWeight: 220,
  activePlanBaseWeight: 300,
  activePlanPriceMultiplier: 100,
  activePlanPriceCap: 120,
  stalePenalty7d: 4,
  stalePenalty14d: 10,
  stalePenalty30d: 18,
  sellerRotationLimit: 2,
};

const rankingPresets: Array<{
  id: 'balanced' | 'commercial' | 'democratic';
  label: string;
  description: string;
  values: Partial<RankingSettingsForm>;
}> = [
  {
    id: 'balanced',
    label: 'Equilibrado',
    description: 'Mantem um meio-termo entre prioridade comercial, qualidade e movimento recente.',
    values: {
      noveltyBoost48h: 10,
      noveltyBoost7d: 5,
      freshnessMultiplier: 1,
      qualityMultiplier: 1,
      engagementMultiplier: 1,
      verificationWeight: 16,
      homeHighlightWeight: 220,
      activePlanBaseWeight: 300,
      activePlanPriceMultiplier: 100,
      activePlanPriceCap: 120,
      stalePenalty7d: 4,
      stalePenalty14d: 10,
      stalePenalty30d: 18,
      sellerRotationLimit: 2,
    },
  },
  {
    id: 'commercial',
    label: 'Mais comercial',
    description: 'Aumenta a forca de plano e destaque, ideal quando a prioridade e monetizacao.',
    values: {
      noveltyBoost48h: 8,
      noveltyBoost7d: 4,
      freshnessMultiplier: 0.95,
      qualityMultiplier: 1,
      engagementMultiplier: 0.9,
      verificationWeight: 18,
      homeHighlightWeight: 280,
      activePlanBaseWeight: 360,
      activePlanPriceMultiplier: 120,
      activePlanPriceCap: 160,
      stalePenalty7d: 3,
      stalePenalty14d: 8,
      stalePenalty30d: 14,
      sellerRotationLimit: 2,
    },
  },
  {
    id: 'democratic',
    label: 'Mais democratico',
    description: 'Distribui melhor a vitrine, valorizando qualidade, frescor e engajamento recente.',
    values: {
      noveltyBoost48h: 12,
      noveltyBoost7d: 6,
      freshnessMultiplier: 1.15,
      qualityMultiplier: 1.2,
      engagementMultiplier: 1.15,
      verificationWeight: 14,
      homeHighlightWeight: 180,
      activePlanBaseWeight: 240,
      activePlanPriceMultiplier: 85,
      activePlanPriceCap: 95,
      stalePenalty7d: 5,
      stalePenalty14d: 12,
      stalePenalty30d: 22,
      sellerRotationLimit: 1,
    },
  },
];

const getPresetDistance = (form: RankingSettingsForm, presetValues: Partial<RankingSettingsForm>) => {
  const keys: Array<keyof RankingSettingsForm> = [
    'noveltyBoost48h',
    'noveltyBoost7d',
    'freshnessMultiplier',
    'qualityMultiplier',
    'engagementMultiplier',
    'verificationWeight',
    'homeHighlightWeight',
    'activePlanBaseWeight',
    'activePlanPriceMultiplier',
    'activePlanPriceCap',
    'stalePenalty7d',
    'stalePenalty14d',
    'stalePenalty30d',
    'sellerRotationLimit',
  ];

  return keys.reduce((total, key) => {
    const formValue = Number(form[key] ?? 0);
    const presetValue = Number(presetValues[key] ?? 0);
    return total + Math.abs(formValue - presetValue);
  }, 0);
};

const numberInputClassName =
  'h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-green-400 focus:ring-2 focus:ring-green-500/20';

const CategoryRankingSettingsManagement: React.FC = () => {
  const [form, setForm] = useState<RankingSettingsForm>(defaultForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  const closestPresetId = useMemo(() => {
    const rankedPresets = rankingPresets
      .map((preset) => ({
        id: preset.id,
        distance: getPresetDistance(form, preset.values),
      }))
      .sort((left, right) => left.distance - right.distance);

    return rankedPresets[0]?.id ?? null;
  }, [form]);

  const loadSettings = async () => {
    setIsLoading(true);

    const { data, error } = await supabase
      .from('category_ranking_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[CategoryRankingSettingsManagement] Erro ao carregar configuracoes:', error);
      toast.error('Nao foi possivel carregar as configuracoes do ranking.', {
        description: error.message,
      });
      setForm(defaultForm);
      setIsLoading(false);
      return;
    }

    if (!data) {
      setForm(defaultForm);
      setIsLoading(false);
      return;
    }

    setForm({
      id: data.id ?? null,
      noveltyBoost48h: Number(data.novelty_boost_48h ?? defaultForm.noveltyBoost48h),
      noveltyBoost7d: Number(data.novelty_boost_7d ?? defaultForm.noveltyBoost7d),
      freshnessMultiplier: Number(data.freshness_multiplier ?? defaultForm.freshnessMultiplier),
      qualityMultiplier: Number(data.quality_multiplier ?? defaultForm.qualityMultiplier),
      engagementMultiplier: Number(data.engagement_multiplier ?? defaultForm.engagementMultiplier),
      verificationWeight: Number(data.verification_weight ?? defaultForm.verificationWeight),
      homeHighlightWeight: Number(data.home_highlight_weight ?? defaultForm.homeHighlightWeight),
      activePlanBaseWeight: Number(data.active_plan_base_weight ?? defaultForm.activePlanBaseWeight),
      activePlanPriceMultiplier: Number(data.active_plan_price_multiplier ?? defaultForm.activePlanPriceMultiplier),
      activePlanPriceCap: Number(data.active_plan_price_cap ?? defaultForm.activePlanPriceCap),
      stalePenalty7d: Number(data.stale_penalty_7d ?? defaultForm.stalePenalty7d),
      stalePenalty14d: Number(data.stale_penalty_14d ?? defaultForm.stalePenalty14d),
      stalePenalty30d: Number(data.stale_penalty_30d ?? defaultForm.stalePenalty30d),
      sellerRotationLimit: Number(data.seller_rotation_limit ?? defaultForm.sellerRotationLimit),
    });

    setIsLoading(false);
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const setNumericField = (field: keyof RankingSettingsForm, value: string) => {
    if (field === 'id') return;

    setForm((current) => ({
      ...current,
      [field]: value === '' ? 0 : Number(value),
    }));
  };

  const handleSave = async () => {
    if (form.sellerRotationLimit < 1) {
      toast.error('O limite de rotacao por vendedor deve ser no minimo 1.');
      return;
    }

    setIsSaving(true);

    const payload = {
      novelty_boost_48h: form.noveltyBoost48h,
      novelty_boost_7d: form.noveltyBoost7d,
      freshness_multiplier: form.freshnessMultiplier,
      quality_multiplier: form.qualityMultiplier,
      engagement_multiplier: form.engagementMultiplier,
      verification_weight: form.verificationWeight,
      home_highlight_weight: form.homeHighlightWeight,
      active_plan_base_weight: form.activePlanBaseWeight,
      active_plan_price_multiplier: form.activePlanPriceMultiplier,
      active_plan_price_cap: form.activePlanPriceCap,
      stale_penalty_7d: form.stalePenalty7d,
      stale_penalty_14d: form.stalePenalty14d,
      stale_penalty_30d: form.stalePenalty30d,
      seller_rotation_limit: form.sellerRotationLimit,
    };

    const result = form.id
      ? await supabase.from('category_ranking_settings').update(payload).eq('id', form.id).select('id').single()
      : await supabase.from('category_ranking_settings').insert(payload).select('id').single();

    setIsSaving(false);

    if (result.error) {
      console.error('[CategoryRankingSettingsManagement] Erro ao salvar configuracoes:', result.error);
      toast.error('Nao foi possivel salvar o ranking de categoria.', {
        description: result.error.message,
      });
      return;
    }

    toast.success('Configuracoes do ranking salvas com sucesso.');
    await loadSettings();
  };

  const applyPreset = (presetId: 'balanced' | 'commercial' | 'democratic') => {
    const preset = rankingPresets.find((item) => item.id === presetId);
    if (!preset) return;

    setForm((current) => ({
      ...current,
      ...preset.values,
    }));

    toast.success(`Preset "${preset.label}" aplicado.`, {
      description: preset.description,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
            <TrendingUp className="h-4 w-4" />
            Ranking comercial
          </span>
          <h2 className="mt-3 text-3xl font-black text-slate-900">Ranking de categorias</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Ajuste os pesos que ordenam a secao de todos os anuncios dentro das categorias.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setIsInfoModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Info className="h-4 w-4" />
            Como funciona
          </button>
          <button
            type="button"
            onClick={() => void loadSettings()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-900">Presets rapidos</h3>
              <p className="mt-1 text-sm text-slate-500">
                Use um perfil pronto e depois refine manualmente se quiser.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {rankingPresets.map((preset) => (
              (() => {
                const isClosestPreset = closestPresetId === preset.id;

                return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  isClosestPreset
                    ? 'border-emerald-300 bg-emerald-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-green-300 hover:bg-green-50/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-black text-slate-900">{preset.label}</p>
                  {isClosestPreset ? (
                    <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                      Mais proximo
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-slate-500">{preset.description}</p>
              </button>
                );
              })()
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-black uppercase tracking-[0.22em]">Novidade</p>
            </div>
            <p className="mt-2 text-sm text-emerald-900">
              Pequeno impulso inicial para anuncios novos, sem atropelar plano e qualidade.
            </p>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
            <div className="flex items-center gap-2 text-sky-700">
              <SlidersHorizontal className="h-4 w-4" />
              <p className="text-xs font-black uppercase tracking-[0.22em]">Multiplicadores</p>
            </div>
            <p className="mt-2 text-sm text-sky-900">
              Escalam a influencia de qualidade, engajamento e frescor no ranking final.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
            <div className="flex items-center gap-2 text-amber-700">
              <TrendingUp className="h-4 w-4" />
              <p className="text-xs font-black uppercase tracking-[0.22em]">Rotacao</p>
            </div>
            <p className="mt-2 text-sm text-amber-900">
              Limita a sequencia de anuncios do mesmo vendedor para reduzir monopolio visual.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="text-lg font-black text-slate-900">Boost de novidade</h3>
            <p className="mt-1 text-sm text-slate-500">Anuncios recem-publicados recebem um empurrao controlado.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Primeiras 48h</span>
                <input type="number" value={form.noveltyBoost48h} onChange={(event) => setNumericField('noveltyBoost48h', event.target.value)} className={numberInputClassName} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Ate 7 dias</span>
                <input type="number" value={form.noveltyBoost7d} onChange={(event) => setNumericField('noveltyBoost7d', event.target.value)} className={numberInputClassName} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="text-lg font-black text-slate-900">Multiplicadores principais</h3>
            <p className="mt-1 text-sm text-slate-500">Use valores como 1, 1.25, 1.5 ou 2 para ampliar o peso.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Qualidade</span>
                <input type="number" step="0.05" value={form.qualityMultiplier} onChange={(event) => setNumericField('qualityMultiplier', event.target.value)} className={numberInputClassName} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Engajamento</span>
                <input type="number" step="0.05" value={form.engagementMultiplier} onChange={(event) => setNumericField('engagementMultiplier', event.target.value)} className={numberInputClassName} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Frescor</span>
                <input type="number" step="0.05" value={form.freshnessMultiplier} onChange={(event) => setNumericField('freshnessMultiplier', event.target.value)} className={numberInputClassName} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="text-lg font-black text-slate-900">Prioridade comercial</h3>
            <p className="mt-1 text-sm text-slate-500">Camada comercial que valoriza plano ativo, destaque e verificacao.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Peso base do plano</span>
                <input type="number" value={form.activePlanBaseWeight} onChange={(event) => setNumericField('activePlanBaseWeight', event.target.value)} className={numberInputClassName} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Multiplicador do valor mensal</span>
                <input type="number" step="0.05" value={form.activePlanPriceMultiplier} onChange={(event) => setNumericField('activePlanPriceMultiplier', event.target.value)} className={numberInputClassName} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Teto do valor mensal</span>
                <input type="number" value={form.activePlanPriceCap} onChange={(event) => setNumericField('activePlanPriceCap', event.target.value)} className={numberInputClassName} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Peso do destaque home</span>
                <input type="number" value={form.homeHighlightWeight} onChange={(event) => setNumericField('homeHighlightWeight', event.target.value)} className={numberInputClassName} />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Peso do selo verificado</span>
                <input type="number" value={form.verificationWeight} onChange={(event) => setNumericField('verificationWeight', event.target.value)} className={numberInputClassName} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="text-lg font-black text-slate-900">Penalizacao e rotacao</h3>
            <p className="mt-1 text-sm text-slate-500">Controla perda de relevancia de anuncios parados e repeticao por anunciante.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Penalidade 7 dias</span>
                <input type="number" value={form.stalePenalty7d} onChange={(event) => setNumericField('stalePenalty7d', event.target.value)} className={numberInputClassName} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Penalidade 14 dias</span>
                <input type="number" value={form.stalePenalty14d} onChange={(event) => setNumericField('stalePenalty14d', event.target.value)} className={numberInputClassName} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Penalidade 30 dias</span>
                <input type="number" value={form.stalePenalty30d} onChange={(event) => setNumericField('stalePenalty30d', event.target.value)} className={numberInputClassName} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Limite por vendedor</span>
                <input type="number" min="1" value={form.sellerRotationLimit} onChange={(event) => setNumericField('sellerRotationLimit', event.target.value)} className={numberInputClassName} />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-600">
            {isLoading
              ? 'Carregando configuracoes do ranking...'
              : 'Esses pesos afetam somente a ordenacao padrao de "Todos os anuncios" nas categorias.'}
          </p>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isLoading || isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Salvando...' : 'Salvar configuracoes'}
          </button>
        </div>
      </section>

      {isInfoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Explicacao do ranking</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900">Como a ordem dos anuncios funciona</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Esta configuracao afeta somente a ordenacao padrao da secao "Todos os anuncios" dentro das categorias.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsInfoModalOpen(false)}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">1. Prioridade comercial</p>
                <p className="mt-2 text-sm text-slate-700">
                  Plano ativo, valor comercial do plano, destaque home e selo verificado entram primeiro na composicao do score.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">2. Qualidade do anuncio</p>
                <p className="mt-2 text-sm text-slate-700">
                  Imagens, descricao, preco e estrutura do cadastro aumentam a relevancia de anuncios mais completos.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">3. Engajamento recente</p>
                <p className="mt-2 text-sm text-slate-700">
                  Visualizacoes, visitantes unicos e leads recentes ajudam anuncios com movimento real a subir no ranking.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">4. Frescor e novidade</p>
                <p className="mt-2 text-sm text-slate-700">
                  Anuncios atualizados recentemente ganham frescor, e anuncios novos recebem um boost inicial controlado.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">5. Penalizacao leve</p>
                <p className="mt-2 text-sm text-slate-700">
                  Anuncios parados, sem movimento recente, vao perdendo forca gradualmente conforme o tempo passa.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">6. Rotacao por vendedor</p>
                <p className="mt-2 text-sm text-slate-700">
                  A plataforma tenta evitar sequencias longas do mesmo anunciante, respeitando o limite configurado.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">
                Dica pratica:
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                Se quiser vender mais destaque comercial, use o preset "Mais comercial". Se quiser uma vitrine mais distribuida e democratica, use o preset "Mais democratico".
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryRankingSettingsManagement;
