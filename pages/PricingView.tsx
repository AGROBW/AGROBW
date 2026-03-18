import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { PRICING_FAQ, PRICING_FEATURES } from '../constants';
import { usePlans } from '../src/hooks/usePlans';
import { useAuth } from '../src/contexts/AuthContext';
import {
  calculateYearlySavings,
  calculateYearlyTotal,
  getCustomPlanContactLink,
  initiateCheckout,
  isCustomPlan,
} from '../services/mercadoPagoService';
import toast from 'react-hot-toast';

type BillingCycle = 'monthly' | 'yearly';

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatNumericValue = (value: number | null | undefined, suffix = '') => {
  if (value === null || value === undefined) {
    return 'Sob consulta';
  }

  return `${value}${suffix}`;
};

const formatComparisonValue = (value: unknown): string | boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return String(value);
};

const PricingView: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const { plansRaw, isLoading: plansLoading } = usePlans();
  const { user } = useAuth();

  const comparisonRows = useMemo(
    () =>
      PRICING_FEATURES.map((feature) => ({
        id: feature.id,
        label: feature.label,
      })),
    []
  );

  const getDisplayPrice = (monthlyPrice: number, yearlyPrice: number) => {
    if (billingCycle === 'monthly') {
      return monthlyPrice;
    }

    return yearlyPrice > 0 ? yearlyPrice / 12 : monthlyPrice;
  };

  const getPlanSummary = (plan: (typeof plansRaw)[number]) => {
    const summary = [
      `Ate ${formatNumericValue(plan.max_ads)} anuncios ativos`,
      `${plan.category_highlights_count || 0} destaques por categoria`,
      `${formatNumericValue(plan.lead_contact_limit_days, ' dias')} de contato com leads`,
    ];

    if ((plan.home_highlight_count || 0) > 0) {
      summary[2] = `${plan.home_highlight_count} destaque${plan.home_highlight_count > 1 ? 's' : ''} na home`;
    }

    return summary;
  };

  const getPlanBadges = (plan: (typeof plansRaw)[number]) => {
    const badges = [];

    if (plan.has_verification_badge) {
      badges.push('Selo verificado');
    }
    if (plan.has_seller_store) {
      badges.push('Loja oficial');
    }
    if (plan.has_email_marketing) {
      badges.push('Email marketing');
    }
    if ((plan.radar_max_alerts || 0) > 0) {
      badges.push(`Radar x${plan.radar_max_alerts}`);
    }

    return badges.slice(0, 4);
  };

  const getPlanSpotlight = (plan: (typeof plansRaw)[number]) => {
    if (plan.is_popular) {
      return 'Mais escolhido por produtores ativos';
    }

    if (isCustomPlan(plan.name)) {
      return 'Plano consultivo para operacoes maiores';
    }

    if (plan.monthly_price === 0) {
      return 'Entrada ideal para validar a plataforma';
    }

    if (plan.has_seller_store || plan.has_verification_badge) {
      return 'Pacote robusto para marca e operacao profissional';
    }

    return 'Equilibrio entre visibilidade, recorrencia e conversao';
  };

  const getComparisonValue = (plan: (typeof plansRaw)[number], featureId: string): string | boolean => {
    const directValue = plan.comparison?.[featureId];
    if (directValue !== undefined) {
      return formatComparisonValue(directValue);
    }

    const fallbackMap: Record<string, string | boolean> = {
      photos: formatNumericValue(plan.max_ads),
      ad_validity:
        plan.ad_duration_days && plan.ad_duration_days < 9999
          ? `${plan.ad_duration_days} dias`
          : 'Publicacao permanente',
      highlight_badge: plan.has_verification_badge,
      click_reports: true,
      whatsapp_button: plan.lead_contact_limit_days !== null,
      search_priority:
        (plan.home_highlight_count || 0) > 0
          ? 'Alta'
          : (plan.category_highlights_count || 0) > 0
            ? 'Media'
            : 'Padrao',
    };

    return formatComparisonValue(fallbackMap[featureId] ?? '-');
  };

  const handleSubscribe = async (
    planId: string,
    planName: string,
    monthlyPrice: number,
    yearlyPrice: number,
    description?: string | null
  ) => {
    if (isCustomPlan(planName)) {
      const contactLink = getCustomPlanContactLink(planName);
      window.open(contactLink, '_blank');
      return;
    }

    if (!user) {
      toast.error('Voce precisa estar logado para assinar um plano.');
      setTimeout(() => {
        window.location.href = '/#/login?redirect=/pricing';
      }, 1500);
      return;
    }

    const amount =
      billingCycle === 'monthly'
        ? monthlyPrice
        : calculateYearlyTotal(monthlyPrice, yearlyPrice);

    setLoadingPlanId(planId);
    toast.loading('Preparando checkout...', { id: 'checkout-loading' });

    try {
      const result = await initiateCheckout({
        planId,
        planName,
        planDescription: description || `Plano ${planName}`,
        billingCycle,
        amount,
        userId: user.id,
      });

      toast.dismiss('checkout-loading');

      if (result.success) {
        toast.success('Redirecionando para checkout...');
      } else {
        toast.error(result.error || 'Erro ao processar checkout.');
      }
    } catch (err) {
      toast.dismiss('checkout-loading');
      console.error('Erro ao iniciar checkout:', err);
      toast.error('Erro inesperado ao processar checkout.');
    } finally {
      setLoadingPlanId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_28%,#f8fafc_100%)]">
      <section className="relative overflow-hidden bg-slate-950 px-4 pb-36 pt-24 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_24%)]" />
        <div className="relative mx-auto max-w-7xl text-center">
          <span className="mb-6 inline-block rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-green-300">
            Crescimento Sustentavel
          </span>
          <h1 className="font-display text-4xl font-black leading-tight tracking-tight md:text-6xl">
            Escolha o plano ideal para
            <br className="hidden md:block" />
            <span className="text-green-400"> vender com mais tracao</span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-base font-medium text-slate-300 md:text-xl">
            Cards pensados para decisao rapida, com a comparacao tecnica completa logo abaixo para
            quem quer ir a fundo.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <span
              className={`text-sm font-bold transition-colors ${
                billingCycle === 'monthly' ? 'text-white' : 'text-slate-500'
              }`}
            >
              Mensal
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className="relative h-8 w-16 rounded-full border border-slate-700 bg-slate-800 p-1 transition-all"
            >
              <div
                className={`h-6 w-6 rounded-full bg-green-500 shadow-lg transition-transform duration-300 ${
                  billingCycle === 'yearly' ? 'translate-x-8' : 'translate-x-0'
                }`}
              />
            </button>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-bold transition-colors ${
                  billingCycle === 'yearly' ? 'text-white' : 'text-slate-500'
                }`}
              >
                Anual
              </span>
              <span className="rounded bg-green-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                economia
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto -mt-20 max-w-7xl px-4">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
          {plansLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`plan-skeleton-${index}`}
                className="h-[430px] animate-pulse rounded-[2rem] border border-slate-100 bg-white shadow-xl"
              />
            ))
          ) : plansRaw.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-slate-100 bg-white p-8 text-center">
              <p className="text-sm text-slate-500">Nenhum plano disponivel no momento.</p>
            </div>
          ) : (
            plansRaw.map((plan) => {
              const displayPrice = getDisplayPrice(plan.monthly_price, plan.yearly_price);
              const yearlySavings = calculateYearlySavings(plan.monthly_price, plan.yearly_price);
              const summary = getPlanSummary(plan);
              const badges = getPlanBadges(plan);

              return (
                <div
                  key={plan.id}
                  className={`flex min-h-[430px] flex-col rounded-[2rem] border bg-white p-7 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] transition-all duration-300 ${
                    plan.is_popular
                      ? 'border-green-500 ring-4 ring-green-100'
                      : 'border-slate-200/70 hover:-translate-y-1'
                  }`}
                >
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
                        {plan.is_popular ? 'Mais popular' : 'Plano BWAGRO'}
                      </p>
                      <h3 className="text-2xl font-black text-slate-950">{plan.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">{plan.description}</p>
                    </div>
                    {plan.is_popular && (
                      <span className="rounded-full bg-green-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                        Escolha segura
                      </span>
                    )}
                  </div>

                  <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white">
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-bold text-slate-400">R$</span>
                      <span className="text-5xl font-black tracking-tighter">
                        {formatCurrency(displayPrice)}
                      </span>
                      <span className="text-sm font-medium text-slate-400">/mes</span>
                    </div>
                    {billingCycle === 'yearly' && plan.yearly_price > 0 ? (
                      <p className="mt-3 text-sm font-semibold text-green-300">
                        Cobranca anual: R$ {formatCurrency(plan.yearly_price)}
                        {yearlySavings.amount > 0
                          ? ` | economia de ${yearlySavings.percentage}%`
                          : ''}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm font-semibold text-slate-400">{getPlanSpotlight(plan)}</p>
                    )}
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                        Anuncios
                      </p>
                      <p className="mt-2 text-lg font-black text-slate-900">
                        {formatNumericValue(plan.max_ads)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                        Categoria
                      </p>
                      <p className="mt-2 text-lg font-black text-slate-900">
                        {plan.category_highlights_count || 0}x
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                        Home
                      </p>
                      <p className="mt-2 text-lg font-black text-slate-900">
                        {plan.home_highlight_count || 0}x
                      </p>
                    </div>
                  </div>

                  <ul className="mt-6 space-y-3">
                    {summary.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm font-medium text-slate-700">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" strokeWidth={2} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {badges.length > 0 ? (
                      badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600"
                        >
                          {badge}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">
                        Plano enxuto para operacao essencial
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-6">
                    <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                      {getPlanSpotlight(plan)}
                    </div>

                    <button
                      onClick={() =>
                        handleSubscribe(
                          plan.id,
                          plan.name,
                          plan.monthly_price,
                          plan.yearly_price,
                          plan.description
                        )
                      }
                      disabled={loadingPlanId === plan.id}
                      className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-black transition-all disabled:cursor-not-allowed disabled:opacity-70 ${
                        plan.is_popular
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {loadingPlanId === plan.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        plan.button_text || 'Assinar agora'
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl overflow-hidden px-4 py-28">
        <div className="mb-14 text-center">
          <h2 className="font-display text-3xl font-black text-slate-950">Comparacao Tecnica</h2>
          <p className="mt-3 text-slate-500">
            Aqui estao os detalhes completos para comparar o impacto operacional de cada plano.
          </p>
        </div>

        <div className="overflow-x-auto rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_-50px_rgba(15,23,42,0.35)]">
          {plansLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">Carregando comparacao de planos...</div>
          ) : plansRaw.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhum plano disponivel para comparacao.
            </div>
          ) : (
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-8 py-6 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Funcionalidade
                  </th>
                  {plansRaw.map((plan) => (
                    <th key={plan.id} className="px-6 py-6 text-center">
                      <div className="text-sm font-black text-slate-900">{plan.name}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-400">
                        R$ {formatCurrency(getDisplayPrice(plan.monthly_price, plan.yearly_price))}/mes
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((feature, index) => (
                  <tr
                    key={feature.id}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                  >
                    <td className="px-8 py-5 text-sm font-bold text-slate-700">{feature.label}</td>
                    {plansRaw.map((plan) => {
                      const value = getComparisonValue(plan, feature.id);
                      return (
                        <td key={plan.id} className="px-6 py-5 text-center">
                          {typeof value === 'boolean' ? (
                            value ? (
                              <div className="flex justify-center">
                                <span className="inline-flex rounded-full bg-green-100 p-2 text-green-700">
                                  <Check className="h-4 w-4" strokeWidth={2.5} />
                                </span>
                              </div>
                            ) : (
                              <div className="flex justify-center">
                                <span className="inline-flex rounded-full bg-slate-100 p-2 text-slate-300">
                                  <X className="h-4 w-4" strokeWidth={2.5} />
                                </span>
                              </div>
                            )
                          ) : (
                            <span className="text-sm font-black text-slate-800">{value}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="bg-slate-50 py-28">
        <div className="mx-auto max-w-4xl px-4">
          <div className="mb-14 text-center">
            <h2 className="font-display text-3xl font-black text-slate-900">Duvidas Frequentes</h2>
            <p className="mt-3 text-slate-500">
              Tudo o que voce precisa saber sobre as assinaturas BWAGRO.
            </p>
          </div>

          <div className="space-y-4">
            {PRICING_FAQ.map((faq, idx) => (
              <div
                key={idx}
                className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"
              >
                <button
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="flex w-full items-center justify-between p-6 text-left"
                >
                  <span className="font-bold text-slate-800">{faq.question}</span>
                  <ChevronDown
                    className={`h-5 w-5 text-slate-400 transition-transform ${
                      activeFaq === idx ? 'rotate-180 text-green-600' : ''
                    }`}
                    strokeWidth={1.5}
                  />
                </button>
                {activeFaq === idx && (
                  <div className="border-t border-slate-50 px-6 pb-6 pt-4 text-sm leading-relaxed text-slate-500">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default PricingView;
