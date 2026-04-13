import React, { useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Check, ChevronDown, ImagePlus, Loader2, Megaphone, Monitor, PlayCircle, ShieldCheck, Sparkles, Store, Telescope, X } from 'lucide-react';
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

const PricingView: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const { plansRaw, isLoading: plansLoading } = usePlans();
  const { user } = useAuth();
  const { settings } = useLayout();
  const { boosters, summary: boosterSummary, isLoading: boostersLoading, refresh: refreshBoosters } = useHighlightBoosters();

  const scrollToSection = (sectionId: string) => {
    if (typeof document === 'undefined') return;
    const section = document.getElementById(sectionId);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const valueCards = [
    { eyebrow: 'Alcance', title: 'Alcance milhares de compradores', description: 'Posicione seus produtos em vitrines premium, categorias estrategicas e na home para disputar atencao com vantagem.', icon: Megaphone, accent: settings.primaryColor },
    { eyebrow: 'Operacao', title: 'Organize sua rotina comercial', description: 'Radar, relatorios, leads e contato ampliado ajudam a transformar interesse em negociacao real.', icon: BarChart3, accent: settings.secondaryColor },
    { eyebrow: 'Marca', title: 'Venda com presenca institucional', description: 'A Loja Parceira coloca sua empresa em um ambiente proprio com identidade visual, catalogo e recursos premium.', icon: Store, accent: settings.accentColor },
  ];
  const visibilitySteps = [
    'Publique com apresentacao mais profissional e mais confianca visual.',
    'Ganhe mais exposicao com destaque na home, categoria e vitrine premium.',
    'Acompanhe contatos, radar e sua operacao com mais inteligencia comercial.',
  ];
  const partnerStoreFeatures = [
    { title: 'Logo, capa e identidade visual', description: 'De a sua empresa uma vitrine propria, com presenca muito mais forte dentro da plataforma.', icon: ImagePlus },
    { title: 'Catalogo organizado e banners', description: 'Escolha a ordem da vitrine e destaque produtos estrategicos com mais intencao comercial.', icon: Sparkles },
    { title: 'Videos e midia rica', description: 'Mostre produtos em acao e aumente a percepcao de valor com materiais mais completos.', icon: PlayCircle },
    { title: 'Pagina de loja mais profissional', description: 'Transforme anuncios em uma experiencia de marca com cara de operacao estruturada.', icon: ShieldCheck },
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
  const getDisplayPrice = (monthlyPrice: number, yearlyPrice: number) => billingCycle === 'monthly' ? monthlyPrice : yearlyPrice > 0 ? yearlyPrice / 12 : monthlyPrice;
  const getPlanSummary = (plan: Plan) => {
    if (plan.display_features?.length) return plan.display_features.filter(Boolean);
    const summary = [`Ate ${formatNumericValue(plan.max_ads)} anuncios ativos`, `${plan.category_highlights_count || 0} destaques por categoria`, `${formatNumericValue(getEffectiveLeadContactLimitDays(plan, billingCycle === 'yearly'), ' dias')} de contato com leads`];
    if ((plan.home_highlight_count || 0) > 0) summary[2] = `${plan.home_highlight_count} destaque${plan.home_highlight_count > 1 ? 's' : ''} na home`;
    return summary;
  };
  const getComparisonValue = (plan: Plan, row: ComparisonRow) => formatComparisonValue(plan.comparison?.[row.id] ?? row.getValue(plan));

  const handleSubscribe = async (planId: string, planName: string, monthlyPrice: number, yearlyPrice: number, description?: string | null) => {
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

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(180deg, ${settings.backgroundColor} 0%, #ffffff 24%, ${settings.backgroundColor} 100%)` }}>
      <section className="relative overflow-hidden px-4 pb-20 pt-24 text-white" style={{ backgroundColor: settings.secondaryColor }}>
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 12%, transparent) 0%, transparent 40%, color-mix(in srgb, ${settings.accentColor} 12%, transparent) 100%)` }} />
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 18%, transparent)` }} />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full blur-3xl" style={{ backgroundColor: `color-mix(in srgb, ${settings.accentColor} 14%, transparent)` }} />
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl">
            <div>
              <span className="mb-6 inline-flex items-center rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em]" style={{ border: `1px solid color-mix(in srgb, ${settings.primaryColor} 30%, transparent)`, backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 10%, transparent)`, color: `color-mix(in srgb, ${settings.primaryColor} 75%, white)` }}>Mais estrutura para vender no agro</span>
              <h1 className="font-display text-4xl font-black leading-[1.02] tracking-tight md:text-6xl">Planos pensados para<br className="hidden md:block" /><span style={{ color: settings.primaryColor }}>gerar mais alcance e mais vendas</span></h1>
              <p className="mt-6 max-w-2xl text-base font-medium leading-8 text-slate-300 md:text-xl">Uma página mais comercial para mostrar valor antes do preço: mais vitrine, mais contatos, melhor leitura de demanda e uma Loja Parceira pronta para fortalecer sua marca.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={() => scrollToSection('cards-planos')} className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white" style={{ backgroundColor: settings.primaryColor }}>Ver planos<ArrowRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => scrollToSection('comparativo-tecnico')} className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white backdrop-blur">Comparar beneficios<ArrowRight className="h-4 w-4" /></button>
              </div>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {valueCards.map((item) => {
                  const Icon = item.icon;
                  return <div key={item.title} className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 backdrop-blur"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `color-mix(in srgb, ${item.accent} 18%, white)` }}><Icon className="h-5 w-5" style={{ color: item.accent }} /></div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">{item.eyebrow}</p><p className="mt-2 text-lg font-black text-white">{item.title}</p><p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p></div>;
                })}
              </div>
            </div>
            <div className="hidden">
              <div className="absolute -left-4 top-8 h-44 w-44 rounded-full blur-3xl" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 16%, transparent)` }} />
              <div className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/5 p-5 shadow-[0_34px_90px_-42px_rgba(15,23,42,0.7)] backdrop-blur-xl">
                <div className="grid gap-5 lg:grid-cols-[0.92fr,1.08fr]">
                  <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/45 p-5">
                    <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 18%, white)` }}><Telescope className="h-5 w-5" style={{ color: settings.primaryColor }} /></div><div><p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Visibilidade comercial</p><p className="mt-1 text-base font-black text-white">Vitrine premium com mais contexto comercial</p></div></div>
                    <div className="mt-5 space-y-3">{visibilitySteps.map((step, index) => <div key={step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3"><div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: settings.primaryColor }}>{index + 1}</div><p className="text-sm font-medium text-slate-200">{step}</p></div>)}</div>
                  </div>
                  <div className="rounded-[1.8rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_100%)] p-4">
                    <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/55 p-4">
                      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div><span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Preview</span></div>
                      <div className="mt-4 rounded-[1.35rem] bg-white p-3 text-slate-900">
                        <div className="rounded-[1rem] bg-[linear-gradient(135deg,#ecfccb_0%,#dcfce7_42%,#dbeafe_100%)] p-4">
                          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-700">Loja Parceira</p><p className="mt-2 text-lg font-black text-slate-950">Catalogo com cara de marca</p><p className="mt-2 text-xs leading-5 text-slate-600">Capa, logo, catálogo, vídeos e recursos de destaque em uma página própria.</p></div><div className="rounded-2xl bg-white/85 p-3 shadow-sm"><Store className="h-7 w-7" style={{ color: settings.primaryColor }} /></div></div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {[{ title: 'Mais exposicao', icon: Megaphone, accent: settings.primaryColor }, { title: 'Mais contato', icon: ShieldCheck, accent: settings.accentColor }, { title: 'Mais leitura', icon: BarChart3, accent: settings.secondaryColor }, { title: 'Loja propria', icon: Store, accent: settings.primaryColor }].map((item) => {
                            const Icon = item.icon;
                            return <div key={item.title} className="rounded-[1rem] border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `color-mix(in srgb, ${item.accent} 16%, white)` }}><Icon className="h-4 w-4" style={{ color: item.accent }} /></div><p className="text-sm font-black text-slate-900">{item.title}</p></div></div>;
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-[1.15rem] border border-white/10 bg-black/10 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Home</p><p className="mt-2 text-lg font-black text-white">Destaque premium</p></div>
                      <div className="rounded-[1.15rem] border border-white/10 bg-black/10 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Radar</p><p className="mt-2 text-lg font-black text-white">Alertas e filtros</p></div>
                      <div className="rounded-[1.15rem] border border-white/10 bg-black/10 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Loja</p><p className="mt-2 text-lg font-black text-white">Branding e catalogo</p></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-12 flex items-center justify-center gap-4">
            <span className={`text-sm font-bold transition-colors ${billingCycle === 'monthly' ? 'text-white' : 'text-slate-500'}`}>Mensal</span>
            <button onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')} className="relative h-8 w-16 rounded-full border border-slate-700 bg-slate-800 p-1 transition-all"><div className={`h-6 w-6 rounded-full shadow-lg transition-transform duration-300 ${billingCycle === 'yearly' ? 'translate-x-8' : 'translate-x-0'}`} style={{ backgroundColor: settings.primaryColor }} /></button>
            <div className="flex items-center gap-2"><span className={`text-sm font-bold transition-colors ${billingCycle === 'yearly' ? 'text-white' : 'text-slate-500'}`}>Anual</span><span className="rounded px-2 py-0.5 text-[10px] font-black uppercase text-white" style={{ backgroundColor: settings.primaryColor }}>economia</span></div>
          </div>
          {billingCycle === 'yearly' && <div className="mx-auto mt-5 max-w-2xl rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-200 backdrop-blur"><p className="font-semibold text-white">Cobranca anual com beneficios renovados mensalmente.</p><p className="mt-1 text-slate-300">Anuncios, destaques e demais limites operacionais sao liberados em ciclos mensais dentro da vigencia anual.</p></div>}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-6 lg:grid-cols-[1.08fr,0.92fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-50px_rgba(15,23,42,0.35)] lg:p-8">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Por que subir de plano</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950">Mais estrutura para atrair, negociar e crescer</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">A decisão fica mais clara quando o usuário enxerga como cada plano melhora a operação: mais exposição, mais tempo de resposta e mais recursos de inteligência comercial.</p>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {[{ eyebrow: 'O que melhora', title: 'Mais exposicao para produtos estrategicos', description: 'Destaques e prioridade de vitrine ajudam seu anuncio a aparecer antes dos demais.' }, { eyebrow: 'Para quem vende', title: 'Mais tempo para responder interessados', description: 'Escolha um plano com janela de contato maior para nao perder oportunidades no meio da negociacao.' }, { eyebrow: 'Para crescer', title: 'Radar, relatorios e loja fortalecem a operacao', description: 'A pagina de planos mostra o quanto sua operacao pode evoluir com mais recursos, nao so o preco.' }].map((item) => <div key={item.title} className="rounded-[1.5rem] bg-slate-50 p-5"><p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{item.eyebrow}</p><p className="mt-3 text-lg font-black text-slate-900">{item.title}</p><p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p></div>)}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border p-6 shadow-[0_24px_80px_-50px_rgba(15,23,42,0.35)] lg:p-8" style={{ borderColor: `color-mix(in srgb, ${settings.primaryColor} 18%, #e2e8f0)`, background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 8%, white) 0%, color-mix(in srgb, ${settings.accentColor} 10%, white) 100%)` }}>
            <div className="rounded-[1.8rem] bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.3)]">
              <div
                className="rounded-[1.6rem] border border-slate-200 px-4 pb-6 pt-5 sm:px-6"
                style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${settings.primaryColor} 4%, white) 0%, #ffffff 18%, color-mix(in srgb, ${settings.primaryColor} 7%, white) 100%)` }}
              >
                <div className="relative overflow-hidden rounded-[1.8rem] px-4 pb-8 pt-6 text-center" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${settings.primaryColor} 6%, white) 0%, color-mix(in srgb, ${settings.primaryColor} 10%, white) 100%)` }}>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-80" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${settings.primaryColor} 10%, white) 0%, transparent 100%)` }} />
                  <div className="relative mx-auto max-w-3xl">
                    <div className="relative mx-auto flex max-w-[34rem] items-end justify-center">
                      <div className="relative w-full rounded-[1.8rem] border-[10px] border-slate-950 bg-white p-2 shadow-[0_22px_50px_-30px_rgba(15,23,42,0.55)]">
                        <div className="rounded-[1rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-3">
                          <div className="flex items-center justify-between rounded-full bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            <span>Preview real da loja</span>
                            <span>Notebook</span>
                          </div>
                          <div className="mt-3 overflow-hidden rounded-[0.9rem] border border-dashed border-slate-300 bg-white">
                            <div className="h-16 sm:h-20" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 18%, white) 0%, color-mix(in srgb, ${settings.accentColor} 16%, white) 100%)` }} />
                            <div className="grid gap-3 p-3 sm:grid-cols-[1.2fr_0.8fr]">
                              <div className="rounded-[0.9rem] border border-slate-200 bg-slate-50 p-3 text-left">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Area reservada</p>
                                <p className="mt-2 text-base font-black text-slate-900">Insira aqui a imagem real da sua loja</p>
                                <p className="mt-2 text-sm leading-6 text-slate-500">O layout ja fica pronto para notebook e celular, sem precisar mexer na estrutura quando a imagem estiver pronta.</p>
                              </div>
                              <div className="grid gap-2">
                                <div className="h-16 rounded-[0.9rem] border border-slate-200 bg-slate-50" />
                                <div className="h-16 rounded-[0.9rem] border border-slate-200 bg-slate-50" />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mx-auto mt-2 h-2.5 w-28 rounded-full bg-slate-300" />
                      </div>

                      <div className="absolute -bottom-2 right-2 w-24 rounded-[1.8rem] border-[6px] border-slate-950 bg-white p-1.5 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.55)] sm:w-28">
                        <div className="rounded-[1.3rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-2">
                          <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" />
                          <div className="mt-2 h-14 rounded-[1rem]" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 14%, white) 0%, color-mix(in srgb, ${settings.accentColor} 14%, white) 100%)` }} />
                          <div className="mt-2 space-y-1.5">
                            <div className="h-2 rounded-full bg-slate-200" />
                            <div className="h-2 rounded-full bg-slate-100" />
                            <div className="h-2 rounded-full bg-slate-100" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 text-center">
                      <div className="inline-flex items-center gap-3 rounded-full bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-600 shadow-sm">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)` }}>
                          <Store className="h-5 w-5" style={{ color: settings.primaryColor }} />
                        </div>
                        Loja Parceira
                      </div>
                      <h3 className="mt-5 text-3xl font-black text-slate-950 sm:text-[2.2rem]">Personalize sua loja</h3>
                      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">Deixe esta secao pronta para receber a imagem real da sua vitrine, com mockup principal em destaque e beneficios organizados logo abaixo.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {partnerStoreFeatures.map((item, index) => {
                    const Icon = item.icon;
                    const accent = index === 2 ? settings.accentColor : settings.primaryColor;
                    return (
                      <div key={item.title} className="rounded-[1.35rem] border border-slate-200 bg-white/90 p-4 text-center shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, white)` }}>
                          <Icon className="h-5 w-5" style={{ color: accent }} />
                        </div>
                        <p className="mt-4 text-base font-black text-slate-900">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 flex justify-center">
                  <button type="button" onClick={() => scrollToSection('cards-planos')} className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white" style={{ backgroundColor: settings.accentColor }}>
                    Contratar minha loja
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="cards-planos" className="relative z-20 mx-auto max-w-7xl px-4 pb-4">
        <div className="mb-10 text-center"><p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Escolha seu ritmo</p><h2 className="mt-3 font-display text-3xl font-black text-slate-950">Planos para cada etapa da sua operacao</h2><p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-500">A vitrine de compra continua objetiva, mas agora com mais contexto visual para ajudar a decisao antes do checkout.</p></div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
          {plansLoading ? Array.from({ length: 5 }).map((_, index) => <div key={`plan-skeleton-${index}`} className="h-[430px] animate-pulse rounded-[2rem] border border-slate-100 bg-white shadow-xl" />) : visiblePlans.length === 0 ? <div className="col-span-full rounded-2xl border border-slate-100 bg-white p-8 text-center"><p className="text-sm text-slate-500">Nenhum plano disponivel no momento.</p></div> : visiblePlans.map((plan) => {
            const displayPrice = getDisplayPrice(plan.monthly_price, plan.yearly_price);
            const yearlySavings = calculateYearlySavings(plan.monthly_price, plan.yearly_price);
            const summary = getPlanSummary(plan);
            return (
              <div key={plan.id} className={`flex min-h-[460px] flex-col rounded-[2rem] border bg-white p-7 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)] transition-all duration-300 ${plan.is_popular ? '' : 'border-slate-200/70 hover:-translate-y-1'}`} style={plan.is_popular ? { borderColor: settings.primaryColor, boxShadow: `0 0 0 4px color-mix(in srgb, ${settings.primaryColor} 16%, white)` } : undefined}>
                <div className="mb-6 flex items-start justify-between gap-4"><div><p className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">{plan.card_eyebrow?.trim() || 'Plano BWAGRO'}</p><h3 className="text-2xl font-black text-slate-950">{plan.name}</h3><p className="mt-2 text-sm leading-relaxed text-slate-500">{plan.description}</p></div>{plan.is_popular && <span className="whitespace-nowrap rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white" style={{ backgroundColor: settings.primaryColor }}>Escolha segura</span>}</div>
                <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white">
                  <div className="flex items-baseline gap-1"><span className="text-base font-bold text-slate-400">R$</span><span className="text-5xl font-black tracking-tighter">{formatCurrency(displayPrice)}</span><span className="text-sm font-medium text-slate-400">/mes</span></div>
                  {billingCycle === 'yearly' && plan.yearly_price > 0 ? <div className="mt-3 space-y-1.5 text-sm font-semibold" style={{ color: `color-mix(in srgb, ${settings.primaryColor} 55%, white)` }}><p>Cobranca anual: R$ {formatCurrency(plan.yearly_price)}{yearlySavings.amount > 0 ? ` | economia de ${yearlySavings.percentage}%` : ''}</p><p className="text-xs text-slate-300">Beneficios operacionais renovados mensalmente.</p></div> : plan.price_caption?.trim() ? <p className="mt-3 text-sm font-semibold text-slate-400">{plan.price_caption.trim()}</p> : null}
                </div>
                <ul className="mt-6 min-h-[176px] space-y-3 overflow-y-auto pr-2">{summary.map((item) => <li key={item} className="flex items-start gap-3 text-sm font-medium text-slate-700"><Check className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={2} style={{ color: settings.primaryColor }} /><span>{item}</span></li>)}</ul>
                <div className="mt-auto pt-6">
                  {plan.show_footer_card !== false && plan.footer_caption?.trim() ? <div className="relative mb-4 overflow-hidden rounded-2xl border px-4 py-4 text-sm font-semibold text-slate-700 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.4)]" style={{ borderColor: `color-mix(in srgb, ${settings.primaryColor} 28%, #e2e8f0)`, background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 11%, white) 0%, color-mix(in srgb, ${settings.accentColor} 12%, white) 100%)` }}><div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-30" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 30%, white)` }} /><div className="relative"><p className="leading-relaxed text-slate-700">{plan.footer_caption.trim()}</p></div></div> : null}
                  <button onClick={() => handleSubscribe(plan.id, plan.name, plan.monthly_price, plan.yearly_price, plan.description)} disabled={loadingPlanId === plan.id} className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-black transition-all disabled:cursor-not-allowed disabled:opacity-70 ${plan.is_popular ? 'text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`} style={plan.is_popular ? { backgroundColor: settings.primaryColor } : undefined}>
                    {loadingPlanId === plan.id ? <><Loader2 className="h-4 w-4 animate-spin" />Processando...</> : `${plan.button_text || 'Assinar'} ${getBillingCycleLabel(billingCycle)}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {(boostersLoading || boosters.length > 0) && (
        <section className="mx-auto max-w-7xl px-4 pt-12">
          <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_24px_80px_-50px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Booster Avulso</p>
                <h2 className="text-2xl font-black text-slate-950">Mais destaque quando sua campanha pedir reforco</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">Compra exclusiva para reforçar vitrines sem banalizar os planos. O consumo continua usando primeiro os créditos do plano e depois o saldo extra do booster.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Limite de compra</span>
                <span className="font-bold text-slate-900">Até 2 boosters a cada 30 dias</span>
              </div>
            </div>
            {boostersLoading ? (
              <div className="h-[220px] animate-pulse rounded-[1.5rem] border border-slate-100 bg-slate-50" />
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr,0.8fr]">
                <HighlightBoosterCard booster={boosters[0]} summary={boosterSummary} onPurchase={handleBoosterPurchase} loading={loadingPlanId === `booster-${boosters[0].id}`} showAccountSummary={!!user} />
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Como funciona</p>
                  <ul className="mt-4 space-y-3 text-sm text-slate-600">
                    <li>O combo adiciona 5 destaques em categoria e 5 destaques na home.</li>
                    <li>Os créditos extras não expiram e continuam válidos mesmo se o plano for cancelado.</li>
                    <li>Quando você aplica um destaque, o sistema consome primeiro o saldo do plano.</li>
                    <li>Depois disso, o uso passa automaticamente para o saldo do booster.</li>
                    <li>Se houver uso, a compra deixa de ser reembolsável.</li>
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
          <p className="mt-3 text-slate-500">Aqui estão os detalhes completos para comparar o impacto operacional de cada plano.</p>
        </div>
        <div className="overflow-x-auto rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_-50px_rgba(15,23,42,0.35)]">
          {plansLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">Carregando comparação de planos...</div>
          ) : visiblePlans.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Nenhum plano disponível para comparação.</div>
          ) : (
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-8 py-6 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Funcionalidade</th>
                  {visiblePlans.map((plan) => (
                    <th key={plan.id} className="px-6 py-6 text-center">
                      <div className="text-sm font-black text-slate-900">{plan.name}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-400">R$ {formatCurrency(getDisplayPrice(plan.monthly_price, plan.yearly_price))}/mes</div>
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
      </section>

      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-12 overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-50px_rgba(15,23,42,0.35)]">
            <div className="grid items-center gap-8 lg:grid-cols-[1.1fr,0.9fr]">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Fechamento comercial</p>
                <h2 className="mt-3 font-display text-3xl font-black text-slate-950">Quer começar a vender com mais estrutura?</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">Escolha o plano que faz mais sentido para a sua etapa e evolua sua operação com mais destaque, mais leitura de mercado e uma apresentação comercial mais forte.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button type="button" onClick={() => scrollToSection('cards-planos')} className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white" style={{ backgroundColor: settings.primaryColor }}>Escolher plano<ArrowRight className="h-4 w-4" /></button>
                  <button type="button" onClick={() => scrollToSection('comparativo-tecnico')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900">Ver comparativo<ArrowRight className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="rounded-[1.8rem] bg-[linear-gradient(135deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[{ title: 'Mais vitrine', icon: Megaphone }, { title: 'Mais contato', icon: ShieldCheck }, { title: 'Radar ativo', icon: BarChart3 }, { title: 'Loja Parceira', icon: Store }].map((item) => {
                    const Icon = item.icon;
                    return <div key={item.title} className="rounded-[1.2rem] border border-slate-200 bg-white p-4"><div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)` }}><Icon className="h-4 w-4" style={{ color: settings.primaryColor }} /></div><p className="mt-4 text-sm font-black text-slate-900">{item.title}</p></div>;
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-14 text-center">
            <h2 className="font-display text-3xl font-black text-slate-900">Duvidas Frequentes</h2>
            <p className="mt-3 text-slate-500">Tudo o que você precisa saber sobre as assinaturas BWAGRO.</p>
          </div>
          <div className="space-y-4">
            {PRICING_FAQ.map((faq, idx) => (
              <div key={idx} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                <button onClick={() => setActiveFaq(activeFaq === idx ? null : idx)} className="flex w-full items-center justify-between p-6 text-left">
                  <span className="font-bold text-slate-800">{faq.question}</span>
                  <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${activeFaq === idx ? 'rotate-180' : ''}`} style={activeFaq === idx ? { color: settings.primaryColor } : undefined} strokeWidth={1.5} />
                </button>
                {activeFaq === idx && <div className="border-t border-slate-50 px-6 pb-6 pt-4 text-sm leading-relaxed text-slate-500">{faq.answer}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default PricingView;
