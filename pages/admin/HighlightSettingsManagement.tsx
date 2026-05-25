import React, { useEffect, useState } from 'react';
import { Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useHighlightSettings } from '../../src/hooks/useHighlightSettings';
import { getEffectiveHighlightCooldownDays } from '../../src/utils/highlightCooldown';

const HighlightSettingsManagement: React.FC = () => {
  const { settings, isLoading, saveSettings, defaultSettings } = useHighlightSettings();
  const [cooldownDays, setCooldownDays] = useState(String(defaultSettings.highlightCooldownDays));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCooldownDays(String(settings?.highlightCooldownDays ?? defaultSettings.highlightCooldownDays));
  }, [defaultSettings.highlightCooldownDays, settings?.highlightCooldownDays]);

  const handleSave = async () => {
    const parsed = Number(cooldownDays);
    const normalized = getEffectiveHighlightCooldownDays(Number.isFinite(parsed) ? parsed : defaultSettings.highlightCooldownDays);

    setIsSaving(true);
    const { error } = await saveSettings({ highlightCooldownDays: normalized });

    if (error) {
      toast.error('Nao foi possivel salvar o cooldown de destaque.', {
        description: error,
      });
    } else {
      setCooldownDays(String(normalized));
      toast.success('Cooldown de destaque atualizado com sucesso.');
    }

    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_72%,rgba(245,158,11,0.08)_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-amber-700">
              Destaques
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-950">Cooldown apos o fim do destaque</h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Defina quantos dias o anuncio deve aguardar para receber novamente o mesmo tipo de destaque
                apos o vencimento do periodo ativo. Esta regra vale para Home e Categoria.
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
            {isSaving ? 'Salvando...' : 'Salvar cooldown'}
          </button>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Cooldown em dias
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={cooldownDays}
              onChange={(event) => setCooldownDays(event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-100"
            />
          </label>

          <div className="rounded-3xl border border-amber-100 bg-[linear-gradient(135deg,rgba(255,251,235,0.92)_0%,rgba(255,255,255,1)_100%)] p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Como essa regra funciona</p>
                <p>
                  Quando um destaque vence, o anuncio entra em espera pelo numero de dias definido aqui antes
                  de poder receber novamente o mesmo destaque.
                </p>
                <p>
                  Exemplo: com valor <strong>{getEffectiveHighlightCooldownDays(Number(cooldownDays || '0'))}</strong>,
                  um destaque encerrado hoje so ficara disponivel novamente apos esse intervalo.
                </p>
                <p className="text-xs text-slate-500">
                  O valor e lido pelo backend na aplicacao real do destaque e tambem pelo frontend nas mensagens
                  e previsoes mostradas ao usuario.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HighlightSettingsManagement;
