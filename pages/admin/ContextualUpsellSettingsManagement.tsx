import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Save, ShieldCheck, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  type ContextualUpsellAdminSettings,
  useContextualUpsellSettings,
} from '../../src/hooks/useContextualUpsellSettings';
import type { ContextualUpsellContext } from '../../src/lib/contextualUpsell';

const contextOptions: Array<{ id: ContextualUpsellContext; label: string; description: string }> = [
  { id: 'ad_limit', label: 'Limite de anuncios', description: 'Quando o uso atingir o percentual configurado.' },
  { id: 'lead_locked', label: 'Lead protegido', description: 'Somente para contas sem acesso ou em plano de downgrade.' },
];

const emptyMetrics = {
  impressions_30d: 0,
  clicks_30d: 0,
  checkout_started_30d: 0,
  converted_30d: 0,
  pending_recovery: 0,
};

const ContextualUpsellSettingsManagement: React.FC = () => {
  const { data, isLoading, isSaving, error, load, save } = useContextualUpsellSettings();
  const [form, setForm] = useState<ContextualUpsellAdminSettings | null>(null);
  const [canaryText, setCanaryText] = useState('');

  useEffect(() => {
    if (!data?.settings) return;
    setForm(data.settings);
    setCanaryText((data.settings.canary_user_ids || []).join('\n'));
  }, [data]);

  const metrics = data?.metrics || emptyMetrics;
  const clickRate = useMemo(
    () => metrics.impressions_30d > 0 ? (metrics.clicks_30d / metrics.impressions_30d) * 100 : 0,
    [metrics.clicks_30d, metrics.impressions_30d],
  );

  if (isLoading) {
    return <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-slate-200 bg-white"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>;
  }

  if (!form) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <p className="font-black">Nao foi possivel carregar o upsell contextual.</p>
        <p className="mt-2 text-sm">{error || 'Tente novamente em alguns instantes.'}</p>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2">Tentar novamente</button>
      </div>
    );
  }

  const update = <K extends keyof ContextualUpsellAdminSettings>(key: K, value: ContextualUpsellAdminSettings[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const toggleContext = (context: ContextualUpsellContext) => {
    update('enabled_contexts', form.enabled_contexts.includes(context)
      ? form.enabled_contexts.filter((item) => item !== context)
      : [...form.enabled_contexts, context]);
  };

  const handleSave = async () => {
    const canaryIds = canaryText.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (canaryIds.some((id) => !uuidPattern.test(id))) {
      toast.error('Revise os IDs de usuarios piloto. Cada item deve ser um UUID valido.');
      return;
    }
    if (canaryIds.length > 50) {
      toast.error('Use no maximo 50 usuarios piloto.');
      return;
    }
    if (!Number.isInteger(form.usage_threshold_percent) || form.usage_threshold_percent < 50 || form.usage_threshold_percent > 100) {
      toast.error('O percentual de uso deve ficar entre 50 e 100.');
      return;
    }
    if (!Number.isInteger(form.impression_cooldown_hours) || form.impression_cooldown_hours < 1 || form.impression_cooldown_hours > 720) {
      toast.error('O cooldown deve ficar entre 1 e 720 horas.');
      return;
    }
    if (form.is_enabled && !data?.settings.is_enabled) {
      const confirmed = window.confirm(
        'Ativar o upsell contextual para todos os usuarios? Recomendamos validar primeiro com usuarios piloto.',
      );
      if (!confirmed) return;
    }
    if (form.recovery_enabled && !data?.settings.recovery_enabled) {
      const confirmed = window.confirm(
        'Ativar a fila interna de recuperacao? Esta entrega apenas registra intencoes e nao envia mensagens.',
      );
      if (!confirmed) return;
    }
    const success = await save({ ...form, canary_user_ids: canaryIds });
    if (success) toast.success('Configuracao de upsell salva com auditoria.');
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#052e2b_0%,#0f172a_72%)] px-6 py-7 text-white">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300"><Sparkles className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Monetizacao responsavel</p>
              <h2 className="mt-2 text-2xl font-black">Upsell contextual</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Oferece a menor solucao que resolve uma necessidade real. A chave global nasce desligada e usuarios piloto podem validar a experiencia antes da liberacao.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Impressoes', metrics.impressions_30d],
            ['Cliques', metrics.clicks_30d],
            ['CTR', `${clickRate.toFixed(1)}%`],
            ['Checkouts', metrics.checkout_started_30d],
            ['Conversoes', metrics.converted_30d],
          ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">ultimos 30 dias</p></div>)}
        </div>
      </section>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>}

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
            <span><span className="block font-black text-slate-900">Ativar para todos</span><span className="mt-1 block text-sm text-slate-500">Mantenha desligado durante a validacao por usuarios piloto.</span></span>
            <input type="checkbox" checked={form.is_enabled} onChange={(event) => update('is_enabled', event.target.checked)} className="h-5 w-5 accent-emerald-600" />
          </label>

          <div>
            <h3 className="font-black text-slate-950">Contextos permitidos</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {contextOptions.map((context) => <label key={context.id} className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"><input type="checkbox" checked={form.enabled_contexts.includes(context.id)} onChange={() => toggleContext(context.id)} className="mt-0.5 h-4 w-4 accent-emerald-600" /><span><span className="block text-sm font-black text-slate-800">{context.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{context.description}</span></span></label>)}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">Uso para exibir (%)<input type="number" required min={50} max={100} value={Number.isNaN(form.usage_threshold_percent) ? '' : form.usage_threshold_percent} onChange={(event) => update('usage_threshold_percent', event.target.value === '' ? Number.NaN : Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
            <label className="text-sm font-bold text-slate-700">Cooldown (horas)<input type="number" required min={1} max={720} value={Number.isNaN(form.impression_cooldown_hours) ? '' : form.impression_cooldown_hours} onChange={(event) => update('impression_cooldown_hours', event.target.value === '' ? Number.NaN : Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-600" /><h3 className="font-black text-slate-950">Usuarios piloto</h3></div>
            <p className="mt-2 text-sm leading-6 text-slate-500">Um UUID por linha. Esses usuarios veem a experiencia mesmo com a chave global desligada.</p>
            <textarea value={canaryText} onChange={(event) => setCanaryText(event.target.value)} rows={6} placeholder="00000000-0000-0000-0000-000000000000" className="mt-4 w-full rounded-2xl border border-slate-200 p-3 font-mono text-xs" />
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-amber-700" /><h3 className="font-black text-amber-950">Recuperacao sem envio</h3></div>
            <p className="mt-2 text-sm leading-6 text-amber-900">Ao ativar, o sistema apenas registra na fila quem iniciou checkout. Esta entrega nao envia WhatsApp, e-mail ou notificacao.</p>
            <label className="mt-4 flex items-center justify-between rounded-2xl border border-amber-200 bg-white/70 p-4"><span><span className="block text-sm font-black text-slate-900">Criar fila de recuperacao</span><span className="mt-1 block text-xs text-slate-500">{metrics.pending_recovery} item(ns) pendente(s)</span></span><input type="checkbox" checked={form.recovery_enabled} onChange={(event) => update('recovery_enabled', event.target.checked)} className="h-5 w-5 accent-amber-600" /></label>
          </div>
        </div>
      </section>

      <div className="flex justify-end"><button type="button" onClick={() => void handleSave()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{isSaving ? 'Salvando...' : 'Salvar configuracao'}</button></div>
    </div>
  );
};

export default ContextualUpsellSettingsManagement;
