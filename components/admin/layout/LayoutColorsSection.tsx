import React from 'react';
import { Palette } from 'lucide-react';

type LayoutColorsFormData = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  successColor: string;
  warningColor: string;
  errorColor: string;
};

interface LayoutColorsSectionProps {
  formData: LayoutColorsFormData;
  onChange: (field: keyof LayoutColorsFormData, value: string) => void;
}

const colorFieldClassName = 'h-11 w-16 rounded-xl border border-slate-200 bg-white p-1';
const textFieldClassName = 'h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm';

const colorItems: Array<{ key: keyof LayoutColorsFormData; label: string }> = [
  { key: 'primaryColor', label: 'Primaria' },
  { key: 'secondaryColor', label: 'Secundaria' },
  { key: 'accentColor', label: 'Destaque' },
  { key: 'backgroundColor', label: 'Fundo' },
  { key: 'surfaceColor', label: 'Superficie' },
  { key: 'textColor', label: 'Texto principal' },
  { key: 'mutedTextColor', label: 'Texto secundario' },
  { key: 'successColor', label: 'Sucesso' },
  { key: 'warningColor', label: 'Alerta' },
  { key: 'errorColor', label: 'Erro' },
];

const LayoutColorsSection: React.FC<LayoutColorsSectionProps> = ({ formData, onChange }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <Palette className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Paleta de cores</h3>
          <p className="text-sm text-slate-500">Defina as cores principais da identidade visual.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {colorItems.map((item) => (
          <div key={item.key} className="rounded-xl border border-slate-200 p-4">
            <label className="mb-3 block text-sm font-semibold text-slate-700">{item.label}</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                className={colorFieldClassName}
                value={formData[item.key]}
                onChange={(e) => onChange(item.key, e.target.value)}
              />
              <input
                className={textFieldClassName}
                value={formData[item.key]}
                onChange={(e) => onChange(item.key, e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LayoutColorsSection;
