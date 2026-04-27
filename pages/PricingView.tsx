import React, { useMemo, useState } from 'react';
import { ArrowRight, Award, BarChart3, Check, ChevronDown, Loader2, MapPin, Megaphone, PlayCircle, ShieldCheck, Sparkles, Star, Store, TrendingUp, Users, X, Zap } from 'lucide-react';
import { PRICING_FAQ } from '../constants';
import { usePlans } from '../src/hooks/usePlans';
import { useAuth } from '../src/contexts/AuthContext';
import { calculateYearlySavings, calculateYearlyTotal, getCustomPlanContactLink, initiateBoosterCheckout, initiateCheckout, isCustomPlan } from '../services/mercadoPagoService';
import toast from 'react-hot-toast';
import { useLayout } from '../src/contexts/LayoutContext';
import { Plan } from '../src/hooks/usePlans';
import { useHighlightBoosters } from '../src/hooks/useHighlightBoosters';
import HighlightBoosterCard from '../components/boosters/HighlightBoosterCard';
import { getEffectiveLeadContactLimitDays, getEffectivePlanValidityDays } from '../src/utils/subscriptionUsageWindow';

type BillingCycle = 'monthly' | 'yearly';
type ComparisonRow = { id: string; label: string; getValue: (plan: Plan) => string | boolean };

const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const getBillingCycleLabel = (billingCycle: BillingCycle) => billingCycle === 'monthly' ? 'Mensal' : 'Anual';
const isFreeMonthlyOnlyPlan = (plan: Plan) => (plan.monthly_price ?? 0) <= 0 && (plan.yearly_price ?? 0) <= 0;
const formatNumericValue = (value: number | null | undefined, suffix = '') => value === null || value === undefined ? 'Sob consulta' : `${value}${suffix}`;
const formatComparisonValue = (value: unknown): string | boolean => typeof value === 'boolean' ? value : value === null || value === undefined || value === '' ? '-' : String(value);
const humanizeComparisonKey = (key: string) => key.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (char) => char.toUpperCase());
const normalizePlanName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const isLegacyStartSignupPlanName = (planName: string) =>
  ['start', 'start agro', 'safra'].includes(normalizePlanName(planName || ''));

const PricingView: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const { plansRaw, isLoading: plansLoading } = usePlans();
  const { user } = useAuth();
  const { settings } = useLayout();
  const { boosters, summary: boosterSummary, isLoading: boostersLoading, refresh: refreshBoosters } = useHighlightBoosters();
  const visiblePricingFaq = useMemo(
    () => PRICING_FAQ
      .filter((faq) => faq.question !== 'Posso cancelar minha assinatura a qualquer momento?')
      .map((faq) => (
        faq.question === 'Existe limite de anÃºncios por conta?'
          ? {
              ...faq,
              answer: 'No plano gratuito, há limitação de anúncios ativos. Já nos planos pagos, é possível manter múltiplos anúncios simultaneamente.',
            }
          : faq
      ))
      .concat({
        question: 'Os benefícios dos planos anuais são acumulativos?',
        answer: 'Os benefícios dos planos não são acumulativos. Eles são disponibilizados e renovados mensalmente ao longo do período contratado, mantendo a mesma estrutura de vantagens durante toda a vigência do plano.',
      }),
    []
  );

  const scrollToSection = (sectionId: string) => {
    if (typeof document === 'undefined') return;
    const section = document.getElementById(sectionId);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const partnerStoreFeatures = [
    { title: 'Logo, capa e identidade visual', description: 'Dê à sua empresa uma vitrine própria, com presença muito mais forte dentro da plataforma.', icon: Sparkles },
    { title: 'Catálogo organizado e banners', description: 'Escolha a ordem da vitrine e destaque produtos estratégicos com mais intenção comercial.', icon: Store },
    { title: 'Vídeos e mídia rica', description: 'Mostre produtos em ação e aumente a percepção de valor com materiais mais completos.', icon: PlayCircle },
    { title: 'Página de loja profissional', description: 'Transforme anúncios em uma experiência de marca com cara de operação estruturada.', icon: ShieldCheck },
  ];

  const comparisonRows = useMemo<ComparisonRow[]>(() => {
    const baseRows: ComparisonRow[] = [
      { id: 'max_ads', label: 'Maximo de anuncios ativos', getValue: (plan) => (plan.max_ads === null ? 'Ilimitado' : String(plan.max_ads)) },
      { id: 'ad_duration_days', label: 'Duracao do anuncio', getValue: (plan) => formatNumericValue(plan.ad_duration_days, ' dias') },
      { id: 'expired_deletion_days', label: 'Exclusao apos vencimento', getValue: (plan) => formatNumericValue(plan.expired_deletion_days, ' dias') },
      { id: 'plan_validity_days', label: billingCycle === 'monthly' ? 'Validade do plano no ciclo mensal' : 'Validade do plano no ciclo anual', getValue: (plan) => formatNumericValue(getEffectivePlanValidityDays(plan, billingCycle), ' dias') },
      { id: 'lead_contact_limit_days', label: billingCycle === 'monthly' ? 'Contato com leads no plano mensal' : 'Contato com leads no plano anual', getValue: (plan) => formatNumericValue(getEffectiveLeadContactLimitDays(plan, billingCycle === 'yearly'), ' dias') },
      { id: 'category_highlights_count', label: 'Destaques por categoria', getValue: (plan) => String(plan.category_highlights_count || 0) },
      { id: 'category_highlight_days', label: 'Duracao do destaque na categoria', getValue: (plan) => (plan.category_highlights_count || 0) > 0 ? formatNumericValue(plan.category_highlight_days, ' dias') : '-' },
      { id: 'home_highlight_count', label: 'Destaques na home', getValue: (plan) => String(plan.home_highlight_count || 0) },
      { id: 'home_highlight_days', label: 'Duracao do destaque na home', getValue: (plan) => (plan.home_highlight_count || 0) > 0 ? formatNumericValue(plan.home_highlight_days, ' dias') : '-' },
      { id: 'has_verification_badge', label: 'Selo de verificacao', getValue: (plan) => plan.has_verification_badge },
      { id: 'has_seller_store', label: 'Loja do vendedor', getValue: (plan) => plan.has_seller_store },
      { id: 'has_email_marketing', label: 'E-mail marketing', getValue: (plan) => plan.has_email_marketing },
      { id: 'social_campaigns_per_month', label: 'Campanhas sociais por mes', getValue: (plan) => plan.social_campaigns_per_month && plan.social_campaigns_per_month > 0 ? String(plan.social_campaigns_per_month) : '-' },
      { id: 'radar_max_alerts', label: 'Alertas do radar', getValue: (plan) => String(plan.radar_max_alerts || 0) },
      { id: 'radar_has_radius', label: 'Filtro por raio no radar', getValue: (plan) => plan.radar_has_radius },
      { id: 'radar_has_keywords', label: 'Filtro por palavras-chave', getValue: (plan) => plan.radar_has_keywords },
      { id: 'radar_has_price_filter', label: 'Filtro por faixa de preco', getValue: (plan) => plan.radar_has_price_filter },
    ];
    const extraKeys = Array.from(new Set(plansRaw.flatMap((plan) => Object.keys(plan.comparison || {}).filter((key) => !baseRows.some((row) => row.id === key)))));
    return [...baseRows, ...extraKeys.map((key) => ({ id: key, label: humanizeComparisonKey(key), getValue: (plan: Plan) => formatComparisonValue(plan.comparison?.[key] ?? '-') }))];
  }, [billingCycle, plansRaw]);

  const visiblePlans = useMemo(() => plansRaw.filter((plan) => plan.is_active && plan.show_in_public_pricing !== false && (billingCycle === 'yearly' ? !isFreeMonthlyOnlyPlan(plan) : true)), [billingCycle, plansRaw]);
  const getDisplayPrice = (monthlyPrice: number, yearlyPrice: number) =>
    billingCycle === 'monthly'
      ? monthlyPrice
      : yearlyPrice > 0
        ? yearlyPrice
        : monthlyPrice;
  const getPlanSummary = (plan: Plan) => {
    if (plan.display_features?.length) return plan.display_features.filter(Boolean);
    const summary = [`Ate ${formatNumericValue(plan.max_ads)} anuncios ativos`, `${plan.category_highlights_count || 0} destaques por categoria`, `${formatNumericValue(getEffectiveLeadContactLimitDays(plan, billingCycle === 'yearly'), ' dias')} de contato com leads`];
    if ((plan.home_highlight_count || 0) > 0) summary[2] = `${plan.home_highlight_count} destaque${plan.home_highlight_count > 1 ? 's' : ''} na home`;
    return summary;
  };
  const getComparisonValue = (plan: Plan, row: ComparisonRow) => formatComparisonValue(plan.comparison?.[row.id] ?? row.getValue(plan));
  const hasConsumedStartPlan = Boolean(user?.startPlanConsumedAt);
  const hasExplicitDefaultSignupPlan = useMemo(
    () => plansRaw.some((plan) => plan.is_default_signup_plan),
    [plansRaw]
  );
  const isCurrentSignupPlan = (plan: Plan) =>
    hasExplicitDefaultSignupPlan
      ? Boolean(plan.is_default_signup_plan)
      : isLegacyStartSignupPlanName(plan.name || '');
  const isStartPlanLockedForUser = (plan: Plan) => Boolean(user && hasConsumedStartPlan && isCurrentSignupPlan(plan));

  const handleSubscribe = async (planId: string, planName: string, monthlyPrice: number, yearlyPrice: number, description?: string | null) => {
    const selectedPlan = plansRaw.find((plan) => plan.id === planId);
    if (selectedPlan && isStartPlanLockedForUser(selectedPlan)) {
      toast.error('O plano Start está disponível apenas no cadastro.', {
        duration: 5000,
      });
      return;
    }

    if (isCustomPlan(planName)) return void window.open(getCustomPlanContactLink(planName), '_blank');
    if (!user) {
      toast.error('Voce precisa estar logado para assinar um plano.');
      setTimeout(() => { window.location.href = '/#/login?redirect=/pricing'; }, 1500);
      return;
    }
    const amount = billingCycle === 'monthly' ? monthlyPrice : calculateYearlyTotal(monthlyPrice, yearlyPrice);
    setLoadingPlanId(planId);
    toast.loading('Preparando checkout...', { id: 'checkout-loading' });
    try {
      const result = await initiateCheckout({ planId, planName, planDescription: description || `Plano ${planName}`, billingCycle, amount, userId: user.id });
      toast.dismiss('checkout-loading');
      result.success ? toast.success(`Redirecionando para checkout ${getBillingCycleLabel(billingCycle).toLowerCase()}...`) : toast.error(result.error || 'Erro ao processar checkout.');
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
    if (!booster) return void toast.error('Nenhum booster disponivel no momento.');
    if (!user) {
      toast.error('Voce precisa estar logado para comprar um booster.');
      setTimeout(() => { window.location.href = '/#/login?redirect=/pricing'; }, 1500);
      return;
    }
    if (boosterSummary.requiresPaidPlan && boosterSummary.hasEligiblePaidPlan === false) {
      return void toast.error(boosterSummary.blockedReason || 'Booster disponivel apenas para assinantes com plano pago ativo.');
    }
    if (!boosterSummary.canPurchase) return void toast.error('Voce atingiu o limite de 2 boosters a cada 30 dias.');
    setLoadingPlanId(`booster-${booster.id}`);
    toast.loading('Preparando checkout do booster...', { id: 'booster-checkout-loading' });
    try {
      const result = await initiateBoosterCheckout({ boosterId: booster.id, boosterName: booster.name, boosterDescription: booster.description || booster.name, amount: booster.monthlyPrice, userId: user.id });
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

  const agro = {
    hero: settings.pricingHeroImageUrl || 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1800&q=80',
    field: settings.pricingFieldImageUrl || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1400&q=80',
    store: settings.pricingStoreImageUrl || 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1000&q=80',
  };

  const stats = [
    { value: '+12 mil', label: 'produtores cadastrados' },
    { value: '98%', label: 'satisfação de assinantes' },
    { value: '3×', label: 'mais contatos vs. gratuito' },
    { value: 'R$ 0', label: 'taxa de cadastro' },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] overflow-hidden flex flex-col justify-end pb-0">
        {/* foto de fundo */}
        <div className="absolute inset-0">
          <img src={agro.hero} alt="Plantação agro" className="h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(170deg, ${settings.secondaryColor}ee 0%, ${settings.secondaryColor}cc 40%, ${settings.secondaryColor}99 70%, transparent 100%)` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
        </div>

        {/* conteúdo */}
        <div className="relative mx-auto w-full max-w-7xl px-4 pt-32 pb-16">
          <div className="max-w-3xl">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-white backdrop-blur-sm">
              <MapPin className="h-3 w-3" style={{ color: settings.primaryColor }} />
              Marketplace Agro · Planos e Preços
            </span>
            <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight text-white md:text-[3.75rem]">
              Mais alcance,<br />
              <span style={{ color: settings.primaryColor }}>mais vendas no agro.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-8 text-slate-200 md:text-lg">
              Escolha o plano ideal para sua operação: vitrine premium, contato mais longo com leads, radar de demanda e Loja Parceira para fortalecer sua marca.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={() => scrollToSection('cards-planos')} className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-black text-white shadow-lg transition hover:opacity-90" style={{ backgroundColor: settings.primaryColor }}>
                Ver planos e preços <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => scrollToSection('comparativo-tecnico')} className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-black text-white backdrop-blur-sm transition hover:bg-white/15">
                Comparar benefícios <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* stat bar */}
          <div className="mt-14 grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 backdrop-blur-sm">
                <p className="text-2xl font-black text-white md:text-3xl" style={{ color: settings.primaryColor }}>{s.value}</p>
                <p className="mt-1 text-xs font-semibold text-slate-300">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* onda de transição */}
        <div className="relative h-16 w-full">
          <svg viewBox="0 0 1440 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none" style={{ height: 64 }}>
            <path d="M0 64L1440 64L1440 0C1440 0 1080 64 720 64C360 64 0 0 0 0L0 64Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ── VALOR / POR QUE SUBIR ───────────────────────────── */}
      <section className="bg-white pb-4 pt-10">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-10 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Por que subir de plano</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950">Mais estrutura para atrair, negociar e crescer</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: Megaphone, eyebrow: 'Visibilidade', title: 'Apareça antes dos concorrentes', description: 'Destaques na home e nas categorias colocam seus produtos no topo da vitrine quando o comprador está pesquisando.', accent: settings.primaryColor },
              { icon: Users, eyebrow: 'Contato', title: 'Mais tempo para fechar negócios', description: 'Planos superiores ampliam a janela de contato com leads para que nenhuma negociação fique no meio do caminho.', accent: settings.accentColor },
              { icon: BarChart3, eyebrow: 'Inteligência', title: 'Radar, relatórios e Loja Parceira', description: 'Acompanhe demanda, organize sua operação e ganhe uma vitrine com identidade visual própria dentro da plataforma.', accent: settings.secondaryColor },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="group rounded-[1.75rem] border border-slate-100 bg-white p-7 shadow-[0_8px_40px_-20px_rgba(15,23,42,0.15)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)]">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110" style={{ backgroundColor: `color-mix(in srgb, ${item.accent} 14%, white)` }}>
                    <Icon className="h-6 w-6" style={{ color: item.accent }} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: item.accent }}>{item.eyebrow}</p>
                  <p className="mt-3 text-xl font-black text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-500">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PLANOS ──────────────────────────────────────────── */}
      <section id="cards-planos" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-12 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Escolha seu plano</p>
            <h2 className="mt-3 font-display text-3xl font-black text-slate-950 md:text-4xl">Planos para cada etapa da operação</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-500">Comece grátis e evolua conforme sua operação cresce. Sem taxa de adesão.</p>

            {/* billing toggle */}
            <div className="mx-auto mt-8 inline-flex flex-col items-center gap-4 rounded-[1.75rem] border border-slate-200 bg-white px-8 py-5 shadow-sm">
              <div className="flex items-center gap-4">
                <span className={`text-sm font-bold transition-colors ${billingCycle === 'monthly' ? 'text-slate-900' : 'text-slate-400'}`}>Mensal</span>
                <button
                  type="button"
                  onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                  className="relative h-8 w-16 rounded-full border border-slate-200 bg-slate-100 p-1 transition-all"
                  aria-label={`Alternar cobrança para ${billingCycle === 'monthly' ? 'anual' : 'mensal'}`}
                >
                  <div
                    className={`h-6 w-6 rounded-full shadow-md transition-transform duration-300 ${billingCycle === 'yearly' ? 'translate-x-8' : 'translate-x-0'}`}
                    style={{ backgroundColor: settings.primaryColor }}
                  />
                </button>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold transition-colors ${billingCycle === 'yearly' ? 'text-slate-900' : 'text-slate-400'}`}>Anual</span>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-black uppercase text-white" style={{ backgroundColor: settings.primaryColor }}>Economia</span>
                </div>
              </div>
              {billingCycle === 'yearly' && (
                <p className="max-w-xs text-center text-xs text-slate-500">
                  Cobrança anual • Benefícios renovados mensalmente dentro da vigência.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {plansLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={`sk-${i}`} className="h-[520px] animate-pulse rounded-[2rem] border border-slate-100 bg-white shadow-xl" />
              ))
            : visiblePlans.length === 0
              ? <div className="col-span-full rounded-2xl border border-slate-100 bg-white p-8 text-center"><p className="text-sm text-slate-500">Nenhum plano disponível no momento.</p></div>
              : visiblePlans.map((plan) => {
                  const displayPrice = getDisplayPrice(plan.monthly_price, plan.yearly_price);
                  const yearlySavings = calculateYearlySavings(plan.monthly_price, plan.yearly_price);
                  const summary = getPlanSummary(plan);
                  const popular = plan.is_popular;
                  const startPlanLocked = isStartPlanLockedForUser(plan);
                  return (
                    <div
                      key={plan.id}
                      className={`relative flex flex-col rounded-[2rem] border bg-white transition-all duration-300 ${
                        popular
                          ? 'shadow-[0_32px_80px_-24px_rgba(15,23,42,0.35)]'
                          : 'border-slate-200 shadow-[0_8px_40px_-20px_rgba(15,23,42,0.15)] hover:-translate-y-1 hover:shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)]'
                      }`}
                      style={popular ? { borderColor: settings.primaryColor, borderWidth: 2 } : undefined}
                    >
                      {/* popular badge */}
                      {popular && (
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                          <span className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-lg" style={{ backgroundColor: settings.primaryColor }}>
                            <Star className="h-3 w-3 fill-current" /> Mais popular
                          </span>
                        </div>
                      )}

                      {/* header */}
                      <div
                        className="rounded-t-[calc(2rem-2px)] px-7 pb-6 pt-8"
                        style={popular ? { background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 6%, white) 0%, color-mix(in srgb, ${settings.accentColor} 8%, white) 100%)` } : undefined}
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">{plan.card_eyebrow?.trim() || 'Plano BWAGRO'}</p>
                        <h3 className="mt-2 text-2xl font-black text-slate-950">{plan.name}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500">{plan.description}</p>
                      </div>

                      {/* price block */}
                      <div className="mx-7 rounded-2xl p-5" style={{ backgroundColor: popular ? settings.secondaryColor : '#0f172a' }}>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-bold text-slate-400">R$</span>
                          <span className="text-5xl font-black tracking-tighter text-white">{formatCurrency(displayPrice)}</span>
                          <span className="text-sm font-medium text-slate-400">{billingCycle === 'yearly' ? '/ano' : '/mês'}</span>
                        </div>
                        {billingCycle === 'yearly' && plan.yearly_price > 0 ? (
                          <p className="mt-2 text-xs font-semibold" style={{ color: `color-mix(in srgb, ${settings.primaryColor} 60%, white)` }}>
                            {yearlySavings.amount > 0 ? `Economia de ${yearlySavings.percentage}% no plano anual` : 'Pagamento único anual'}
                          </p>
                        ) : plan.price_caption?.trim() ? (
                          <p className="mt-2 text-xs font-semibold text-slate-400">{plan.price_caption.trim()}</p>
                        ) : null}
                      </div>

                      {/* features */}
                      <ul className="mt-6 space-y-3 px-7">
                        {summary.map((item) => (
                          <li key={item} className="flex items-start gap-3 text-sm font-medium text-slate-700">
                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={2.5} style={{ color: settings.primaryColor }} />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>

                      {startPlanLocked && (
                        <div className="mx-7 mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                          Plano disponível apenas no cadastro. Sua conta já consumiu o benefício inicial.
                        </div>
                      )}

                      {/* footer caption */}
                      {plan.show_footer_card !== false && plan.footer_caption?.trim() && (
                        <div
                          className="relative mx-7 mt-6 overflow-hidden rounded-2xl border px-4 py-3 text-sm font-semibold text-slate-700"
                          style={{ borderColor: `color-mix(in srgb, ${settings.primaryColor} 28%, #e2e8f0)`, background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 10%, white) 0%, color-mix(in srgb, ${settings.accentColor} 12%, white) 100%)` }}
                        >
                          <p className="leading-relaxed text-slate-700">{plan.footer_caption.trim()}</p>
                        </div>
                      )}

                      {/* CTA */}
                      <div className="mt-auto px-7 pb-7 pt-6">
                        <button
                          onClick={() => handleSubscribe(plan.id, plan.name, plan.monthly_price, plan.yearly_price, plan.description)}
                          disabled={loadingPlanId === plan.id || startPlanLocked}
                          className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-black transition-all disabled:cursor-not-allowed disabled:opacity-70 ${
                            startPlanLocked
                              ? 'bg-slate-200 text-slate-500'
                              : popular
                                ? 'text-white'
                                : 'bg-slate-900 text-white hover:bg-slate-700'
                          }`}
                          style={popular && !startPlanLocked ? { backgroundColor: settings.primaryColor } : undefined}
                        >
                          {loadingPlanId === plan.id
                            ? <><Loader2 className="h-4 w-4 animate-spin" />Processando...</>
                            : startPlanLocked
                              ? <>Disponível apenas no cadastro</>
                              : <>{plan.button_text || 'Assinar'} {getBillingCycleLabel(billingCycle)} <ArrowRight className="h-4 w-4" /></>}
                        </button>
                      </div>
                    </div>
                  );
                })
          }
        </div>
        </div>
      </section>

      {/* ── LOJA PARCEIRA ────────────────────────────────────── */}
      <section className="overflow-hidden bg-white py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* foto */}
            <div className="relative">
              <div className="overflow-hidden rounded-[2rem] shadow-[0_32px_80px_-30px_rgba(15,23,42,0.35)]">
                <img src={agro.store} alt="Produtor rural com tablet em fazenda moderna" className="h-80 w-full object-cover lg:h-[460px]" />
                <div className="absolute inset-0 rounded-[2rem]" style={{ background: `linear-gradient(180deg, transparent 50%, ${settings.secondaryColor}cc 100%)` }} />
              </div>
              {/* badge flutuante */}
              <div className="absolute -bottom-5 -right-4 rounded-2xl border border-white/20 bg-white px-5 py-4 shadow-[0_16px_48px_-16px_rgba(15,23,42,0.3)]">
                <p className="text-2xl font-black" style={{ color: settings.primaryColor }}>Loja Parceira</p>
                <p className="text-xs font-semibold text-slate-500">Vitrine com identidade visual própria</p>
              </div>
            </div>
            {/* conteúdo */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: settings.primaryColor }}>Diferencial exclusivo</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950 md:text-4xl">Sua marca em uma vitrine própria dentro da plataforma</h2>
              <p className="mt-4 text-sm leading-7 text-slate-500">Com a Loja Parceira você tem uma página exclusiva com capa, logo, catálogo, vídeos e banners — tudo com a cara da sua empresa, sem precisar de um site separado.</p>
              <div className="mt-8 space-y-4">
                {partnerStoreFeatures.map((item, i) => {
                  const Icon = item.icon;
                  const accent = i === 2 ? settings.accentColor : settings.primaryColor;
                  return (
                    <div key={item.title} className="flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, white)` }}>
                        <Icon className="h-5 w-5" style={{ color: accent }} />
                      </div>
                      <div>
                        <p className="font-black text-slate-900">{item.title}</p>
                        <p className="mt-0.5 text-sm leading-6 text-slate-500">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => scrollToSection('cards-planos')} className="mt-8 inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-black text-white transition hover:opacity-90" style={{ backgroundColor: settings.primaryColor }}>
                Contratar Loja Parceira <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOOSTERS ─────────────────────────────────────────── */}
      {(boostersLoading || boosters.length > 0) && (
        <section className="relative overflow-hidden py-20" style={{ backgroundColor: settings.secondaryColor }}>
          {/* glows decorativos */}
          <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full blur-3xl" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, transparent)` }} />
          <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full blur-3xl" style={{ backgroundColor: `color-mix(in srgb, ${settings.accentColor} 10%, transparent)` }} />

          <div className="relative mx-auto max-w-7xl px-4">
            {/* header da seção */}
            <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 backdrop-blur-sm" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, transparent)`, borderColor: `color-mix(in srgb, ${settings.primaryColor} 25%, transparent)` }}>
                  <Zap className="h-3.5 w-3.5" style={{ color: settings.primaryColor }} />
                  <span className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: settings.primaryColor }}>Booster Avulso · Exclusivo</span>
                </div>
                <h2 className="text-3xl font-black text-white md:text-4xl">
                  Acelere sua vitrine<br />
                  <span style={{ color: settings.primaryColor }}>quando a campanha pedir.</span>
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
                  Compra pontual para reforçar visibilidade sem alterar seu plano. Os créditos não expiram e o consumo começa pelo saldo do plano — o booster entra depois.
                </p>
              </div>

              {/* selos de garantia */}
              <div className="flex flex-wrap gap-3 md:flex-col md:items-end">
                {[
                  { icon: ShieldCheck, text: 'Sem recorrência' },
                  { icon: Sparkles, text: 'Créditos não expiram' },
                  { icon: Zap, text: 'Ativação imediata' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 backdrop-blur-sm">
                    <Icon className="h-3.5 w-3.5" style={{ color: settings.primaryColor }} />
                    {text}
                  </div>
                ))}
              </div>
            </div>

            {/* corpo */}
            {boostersLoading ? (
              <div className="h-[260px] animate-pulse rounded-[2rem] border border-white/10 bg-white/5" />
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr,0.6fr]">
                {/* card do booster */}
                <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-sm">
                  <HighlightBoosterCard
                    booster={boosters[0]}
                    summary={boosterSummary}
                    onPurchase={handleBoosterPurchase}
                    loading={loadingPlanId === `booster-${boosters[0].id}`}
                    showAccountSummary={!!user}
                  />
                </div>

                {/* como funciona */}
                <div className="rounded-[2rem] border border-white/10 bg-white/5 p-7 backdrop-blur-sm">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 18%, transparent)` }}>
                      <BarChart3 className="h-4 w-4" style={{ color: settings.primaryColor }} />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Como funciona</p>
                  </div>
                  <ol className="space-y-5">
                    {[
                      { n: '1', text: 'O combo adiciona 5 destaques em categoria + 5 na home.' },
                      { n: '2', text: 'Créditos ficam no seu saldo e não expiram — nem se o plano for cancelado.' },
                      { n: '3', text: 'Ao aplicar um destaque, o sistema usa primeiro o saldo do plano.' },
                      { n: '4', text: 'Esgotado o plano, o booster entra automaticamente.' },
                      { n: '5', text: 'Com qualquer uso registrado, a compra deixa de ser reembolsável.' },
                    ].map(({ n, text }) => (
                      <li key={n} className="flex items-start gap-4">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 22%, transparent)`, border: `1px solid color-mix(in srgb, ${settings.primaryColor} 35%, transparent)`, color: settings.primaryColor }}>
                          {n}
                        </span>
                        <p className="pt-0.5 text-sm leading-6 text-slate-300">{text}</p>
                      </li>
                    ))}
                  </ol>

                  {/* limite de compra */}
                  <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: settings.accentColor }}>Limite de compra</p>
                    <p className="mt-1 text-sm font-bold text-white">Até 2 boosters a cada 30 dias</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── COMPARATIVO TÉCNICO ──────────────────────────────── */}
      <section id="comparativo-tecnico" className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl overflow-hidden px-4">
          <div className="mb-12 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Detalhes técnicos</p>
            <h2 className="mt-3 font-display text-3xl font-black text-slate-950">Comparação completa de planos</h2>
            <p className="mt-3 text-sm text-slate-500">Todos os detalhes operacionais lado a lado para uma decisão bem fundamentada.</p>
          </div>
          <div className="overflow-x-auto rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_-50px_rgba(15,23,42,0.25)]">
            {plansLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">Carregando comparação de planos...</div>
            ) : visiblePlans.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Nenhum plano disponível para comparação.</div>
            ) : (
              <table className="min-w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-100 bg-white shadow-sm">
                    <th className="px-8 py-6 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Funcionalidade</th>
                    {visiblePlans.map((plan) => (
                      <th key={plan.id} className="px-6 py-6 text-center">
                        <div className="text-sm font-black text-slate-900">{plan.name}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-400">R$ {formatCurrency(getDisplayPrice(plan.monthly_price, plan.yearly_price))}/{billingCycle === 'yearly' ? 'ano' : 'mês'}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((feature, index) => (
                    <tr key={feature.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-8 py-5 text-sm font-bold text-slate-700">{feature.label}</td>
                      {visiblePlans.map((plan) => {
                        const value = getComparisonValue(plan, feature);
                        return (
                          <td key={plan.id} className="px-6 py-5 text-center">
                            {typeof value === 'boolean' ? (
                              value ? (
                                <div className="flex justify-center"><span className="inline-flex rounded-full p-2" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)`, color: settings.primaryColor }}><Check className="h-4 w-4" strokeWidth={2.5} /></span></div>
                              ) : (
                                <div className="flex justify-center"><span className="inline-flex rounded-full bg-slate-100 p-2 text-slate-300"><X className="h-4 w-4" strokeWidth={2.5} /></span></div>
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
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-3xl px-4">
          <div className="mb-12 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Dúvidas</p>
            <h2 className="mt-3 font-display text-3xl font-black text-slate-950">Perguntas Frequentes</h2>
            <p className="mt-3 text-sm text-slate-500">Tudo o que você precisa saber sobre os planos e assinaturas BWAGRO.</p>
          </div>
          <div className="space-y-3">
              {visiblePricingFaq.map((faq, idx) => (
              <div key={idx} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md">
                <button
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 p-6 text-left"
                >
                  <span className="font-bold text-slate-800">{faq.question}</span>
                  <ChevronDown
                    className={`h-5 w-5 flex-shrink-0 transition-transform duration-300 ${activeFaq === idx ? 'rotate-180' : 'text-slate-400'}`}
                    style={activeFaq === idx ? { color: settings.primaryColor } : undefined}
                    strokeWidth={1.5}
                  />
                </button>
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{ maxHeight: activeFaq === idx ? '400px' : '0px' }}
                >
                  <div className="border-t border-slate-100 px-6 pb-6 pt-4 text-sm leading-7 text-slate-500">{faq.answer}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────── */}
      <section className="relative overflow-hidden py-28">
        <div className="absolute inset-0">
          <img src={agro.field} alt="Campo agro" className="h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${settings.secondaryColor}f0 0%, ${settings.secondaryColor}cc 60%, color-mix(in srgb, ${settings.primaryColor} 60%, ${settings.secondaryColor}) 100%)` }} />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.25em] text-white backdrop-blur-sm">
            <Award className="h-3.5 w-3.5" style={{ color: settings.primaryColor }} />
            Comece hoje
          </span>
          <h2 className="mt-4 font-display text-4xl font-black leading-tight text-white md:text-5xl">
            Pronto para vender com<br />
            <span style={{ color: settings.primaryColor }}>mais estrutura no agro?</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-200">
            Escolha o plano ideal, sem taxa de cadastro. Evolua quando quiser e construa sua operação com mais destaque, mais leitura de mercado e uma Loja Parceira que representa sua marca.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={() => scrollToSection('cards-planos')}
              className="inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-black text-white shadow-xl transition hover:opacity-90"
              style={{ backgroundColor: settings.primaryColor }}
            >
              Escolher meu plano <ArrowRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('comparativo-tecnico')}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-8 py-4 text-base font-black text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              Ver comparativo <TrendingUp className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-12 flex flex-wrap justify-center gap-6">
            {[
              { icon: Zap, text: 'Ativação imediata' },
              { icon: ShieldCheck, text: 'Pagamento seguro' },
              { icon: Sparkles, text: 'Cancele quando quiser' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Icon className="h-4 w-4" style={{ color: settings.primaryColor }} />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default PricingView;
