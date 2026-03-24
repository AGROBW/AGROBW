import React from 'react';
import { Sparkles, Tag, Home } from 'lucide-react';
import { HighlightBoosterRecord, HighlightBoosterSummary } from '../../types';
import { useLayout } from '../../src/contexts/LayoutContext';

type HighlightBoosterCardProps = {
  booster: HighlightBoosterRecord;
  summary?: HighlightBoosterSummary | null;
  onPurchase: () => void;
  loading?: boolean;
  compact?: boolean;
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const HighlightBoosterCard: React.FC<HighlightBoosterCardProps> = ({
  booster,
  summary,
  onPurchase,
  loading = false,
  compact = false,
}) => {
  const { settings } = useLayout();
  const purchasesLeft = Math.max(0, booster.maxPurchasesPer30Days - (summary?.purchasesLast30Days || 0));

  return (
    <div className={`rounded-[2rem] border bg-white shadow-sm ${compact ? 'p-5' : 'p-7'}`} style={{ borderColor: `color-mix(in srgb, ${settings.primaryColor} 20%, #e2e8f0)` }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)`, color: settings.primaryColor }}>
            <Sparkles className="h-3.5 w-3.5" />
            Booster exclusivo
          </div>
          <h3 className="mt-4 text-xl font-black text-slate-900">{booster.name}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {booster.description}
          </p>
        </div>
        <div className="rounded-2xl px-4 py-3 text-right" style={{ backgroundColor: `color-mix(in srgb, ${settings.secondaryColor} 8%, white)` }}>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Pagamento avulso</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{formatCurrency(booster.monthlyPrice)}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Tag className="h-4 w-4" style={{ color: settings.primaryColor }} />
            <span className="text-sm font-semibold">Categoria</span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">+{booster.categoryCredits}</p>
          <p className="text-xs text-slate-500">créditos extras</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Home className="h-4 w-4" style={{ color: settings.accentColor }} />
            <span className="text-sm font-semibold">Home</span>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">+{booster.homeCredits}</p>
          <p className="text-xs text-slate-500">créditos extras</p>
        </div>
      </div>

      {summary && (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Saldo extra atual: <strong>{summary.categoryRemaining}</strong> categoria e <strong>{summary.homeRemaining}</strong> home</span>
            <span>Compras restantes em 30 dias: <strong>{purchasesLeft}</strong></span>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-slate-500">
          O sistema consome primeiro os créditos do plano e depois os créditos extras do booster.
        </p>
        <button
          onClick={onPurchase}
          disabled={loading || (!!summary && !summary.canPurchase)}
          className="h-11 rounded-xl px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: settings.primaryColor }}
        >
          {loading ? 'Processando...' : booster.buttonText || 'Comprar booster'}
        </button>
      </div>
    </div>
  );
};

export default HighlightBoosterCard;
