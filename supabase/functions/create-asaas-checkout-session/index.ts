import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { extractBearerToken, logSecurityEvent } from '../_shared/security.ts';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';

interface AsaasCheckoutRequest {
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

type BillingModel = 'one_time' | 'recurring';

const resolveCheckoutBillingTypes = (billingModel: BillingModel) => {
  if (billingModel === 'recurring') {
    return ['CREDIT_CARD'];
  }

  return ['PIX', 'CREDIT_CARD'];
};

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });

const normalizeDigits = (value?: string | null) => (value || '').replace(/\D+/g, '');
const normalizeEmail = (value?: string | null) => {
  const email = (value || '').trim();
  return email.includes('@') ? email : '';
};
const normalizePhone = (value?: string | null) => {
  const digits = normalizeDigits(value);
  return digits.length >= 10 ? digits : '';
};
const isLikelyValidBrazilPhone = (value?: string | null) => {
  const digits = normalizeDigits(value);
  if (!/^[1-9]{2}(?:9\d{8}|\d{8})$/.test(digits)) {
    return false;
  }

  const subscriberNumber = digits.slice(2);
  if (/^(\d)\1+$/.test(subscriberNumber)) {
    return false;
  }

  return true;
};
const normalizeDocument = (value?: string | null) => {
  const digits = normalizeDigits(value);
  return digits.length === 11 || digits.length === 14 ? digits : '';
};
const normalizePostalCode = (value?: string | null) => {
  const digits = normalizeDigits(value);
  return digits.length === 8 ? digits : '';
};
const normalizeText = (value?: string | null) => {
  const text = (value || '').trim();
  return text;
};
const isLikelyValidCustomerName = (name?: string | null, document?: string | null) => {
  const normalizedName = normalizeText(name);
  if (normalizedName.length < 3) {
    return false;
  }

  const doc = normalizeDocument(document);
  if (doc.length === 11) {
    return normalizedName.split(/\s+/).filter(Boolean).length >= 2;
  }

  return true;
};

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const isPublicHttpsOrigin = (value?: string | null) => {
  if (!value) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== 'https:') {
      return false;
    }

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local')
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

const resolveSiteUrl = (req: Request) => {
  const configuredSiteUrl = Deno.env.get('SITE_URL');
  const origin = req.headers.get('origin') || req.headers.get('Origin');

  if (isPublicHttpsOrigin(origin)) {
    return origin;
  }

  if (isPublicHttpsOrigin(configuredSiteUrl)) {
    return configuredSiteUrl as string;
  }

  return 'https://agrobw.com.br';
};

const resolveAsaasApiBase = (isProduction: boolean) =>
  isProduction ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';

const buildCheckoutUrlFallback = (checkoutId: string) =>
  `https://www.asaas.com/c/checkout/${checkoutId}`;

const compactObject = <T extends Record<string, unknown>>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined) {
        return false;
      }

      if (typeof entry === 'string') {
        return entry.trim().length > 0;
      }

      if (Array.isArray(entry)) {
        return entry.length > 0;
      }

      return true;
    })
  ) as Partial<T>;

const extractAsaasErrors = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const errors = (payload as Record<string, unknown>).errors;
  if (Array.isArray(errors)) {
    const messages = errors
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const code = typeof (item as Record<string, unknown>).code === 'string'
          ? String((item as Record<string, unknown>).code).trim()
          : '';
        const description = typeof (item as Record<string, unknown>).description === 'string'
          ? String((item as Record<string, unknown>).description).trim()
          : '';

        if (code && description) {
          return `${code}: ${description}`;
        }

        return description || code || null;
      })
      .filter((item): item is string => Boolean(item));

    if (messages.length > 0) {
      return messages.join(' | ');
    }
  }

  const message = (payload as Record<string, unknown>).message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
};

const requestAsaasCheckout = async (
  apiBaseUrl: string,
  apiKey: string,
  payload: Record<string, unknown>
) => {
  const response = await fetch(`${apiBaseUrl}/checkouts`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      access_token: apiKey,
      'User-Agent': 'AGRO-BW/1.0.0',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightBrowser(req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(req, { success: false, error: 'Configuracao incompleta do Supabase.' }, 500);
  }

  const token = extractBearerToken(req);
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    },
  });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  if (!token) {
    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/functions/v1/create-asaas-checkout-session',
      attemptedAction: 'asaas_checkout_missing_bearer',
      reason: 'Authorization header ausente ou sem Bearer token.',
    });
    return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/functions/v1/create-asaas-checkout-session',
      attemptedAction: 'asaas_checkout_invalid_jwt',
      reason: authError?.message || 'JWT invalido.',
    });
    return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);
  }

  try {
    const body: AsaasCheckoutRequest = await req.json();
    const itemType = body.itemType === 'booster' ? 'booster' : 'plan';
    const effectiveResourceId = itemType === 'booster' ? body.boosterId || body.planId : body.planId;

    if (!body.planId || !body.userId || body.userId !== user.id || !effectiveResourceId) {
      return jsonResponse(req, { success: false, error: 'Invalid request data.' }, 400);
    }

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('payment_settings')
      .select('asaas_api_key, is_production, preferred_checkout_provider')
      .eq('id', '00000000-0000-0000-0000-000000000005')
      .single();

    if (settingsError || !settings?.asaas_api_key) {
      return jsonResponse(
        req,
        {
          success: false,
          error: 'Asaas nao esta configurado no momento.',
          details: settingsError?.message || 'payment_settings.asaas_api_key vazio',
        },
        400
      );
    }

    if (settings.preferred_checkout_provider !== 'asaas') {
      return jsonResponse(req, { success: false, error: 'O gateway principal ainda nao esta apontando para o Asaas.' }, 409);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('name, email, phone, document, cep, logradouro, numero, bairro, cidade, estado')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return jsonResponse(
        req,
        {
          success: false,
          error: 'Nao foi possivel carregar os dados do perfil para o checkout.',
          details: profileError.message,
        },
        500
      );
    }

    const activeSubscriptionStatuses = ['active', 'trialing', 'past_due'];
    let amount = 0;
    let itemTitle = body.itemName || body.planName || 'AGRO BW';
    let itemDescription = body.planDescription || itemTitle;
    let externalReference = '';
    let chargeTypes: string[] = [];
    let billingTypes: string[] = [];
    let subscriptionPayload: Record<string, unknown> | undefined;

    if (itemType === 'booster') {
      const { data: activeSubscription, error: activeSubscriptionError } = await supabaseAdmin
        .from('user_subscriptions')
        .select(`
          status,
          current_period_end,
          plan:plans(
            id,
            name,
            monthly_price,
            yearly_price,
            is_downgrade_plan
          )
        `)
        .eq('user_id', user.id)
        .in('status', activeSubscriptionStatuses)
        .order('current_period_end', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (activeSubscriptionError) {
        return jsonResponse(req, { success: false, error: activeSubscriptionError.message }, 500);
      }

      const activePlan = Array.isArray((activeSubscription as any)?.plan)
        ? (activeSubscription as any)?.plan?.[0] ?? null
        : (activeSubscription as any)?.plan ?? null;
      const hasEligiblePaidPlan =
        !!activePlan &&
        !activePlan.is_downgrade_plan &&
        (Number(activePlan.monthly_price ?? 0) > 0 || Number(activePlan.yearly_price ?? 0) > 0);

      if (!hasEligiblePaidPlan) {
        return jsonResponse(
          req,
          {
            success: false,
            error: 'Booster disponivel apenas para assinantes com plano pago ativo.',
          },
          403
        );
      }

      const { data: booster, error: boosterError } = await supabaseAdmin
        .from('highlight_boosters')
        .select('id, name, description, monthly_price, is_active, max_purchases_per_30_days')
        .eq('id', effectiveResourceId)
        .maybeSingle();

      if (boosterError || !booster) {
        return jsonResponse(req, { success: false, error: 'Booster nao encontrado.' }, 404);
      }

      if (!booster.is_active) {
        return jsonResponse(req, { success: false, error: 'Booster inativo.' }, 400);
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: recentPurchasesCount, error: limitError } = await supabaseAdmin
        .from('user_highlight_booster_purchases')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('booster_id', effectiveResourceId)
        .eq('status', 'credited')
        .gte('created_at', thirtyDaysAgo);

      if (limitError) {
        return jsonResponse(req, { success: false, error: limitError.message }, 500);
      }

      const purchaseLimit = Number(booster.max_purchases_per_30_days || 2);
      if ((recentPurchasesCount || 0) >= purchaseLimit) {
        return jsonResponse(
          req,
          { success: false, error: `Limite de ${purchaseLimit} booster(s) a cada 30 dias atingido.` },
          400
        );
      }

      amount = Number(booster.monthly_price ?? 0);
      itemTitle = booster.name;
      itemDescription = booster.description || `Compra do booster ${booster.name}`;
      externalReference = `booster|${user.id}|${effectiveResourceId}`;
      chargeTypes = ['DETACHED'];
      billingTypes = resolveCheckoutBillingTypes('one_time');
    } else {
      const { data: existingSubscription, error: existingSubscriptionError } = await supabaseAdmin
        .from('user_subscriptions')
        .select('id,billing_model,current_period_end')
        .eq('user_id', user.id)
        .in('status', activeSubscriptionStatuses)
        .gte('current_period_end', new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (existingSubscriptionError) {
        return jsonResponse(req, { success: false, error: existingSubscriptionError.message }, 500);
      }

      if (existingSubscription?.id && existingSubscription.billing_model === 'recurring') {
        return jsonResponse(
          req,
          {
            success: false,
            error:
              'Sua conta ja possui um plano com cobranca recorrente em andamento. Trocas antes do vencimento ainda precisam ser tratadas primeiro na area Financeiro para evitar cobrancas duplicadas.',
          },
          409
        );
      }

      const { data: plan, error: planError } = await supabaseAdmin
        .from('plans')
        .select('id, name, description, is_active, monthly_price, yearly_price, billing_model, has_yearly_billing')
        .eq('id', body.planId)
        .maybeSingle();

      if (planError || !plan) {
        return jsonResponse(req, { success: false, error: 'Plano nao encontrado.' }, 404);
      }

      if (!plan.is_active) {
        return jsonResponse(req, { success: false, error: 'Plano inativo.' }, 400);
      }

      // Blindagem: rejeita checkout anual quando o plano nao oferece ciclo anual.
      if (body.billingCycle === 'yearly' && plan.has_yearly_billing === false) {
        await logSecurityEvent(supabaseAdmin, {
          req,
          attemptedRoute: '/functions/v1/create-asaas-checkout-session',
          attemptedAction: 'asaas_checkout_yearly_not_allowed',
          reason: `Plano ${body.planId} nao oferece ciclo anual.`,
        });
        return jsonResponse(
          req,
          { success: false, error: 'Este plano nao esta disponivel no ciclo anual.' },
          400
        );
      }

      const billingModel: BillingModel = plan.billing_model === 'recurring' ? 'recurring' : 'one_time';

      amount =
        body.billingCycle === 'yearly'
          ? Number(plan.yearly_price ?? 0)
          : Number(plan.monthly_price ?? 0);
      itemTitle = plan.name;
      itemDescription = plan.description || `Plano ${plan.name}`;
      externalReference = `plan|${user.id}|${body.planId}|${body.billingCycle}|${billingModel}`;
      billingTypes = resolveCheckoutBillingTypes(billingModel);

      if (billingModel === 'recurring') {
        chargeTypes = ['RECURRENT'];
        subscriptionPayload = {
          cycle: body.billingCycle === 'yearly' ? 'YEARLY' : 'MONTHLY',
          nextDueDate: toIsoDate(new Date()),
        };
      } else {
        chargeTypes = ['DETACHED'];
      }
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse(req, { success: false, error: 'Valor invalido para checkout.' }, 400);
    }

    const siteUrl = resolveSiteUrl(req);
    const metadata = (user.user_metadata && typeof user.user_metadata === 'object')
      ? (user.user_metadata as Record<string, unknown>)
      : {};
    const profileData = {
      name: profile?.name || (typeof metadata.name === 'string' ? metadata.name : '') || user.email || 'Cliente AGRO BW',
      email: profile?.email || user.email || (typeof metadata.email === 'string' ? metadata.email : '') || '',
      phone: profile?.phone || (typeof metadata.phone === 'string' ? metadata.phone : ''),
      document: (profile as any)?.document || (typeof metadata.document === 'string' ? metadata.document : ''),
      cep: (profile as any)?.cep || (typeof metadata.cep === 'string' ? metadata.cep : ''),
      logradouro: (profile as any)?.logradouro || (typeof metadata.logradouro === 'string' ? metadata.logradouro : ''),
      numero: (profile as any)?.numero || (typeof metadata.numero === 'string' ? metadata.numero : ''),
      complemento: (profile as any)?.complemento || (typeof metadata.complemento === 'string' ? metadata.complemento : ''),
      bairro: (profile as any)?.bairro || (typeof metadata.bairro === 'string' ? metadata.bairro : ''),
      cidade: (profile as any)?.cidade || (typeof metadata.cidade === 'string' ? metadata.cidade : ''),
      estado: (profile as any)?.estado || (typeof metadata.estado === 'string' ? metadata.estado : ''),
    };

    const normalizedPhone = normalizePhone(profileData.phone || null);
    const normalizedDocument = normalizeDocument(profileData.document || null);
    const normalizedPostalCode = normalizePostalCode(profileData.cep || null);
    const normalizedAddress = normalizeText(profileData.logradouro || null);
    const normalizedAddressNumber = normalizeText(profileData.numero || null);
    const normalizedComplement = normalizeText(profileData.complemento || null);
    const normalizedProvince = normalizeText(profileData.bairro || null);
    const normalizedCity = normalizeText(profileData.cidade || null);
    const normalizedState = normalizeText(profileData.estado || null);

    const missingProfileFields: string[] = [];
    if (!normalizedDocument) missingProfileFields.push('CPF/CNPJ');
    if (!normalizedPhone) missingProfileFields.push('WhatsApp/telefone');
    if (!normalizedAddress) missingProfileFields.push('logradouro');
    if (!normalizedAddressNumber) missingProfileFields.push('numero');
    if (!normalizedPostalCode) missingProfileFields.push('CEP');
    if (!normalizedProvince) missingProfileFields.push('bairro');
    if (!normalizedCity) missingProfileFields.push('cidade');
    if (!normalizedState) missingProfileFields.push('estado');

    if (missingProfileFields.length > 0) {
      return jsonResponse(
        req,
        {
          success: false,
          error: `Complete seu cadastro antes de contratar este plano. Faltam: ${missingProfileFields.join(', ')}. Atualize em Minha Conta > Perfil, nas abas Dados principais e Localizacao e contato.`,
          details: {
            missingProfileFields,
          },
        },
        400
      );
    }

    const invalidProfileFields: string[] = [];
    if (!isLikelyValidCustomerName(profileData.name, normalizedDocument)) {
      invalidProfileFields.push('nome completo / razao social');
    }
    if (!isLikelyValidBrazilPhone(normalizedPhone)) {
      invalidProfileFields.push('WhatsApp com DDD valido');
    }

    if (invalidProfileFields.length > 0) {
      return jsonResponse(
        req,
        {
          success: false,
          error: `Alguns dados do cadastro nao passaram na validacao do gateway. Ajuste: ${invalidProfileFields.join(', ')}.`,
          details: {
            invalidProfileFields,
            help: 'Para pessoas fisicas, use nome completo. Para telefone, informe um numero real com DDD e evite numeros de teste repetidos.',
          },
        },
        400
      );
    }

    const customerData = compactObject({
      name: profileData.name,
      email: normalizeEmail(profileData.email || null) || undefined,
      phone: normalizedPhone || undefined,
      cpfCnpj: normalizedDocument || undefined,
      address: normalizedAddress || undefined,
      addressNumber: normalizedAddressNumber || undefined,
      complement: normalizedComplement || undefined,
      postalCode: normalizedPostalCode || undefined,
      province: normalizedProvince || undefined,
    });

    const checkoutPayload: Record<string, unknown> = compactObject({
      billingTypes,
      chargeTypes,
      minutesToExpire: 60,
      externalReference,
      callback: {
        successUrl: `${siteUrl}/minha-conta/financeiro?payment=success&provider=asaas&item=${itemType}`,
        cancelUrl: `${siteUrl}/minha-conta/financeiro?payment=cancelled&provider=asaas&item=${itemType}`,
        expiredUrl: `${siteUrl}/minha-conta/financeiro?payment=failure&provider=asaas&item=${itemType}`,
      },
      items: [
        {
          name: itemTitle,
          description: itemDescription,
          quantity: 1,
          value: amount,
        },
      ],
      customerData,
    });

    if (subscriptionPayload) {
      checkoutPayload.subscription = subscriptionPayload;
    }

    const asaasResult = await requestAsaasCheckout(
      resolveAsaasApiBase(Boolean(settings.is_production)),
      settings.asaas_api_key,
      checkoutPayload
    );

    if (!asaasResult.ok) {
      const asaasErrorMessage =
        extractAsaasErrors(asaasResult.data) ||
        (typeof asaasResult.data === 'string' ? asaasResult.data : null) ||
        `HTTP ${asaasResult.status}`;

      return jsonResponse(
        req,
        {
          success: false,
          error: asaasErrorMessage,
          details: asaasResult.data || `HTTP ${asaasResult.status}`,
        },
        asaasResult.status >= 400 && asaasResult.status < 500 ? 400 : 500
      );
    }

    const checkoutId = String(asaasResult.data?.id || '');
    const checkoutUrl =
      asaasResult.data?.link ||
      asaasResult.data?.checkoutUrl ||
      asaasResult.data?.url ||
      (checkoutId ? buildCheckoutUrlFallback(checkoutId) : null);

    if (!checkoutUrl) {
      return jsonResponse(req, { success: false, error: 'Checkout Asaas criado sem URL de acesso.' }, 500);
    }

    return jsonResponse(req, {
      success: true,
      provider: 'asaas',
      url: checkoutUrl,
      checkoutId,
      environment: settings.is_production ? 'production' : 'sandbox',
    });
  } catch (error) {
    console.error('Asaas checkout session error:', error);
    return jsonResponse(
      req,
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500
    );
  }
});
