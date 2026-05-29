import { supabase } from '../src/lib/supabaseClient';

export interface CheckoutRequest {
  planId: string;
  planName: string;
  planDescription?: string;
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  userId: string;
  itemType?: 'plan' | 'booster';
  boosterId?: string;
  itemName?: string;
}

export interface BoosterCheckoutRequest {
  boosterId: string;
  boosterName: string;
  boosterDescription?: string;
  amount: number;
  userId: string;
}

type CheckoutAction = 'open_stripe_portal' | 'schedule_subscription_change';

type CheckoutResult = {
  success: boolean;
  error?: string;
  provider?: 'stripe';
  action?: CheckoutAction;
};

export interface CheckoutGatewayConfig {
  preferred_checkout_provider: 'stripe';
  stripe_enabled: boolean;
  stripe_rollout_mode: 'all_customers';
  stripe_checkout_allowed_for_current_user: boolean;
  stripe_checkout_reason: string;
  is_production: boolean;
}

const readFunctionErrorResponse = async (response?: Response): Promise<string | null> => {
  if (!response) {
    return null;
  }

  try {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = await response.clone().json();
      return payload?.details || payload?.error || payload?.message || JSON.stringify(payload);
    }

    const text = await response.clone().text();
    return text || null;
  } catch (parseError) {
    console.error('Erro ao ler corpo da resposta da Edge Function:', parseError);
    return null;
  }
};

export const getCheckoutGatewayConfig = async (): Promise<CheckoutGatewayConfig | null> => {
  try {
    const { data, error } = await supabase.rpc('get_checkout_gateway_public_safe');

    if (error) {
      console.error('Erro ao buscar gateway de checkout:', error);
      return null;
    }

    return (Array.isArray(data) ? data[0] : data) || null;
  } catch (err) {
    console.error('Erro inesperado ao buscar gateway de checkout:', err);
    return null;
  }
};

const ACTIVE_STRIPE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'];

const hasExistingStripePlanSubscription = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'stripe')
      .in('status', ACTIVE_STRIPE_SUBSCRIPTION_STATUSES)
      .not('provider_subscription_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Erro ao verificar assinatura Stripe existente:', error);
      return false;
    }

    return Boolean(data?.id);
  } catch (error) {
    console.warn('Erro inesperado ao verificar assinatura Stripe existente:', error);
    return false;
  }
};

const initiateStripeCheckout = async (
  request: CheckoutRequest
): Promise<CheckoutResult> => {
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
      console.warn('Erro ao registrar log de checkout Stripe:', logError);
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

    const { data, error, response } = await supabase.functions.invoke('create-stripe-checkout-session', {
      method: 'POST',
      body: request,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      const errorDetails = await readFunctionErrorResponse(response);
      console.error('Erro ao criar sessao Stripe:', error, errorDetails);
      return {
        success: false,
        error:
          errorDetails ||
          error.message ||
          `Erro ao criar sessao Stripe${response?.status ? ` (HTTP ${response.status})` : ''}.`,
      };
    }

    if (!data?.url) {
      return {
        success: false,
        error: data?.error || 'Resposta invalida do servidor.',
      };
    }

    window.location.assign(data.url);

    return {
      success: true,
    };
  } catch (err) {
    console.error('Erro inesperado ao iniciar checkout Stripe:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro inesperado ao processar checkout Stripe.',
    };
  }
};

export const initiatePlatformPlanCheckout = async (
  request: CheckoutRequest
): Promise<CheckoutResult> => {
  const hasExistingStripeSubscription = await hasExistingStripePlanSubscription(request.userId);
  if (hasExistingStripeSubscription) {
    return {
      success: false,
      provider: 'stripe',
      action: 'schedule_subscription_change',
      error: 'Sua conta já possui uma assinatura Stripe ativa. A alteração do plano será agendada para o próximo ciclo.',
    };
  }

  const gatewayConfig = await getCheckoutGatewayConfig();
  if (!gatewayConfig?.stripe_enabled) {
    return {
      success: false,
      provider: 'stripe',
      error: 'Stripe nao esta configurada no momento. Entre em contato com o suporte.',
    };
  }

  if (!gatewayConfig.stripe_checkout_allowed_for_current_user) {
    return {
      success: false,
      provider: 'stripe',
      error:
        gatewayConfig.stripe_checkout_reason === 'existing_paid_customer'
          ? 'Sua conta ainda precisa de sincronizacao final para operar 100% via Stripe. A equipe pode concluir essa liberacao pelo admin.'
          : 'O checkout Stripe ainda nao esta liberado para esta conta.',
    };
  }

  const result = await initiateStripeCheckout(request);
  return { ...result, provider: 'stripe' };
};

export const initiateBoosterCheckout = async (
  request: BoosterCheckoutRequest
): Promise<CheckoutResult> => {
  const gatewayConfig = await getCheckoutGatewayConfig();
  const checkoutRequest: CheckoutRequest = {
    planId: request.boosterId,
    planName: request.boosterName,
    planDescription: request.boosterDescription,
    billingCycle: 'monthly',
    amount: request.amount,
    userId: request.userId,
    itemType: 'booster',
    boosterId: request.boosterId,
    itemName: request.boosterName,
  };

  if (!gatewayConfig?.stripe_enabled) {
    return {
      success: false,
      provider: 'stripe',
      error: 'Stripe nao esta configurada no momento. Entre em contato com o suporte.',
    };
  }

  if (!gatewayConfig.stripe_checkout_allowed_for_current_user) {
    return {
      success: false,
      provider: 'stripe',
      error:
        gatewayConfig.stripe_checkout_reason === 'existing_paid_customer'
          ? 'Sua conta ainda precisa de sincronizacao final para operar 100% via Stripe. A equipe pode concluir essa liberacao pelo admin.'
          : 'O checkout Stripe ainda nao esta liberado para esta conta.',
    };
  }

  const result = await initiateStripeCheckout(checkoutRequest);
  return { ...result, provider: 'stripe' };
};

export const openStripeCustomerPortal = async (
  returnPath = '/minha-conta/financeiro'
): Promise<{ success: boolean; error?: string }> => {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return {
        success: false,
        error: sessionError?.message || 'Sessao invalida para abrir o portal.',
      };
    }

    const { data, error, response } = await supabase.functions.invoke('create-stripe-customer-portal-session', {
      method: 'POST',
      body: { returnPath },
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      const errorDetails = await readFunctionErrorResponse(response);
      return {
        success: false,
        error:
          errorDetails ||
          error.message ||
          `Erro ao abrir portal Stripe${response?.status ? ` (HTTP ${response.status})` : ''}.`,
      };
    }

    if (!data?.url) {
      return {
        success: false,
        error: data?.error || 'Resposta invalida do servidor.',
      };
    }

    window.location.assign(data.url);

    return {
      success: true,
    };
  } catch (err) {
    console.error('Erro ao abrir portal Stripe:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao abrir portal Stripe.',
    };
  }
};
