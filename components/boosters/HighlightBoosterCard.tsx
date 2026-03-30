import React from 'react';
import { Home, Sparkles, Tag } from 'lucide-react';
import { HighlightBoosterRecord, HighlightBoosterSummary } from '../../types';
import { useLayout } from '../../src/contexts/LayoutContext';

type HighlightBoosterCardProps = {
  booster: HighlightBoosterRecord;
  summary?: HighlightBoosterSummary | null;
  onPurchase: () => void;
  loading?: boolean;
  compact?: boolean;
  showAccountSummary?: boolean;
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
  showAccountSummary = false,
}) => {
  const { settings } = useLayout();
  const purchasesLeft = Math.max(0, booster.maxPurchasesPer30Days - (summary?.purchasesLast30Days || 0));
  const totalExtraCredits = booster.categoryCredits + booster.homeCredits;
  const shouldShowAccountSummary = showAccountSummary && !!summary;

  if (compact) {
    return (
      <div
        className="rounded-[1.5rem] border bg-white p-4 shadow-[0_16px_35px_-32px_rgba(15,23,42,0.32)]"
        style={{ borderColor: `color-mix(in srgb, ${settings.primaryColor} 16%, #e2e8f0)` }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div
              className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
              style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 10%, white)`, color: settings.primaryColor }}
            >
              <Sparkles className="h-3 w-3" />
              Booster avulso
            </div>
            <div className="mt-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-4">
              <h3 className="text-lg font-black tracking-tight text-slate-900">{booster.name}</h3>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  +{booster.categoryCredits} categoria
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  +{booster.homeCredits} home
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  {booster.categoryHighlightDays}d categoria
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  {booster.homeHighlightDays}d home
                </span>
              </div>
            </div>
              <p className="mt-2 text-sm text-slate-500">
              {shouldShowAccountSummary
                ? `Saldo atual: ${summary.categoryRemaining} categoria e ${summary.homeRemaining} home.`
                : `${totalExtraCredits} créditos extras para campanhas pontuais.`}
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:min-w-[220px] lg:items-end">
            <div className="text-left lg:text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pagamento avulso</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-slate-900">{formatCurrency(booster.monthlyPrice)}</p>
              {shouldShowAccountSummary && (
                <p className="mt-1 text-xs text-slate-500">
                  {purchasesLeft} compra(s) restante(s) em 30 dias
                </p>
              )}
            </div>

            <button
              onClick={onPurchase}
              disabled={loading || (!!summary && !summary.canPurchase)}
              className="h-11 rounded-2xl px-5 text-sm font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: settings.primaryColor }}
            >
              {loading ? 'Processando...' : booster.buttonText || 'Comprar booster'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-[2rem] border bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_20px_45px_-36px_rgba(15,23,42,0.45)] ${
        compact ? 'p-5' : 'p-7'
      }`}
      style={{ borderColor: `color-mix(in srgb, ${settings.primaryColor} 20%, #e2e8f0)` }}
    >
      <div
        className="relative mb-6 overflow-hidden rounded-[1.75rem] border p-5"
        style={{
          borderColor: `color-mix(in srgb, ${settings.primaryColor} 22%, #e2e8f0)`,
          background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 10%, white) 0%, white 44%, color-mix(in srgb, ${settings.accentColor} 10%, white) 100%)`
        }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-40"
          style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 22%, white)` }}
        />
        <div
          className="pointer-events-none absolute -bottom-12 left-8 h-24 w-24 rounded-full opacity-30"
          style={{ backgroundColor: `color-mix(in srgb, ${settings.accentColor} 20%, white)` }}
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]"
            style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)`, color: settings.primaryColor }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Booster exclusivo
          </div>
          <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-900">{booster.name}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{booster.description}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: settings.primaryColor }} />
            {totalExtraCredits} créditos extras para campanhas pontuais
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
              Sem recorrência
            </span>
            <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
              Não altera seu plano atual
            </span>
            <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
              Créditos extras não expiram
            </span>
          </div>
        </div>

        <div
          className="min-w-[220px] rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] px-5 py-4 text-right shadow-sm"
          style={{ borderColor: `color-mix(in srgb, ${settings.secondaryColor} 14%, #e2e8f0)` }}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Pagamento avulso</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{formatCurrency(booster.monthlyPrice)}</p>
          <p className="mt-1 text-xs text-slate-500">Sem recorrência e sem impacto no plano atual</p>
        </div>
      </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5">
          <div className="flex items-center gap-2 text-slate-700">
            <Tag className="h-4 w-4" style={{ color: settings.primaryColor }} />
            <span className="text-sm font-semibold">Categoria</span>
          </div>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">+{booster.categoryCredits}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">Créditos extras</p>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5">
          <div className="flex items-center gap-2 text-slate-700">
            <Home className="h-4 w-4" style={{ color: settings.accentColor }} />
            <span className="text-sm font-semibold">Home</span>
          </div>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">+{booster.homeCredits}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">Créditos extras</p>
        </div>
      </div>

      {shouldShowAccountSummary && (
        <div className="mt-5 rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Saldo extra na sua conta</p>
              <p className="mt-2 font-semibold text-slate-900">
                {summary.categoryRemaining} categoria e {summary.homeRemaining} home
              </p>
            </div>
            <div className="md:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Janela de compra</p>
              <p className="mt-2 font-semibold text-slate-900">
                {purchasesLeft} compra(s) restante(s) em 30 dias
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Regra de consumo</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            O sistema consome primeiro os créditos do plano e depois usa os créditos extras do booster.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 md:items-end">
          <button
            onClick={onPurchase}
            disabled={loading || (shouldShowAccountSummary && !summary.canPurchase)}
            className="h-12 rounded-2xl px-6 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: settings.primaryColor }}
          >
            {loading ? 'Processando...' : booster.buttonText || 'Comprar booster'}
          </button>
          <p className="text-xs text-slate-500 md:text-right">
            {shouldShowAccountSummary
              ? `${purchasesLeft} compra(s) restante(s) na janela atual`
              : 'Entre na sua conta para acompanhar saldo e janela de compra'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default HighlightBoosterCard;
