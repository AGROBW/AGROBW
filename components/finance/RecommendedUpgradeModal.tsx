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
import { initiatePlatformPlanCheckout, openStripeCustomerPortal } from '../../services/paymentCheckoutService';
import { requestSubscriptionChangeNextCycle } from '../../services/subscriptionChangeService';
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
      items.push('Loja parceira e perfil mais profissional');
    }

    if (nextPlan.has_email_marketing && !currentPlan?.has_email_marketing) {
      items.push('Campanhas de e-mail marketing');
    }

    if ((nextPlan.radar_max_alerts || 0) > (currentPlan?.radar_max_alerts || 0)) {
      items.push(`Radar com até ${nextPlan.radar_max_alerts} alertas`);
    }

    if (items.length === 0) {
      return (nextPlan.display_features || []).filter(Boolean).slice(0, 4);
    }

    return items.slice(0, 4);
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
    billingCycle === 'monthly'
      ? `Assinatura mensal de R$ ${formatCurrency(nextPlan.monthly_price)}.`
      : `Assinatura anual de R$ ${formatCurrency(calculateYearlyTotal(nextPlan.monthly_price, nextPlan.yearly_price))} cobrados de uma vez.`;

  const handleSubscribe = async () => {
    if (!userId) {
      toast.error('Você precisa estar logado para assinar um plano.');
      return;
    }

    if (isCustomPlan(nextPlan.name)) {
      window.open(getCustomPlanContactLink(nextPlan.name), '_blank');
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

      if (!result.success && result.action === 'schedule_subscription_change') {
        const changeKind =
          currentPlan && nextPlan.position < currentPlan.position ? 'downgrade' : 'upgrade';

        const scheduleResult = await requestSubscriptionChangeNextCycle({
          changeKind,
          targetPlanId: nextPlan.id,
          targetBillingCycle: billingCycle,
        });

        if (!scheduleResult.success) {
          toast.error(scheduleResult.error || result.error || 'Não foi possível agendar a alteração do plano.');
          return;
        }

        toast.success(
          changeKind === 'upgrade'
            ? 'Upgrade agendado para o próximo ciclo.'
            : 'Downgrade agendado para o próximo ciclo.'
        );
        if (scheduleResult.warning) {
          toast.warning(`A mudança foi registrada, mas a sincronização com a Stripe ainda precisa de revisão: ${scheduleResult.warning}`);
        }
        await onScheduledChangeCreated?.();
        onClose();
        return;
      }

      if (!result.success && result.action === 'open_stripe_portal') {
        const portalResult = await openStripeCustomerPortal('/minha-conta/assinatura');

        if (!portalResult.success) {
          toast.error(portalResult.error || result.error || 'Não foi possível abrir o portal Stripe.');
          return;
        }

        toast.success('Portal Stripe aberto para gerenciar sua assinatura atual.');
        onClose();
        return;
      }

      if (!result.success) {
        toast.error(result.error || 'Não foi possível iniciar o upgrade.');
        return;
      }

      toast.success(`Redirecionando para o checkout Stripe ${getBillingCycleLabel(billingCycle).toLowerCase()}...`);
      onClose();
    } catch (error) {
      console.error('Erro ao iniciar upgrade:', error);
      toast.dismiss('upgrade-checkout-loading');
      toast.error('Não foi possível iniciar o upgrade agora.');
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
              <p className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: `color-mix(in srgb, ${settings.primaryColor} 70%, white)` }}>
                Upgrade recomendado
              </p>
              <h3 className="mt-2 text-xl md:text-2xl font-black tracking-tight">
                {currentPlan?.name ? `${currentPlan.name} para ${nextPlan.name}` : nextPlan.name}
              </h3>
              <p className="mt-2 text-xs md:text-sm text-slate-200">
                Assine o próximo plano da sua jornada e ganhe mais alcance, recursos e visibilidade.
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
            style={{ borderColor: settings.primaryColor, boxShadow: `0 0 0 4px color-mix(in srgb, ${settings.primaryColor} 16%, white)` }}
          >
            <div className="mb-4 md:mb-6 flex items-start justify-between gap-3 md:gap-4">
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
                  {nextPlan.card_eyebrow?.trim() || 'Plano BWAGRO'}
                </p>
                <h3 className="text-xl md:text-2xl font-black text-slate-950">{nextPlan.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{nextPlan.description}</p>
              </div>
              {nextPlan.is_popular && (
                <span
                  className="whitespace-nowrap rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  Escolha segura
                </span>
              )}
            </div>

            <div className="rounded-[1.25rem] md:rounded-[1.5rem] bg-slate-950 p-4 md:p-5 text-white">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span
                  className="inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 18%, white)`,
                    color: settings.primaryColor,
                  }}
                >
                  {getBillingCycleLabel(billingCycle)}
                </span>
                {billingCycle === 'yearly' ? (
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Pagamento a vista anual
                  </span>
                ) : (
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Renovacao mensal
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-slate-400">R$</span>
                <span className="text-4xl md:text-5xl font-black tracking-tighter">{formatCurrency(displayPrice)}</span>
                <span className="text-sm font-medium text-slate-400">/mês</span>
              </div>
              {billingCycle === 'yearly' && nextPlan.yearly_price > 0 ? (
                <p className="mt-3 text-sm font-semibold" style={{ color: `color-mix(in srgb, ${settings.primaryColor} 55%, white)` }}>
                  Cobrança anual: R$ {formatCurrency(nextPlan.yearly_price)}
                  {yearlySavings.amount > 0 ? ` | economia de ${yearlySavings.percentage}%` : ''}
                </p>
              ) : nextPlan.price_caption?.trim() ? (
                <p className="mt-3 text-sm font-semibold text-slate-400">
                  {nextPlan.price_caption.trim()}
                </p>
              ) : null}
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                {checkoutSummary}
              </p>
            </div>

            <div className="mt-4 md:mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">O que você ganha no upgrade</p>
              <ul className="mt-3 md:mt-4 space-y-2.5 md:space-y-3">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm font-medium text-slate-700">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={2} style={{ color: settings.primaryColor }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {currentPlan && (
              <div className="mt-4 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Plano atual</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{currentPlan.name}</p>
                  <p className="mt-1 text-slate-500">
                    {currentPlan.max_ads ?? 0} anúncios, {currentPlan.category_highlights_count || 0} destaques em categoria
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Próximo plano</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{nextPlan.name}</p>
                  <p className="mt-1 text-slate-500">
                    {nextPlan.max_ads ?? 0} anúncios, {nextPlan.category_highlights_count || 0} destaques em categoria
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 md:mt-auto pt-2 md:pt-6 flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={onClose}
                className="h-11 px-5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Agora não
              </button>
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="h-11 px-5 rounded-xl text-sm font-semibold text-white inline-flex items-center justify-center gap-2"
                style={{ backgroundColor: settings.primaryColor }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Preparando checkout...' : `Assinar ${nextPlan.name} ${getBillingCycleLabel(billingCycle)}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecommendedUpgradeModal;
