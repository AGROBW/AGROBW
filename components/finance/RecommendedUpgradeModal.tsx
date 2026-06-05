import React, { useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { useLayout } from '../../src/contexts/LayoutContext';
import { Plan } from '../../src/hooks/usePlans';
import {
  calculateYearlySavings,
  calculateYearlyTotal,
  getCustomPlanContactLink,
  isCustomPlan,
} from '../../services/paymentUtils';
import { initiatePlatformPlanCheckout } from '../../services/paymentCheckoutService';
import toast from 'react-hot-toast';

type BillingCycle = 'monthly' | 'yearly';

interface RecommendedUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: Plan | null;
  nextPlan: Plan | null;
  userId?: string;
  onScheduledChangeCreated?: () => void | Promise<void>;
}

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getBillingCycleLabel = (billingCycle: BillingCycle) =>
  billingCycle === 'monthly' ? 'Mensal' : 'Anual';

const RecommendedUpgradeModal: React.FC<RecommendedUpgradeModalProps> = ({
  isOpen,
  onClose,
  currentPlan,
  nextPlan,
  userId,
  onScheduledChangeCreated,
}) => {
  const { settings } = useLayout();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading] = useState(false);

  const highlights = useMemo(() => {
    if (!nextPlan) return [];

    const items: string[] = [];

    if ((nextPlan.max_ads ?? 0) > (currentPlan?.max_ads ?? 0)) {
      items.push(`Até ${nextPlan.max_ads} anúncios ativos`);
    }

    if ((nextPlan.category_highlights_count || 0) > (currentPlan?.category_highlights_count || 0)) {
      items.push(`${nextPlan.category_highlights_count} destaque${nextPlan.category_highlights_count > 1 ? 's' : ''} em categoria`);
    }

    if ((nextPlan.home_highlight_count || 0) > (currentPlan?.home_highlight_count || 0)) {
      items.push(`${nextPlan.home_highlight_count} destaque${nextPlan.home_highlight_count > 1 ? 's' : ''} na home`);
    }

    if (nextPlan.has_verification_badge && !currentPlan?.has_verification_badge) {
      items.push('Selo de vendedor verificado');
    }

    if (nextPlan.has_seller_store && !currentPlan?.has_seller_store) {
      items.push('Loja parceira e perfil profissional');
    }

    if (nextPlan.has_email_marketing && !currentPlan?.has_email_marketing) {
      items.push('Campanhas de e-mail marketing');
    }

    if ((nextPlan.radar_max_alerts || 0) > (currentPlan?.radar_max_alerts || 0)) {
      items.push(`Radar com até ${nextPlan.radar_max_alerts} alertas`);
    }

    return items.length > 0 ? items.slice(0, 4) : (nextPlan.display_features || []).filter(Boolean).slice(0, 4);
  }, [currentPlan, nextPlan]);

  if (!isOpen || !nextPlan) {
    return null;
  }

  const displayPrice =
    billingCycle === 'monthly'
      ? nextPlan.monthly_price
      : nextPlan.yearly_price > 0
        ? nextPlan.yearly_price / 12
        : nextPlan.monthly_price;

  const yearlySavings = calculateYearlySavings(nextPlan.monthly_price, nextPlan.yearly_price);
  const checkoutSummary =
    nextPlan.billing_model === 'recurring'
      ? billingCycle === 'monthly'
        ? `Plano com cobrança recorrente mensal de R$ ${formatCurrency(nextPlan.monthly_price)}.`
        : `Plano com cobrança recorrente anual de R$ ${formatCurrency(calculateYearlyTotal(nextPlan.monthly_price, nextPlan.yearly_price))} cobrados de uma vez.`
      : billingCycle === 'monthly'
        ? `Compra avulsa com vigência mensal de R$ ${formatCurrency(nextPlan.monthly_price)}.`
        : `Compra avulsa com vigência anual de R$ ${formatCurrency(calculateYearlyTotal(nextPlan.monthly_price, nextPlan.yearly_price))} cobrados de uma vez.`;
  const checkoutActionLabel =
    nextPlan.billing_model === 'recurring'
      ? `Contratar ${getBillingCycleLabel(billingCycle)}`
      : `Comprar ${getBillingCycleLabel(billingCycle)}`;

  const handleSubscribe = async () => {
    if (!userId) {
      toast.error('Você precisa estar logado para contratar um plano.');
      return;
    }

    if (isCustomPlan(nextPlan.name)) {
      window.open(getCustomPlanContactLink(nextPlan.name), '_blank');
      return;
    }

    if (currentPlan) {
      toast('Os ajustes de planos com cobrança recorrente em andamento ficam centralizados na aba Financeiro.');
      onClose();
      window.location.href = '/minha-conta/financeiro';
      return;
    }

    setLoading(true);
    toast.loading('Preparando checkout...', { id: 'upgrade-checkout-loading' });

    try {
      const amount =
        billingCycle === 'monthly'
          ? nextPlan.monthly_price
          : calculateYearlyTotal(nextPlan.monthly_price, nextPlan.yearly_price);

      const result = await initiatePlatformPlanCheckout({
        planId: nextPlan.id,
        planName: nextPlan.name,
        planDescription: nextPlan.description || `Plano ${nextPlan.name}`,
        billingCycle,
        amount,
        userId,
      });

      toast.dismiss('upgrade-checkout-loading');

      if (!result.success) {
        toast.error(result.error || 'Não foi possível iniciar a contratação.');
        return;
      }

      toast.success(`Redirecionando para o checkout Asaas ${getBillingCycleLabel(billingCycle).toLowerCase()}...`);
      await onScheduledChangeCreated?.();
      onClose();
    } catch (error) {
      console.error('Erro ao iniciar contratação no modal de upgrade:', error);
      toast.dismiss('upgrade-checkout-loading');
      toast.error('Não foi possível iniciar a contratação agora.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3 md:p-4">
      <div className="w-full max-w-3xl max-h-[92vh] rounded-[2rem] bg-white shadow-2xl overflow-hidden flex flex-col">
        <div
          className="px-5 py-4 md:px-6 md:py-5 text-white flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${settings.secondaryColor} 0%, color-mix(in srgb, ${settings.secondaryColor} 78%, black) 100%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p
                className="text-[11px] font-black uppercase tracking-[0.28em]"
                style={{ color: `color-mix(in srgb, ${settings.primaryColor} 70%, white)` }}
              >
                Upgrade recomendado
              </p>
              <h3 className="mt-2 text-xl md:text-2xl font-black tracking-tight">
                {currentPlan?.name ? `${currentPlan.name} para ${nextPlan.name}` : nextPlan.name}
              </h3>
              <p className="mt-2 text-xs md:text-sm text-slate-200">
                Use o checkout hospedado do Asaas para ativar uma nova contratação com mais alcance e recursos.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl border border-white/15 bg-white/10 text-white flex items-center justify-center hover:bg-white/15 transition-colors"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 overflow-y-auto">
          <div className="flex items-center justify-center gap-3 md:gap-4">
            <span className={`text-sm font-bold ${billingCycle === 'monthly' ? 'text-slate-900' : 'text-slate-400'}`}>
              Mensal
            </span>
            <button
              onClick={() => setBillingCycle((value) => (value === 'monthly' ? 'yearly' : 'monthly'))}
              className="relative h-8 w-16 rounded-full border border-slate-200 bg-slate-100 p-1"
            >
              <div
                className={`h-6 w-6 rounded-full transition-transform duration-300 ${billingCycle === 'yearly' ? 'translate-x-8' : 'translate-x-0'}`}
                style={{ backgroundColor: settings.primaryColor }}
              />
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${billingCycle === 'yearly' ? 'text-slate-900' : 'text-slate-400'}`}>
                Anual
              </span>
              <span
                className="rounded px-2 py-0.5 text-[10px] font-black uppercase text-white"
                style={{ backgroundColor: settings.primaryColor }}
              >
                economia
              </span>
            </div>
          </div>

          <div
            className="flex min-h-0 flex-col rounded-[1.5rem] md:rounded-[2rem] border bg-white p-4 md:p-6 lg:p-7 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)]"
            style={{
              borderColor: settings.primaryColor,
              boxShadow: `0 0 0 4px color-mix(in srgb, ${settings.primaryColor} 16%, white)`,
            }}
          >
            <div className="mb-4 md:mb-6 flex items-start justify-between gap-3 md:gap-4">
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
                  {nextPlan.card_eyebrow?.trim() || 'Plano BWAGRO'}
                </p>
                <h3 className="text-xl md:text-2xl font-black text-slate-950">{nextPlan.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{nextPlan.description}</p>
              </div>
            </div>

            <div className="rounded-[1.5rem] bg-slate-950 px-5 py-5 text-white">
              <div className="flex items-end gap-2">
                <span className="text-4xl md:text-5xl font-black tracking-tighter">
                  R$ {formatCurrency(displayPrice)}
                </span>
                <span className="pb-1 text-sm text-slate-300">
                  {billingCycle === 'yearly' ? '/mês (cobrado anual)' : '/mês'}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-300">{checkoutSummary}</p>
              {billingCycle === 'yearly' && yearlySavings.amount > 0 ? (
                <p
                  className="mt-2 text-xs font-black uppercase tracking-[0.18em]"
                  style={{ color: `color-mix(in srgb, ${settings.primaryColor} 65%, white)` }}
                >
                  Economia de {yearlySavings.percentage}% no ciclo anual
                </p>
              ) : null}
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                Destaques do plano
              </p>
              <ul className="mt-3 space-y-2">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm font-medium text-slate-700">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={2.5} style={{ color: settings.primaryColor }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="max-w-xl text-xs leading-5 text-slate-500">
                Novas contratações passam pelo checkout hospedado do Asaas. Mudanças em um plano com cobrança recorrente em andamento ficam centralizadas na aba Financeiro.
              </p>
              <button
                onClick={() => void handleSubscribe()}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black text-white shadow-[0_18px_30px_-20px_rgba(22,163,74,0.75)] transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: settings.primaryColor }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? 'Processando...' : checkoutActionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecommendedUpgradeModal;
