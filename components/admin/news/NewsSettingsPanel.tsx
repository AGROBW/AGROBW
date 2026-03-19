import React, { useEffect, useState } from 'react';
import type { NewsSettingsRecord } from '../../../types';

interface NewsSettingsPanelProps {
  settings: NewsSettingsRecord | null;
  onSave: (payload: Partial<NewsSettingsRecord>) => Promise<void>;
}

const NewsSettingsPanel: React.FC<NewsSettingsPanelProps> = ({ settings, onSave }) => {
  const [form, setForm] = useState({
    defaultPrompt: '',
    maxExtractedCharacters: 12000,
    summaryRule: '',
    showAgroImpact: true,
    referencesTemplate: '',
    defaultGeneratedStatus: 'draft' as NewsSettingsRecord['defaultGeneratedStatus'],
    openaiModel: '',
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      defaultPrompt: settings.defaultPrompt,
      maxExtractedCharacters: settings.maxExtractedCharacters,
      summaryRule: settings.summaryRule,
      showAgroImpact: settings.showAgroImpact,
      referencesTemplate: settings.referencesTemplate,
      defaultGeneratedStatus: settings.defaultGeneratedStatus,
      openaiModel: settings.openaiModel || '',
    });
  }, [settings]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-black text-slate-900">Configuracoes do modulo</h3>
      <div className="mt-5 grid grid-cols-1 gap-4">
        <textarea value={form.defaultPrompt} onChange={(event) => setForm((prev) => ({ ...prev, defaultPrompt: event.target.value }))} rows={5} placeholder="Prompt padrao da IA" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input type="number" value={form.maxExtractedCharacters} onChange={(event) => setForm((prev) => ({ ...prev, maxExtractedCharacters: Number(event.target.value) || 0 }))} placeholder="Maximo de caracteres extraidos" className="h-11 rounded-xl border border-slate-200 px-4 text-sm" />
          <input value={form.openaiModel} onChange={(event) => setForm((prev) => ({ ...prev, openaiModel: event.target.value }))} placeholder="Modelo de IA" className="h-11 rounded-xl border border-slate-200 px-4 text-sm" />
        </div>
        <textarea value={form.summaryRule} onChange={(event) => setForm((prev) => ({ ...prev, summaryRule: event.target.value }))} rows={3} placeholder="Regra para geracao do resumo" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
        <textarea value={form.referencesTemplate} onChange={(event) => setForm((prev) => ({ ...prev, referencesTemplate: event.target.value }))} rows={3} placeholder="Modelo do bloco de referencias" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <select value={form.defaultGeneratedStatus} onChange={(event) => setForm((prev) => ({ ...prev, defaultGeneratedStatus: event.target.value as NewsSettingsRecord['defaultGeneratedStatus'] }))} className="h-11 rounded-xl border border-slate-200 px-4 text-sm">
            <option value="draft">Rascunho</option>
            <option value="in_review">Em revisao</option>
            <option value="published">Publicado</option>
            <option value="archived">Arquivado</option>
          </select>
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.showAgroImpact} onChange={(event) => setForm((prev) => ({ ...prev, showAgroImpact: event.target.checked }))} />
            Exibir secao Impacto no Agro
          </label>
        </div>
        <button
          onClick={() => onSave(form)}
          className="w-fit rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700"
        >
          Salvar configuracoes
        </button>
      </div>
    </div>
  );
};

export default NewsSettingsPanel;
