import React from 'react';
import { RotateCcw } from 'lucide-react';
import { PlanAlertTemplate } from '../../types';
import { renderPlanAlertText } from '../../src/lib/planAlertTemplates';

type TemplateFieldKey = keyof PlanAlertTemplate;

type ItemOption<TKey extends string> = {
  key: TKey;
  title: string;
  description: string;
};

type PlaceholderOption = {
  key: string;
  label: string;
  example: string;
};

type Props<TKey extends string> = {
  sectionLabel: string;
  sectionTitle: string;
  sectionDescription: string;
  previewHint: string;
  accent: 'emerald' | 'amber';
  items: ItemOption<TKey>[];
  selectedKey: TKey;
  onSelect: (key: TKey) => void;
  template: PlanAlertTemplate;
  previewValues: Record<string, string>;
  placeholders: PlaceholderOption[];
  onChange: (field: TemplateFieldKey, value: string) => void;
  onRestoreDefault: () => void;
};

const accentStyles = {
  emerald: {
    softBg: 'bg-emerald-50',
    softText: 'text-emerald-700',
    softBorder: 'border-emerald-200',
    ring: 'focus:ring-emerald-100',
    focusBorder: 'focus:border-emerald-500',
    activeCard: 'border-emerald-200 bg-[linear-gradient(135deg,rgba(22,163,74,0.10)_0%,#ffffff_75%)]',
  },
  amber: {
    softBg: 'bg-amber-50',
    softText: 'text-amber-700',
    softBorder: 'border-amber-200',
    ring: 'focus:ring-amber-100',
    focusBorder: 'focus:border-amber-500',
    activeCard: 'border-amber-200 bg-[linear-gradient(135deg,rgba(245,158,11,0.10)_0%,#ffffff_75%)]',
  },
} as const;

const FIELD_CONFIG: Array<{ key: TemplateFieldKey; label: string; multiline?: boolean; rows?: number }> = [
  { key: 'subject', label: 'Assunto' },
  { key: 'title', label: 'Titulo' },
  { key: 'message', label: 'Mensagem principal', multiline: true, rows: 4 },
  { key: 'supportText', label: 'Mensagem curta de apoio', multiline: true, rows: 3 },
  { key: 'cta', label: 'CTA / botao' },
  { key: 'link', label: 'Link de destino' },
];

function PlanAlertTemplateEditor<TKey extends string>({
  sectionLabel,
  sectionTitle,
  sectionDescription,
  previewHint,
  accent,
  items,
  selectedKey,
  onSelect,
  template,
  previewValues,
  placeholders,
  onChange,
  onRestoreDefault,
}: Props<TKey>) {
  const styles = accentStyles[accent];
  const previewSubject = renderPlanAlertText(template.subject, previewValues);
  const previewTitle = renderPlanAlertText(template.title, previewValues);
  const previewMessage = renderPlanAlertText(template.message, previewValues);
  const previewSupportText = renderPlanAlertText(template.supportText, previewValues);
  const previewCta = renderPlanAlertText(template.cta, previewValues);
  const previewLink = renderPlanAlertText(template.link, previewValues);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.4)]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">{sectionLabel}</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{sectionTitle}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{sectionDescription}</p>
        </div>

        <button
          type="button"
          onClick={onRestoreDefault}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" />
          Restaurar texto padrao
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {placeholders.map((placeholder) => (
          <div
            key={placeholder.key}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${styles.softBorder} ${styles.softBg} ${styles.softText}`}
            title={`Exemplo: ${placeholder.example}`}
          >
            {placeholder.key}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.2fr_0.95fr]">
        <div className="space-y-3">
          {items.map((item) => {
            const isSelected = item.key === selectedKey;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                className={`w-full rounded-[24px] border p-4 text-left transition ${
                  isSelected
                    ? styles.activeCard
                    : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <p className="text-sm font-black text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {FIELD_CONFIG.map((field) => (
            <label key={field.key} className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{field.label}</span>
              {field.multiline ? (
                <textarea
                  rows={field.rows ?? 3}
                  value={template[field.key]}
                  onChange={(event) => onChange(field.key, event.target.value)}
                  className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm outline-none transition ${styles.focusBorder} focus:bg-white focus:ring-4 ${styles.ring}`}
                />
              ) : (
                <input
                  type="text"
                  value={template[field.key]}
                  onChange={(event) => onChange(field.key, event.target.value)}
                  className={`h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 shadow-sm outline-none transition ${styles.focusBorder} focus:bg-white focus:ring-4 ${styles.ring}`}
                />
              )}
            </label>
          ))}
        </div>

        <div className={`rounded-[24px] border p-5 ${styles.activeCard}`}>
          <div className="flex items-center justify-between gap-3">
            <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${styles.softBg} ${styles.softText}`}>
              Previa renderizada
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{previewHint}</span>
          </div>

          <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Assunto
              </span>
              <p className="text-xs font-semibold text-slate-500">{previewSubject || 'Sem assunto'}</p>
            </div>

            <p className="mt-4 text-base font-black leading-6 text-slate-950">{previewTitle || 'Sem titulo'}</p>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{previewMessage || 'Sem mensagem principal.'}</p>

            {previewSupportText ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-500">
                {previewSupportText}
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
              <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
                CTA: {previewCta || 'Sem CTA'}
              </span>
              <span className="break-all text-xs font-semibold text-slate-400">{previewLink || 'Sem link'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlanAlertTemplateEditor;
