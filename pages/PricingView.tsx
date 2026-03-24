import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { PRICING_FAQ } from '../constants';
import { usePlans } from '../src/hooks/usePlans';
import { useAuth } from '../src/contexts/AuthContext';
import {
  calculateYearlySavings,
  calculateYearlyTotal,
  getCustomPlanContactLink,
  initiateCheckout,
  initiateBoosterCheckout,
  isCustomPlan,
} from '../services/mercadoPagoService';
import toast from 'react-hot-toast';
import { useLayout } from '../src/contexts/LayoutContext';
import { Plan } from '../src/hooks/usePlans';
import { useHighlightBoosters } from '../src/hooks/useHighlightBoosters';
import HighlightBoosterCard from '../components/boosters/HighlightBoosterCard';

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

type ComparisonRow = {
  id: string;
  label: string;
  getValue: (plan: Plan) => string | boolean;
};

const humanizeComparisonKey = (key: string) =>
  key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const PricingView: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const { plansRaw, isLoading: plansLoading } = usePlans();
  const { user } = useAuth();
  const { settings } = useLayout();
  const {
    boosters,
    summary: boosterSummary,
    isLoading: boostersLoading,
    refresh: refreshBoosters,
  } = useHighlightBoosters();

  const comparisonRows = useMemo<ComparisonRow[]>(() => {
    const baseRows: ComparisonRow[] = [
      {
        id: 'max_ads',
        label: 'Máximo de anúncios ativos',
        getValue: (plan) => (plan.max_ads === null ? 'Ilimitado' : String(plan.max_ads)),
      },
      {
        id: 'ad_duration_days',
        label: 'Duração do anúncio',
        getValue: (plan) => formatNumericValue(plan.ad_duration_days, ' dias'),
      },
      {
        id: 'expired_deletion_days',
        label: 'Exclusão após vencimento',
        getValue: (plan) => formatNumericValue(plan.expired_deletion_days, ' dias'),
      },
      {
        id: 'lead_contact_limit_days',
        label: 'Contato com leads',
        getValue: (plan) => formatNumericValue(plan.lead_contact_limit_days, ' dias'),
      },
      {
        id: 'category_highlights_count',
        label: 'Destaques por categoria',
        getValue: (plan) => String(plan.category_highlights_count || 0),
      },
      {
        id: 'category_highlight_days',
        label: 'Duração do destaque na categoria',
        getValue: (plan) =>
          (plan.category_highlights_count || 0) > 0
            ? formatNumericValue(plan.category_highlight_days, ' dias')
            : '-',
      },
      {
        id: 'home_highlight_count',
        label: 'Destaques na home',
        getValue: (plan) => String(plan.home_highlight_count || 0),
      },
      {
        id: 'home_highlight_days',
        label: 'Duração do destaque na home',
        getValue: (plan) =>
          (plan.home_highlight_count || 0) > 0
            ? formatNumericValue(plan.home_highlight_days, ' dias')
            : '-',
      },
      {
        id: 'has_verification_badge',
        label: 'Selo de verificação',
        getValue: (plan) => plan.has_verification_badge,
      },
      {
        id: 'has_seller_store',
        label: 'Loja do vendedor',
        getValue: (plan) => plan.has_seller_store,
      },
      {
        id: 'has_email_marketing',
        label: 'E-mail marketing',
        getValue: (plan) => plan.has_email_marketing,
      },
      {
        id: 'social_campaigns_per_month',
        label: 'Campanhas sociais por mês',
        getValue: (plan) =>
          plan.social_campaigns_per_month && plan.social_campaigns_per_month > 0
            ? String(plan.social_campaigns_per_month)
            : '-',
      },
      {
        id: 'radar_max_alerts',
        label: 'Alertas do radar',
        getValue: (plan) => String(plan.radar_max_alerts || 0),
      },
      {
        id: 'radar_has_radius',
        label: 'Filtro por raio no radar',
        getValue: (plan) => plan.radar_has_radius,
      },
      {
        id: 'radar_has_keywords',
        label: 'Filtro por palavras-chave',
        getValue: (plan) => plan.radar_has_keywords,
      },
      {
        id: 'radar_has_price_filter',
        label: 'Filtro por faixa de preço',
        getValue: (plan) => plan.radar_has_price_filter,
      },
    ];

    const extraKeys = Array.from(
      new Set(
        plansRaw.flatMap((plan) =>
          Object.keys(plan.comparison || {}).filter(
            (key) => !baseRows.some((row) => row.id === key)
          )
        )
      )
    );

    const extraRows: ComparisonRow[] = extraKeys.map((key) => ({
      id: key,
      label: humanizeComparisonKey(key),
      getValue: (plan) => formatComparisonValue(plan.comparison?.[key] ?? '-'),
    }));

    return [...baseRows, ...extraRows];
  }, [plansRaw]);

  const getDisplayPrice = (monthlyPrice: number, yearlyPrice: number) => {
    if (billingCycle === 'monthly') {
      return monthlyPrice;
    }

    return yearlyPrice > 0 ? yearlyPrice / 12 : monthlyPrice;
  };

  const getPlanSummary = (plan: (typeof plansRaw)[number]) => {
    if (plan.display_features && plan.display_features.length > 0) {
      return plan.display_features.filter(Boolean);
    }

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

  const getDefaultSpotlight = (plan: (typeof plansRaw)[number]) => {
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

  const getPlanPriceCaption = (plan: (typeof plansRaw)[number]) =>
    plan.price_caption?.trim() || getDefaultSpotlight(plan);

  const getPlanFooterCaption = (plan: (typeof plansRaw)[number]) =>
    plan.footer_caption?.trim() || getDefaultSpotlight(plan);

  const getComparisonValue = (
    plan: (typeof plansRaw)[number],
    row: ComparisonRow
  ): string | boolean => {
    const directValue = plan.comparison?.[row.id];
    if (directValue !== undefined) {
      return formatComparisonValue(directValue);
    }

    return formatComparisonValue(row.getValue(plan));
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

  const handleBoosterPurchase = async () => {
    const booster = boosters[0];

    if (!booster) {
      toast.error('Nenhum booster disponivel no momento.');
      return;
    }

    if (!user) {
      toast.error('Voce precisa estar logado para comprar um booster.');
      setTimeout(() => {
        window.location.href = '/#/login?redirect=/pricing';
      }, 1500);
      return;
    }

    if (!boosterSummary.canPurchase) {
      toast.error('Voce atingiu o limite de 2 boosters a cada 30 dias.');
      return;
    }

    setLoadingPlanId(`booster-${booster.id}`);
    toast.loading('Preparando checkout do booster...', { id: 'booster-checkout-loading' });

    try {
      const result = await initiateBoosterCheckout({
        boosterId: booster.id,
        boosterName: booster.name,
        boosterDescription: booster.description || booster.name,
        amount: booster.monthlyPrice,
        userId: user.id,
      });

      toast.dismiss('booster-checkout-loading');

      if (result.success) {
        toast.success('Redirecionando para checkout...');
        await refreshBoosters();
      } else {
        toast.error(result.error || 'Erro ao processar checkout do booster.');
      }
    } catch (err) {
      toast.dismiss('booster-checkout-loading');
      console.error('Erro ao iniciar checkout do booster:', err);
      toast.error('Erro inesperado ao processar checkout do booster.');
    } finally {
      setLoadingPlanId(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, ${settings.backgroundColor} 0%, #ffffff 28%, ${settings.backgroundColor} 100%)` }}>
      <section className="relative overflow-hidden px-4 pb-36 pt-24 text-white" style={{ backgroundColor: settings.secondaryColor }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at top left, color-mix(in srgb, ${settings.primaryColor} 18%, transparent), transparent 32%), radial-gradient(circle at top right, color-mix(in srgb, ${settings.accentColor} 18%, transparent), transparent 24%)` }} />
        <div className="relative mx-auto max-w-7xl text-center">
          <span className="mb-6 inline-block rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em]" style={{ border: `1px solid color-mix(in srgb, ${settings.primaryColor} 30%, transparent)`, backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 10%, transparent)`, color: `color-mix(in srgb, ${settings.primaryColor} 70%, white)` }}>
            Crescimento Sustentavel
          </span>
          <h1 className="font-display text-4xl font-black leading-tight tracking-tight md:text-6xl">
            Escolha o plano ideal para
            <br className="hidden md:block" />
            <span style={{ color: settings.primaryColor }}> vender com mais tracao</span>
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
                className={`h-6 w-6 rounded-full shadow-lg transition-transform duration-300 ${
                  billingCycle === 'yearly' ? 'translate-x-8' : 'translate-x-0'
                }`}
                style={{ backgroundColor: settings.primaryColor }}
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
              <span className="rounded px-2 py-0.5 text-[10px] font-black uppercase text-white" style={{ backgroundColor: settings.primaryColor }}>
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

              return (
                <div
                  key={plan.id}
                  className={`flex min-h-[430px] flex-col rounded-[2rem] border bg-white p-7 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] transition-all duration-300 ${
                    plan.is_popular
                      ? ''
                      : 'border-slate-200/70 hover:-translate-y-1'
                  }`}
                  style={plan.is_popular ? { borderColor: settings.primaryColor, boxShadow: `0 0 0 4px color-mix(in srgb, ${settings.primaryColor} 16%, white)` } : undefined}
                >
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
                        {plan.card_eyebrow?.trim() || 'Plano BWAGRO'}
                      </p>
                      <h3 className="text-2xl font-black text-slate-950">{plan.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">{plan.description}</p>
                    </div>
                    {plan.is_popular && (
                      <span className="whitespace-nowrap rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white" style={{ backgroundColor: settings.primaryColor }}>
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
                      <p className="mt-3 text-sm font-semibold" style={{ color: `color-mix(in srgb, ${settings.primaryColor} 55%, white)` }}>
                        Cobranca anual: R$ {formatCurrency(plan.yearly_price)}
                        {yearlySavings.amount > 0
                          ? ` | economia de ${yearlySavings.percentage}%`
                          : ''}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm font-semibold text-slate-400">
                        {getPlanPriceCaption(plan)}
                      </p>
                    )}
                  </div>

                  <ul className="mt-6 min-h-[176px] space-y-3 overflow-y-auto pr-2">
                    {summary.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm font-medium text-slate-700">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={2} style={{ color: settings.primaryColor }} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-6">
                    <div
                      className="relative mb-4 overflow-hidden rounded-2xl border px-4 py-4 text-sm font-semibold text-slate-700 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.4)]"
                      style={{
                        borderColor: `color-mix(in srgb, ${settings.primaryColor} 28%, #e2e8f0)`,
                        background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 11%, white) 0%, color-mix(in srgb, ${settings.accentColor} 12%, white) 100%)`
                      }}
                    >
                      <div
                        className="pointer-events-none absolute inset-x-0 top-0 h-px"
                        style={{ background: `linear-gradient(90deg, transparent, ${settings.accentColor}, transparent)` }}
                      />
                      <div
                        className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-30"
                        style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 30%, white)` }}
                      />
                      <div className="relative">
                        <p className="leading-relaxed text-slate-700">
                          {getPlanFooterCaption(plan)}
                        </p>
                      </div>
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
                          ? 'text-white'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                      style={plan.is_popular ? { backgroundColor: settings.primaryColor } : undefined}
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

      {(boostersLoading || boosters.length > 0) && (
        <section className="mx-auto max-w-7xl px-4 pt-12">
          <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_24px_80px_-50px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
                  Booster Avulso
                </p>
                <h2 className="text-2xl font-black text-slate-950">Mais destaque quando sua campanha pedir reforco</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  Compra exclusiva para reforcar vitrines sem banalizar os planos. O consumo continua usando primeiro os creditos do plano e depois o saldo extra do booster.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Limite de compra</span>
                <span className="font-bold text-slate-900">Ate 2 boosters a cada 30 dias</span>
              </div>
            </div>

            {boostersLoading ? (
              <div className="h-[220px] animate-pulse rounded-[1.5rem] border border-slate-100 bg-slate-50" />
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr,0.8fr]">
                <HighlightBoosterCard
                  booster={boosters[0]}
                  summary={boosterSummary}
                  onPurchase={handleBoosterPurchase}
                  loading={loadingPlanId === `booster-${boosters[0].id}`}
                />
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Como funciona</p>
                  <ul className="mt-4 space-y-3 text-sm text-slate-600">
                    <li>O combo adiciona 5 destaques em categoria e 5 destaques na home.</li>
                    <li>Os creditos extras nao expiram e continuam validos mesmo se o plano for cancelado.</li>
                    <li>Quando voce aplica um destaque, o sistema consome primeiro o saldo do plano.</li>
                    <li>Depois disso, o uso passa automaticamente para o saldo do booster.</li>
                    <li>Se houver uso, a compra deixa de ser reembolsavel.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

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
                      const value = getComparisonValue(plan, feature);
                      return (
                        <td key={plan.id} className="px-6 py-5 text-center">
                          {typeof value === 'boolean' ? (
                            value ? (
                              <div className="flex justify-center">
                                <span className="inline-flex rounded-full p-2" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)`, color: settings.primaryColor }}>
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
                      activeFaq === idx ? 'rotate-180' : ''
                    }`}
                    style={activeFaq === idx ? { color: settings.primaryColor } : undefined}
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
