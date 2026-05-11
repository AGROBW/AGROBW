import React, { useEffect, useState } from 'react';
import { BellRing, Megaphone, Save, Sparkles, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import PlanAlertTemplateEditor from '../../components/admin/PlanAlertTemplateEditor';
import {
  GrowthConversionTemplates,
  GrowthConversionTriggerKey,
  PlanAlertTemplate,
} from '../../types';
import {
  DEFAULT_GROWTH_CONVERSION_TEMPLATES,
  GROWTH_SAMPLE_VALUES,
  GROWTH_TEMPLATE_LABELS,
  PLAN_ALERT_PLACEHOLDERS,
  clonePlanAlertTemplate,
  cloneTemplateSet,
} from '../../src/lib/planAlertTemplates';
import { useGrowthConversionSettings } from '../../src/hooks/useGrowthConversionSettings';

type FormState = {
  isEnabled: boolean;
  dailyUserLimit: number;
  minViewsForHighViews: number;
  minViewsForNoLeads: number;
  minViewsForExpiring: number;
  expireSoonDays: number;
  triggerHighViewsEnabled: boolean;
  triggerTopCategoryEnabled: boolean;
  triggerNoLeadsEnabled: boolean;
  triggerExpiringEnabled: boolean;
  triggerPlanLimitEnabled: boolean;
  templates: GrowthConversionTemplates;
};

const GrowthConversionSettingsManagement: React.FC = () => {
  const { settings, isLoading, saveSettings, defaultSettings } = useGrowthConversionSettings();
  const [form, setForm] = useState<FormState>({
    isEnabled: defaultSettings.isEnabled,
    dailyUserLimit: defaultSettings.dailyUserLimit,
    minViewsForHighViews: defaultSettings.minViewsForHighViews,
    minViewsForNoLeads: defaultSettings.minViewsForNoLeads,
    minViewsForExpiring: defaultSettings.minViewsForExpiring,
    expireSoonDays: defaultSettings.expireSoonDays,
    triggerHighViewsEnabled: defaultSettings.triggerHighViewsEnabled,
    triggerTopCategoryEnabled: defaultSettings.triggerTopCategoryEnabled,
    triggerNoLeadsEnabled: defaultSettings.triggerNoLeadsEnabled,
    triggerExpiringEnabled: defaultSettings.triggerExpiringEnabled,
    triggerPlanLimitEnabled: defaultSettings.triggerPlanLimitEnabled,
    templates: cloneTemplateSet(defaultSettings.templates),
  });
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<GrowthConversionTriggerKey>('high_views');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;

    setForm({
      isEnabled: settings.isEnabled,
      dailyUserLimit: settings.dailyUserLimit,
      minViewsForHighViews: settings.minViewsForHighViews,
      minViewsForNoLeads: settings.minViewsForNoLeads,
      minViewsForExpiring: settings.minViewsForExpiring,
      expireSoonDays: settings.expireSoonDays,
      triggerHighViewsEnabled: settings.triggerHighViewsEnabled,
      triggerTopCategoryEnabled: settings.triggerTopCategoryEnabled,
      triggerNoLeadsEnabled: settings.triggerNoLeadsEnabled,
      triggerExpiringEnabled: settings.triggerExpiringEnabled,
      triggerPlanLimitEnabled: settings.triggerPlanLimitEnabled,
      templates: cloneTemplateSet(settings.templates),
    });
  }, [settings]);

  const updateNumber = (key: keyof FormState, value: string) => {
    const parsed = Number(value);
    setForm((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }));
  };

  const handleTemplateChange = (field: keyof PlanAlertTemplate, value: string) => {
    setForm((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [selectedTemplateKey]: {
          ...prev.templates[selectedTemplateKey],
          [field]: value,
        },
      },
    }));
  };

  const handleRestoreDefaultTemplate = () => {
    setForm((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [selectedTemplateKey]: clonePlanAlertTemplate(DEFAULT_GROWTH_CONVERSION_TEMPLATES[selectedTemplateKey]),
      },
    }));
    toast.success('Texto padrao restaurado para este gatilho.');
  };

  const handleSave = async () => {
    setIsSaving(true);

    const { error } = await saveSettings(form);

    if (error) {
      toast.error('Nao foi possivel salvar as regras de conversao.', {
        description: error,
      });
    } else {
      toast.success('Regras de conversao atualizadas com sucesso.');
    }

    setIsSaving(false);
  };

  const triggerCards: Array<{
    key: keyof Pick<
      FormState,
      | 'triggerHighViewsEnabled'
      | 'triggerTopCategoryEnabled'
      | 'triggerNoLeadsEnabled'
      | 'triggerExpiringEnabled'
      | 'triggerPlanLimitEnabled'
    >;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      key: 'triggerHighViewsEnabled',
      title: 'Alta visibilidade',
      description: 'Notifica quando um anuncio ja acumulou visualizacoes suficientes para merecer impulso.',
      icon: TrendingUp,
    },
    {
      key: 'triggerTopCategoryEnabled',
      title: 'Topo da categoria',
      description: 'Usa o destaque do anuncio entre os mais vistos da categoria como gatilho de upgrade.',
      icon: Sparkles,
    },
    {
      key: 'triggerNoLeadsEnabled',
      title: 'Muitas views sem contato',
      description: 'Ativa quando a exposicao esta alta, mas ainda nao houve contato suficiente.',
      icon: BellRing,
    },
    {
      key: 'triggerExpiringEnabled',
      title: 'Expirando em breve',
      description: 'Lembra o usuario de que o anuncio esta perto do vencimento e pode perder tracao.',
      icon: Megaphone,
    },
    {
      key: 'triggerPlanLimitEnabled',
      title: 'Plano limita exposicao',
      description: 'Usa interesse real do mercado para sugerir um plano com mais destaque.',
      icon: Sparkles,
    },
  ];

  const templateOptions = (Object.keys(GROWTH_TEMPLATE_LABELS) as GrowthConversionTriggerKey[]).map((key) => ({
    key,
    title: GROWTH_TEMPLATE_LABELS[key].title,
    description: GROWTH_TEMPLATE_LABELS[key].description,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_72%,rgba(22,163,74,0.08)_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">
              Conversao inteligente
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-950">Notificacoes de upgrade para usuarios gratuitos</h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Configure os gatilhos que transformam comportamento real do anuncio em oportunidade de conversao.
                As mensagens sao entregues para planos Start, Basico e planos sem destaque Home/Categoria.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-[0_20px_45px_-28px_rgba(15,23,42,0.85)] transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Salvando...' : 'Salvar regras'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Motor geral</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Ativacao e limites</h3>
            </div>

            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, isEnabled: !prev.isEnabled }))}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${
                form.isEnabled ? 'bg-emerald-500 shadow-[0_16px_30px_-16px_rgba(22,163,74,0.85)]' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition ${
                  form.isEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Max. notificacoes por dia
              </span>
              <input
                type="number"
                min={0}
                value={form.dailyUserLimit}
                onChange={(event) => updateNumber('dailyUserLimit', event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Dias para expiracao
              </span>
              <input
                type="number"
                min={1}
                value={form.expireSoonDays}
                onChange={(event) => updateNumber('expireSoonDays', event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Views para visibilidade
              </span>
              <input
                type="number"
                min={0}
                value={form.minViewsForHighViews}
                onChange={(event) => updateNumber('minViewsForHighViews', event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Views sem leads
              </span>
              <input
                type="number"
                min={0}
                value={form.minViewsForNoLeads}
                onChange={(event) => updateNumber('minViewsForNoLeads', event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Views minimas para anuncio expirando
              </span>
              <input
                type="number"
                min={0}
                value={form.minViewsForExpiring}
                onChange={(event) => updateNumber('minViewsForExpiring', event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>
          </div>

          <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-4 text-sm leading-6 text-amber-900">
            <strong className="font-black">Observacao:</strong> o motor continua usando views, leads, conversas
            e proximidade da expiracao. O novo editor controla apenas a copy, sem abrir espaco para HTML livre nem
            quebrar a logica dos gatilhos.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          {triggerCards.map((trigger) => {
            const Icon = trigger.icon;
            const enabled = form[trigger.key];

            return (
              <button
                key={trigger.key}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, [trigger.key]: !prev[trigger.key] }))}
                className={`group rounded-[26px] border p-5 text-left transition ${
                  enabled
                    ? 'border-emerald-200 bg-[linear-gradient(135deg,rgba(22,163,74,0.10)_0%,#ffffff_70%)] shadow-[0_24px_55px_-42px_rgba(22,163,74,0.7)]'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-[0_22px_50px_-42px_rgba(15,23,42,0.45)]'
                }`}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                    enabled ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <span
                    className={`inline-flex h-7 min-w-[68px] items-center justify-center rounded-full px-3 text-[11px] font-black uppercase tracking-[0.22em] ${
                      enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {enabled ? 'Ativo' : 'Pausado'}
                  </span>
                </div>

                <h4 className="text-base font-black text-slate-950">{trigger.title}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-500">{trigger.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <PlanAlertTemplateEditor
        sectionLabel="Copys da conversao"
        sectionTitle="Edite os textos enviados nos gatilhos de upgrade"
        sectionDescription="Cada gatilho pode ter assunto, titulo, mensagem principal, apoio, CTA e link proprios. Os placeholders abaixo sao substituidos automaticamente na hora do envio."
        previewHint="Card, notificacao e e-mail"
        accent="emerald"
        items={templateOptions}
        selectedKey={selectedTemplateKey}
        onSelect={(key) => setSelectedTemplateKey(key as GrowthConversionTriggerKey)}
        template={form.templates[selectedTemplateKey]}
        previewValues={GROWTH_SAMPLE_VALUES}
        placeholders={PLAN_ALERT_PLACEHOLDERS}
        onChange={handleTemplateChange}
        onRestoreDefault={handleRestoreDefaultTemplate}
      />
    </div>
  );
};

export default GrowthConversionSettingsManagement;
