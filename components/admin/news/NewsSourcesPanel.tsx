import React, { useState } from 'react';
import type { NewsSourceCaptureType, NewsSourceRecord } from '../../../types';

interface NewsSourcesPanelProps {
  sources: NewsSourceRecord[];
  onSave: (payload: {
    id?: string;
    name: string;
    domain: string;
    notes?: string | null;
    isActive: boolean;
    captureType: NewsSourceCaptureType;
  }) => Promise<void>;
  onDelete: (source: NewsSourceRecord) => Promise<void>;
}

const emptySource = {
  name: '',
  domain: '',
  notes: '',
  isActive: true,
  captureType: 'manual_url' as NewsSourceCaptureType,
};

const NewsSourcesPanel: React.FC<NewsSourcesPanelProps> = ({ sources, onSave, onDelete }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySource);

  const startEdit = (source: NewsSourceRecord) => {
    setEditingId(source.id);
    setForm({
      name: source.name,
      domain: source.domain,
      notes: source.notes || '',
      isActive: source.isActive,
      captureType: source.captureType,
    });
  };

  const reset = () => {
    setEditingId(null);
    setForm(emptySource);
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr,1.05fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-900">{editingId ? 'Editar fonte' : 'Nova fonte'}</h3>
        <div className="mt-4 space-y-4">
          <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nome da fonte" className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm" />
          <input value={form.domain} onChange={(event) => setForm((prev) => ({ ...prev, domain: event.target.value }))} placeholder="Dominio / site" className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm" />
          <select value={form.captureType} onChange={(event) => setForm((prev) => ({ ...prev, captureType: event.target.value as NewsSourceCaptureType }))} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm">
            <option value="manual_url">Manual por URL</option>
            <option value="scraping">Scraping</option>
            <option value="api">API</option>
            <option value="rss">RSS</option>
          </select>
          <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Observacoes" rows={4} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
            Fonte ativa
          </label>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                await onSave({
                  id: editingId || undefined,
                  name: form.name,
                  domain: form.domain,
                  notes: form.notes || null,
                  isActive: form.isActive,
                  captureType: form.captureType,
                });
                reset();
              }}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
            >
              Salvar fonte
            </button>
            {editingId ? (
              <button onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-900">Fontes cadastradas</h3>
        <div className="mt-4 space-y-3">
          {sources.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma fonte cadastrada.</p>
          ) : (
            sources.map((source) => (
              <div key={source.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{source.name}</p>
                  <p className="text-xs text-slate-500">{source.domain} · {source.captureType}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(source)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-white">
                    Editar
                  </button>
                  <button onClick={() => onDelete(source)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50">
                    Excluir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default NewsSourcesPanel;
