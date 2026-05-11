import React, { useEffect, useState } from 'react';
import { AlarmClock, BellRing, CalendarClock, RefreshCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import PlanAlertTemplateEditor from '../../components/admin/PlanAlertTemplateEditor';
import {
  PlanAlertTemplate,
  RenewalNotificationStageKey,
  RenewalNotificationTemplates,
} from '../../types';
import {
  DEFAULT_RENEWAL_NOTIFICATION_TEMPLATES,
  PLAN_ALERT_PLACEHOLDERS,
  RENEWAL_SAMPLE_VALUES,
  RENEWAL_TEMPLATE_LABELS,
  clonePlanAlertTemplate,
  cloneTemplateSet,
} from '../../src/lib/planAlertTemplates';
import { useRenewalNotificationSettings } from '../../src/hooks/useRenewalNotificationSettings';

type FormState = {
  isEnabled: boolean;
  dailyUserLimit: number;
  notifySevenDaysBefore: boolean;
  notifyThreeDaysBefore: boolean;
  notifyOneDayBefore: boolean;
  notifyOnExpirationDay: boolean;
  notifyAfterExpiration: boolean;
  daysAfterExpiration: number;
  showDashboardToast: boolean;
  templates: RenewalNotificationTemplates;
};

const RenewalNotificationSettingsManagement: React.FC = () => {
  const { settings, isLoading, saveSettings, defaultSettings } = useRenewalNotificationSettings();
  const [form, setForm] = useState<FormState>({
    isEnabled: defaultSettings.isEnabled,
    dailyUserLimit: defaultSettings.dailyUserLimit,
    notifySevenDaysBefore: defaultSettings.notifySevenDaysBefore,
    notifyThreeDaysBefore: defaultSettings.notifyThreeDaysBefore,
    notifyOneDayBefore: defaultSettings.notifyOneDayBefore,
    notifyOnExpirationDay: defaultSettings.notifyOnExpirationDay,
    notifyAfterExpiration: defaultSettings.notifyAfterExpiration,
    daysAfterExpiration: defaultSettings.daysAfterExpiration,
    showDashboardToast: defaultSettings.showDashboardToast,
    templates: cloneTemplateSet(defaultSettings.templates),
  });
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<RenewalNotificationStageKey>('seven_days');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;

    setForm({
      isEnabled: settings.isEnabled,
      dailyUserLimit: settings.dailyUserLimit,
      notifySevenDaysBefore: settings.notifySevenDaysBefore,
      notifyThreeDaysBefore: settings.notifyThreeDaysBefore,
      notifyOneDayBefore: settings.notifyOneDayBefore,
      notifyOnExpirationDay: settings.notifyOnExpirationDay,
      notifyAfterExpiration: settings.notifyAfterExpiration,
      daysAfterExpiration: settings.daysAfterExpiration,
      showDashboardToast: settings.showDashboardToast,
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
        [selectedTemplateKey]: clonePlanAlertTemplate(DEFAULT_RENEWAL_NOTIFICATION_TEMPLATES[selectedTemplateKey]),
      },
    }));
    toast.success('Texto padrao restaurado para esta etapa.');
  };

  const handleSave = async () => {
    setIsSaving(true);
    const { error } = await saveSettings(form);

    if (error) {
      toast.error('Nao foi possivel salvar as regras de renovacao.', { description: error });
    } else {
      toast.success('Regras de renovacao atualizadas com sucesso.');
    }

    setIsSaving(false);
  };

  const stages: Array<{
    key: keyof Pick<
      FormState,
      | 'notifySevenDaysBefore'
      | 'notifyThreeDaysBefore'
      | 'notifyOneDayBefore'
      | 'notifyOnExpirationDay'
      | 'notifyAfterExpiration'
    >;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      key: 'notifySevenDaysBefore',
      title: '7 dias antes',
      description: 'Lembra o assinante com antecedencia suficiente para renovar com calma.',
      icon: CalendarClock,
    },
    {
      key: 'notifyThreeDaysBefore',
      title: '3 dias antes',
      description: 'Reforca que o plano esta perto do vencimento e evita esquecimento.',
      icon: AlarmClock,
    },
    {
      key: 'notifyOneDayBefore',
      title: '1 dia antes',
      description: 'Ultimo aviso preventivo antes da data final do plano.',
      icon: BellRing,
    },
    {
      key: 'notifyOnExpirationDay',
      title: 'No dia do vencimento',
      description: 'Mostra urgencia para renovar no mesmo dia e nao perder beneficios.',
      icon: RefreshCcw,
    },
    {
      key: 'notifyAfterExpiration',
      title: 'Apos expirar',
      description: 'Lembra o usuario de reativar o plano depois que ele venceu.',
      icon: AlarmClock,
    },
  ];

  const templateOptions = (Object.keys(RENEWAL_TEMPLATE_LABELS) as RenewalNotificationStageKey[]).map((key) => ({
    key,
    title: RENEWAL_TEMPLATE_LABELS[key].title,
    description: RENEWAL_TEMPLATE_LABELS[key].description,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_72%,rgba(245,158,11,0.10)_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-amber-700">
              Renovacao inteligente
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-950">Notificacoes para planos pagos</h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Configure os alertas de retencao para avisar sobre vencimento e expiracao. Essa logica
                vale para todos os planos pagos, excluindo Start e Basico.
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

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.45fr]">
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
                Dias apos expiracao
              </span>
              <input
                type="number"
                min={1}
                value={form.daysAfterExpiration}
                onChange={(event) => updateNumber('daysAfterExpiration', event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, showDashboardToast: !prev.showDashboardToast }))}
            className={`flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition ${
              form.showDashboardToast
                ? 'border-emerald-200 bg-emerald-50/70'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div>
              <p className="text-sm font-black text-slate-950">Toast ao entrar no painel</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Mantem o aviso com alta visibilidade alem da central de notificacoes.
              </p>
            </div>
            <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] ${
              form.showDashboardToast ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
            }`}>
              {form.showDashboardToast ? 'Ativo' : 'Pausado'}
            </span>
          </button>

          <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-4 text-sm leading-6 text-amber-900">
            <strong className="font-black">Observacao:</strong> essa area separa copy de renovacao da copy de
            conversao. Assim voce consegue ajustar urgencia, promessa e CTA sem misturar os dois contextos.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          {stages.map((stage) => {
            const Icon = stage.icon;
            const enabled = form[stage.key];

            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, [stage.key]: !prev[stage.key] }))}
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

                  <span className={`inline-flex h-7 min-w-[68px] items-center justify-center rounded-full px-3 text-[11px] font-black uppercase tracking-[0.22em] ${
                    enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {enabled ? 'Ativo' : 'Pausado'}
                  </span>
                </div>

                <h4 className="text-base font-black text-slate-950">{stage.title}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-500">{stage.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <PlanAlertTemplateEditor
        sectionLabel="Copys da renovacao"
        sectionTitle="Edite os textos enviados em cada etapa do vencimento"
        sectionDescription="As etapas ficam separadas por momento da jornada: 7 dias, 3 dias, 1 dia, dia do vencimento e pos-expiracao. Os placeholders sao preenchidos automaticamente no envio."
        previewHint={form.showDashboardToast ? 'Card, notificacao e toast' : 'Card e notificacao'}
        accent="amber"
        items={templateOptions}
        selectedKey={selectedTemplateKey}
        onSelect={(key) => setSelectedTemplateKey(key as RenewalNotificationStageKey)}
        template={form.templates[selectedTemplateKey]}
        previewValues={RENEWAL_SAMPLE_VALUES}
        placeholders={PLAN_ALERT_PLACEHOLDERS}
        onChange={handleTemplateChange}
        onRestoreDefault={handleRestoreDefaultTemplate}
      />
    </div>
  );
};

export default RenewalNotificationSettingsManagement;
