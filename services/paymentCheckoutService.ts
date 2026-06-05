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

export type CheckoutResult = {
  success: boolean;
  error?: string;
  provider?: 'asaas';
  url?: string;
};

const stringifyUnknownError = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => stringifyUnknownError(item))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? parts.join(' | ') : null;
  }

  if (value && typeof value === 'object') {
    const maybeDescription = (value as Record<string, unknown>).description;
    const maybeMessage = (value as Record<string, unknown>).message;
    const maybeError = (value as Record<string, unknown>).error;
    const maybeDetails = (value as Record<string, unknown>).details;
    const maybeCode = (value as Record<string, unknown>).code;

    const preferred =
      stringifyUnknownError(maybeDescription) ||
      stringifyUnknownError(maybeMessage) ||
      stringifyUnknownError(maybeError) ||
      stringifyUnknownError(maybeDetails);

    if (preferred) {
      return preferred;
    }

    if (typeof maybeCode === 'string' && maybeCode.trim()) {
      return maybeCode.trim();
    }

    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  return null;
};

const readFunctionErrorResponse = async (response?: Response): Promise<string | null> => {
  if (!response) {
    return null;
  }

  try {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = await response.clone().json();
      return (
        stringifyUnknownError(payload?.error) ||
        stringifyUnknownError(payload?.message) ||
        stringifyUnknownError(payload?.details) ||
        stringifyUnknownError(payload)
      );
    }

    const text = await response.clone().text();
    return text || null;
  } catch (parseError) {
    console.error('Erro ao ler corpo da resposta da Edge Function:', parseError);
    return null;
  }
};

const initiateAsaasCheckout = async (
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

    const { data, error, response } = await supabase.functions.invoke('create-asaas-checkout-session', {
      method: 'POST',
      body: request,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      const errorDetails = await readFunctionErrorResponse(response);
      console.error('Erro ao criar checkout Asaas:', error, errorDetails);
      return {
        success: false,
        error:
          errorDetails ||
          error.message ||
          `Erro ao criar checkout Asaas${response?.status ? ` (HTTP ${response.status})` : ''}.`,
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
      provider: 'asaas',
      url: data.url,
    };
  } catch (err) {
    console.error('Erro inesperado ao iniciar checkout Asaas:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro inesperado ao processar checkout Asaas.',
    };
  }
};

export const initiatePlatformPlanCheckout = async (
  request: CheckoutRequest
): Promise<CheckoutResult> => {
  const result = await initiateAsaasCheckout({
    ...request,
    itemType: 'plan',
  });

  return { ...result, provider: 'asaas' };
};

export const initiateBoosterCheckout = async (
  request: BoosterCheckoutRequest
): Promise<CheckoutResult> => {
  const result = await initiateAsaasCheckout({
    planId: request.boosterId,
    planName: request.boosterName,
    planDescription: request.boosterDescription,
    billingCycle: 'monthly',
    amount: request.amount,
    userId: request.userId,
    itemType: 'booster',
    boosterId: request.boosterId,
    itemName: request.boosterName,
  });

  return { ...result, provider: 'asaas' };
};
