import React, { useMemo, useState } from 'react';
import { BarChart3, Check, ChevronDown, Loader2, Megaphone, ShieldCheck, Telescope, X } from 'lucide-react';
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
import {
  getEffectiveLeadContactLimitDays,
  getEffectivePlanValidityDays,
} from '../src/utils/subscriptionUsageWindow';

type BillingCycle = 'monthly' | 'yearly';

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getBillingCycleLabel = (billingCycle: BillingCycle) =>
  billingCycle === 'monthly' ? 'Mensal' : 'Anual';

const isFreeMonthlyOnlyPlan = (plan: Plan) =>
  (plan.monthly_price ?? 0) <= 0 && (plan.yearly_price ?? 0) <= 0;

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

  const scrollToSection = (sectionId: string) => {
    if (typeof document === 'undefined') return;

    const section = document.getElementById(sectionId);
    if (!section) return;

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const topBenefitCards = [
    {
      title: 'Mais visibilidade',
      description: 'Destaques em categoria e home colocam seu anuncio em vitrines mais nobres da plataforma.',
      icon: Megaphone,
    },
    {
      title: 'Mais contatos qualificados',
      description: 'Ganhe mais tempo de acesso aos leads e mantenha a conversa ativa enquanto a negociação acontece.',
      icon: ShieldCheck,
    },
    {
      title: 'Mais inteligencia comercial',
      description: 'Use radar, relatorios e recursos premium para entender melhor sua demanda e acelerar a venda.',
      icon: BarChart3,
    },
  ];

  const visibilitySteps = [
    'Publique seu anuncio com uma apresentacao profissional',
    'Ative mais exposição com destaques e vitrine premium',
    'Receba contatos, acompanhe o radar e feche mais negócios',
  ];

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
        id: 'plan_validity_days',
        label:
          billingCycle === 'monthly'
            ? 'Validade do plano no ciclo mensal'
            : 'Validade do plano no ciclo anual',
        getValue: (plan) =>
          formatNumericValue(getEffectivePlanValidityDays(plan, billingCycle), ' dias'),
      },
      {
        id: 'lead_contact_limit_days',
        label:
          billingCycle === 'monthly'
            ? 'Contato com leads no plano mensal'
            : 'Contato com leads no plano anual',
        getValue: (plan) =>
          formatNumericValue(
            getEffectiveLeadContactLimitDays(plan, billingCycle === 'yearly'),
            ' dias'
          ),
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
  }, [billingCycle, plansRaw]);

  const visiblePlans = useMemo(
    () =>
      plansRaw.filter(
        (plan) =>
          plan.is_active &&
          plan.show_in_public_pricing !== false &&
          (billingCycle === 'yearly' ? !isFreeMonthlyOnlyPlan(plan) : true)
      ),
    [billingCycle, plansRaw]
  );

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
      `${formatNumericValue(
        getEffectiveLeadContactLimitDays(plan, billingCycle === 'yearly'),
        ' dias'
      )} de contato com leads`,
    ];

    if ((plan.home_highlight_count || 0) > 0) {
      summary[2] = `${plan.home_highlight_count} destaque${plan.home_highlight_count > 1 ? 's' : ''} na home`;
    }

    return summary;
  };

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
      toast.error('Você precisa estar logado para assinar um plano.');
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
        toast.success(`Redirecionando para checkout ${getBillingCycleLabel(billingCycle).toLowerCase()}...`);
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
      toast.error('Você precisa estar logado para comprar um booster.');
      setTimeout(() => {
        window.location.href = '/#/login?redirect=/pricing';
      }, 1500);
      return;
    }

    if (!boosterSummary.canPurchase) {
      toast.error('Você atingiu o limite de 2 boosters a cada 30 dias.');
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
      <section className="relative overflow-hidden px-4 pb-24 pt-24 text-white" style={{ backgroundColor: settings.secondaryColor }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at top left, color-mix(in srgb, ${settings.primaryColor} 18%, transparent), transparent 32%), radial-gradient(circle at top right, color-mix(in srgb, ${settings.accentColor} 18%, transparent), transparent 24%)` }} />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr,0.85fr]">
            <div>
              <span className="mb-6 inline-block rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em]" style={{ border: `1px solid color-mix(in srgb, ${settings.primaryColor} 30%, transparent)`, backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 10%, transparent)`, color: `color-mix(in srgb, ${settings.primaryColor} 70%, white)` }}>
                Mais alcance no agro
              </span>
              <h1 className="font-display text-4xl font-black leading-tight tracking-tight md:text-6xl">
                Transforme visibilidade
                <br className="hidden md:block" />
                <span style={{ color: settings.primaryColor }}> em contatos e vendas</span>
              </h1>
              <p className="mt-6 max-w-3xl text-base font-medium text-slate-300 md:text-xl">
                A pagina de planos agora explica o valor antes do preco: mais exibicao para seus anuncios,
                mais contatos qualificados e mais recursos para acompanhar sua demanda dentro da BWAGRO.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => scrollToSection('cards-planos')}
                  className="inline-flex items-center rounded-2xl px-5 py-3 text-sm font-black text-white"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  Ver planos
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('comparativo-tecnico')}
                  className="inline-flex items-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white backdrop-blur"
                >
                  Comparar benefícios
                </button>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 18%, white)` }}
                  >
                    <Telescope className="h-5 w-5" style={{ color: settings.primaryColor }} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Visibilidade comercial</p>
                    <p className="mt-1 text-lg font-black text-white">Anuncios premium aparecem antes e recebem mais atencao</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {visibilitySteps.map((step, index) => (
                    <div key={step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                      <div
                        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                        style={{ backgroundColor: settings.primaryColor }}
                      >
                        {index + 1}
                      </div>
                      <p className="text-sm font-medium text-slate-200">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {topBenefitCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.title} className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 backdrop-blur">
                      <div
                        className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: `color-mix(in srgb, ${settings.accentColor} 18%, white)` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: settings.accentColor }} />
                      </div>
                      <p className="text-base font-black text-white">{card.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

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
          {billingCycle === 'yearly' && (
            <div className="mx-auto mt-5 max-w-2xl rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-200 backdrop-blur">
              <p className="font-semibold text-white">Cobrança anual com benefícios renovados mensalmente.</p>
              <p className="mt-1 text-slate-300">
                Anúncios, destaques e demais limites operacionais são liberados em ciclos mensais dentro da vigência anual.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-50px_rgba(15,23,42,0.35)] lg:p-8">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-[1.5rem] bg-slate-50 p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">O que melhora</p>
              <p className="mt-3 text-lg font-black text-slate-900">Mais exposição para produtos estratégicos</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Destaques e prioridade de vitrine ajudam o seu anuncio a ser visto antes dos demais.
              </p>
            </div>
            <div className="rounded-[1.5rem] bg-slate-50 p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Para quem vende</p>
              <p className="mt-3 text-lg font-black text-slate-900">Mais tempo para responder interessados</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Escolha um plano com janela de contato maior para não perder oportunidades no meio da negociação.
              </p>
            </div>
            <div className="rounded-[1.5rem] bg-slate-50 p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Para crescer</p>
              <p className="mt-3 text-lg font-black text-slate-900">Radar, relatorios e loja fortalecem a operação</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                A página de planos não vende só preço: ela mostra o quanto sua operação pode evoluir com mais recursos.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="cards-planos" className="relative z-20 mx-auto max-w-7xl px-4 pb-4">
        <div className="mb-10 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Escolha seu ritmo</p>
          <h2 className="mt-3 font-display text-3xl font-black text-slate-950">Planos para cada etapa da sua operação</h2>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-500">
            Primeiro entenda o ganho de visibilidade e depois compare os pacotes. A vitrine de compra continua objetiva, mas agora com contexto comercial antes da decisao.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
          {plansLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`plan-skeleton-${index}`}
                className="h-[430px] animate-pulse rounded-[2rem] border border-slate-100 bg-white shadow-xl"
              />
            ))
          ) : visiblePlans.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-slate-100 bg-white p-8 text-center">
              <p className="text-sm text-slate-500">Nenhum plano disponivel no momento.</p>
            </div>
          ) : (
            visiblePlans.map((plan) => {
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
                      <div className="mt-3 space-y-1.5 text-sm font-semibold" style={{ color: `color-mix(in srgb, ${settings.primaryColor} 55%, white)` }}>
                        <p>
                          Cobranca anual: R$ {formatCurrency(plan.yearly_price)}
                          {yearlySavings.amount > 0
                            ? ` | economia de ${yearlySavings.percentage}%`
                            : ''}
                        </p>
                        <p className="text-xs text-slate-300">
                          Benefícios operacionais renovados mensalmente.
                        </p>
                      </div>
                    ) : plan.price_caption?.trim() ? (
                      <p className="mt-3 text-sm font-semibold text-slate-400">
                        {plan.price_caption.trim()}
                      </p>
                    ) : null}
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
                    {plan.show_footer_card !== false && plan.footer_caption?.trim() ? (
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
                            {plan.footer_caption.trim()}
                          </p>
                        </div>
                      </div>
                    ) : null}

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
                        `${plan.button_text || 'Assinar'} ${getBillingCycleLabel(billingCycle)}`
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
                  Compra exclusiva para reforçar vitrines sem banalizar os planos. O consumo continua usando primeiro os créditos do plano e depois o saldo extra do booster.
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
                  showAccountSummary={!!user}
                />
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Como funciona</p>
                  <ul className="mt-4 space-y-3 text-sm text-slate-600">
                    <li>O combo adiciona 5 destaques em categoria e 5 destaques na home.</li>
                    <li>Os créditos extras não expiram e continuam válidos mesmo se o plano for cancelado.</li>
                    <li>Quando você aplica um destaque, o sistema consome primeiro o saldo do plano.</li>
                    <li>Depois disso, o uso passa automaticamente para o saldo do booster.</li>
                    <li>Se houver uso, a compra deixa de ser reembolsavel.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section id="comparativo-tecnico" className="mx-auto max-w-6xl overflow-hidden px-4 py-28">
        <div className="mb-14 text-center">
          <h2 className="font-display text-3xl font-black text-slate-950">Comparação Técnica</h2>
          <p className="mt-3 text-slate-500">
            Aqui estao os detalhes completos para comparar o impacto operacional de cada plano.
          </p>
        </div>

        <div className="overflow-x-auto rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_-50px_rgba(15,23,42,0.35)]">
          {plansLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">Carregando comparação de planos...</div>
          ) : visiblePlans.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhum plano disponível para comparação.
            </div>
          ) : (
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-8 py-6 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Funcionalidade
                  </th>
                  {visiblePlans.map((plan) => (
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
                    {visiblePlans.map((plan) => {
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
              Tudo o que você precisa saber sobre as assinaturas BWAGRO.
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
