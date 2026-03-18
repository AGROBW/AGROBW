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

export const isMercadoPagoConfigured = async (): Promise<boolean> => {
  const credentials = await getMercadoPagoCredentials();
  return !!(credentials && credentials.access_token);
};

export const createPaymentPreference = async (
  request: CheckoutRequest
): Promise<CheckoutResponse> => {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: userError?.message || 'Usuario nao autenticado. Faca login para continuar.',
      };
    }

    if (request.userId !== user.id) {
      return {
        success: false,
        error: 'Usuario invalido.',
      };
    }

    try {
      await supabase.rpc('log_checkout_attempt', {
        p_plan_id: request.planId,
        p_billing_cycle: request.billingCycle,
        p_amount: request.amount,
      });
    } catch (logError) {
      console.warn('Erro ao registrar log de checkout:', logError);
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return {
        success: false,
        error: sessionError?.message || 'Sessao invalida para criar checkout.',
      };
    }

    const { data, error } = await supabase.functions.invoke('create-preference', {
      method: 'POST',
      body: request,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      console.error('Erro ao criar preferencia:', error);
      return {
        success: false,
        error: error.message || 'Erro ao criar preferencia de pagamento.',
      };
    }

    if (!data || !data.initPoint) {
      return {
        success: false,
        error: data?.error || 'Resposta invalida do servidor.',
      };
    }

    return {
      success: true,
      preferenceId: data.preferenceId,
      initPoint: data.initPoint,
      sandboxInitPoint: data.sandboxInitPoint,
    };
  } catch (err) {
    console.error('Erro inesperado ao criar preferencia:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro inesperado ao processar pagamento.',
    };
  }
};

export const initiateCheckout = async (
  request: CheckoutRequest
): Promise<{ success: boolean; error?: string }> => {
  try {
    const isConfigured = await isMercadoPagoConfigured();
    if (!isConfigured) {
      return {
        success: false,
        error: 'Mercado Pago nao esta configurado. Entre em contato com o suporte.',
      };
    }

    const result = await createPaymentPreference(request);

    if (!result.success || !result.initPoint) {
      return {
        success: false,
        error: result.error || 'Erro ao criar preferencia de pagamento.',
      };
    }

    const credentials = await getMercadoPagoCredentials();
    const checkoutUrl = credentials?.is_production
      ? result.initPoint
      : result.sandboxInitPoint || result.initPoint;

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

export const formatPrice = (price: number): string => {
  return price.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const calculatePrice = (
  monthlyPrice: number,
  yearlyPrice: number,
  billingCycle: 'monthly' | 'yearly'
): number => {
  if (billingCycle === 'monthly') {
    return monthlyPrice;
  }

  return yearlyPrice > 0 ? yearlyPrice : monthlyPrice * 12;
};

export const calculateYearlyTotal = (
  monthlyPrice: number,
  yearlyPrice: number
): number => {
  return yearlyPrice > 0 ? yearlyPrice : monthlyPrice * 12;
};

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

export const isCustomPlan = (planName: string): boolean => {
  const customPlanNames = ['corporativo', 'enterprise', 'personalizado', 'custom'];
  return customPlanNames.some((name) => planName.toLowerCase().includes(name));
};

export const getCustomPlanContactLink = (planName: string): string => {
  const whatsappNumber = '5511999999999';
  const message = encodeURIComponent(
    `Ola! Tenho interesse no plano ${planName}. Gostaria de mais informacoes.`
  );
  return `https://wa.me/${whatsappNumber}?text=${message}`;
};

export const getContactFormLink = (): string => '/#/contact';
