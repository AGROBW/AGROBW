import React from 'react';
import { LayoutSettings } from '../../../types';

interface LayoutPreviewPanelProps {
  settings: Pick<
    LayoutSettings,
    | 'siteName'
    | 'siteTagline'
    | 'headerBrandText'
    | 'footerBrandText'
    | 'primaryColor'
    | 'secondaryColor'
    | 'accentColor'
    | 'backgroundColor'
    | 'surfaceColor'
    | 'textColor'
    | 'mutedTextColor'
  >;
}

const LayoutPreviewPanel: React.FC<LayoutPreviewPanelProps> = ({ settings }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-slate-900">Preview rapido</h3>
        <p className="text-sm text-slate-500">Uma visao simplificada da identidade antes de salvar.</p>
      </div>

      <div
        className="overflow-hidden rounded-2xl border border-slate-200"
        style={{ backgroundColor: settings.backgroundColor }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ backgroundColor: settings.secondaryColor }}
        >
          <div>
            <p className="text-lg font-black" style={{ color: '#ffffff' }}>
              {settings.headerBrandText || settings.siteName}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {settings.siteTagline}
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: settings.primaryColor, color: '#ffffff' }}
          >
            CTA
          </button>
        </div>

        <div className="p-5">
          <div
            className="rounded-2xl border p-5"
            style={{
              backgroundColor: settings.surfaceColor,
              borderColor: settings.accentColor,
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: settings.mutedTextColor }}>
              Card de exemplo
            </p>
            <h4 className="mt-2 text-xl font-black" style={{ color: settings.textColor }}>
              {settings.siteName}
            </h4>
            <p className="mt-2 text-sm leading-6" style={{ color: settings.mutedTextColor }}>
              {settings.siteTagline || 'Sua identidade visual sera refletida aqui assim que o modulo for aplicado ao site.'}
            </p>
            <div className="mt-4 flex gap-3">
              <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: settings.primaryColor, color: '#ffffff' }}>
                Primaria
              </span>
              <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: settings.accentColor, color: settings.secondaryColor }}>
                Destaque
              </span>
            </div>
          </div>
        </div>

        <div
          className="px-5 py-4 text-sm"
          style={{ backgroundColor: settings.surfaceColor, color: settings.mutedTextColor }}
        >
          {settings.footerBrandText || settings.siteName}
        </div>
      </div>
    </div>
  );
};

export default LayoutPreviewPanel;
