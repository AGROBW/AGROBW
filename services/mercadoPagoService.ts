/**
 * =====================================================
 * Mercado Pago Service
 * =====================================================
 * 
 * Service para integração com Mercado Pago via Supabase Edge Function.
 * Gerencia criação de preferências de pagamento e checkout.
 */

import { supabase } from '../src/lib/supabaseClient';

export interface CheckoutRequest {
  planId: string;
  planName: string;
  planDescription?: string;
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  userId: string;
}

export interface CheckoutResponse {
  success: boolean;
  preferenceId?: string;
  initPoint?: string;
  sandboxInitPoint?: string;
  error?: string;
}

export interface MPCredentials {
  access_token: string | null;
  public_key: string | null;
  is_production: boolean;
}

/**
 * Busca as credenciais do Mercado Pago via RPC function
 */
export const getMercadoPagoCredentials = async (): Promise<MPCredentials | null> => {
  try {
    const { data, error } = await supabase.rpc('get_mp_credentials');

    if (error) {
      console.error('Erro ao buscar credenciais MP:', error);
      return null;
    }

    if (!data || data.length === 0) {
      console.warn('Nenhuma credencial MP configurada');
      return null;
    }

    return data[0];
  } catch (err) {
    console.error('Erro ao buscar credenciais:', err);
    return null;
  }
};

/**
 * Verifica se o Mercado Pago está configurado
 */
export const isMercadoPagoConfigured = async (): Promise<boolean> => {
  const credentials = await getMercadoPagoCredentials();
  return !!(credentials && credentials.access_token);
};

/**
 * Cria uma preferência de pagamento via Edge Function
 */
export const createPaymentPreference = async (
  request: CheckoutRequest
): Promise<CheckoutResponse> => {
  try {
    // Verificar autenticação
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return {
        success: false,
        error: 'Usuário não autenticado. Faça login para continuar.',
      };
    }

    // Garantir que o userId é do usuário atual (segurança)
    if (request.userId !== user.id) {
      return {
        success: false,
        error: 'Usuário inválido.',
      };
    }

    // Log de tentativa de checkout
    try {
      await supabase.rpc('log_checkout_attempt', {
        p_plan_id: request.planId,
        p_billing_cycle: request.billingCycle,
        p_amount: request.amount,
      });
    } catch (logError) {
      console.warn('Erro ao registrar log de checkout:', logError);
      // Não bloqueia o checkout se o log falhar
    }

    // Chamar Edge Function
    const { data, error } = await supabase.functions.invoke('create-preference', {
      body: request,
    });

    if (error) {
      console.error('Erro ao criar preferência:', error);
      return {
        success: false,
        error: error.message || 'Erro ao criar preferência de pagamento.',
      };
    }

    if (!data || !data.initPoint) {
      return {
        success: false,
        error: 'Resposta inválida do servidor.',
      };
    }

    return {
      success: true,
      preferenceId: data.preferenceId,
      initPoint: data.initPoint,
      sandboxInitPoint: data.sandboxInitPoint,
    };
  } catch (err) {
    console.error('Erro inesperado ao criar preferência:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro inesperado ao processar pagamento.',
    };
  }
};

/**
 * Inicia o fluxo de checkout do Mercado Pago
 * Cria a preferência e redireciona para o checkout
 */
export const initiateCheckout = async (
  request: CheckoutRequest
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Verificar se MP está configurado
    const isConfigured = await isMercadoPagoConfigured();
    if (!isConfigured) {
      return {
        success: false,
        error: 'Mercado Pago não está configurado. Entre em contato com o suporte.',
      };
    }

    // Criar preferência
    const result = await createPaymentPreference(request);

    if (!result.success || !result.initPoint) {
      return {
        success: false,
        error: result.error || 'Erro ao criar preferência de pagamento.',
      };
    }

    // Redirecionar para checkout do Mercado Pago
    // Usar sandbox_init_point se estiver em ambiente de teste
    const credentials = await getMercadoPagoCredentials();
    const checkoutUrl = credentials?.is_production
      ? result.initPoint
      : result.sandboxInitPoint || result.initPoint;

    // Abrir em nova aba (melhor UX)
    window.open(checkoutUrl, '_blank');

    return {
      success: true,
    };
  } catch (err) {
    console.error('Erro ao iniciar checkout:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao iniciar checkout.',
    };
  }
};

/**
 * Formata o preço para exibição
 */
export const formatPrice = (price: number): string => {
  return price.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Calcula o preço com base no ciclo de faturamento
 */
export const calculatePrice = (
  monthlyPrice: number,
  yearlyPrice: number,
  billingCycle: 'monthly' | 'yearly'
): number => {
  if (billingCycle === 'monthly') {
    return monthlyPrice;
  }
  // Retornar preço mensal equivalente do plano anual
  return yearlyPrice / 12;
};

/**
 * Calcula o valor total anual
 */
export const calculateYearlyTotal = (
  monthlyPrice: number,
  yearlyPrice: number
): number => {
  return yearlyPrice > 0 ? yearlyPrice : monthlyPrice * 12;
};

/**
 * Calcula a economia do plano anual
 */
export const calculateYearlySavings = (
  monthlyPrice: number,
  yearlyPrice: number
): { amount: number; percentage: number } => {
  const monthlyTotal = monthlyPrice * 12;
  const yearlyTotal = yearlyPrice > 0 ? yearlyPrice : monthlyTotal;
  const savings = monthlyTotal - yearlyTotal;
  const percentage = (savings / monthlyTotal) * 100;

  return {
    amount: savings,
    percentage: Math.round(percentage),
  };
};

/**
 * Verifica se o plano é "sob consulta" (Corporativo, Enterprise, etc.)
 */
export const isCustomPlan = (planName: string): boolean => {
  const customPlanNames = ['corporativo', 'enterprise', 'personalizado', 'custom'];
  return customPlanNames.some((name) => 
    planName.toLowerCase().includes(name)
  );
};

/**
 * Retorna o link de contato para planos customizados
 * Ajuste o número do WhatsApp conforme necessário
 */
export const getCustomPlanContactLink = (planName: string): string => {
  const whatsappNumber = '5511999999999'; // Ajustar número
  const message = encodeURIComponent(
    `Olá! Tenho interesse no plano ${planName}. Gostaria de mais informações.`
  );
  return `https://wa.me/${whatsappNumber}?text=${message}`;
};

/**
 * Retorna o link de contato via formulário
 */
export const getContactFormLink = (): string => {
  return '/#/contact';
};
