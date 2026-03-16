import React, { useState } from 'react';
import { Check, ChevronDown, X, Loader2 } from 'lucide-react';
import { PRICING_FEATURES, PRICING_FAQ } from '../constants';
import { usePlans } from '../src/hooks/usePlans';
import { useAuth } from '../src/contexts/AuthContext';
import { 
  initiateCheckout, 
  isCustomPlan, 
  getCustomPlanContactLink,
  calculateYearlyTotal
} from '../services/mercadoPagoService';
import toast from 'react-hot-toast';

const PricingView: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const { plans, isLoading: plansLoading } = usePlans();
  const { user } = useAuth();

  /**
   * Manipula o clique no botão de assinar
   */
  const handleSubscribe = async (planId: string, planName: string, monthlyPrice: number, yearlyPrice: number) => {
    // Verificar se é plano customizado (Corporativo)
    if (isCustomPlan(planName)) {
      const contactLink = getCustomPlanContactLink(planName);
      window.open(contactLink, '_blank');
      return;
    }

    // Verificar autenticação
    if (!user) {
      toast.error('Você precisa estar logado para assinar um plano.');
      // Redirecionar para login
      setTimeout(() => {
        window.location.href = '/#/login?redirect=/pricing';
      }, 1500);
      return;
    }

    // Calcular valor correto
    const amount = billingCycle === 'monthly' 
      ? monthlyPrice 
      : calculateYearlyTotal(monthlyPrice, yearlyPrice);

    setLoadingPlanId(planId);
    toast.loading('Preparando checkout...', { id: 'checkout-loading' });

    try {
      const result = await initiateCheckout({
        planId,
        planName,
        planDescription: `Plano ${planName} - ${billingCycle === 'monthly' ? 'Mensal' : 'Anual'}`,
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
    <div className="bg-white min-h-screen">
      {/* Header Corporativo - Ajustado padding-bottom para evitar overlap */}
      <section className="bg-slate-900 text-white pt-24 pb-36 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-slate-800 skew-x-12 translate-x-20 opacity-20"></div>
        <div className="max-w-7xl mx-auto px-4 relative z-10 text-center">
          <span className="bg-green-600/20 text-green-400 text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest mb-6 inline-block border border-green-600/30">
            Crescimento Sustentável
          </span>
          <h1 className="text-4xl md:text-6xl font-black mb-6 font-display leading-tight tracking-tight">
            Escolha o plano ideal para <br className="hidden md:block" />
            <span className="text-green-500">acelerar seus negócios</span>
          </h1>
          <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto font-medium">
            Seja você um produtor independente ou uma grande imobiliária rural, temos a solução certa para aumentar sua visibilidade.
          </p>

          {/* Toggle de Periodicidade - mt reduzido para subir a altura */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <span className={`text-sm font-bold transition-colors ${billingCycle === 'monthly' ? 'text-white' : 'text-slate-500'}`}>Mensal</span>
            <button 
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className="w-16 h-8 bg-slate-800 rounded-full p-1 relative border border-slate-700 transition-all"
            >
              <div className={`w-6 h-6 bg-green-500 rounded-full shadow-lg transform transition-transform duration-300 ${billingCycle === 'yearly' ? 'translate-x-8' : 'translate-x-0'}`}></div>
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold transition-colors ${billingCycle === 'yearly' ? 'text-white' : 'text-slate-500'}`}>Anual</span>
              <span className="bg-green-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">-20% OFF</span>
            </div>
          </div>
        </div>
      </section>

      {/* Grid de Planos */}
      <section className="max-w-7xl mx-auto px-4 -mt-20 relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plansLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={`plan-skeleton-${index}`} className="bg-white rounded-[2.5rem] p-10 border-2 border-slate-50 shadow-xl animate-pulse h-[520px]" />
            ))
          ) : plans.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl p-8 text-center border border-slate-100">
              <p className="text-sm text-slate-500">Nenhum plano disponível no momento.</p>
            </div>
          ) : (
          plans.map((plan) => {
            const displayPrice = billingCycle === 'monthly' ? plan.monthlyPrice : (plan.yearlyPrice / 12);
            return (
              <div 
                key={plan.id}
                className={`bg-white rounded-[2.5rem] p-10 flex flex-col border-2 transition-all duration-500 ${plan.isPopular ? 'border-green-500 shadow-2xl shadow-green-900/10 scale-105' : 'border-slate-50 shadow-xl'}`}
              >
                {plan.isPopular && (
                  <div className="self-center bg-green-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest -mt-14 mb-8">
                    Mais Popular
                  </div>
                )}
                
                <div className="mb-8">
                  <h3 className="text-2xl font-black text-slate-900 mb-2">{plan.name}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{plan.description}</p>
                </div>

                <div className="mb-10">
                  <div className="flex items-baseline gap-1">
                    <span className="text-slate-400 font-bold text-lg">R$</span>
                    <span className="text-5xl font-black text-slate-900 tracking-tighter">
                      {displayPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-slate-400 font-medium">/mês</span>
                  </div>
                  {billingCycle === 'yearly' && plan.yearlyPrice > 0 && (
                    <p className="text-xs font-bold text-green-600 mt-2">Faturado anualmente: R$ {plan.yearlyPrice.toLocaleString('pt-BR')}</p>
                  )}
                </div>

                <ul className="space-y-4 mb-10 flex-grow">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm font-medium text-slate-600">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" strokeWidth={1.5} />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button 
                  onClick={() => handleSubscribe(plan.id, plan.name, plan.monthlyPrice, plan.yearlyPrice)}
                  disabled={loadingPlanId === plan.id}
                  className={`w-full py-5 rounded-2xl font-black text-sm transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${plan.isPopular ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200'}`}
                >
                  {loadingPlanId === plan.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    plan.buttonText || 'Assinar Agora'
                  )}
                </button>
              </div>
            );
          })
          )}
        </div>
      </section>

      {/* Tabela Comparativa Detalhada */}
      <section className="max-w-6xl mx-auto px-4 py-32 overflow-hidden">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-black text-slate-900 mb-4 font-display">Comparação Técnica</h2>
          <p className="text-slate-500">Detalhes de cada funcionalidade para sua tomada de decisão.</p>
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-x-auto">
          {plansLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">Carregando comparação de planos...</div>
          ) : plans.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Nenhum plano disponível para comparação.</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="py-8 px-8 font-black text-slate-400 uppercase tracking-widest text-[10px]">Funcionalidade</th>
                  {plans.map(p => (
                    <th key={p.id} className="py-8 px-6 font-black text-slate-900 text-center">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {PRICING_FEATURES.map((feat) => (
                  <tr key={feat.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="py-6 px-8 text-sm font-bold text-slate-700">{feat.label}</td>
                    {plans.map(plan => {
                      const value = plan.comparison[feat.id];
                      return (
                        <td key={plan.id} className="py-6 px-6 text-center">
                          {typeof value === 'boolean' ? (
                            value ? (
                              <div className="flex justify-center">
                                <Check className="w-5 h-5 text-green-500" strokeWidth={1.5} />
                              </div>
                            ) : (
                              <div className="flex justify-center">
                                <X className="w-5 h-5 text-slate-200" strokeWidth={1.5} />
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

      {/* Seção FAQ */}
      <section className="bg-slate-50 py-32">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16">
             <h2 className="text-3xl font-black text-slate-900 mb-4 font-display">Dúvidas Frequentes</h2>
             <p className="text-slate-500">Tudo o que você precisa saber sobre as assinaturas BWAGRO.</p>
          </div>

          <div className="space-y-4">
            {PRICING_FAQ.map((faq, idx) => (
              <div 
                key={idx} 
                className="bg-white rounded-2xl border border-slate-100 overflow-hidden transition-all duration-300 shadow-sm"
              >
                <button 
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <span className="font-bold text-slate-800">{faq.question}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${activeFaq === idx ? 'rotate-180 text-green-600' : ''}`} strokeWidth={1.5} />
                </button>
                {activeFaq === idx && (
                  <div className="px-6 pb-6 text-sm text-slate-500 leading-relaxed border-t border-slate-50 pt-4">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-24 bg-green-600">
        <div className="max-w-7xl mx-auto px-4 text-center text-white">
          <h2 className="text-4xl font-black mb-6 font-display">Ainda tem dúvidas?</h2>
          <p className="text-green-50 text-lg mb-10 max-w-xl mx-auto opacity-90">
            Fale com um de nossos consultores especializados em agronegócio para encontrar o melhor pacote para sua empresa.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl active:scale-95">
              Consultoria via WhatsApp
            </button>
            <button className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-10 py-5 rounded-2xl font-black hover:bg-white/20 transition-all">
              Ver Planos Enterprise
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PricingView;