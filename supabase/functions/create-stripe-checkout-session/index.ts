import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { logSecurityEvent } from '../_shared/security.ts';

interface StripeCheckoutRequest {
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  userId: string;
  itemType?: 'plan' | 'booster';
  boosterId?: string;
  itemName?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://bwagro.vercel.app',  // VULN-002 fix: Allowlist
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const stripeRequest = async (
  secretKey: string,
  path: string,
  body: URLSearchParams,
) => {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(
      {
        success: false,
        error: 'Configuracao incompleta do Supabase',
      },
      500
    );
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  if (!authHeader.startsWith('Bearer ')) {
    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/functions/v1/create-stripe-checkout-session',
      attemptedAction: 'stripe_checkout_missing_bearer',
      reason: 'Authorization header ausente ou sem Bearer token.',
    });
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/functions/v1/create-stripe-checkout-session',
      attemptedAction: 'stripe_checkout_invalid_jwt',
      reason: authError?.message || 'JWT invalido.',
    });
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  try {
    const body: StripeCheckoutRequest = await req.json();
    const itemType = body.itemType === 'booster' ? 'booster' : 'plan';
    const effectiveResourceId = itemType === 'booster' ? body.boosterId || body.planId : body.planId;

    if (!body.planId || !body.billingCycle || body.userId !== user.id || !effectiveResourceId) {
      return jsonResponse({ success: false, error: 'Invalid request data' }, 400);
    }

    const { data: gatewayConfig, error: gatewayError } = await supabaseAdmin
      .rpc('get_checkout_gateway_public_safe');

    const gatewayRow = Array.isArray(gatewayConfig) ? gatewayConfig[0] : gatewayConfig;

    if (
      gatewayError ||
      !gatewayRow?.stripe_enabled ||
      gatewayRow?.preferred_checkout_provider !== 'stripe' ||
      !gatewayRow?.stripe_checkout_allowed_for_current_user
    ) {
      return jsonResponse(
        {
          success: false,
          error: 'Checkout Stripe indisponivel para esta conta no momento.',
          details:
            gatewayError?.message ||
            gatewayRow?.stripe_checkout_reason ||
            'stripe checkout blocked by rollout policy',
        },
        403
      );
    }

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('payment_settings')
      .select('stripe_secret_key, is_production')
      .eq('id', '00000000-0000-0000-0000-000000000005')
      .single();

    if (settingsError || !settings?.stripe_secret_key) {
      return jsonResponse(
        {
          success: false,
          error: 'Stripe sem secret key configurada.',
          details: settingsError?.message || 'payment_settings.stripe_secret_key vazio',
        },
        400
      );
    }

    let priceId = '';
    let itemTitle = '';
    let itemDescription = '';
    let auditResourceType = 'PLAN';

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
        .eq('status', 'active')
        .order('current_period_end', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (activeSubscriptionError) {
        return jsonResponse(
          {
            success: false,
            error: 'Nao foi possivel validar o plano ativo para compra do booster.',
            details: activeSubscriptionError.message,
          },
          500
        );
      }

      const activePlan = Array.isArray((activeSubscription as any)?.plan)
        ? (activeSubscription as any)?.plan?.[0] ?? null
        : (activeSubscription as any)?.plan ?? null;
      const hasEligiblePaidPlan =
        !!activePlan &&
        !activePlan.is_downgrade_plan &&
        (Number(activePlan.monthly_price ?? 0) > 0 || Number(activePlan.yearly_price ?? 0) > 0);

      if (!hasEligiblePaidPlan) {
        await logSecurityEvent(supabaseAdmin, {
          req,
          attemptedRoute: '/functions/v1/create-stripe-checkout-session',
          attemptedAction: 'create_stripe_checkout_booster_without_paid_plan',
          userId: user.id,
          email: user.email ?? null,
          severity: 'warning',
          reason: 'Usuario tentou comprar booster Stripe sem plano pago elegivel.',
          metadata: {
            boosterId: effectiveResourceId,
            activePlanName: activePlan?.name ?? null,
          },
        });

        return jsonResponse(
          {
            success: false,
            error: 'Booster disponivel apenas para assinantes com plano pago ativo.',
            details: activePlan?.name
              ? `Plano atual: ${activePlan.name}`
              : 'Nenhum plano pago ativo elegivel encontrado.',
          },
          403
        );
      }

      const { data: booster, error: boosterError } = await supabaseAdmin
        .from('highlight_boosters')
        .select('id, name, description, monthly_price, is_active, stripe_price_id, max_purchases_per_30_days')
        .eq('id', effectiveResourceId)
        .maybeSingle();

      if (boosterError || !booster) {
        return jsonResponse(
          {
            success: false,
            error: 'Booster nao encontrado',
            details: boosterError?.message || 'Booster not found',
          },
          404
        );
      }

      if (!booster.is_active) {
        return jsonResponse({ success: false, error: 'Booster inativo' }, 400);
      }

      priceId = String(booster.stripe_price_id || '').trim();
      if (!priceId) {
        return jsonResponse(
          {
            success: false,
            error: 'Booster sem Price ID Stripe configurado.',
            details: `boosterId=${effectiveResourceId}`,
          },
          400
        );
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
        return jsonResponse(
          {
            success: false,
            error: 'Erro ao validar limite do booster',
            details: limitError.message,
          },
          500
        );
      }

      if ((recentPurchasesCount || 0) >= Number(booster.max_purchases_per_30_days || 2)) {
        return jsonResponse(
          {
            success: false,
            error: `Limite de ${Number(booster.max_purchases_per_30_days || 2)} booster(s) a cada 30 dias atingido.`,
          },
          400
        );
      }

      itemTitle = booster.name;
      itemDescription = booster.description || `Compra do booster ${booster.name}`;
      auditResourceType = 'PAYMENT';
    } else {
      const { data: plan, error: planError } = await supabaseAdmin
        .from('plans')
        .select('id, name, description, is_active, monthly_price, yearly_price, stripe_monthly_price_id, stripe_yearly_price_id')
        .eq('id', body.planId)
        .maybeSingle();

      if (planError || !plan) {
        return jsonResponse(
          {
            success: false,
            error: 'Plano nao encontrado',
            details: planError?.message || 'Plan not found',
          },
          404
        );
      }

      if (!plan.is_active) {
        return jsonResponse({ success: false, error: 'Plano inativo' }, 400);
      }

      priceId =
        body.billingCycle === 'yearly'
          ? String(plan.stripe_yearly_price_id || '').trim()
          : String(plan.stripe_monthly_price_id || '').trim();

      if (!priceId) {
        return jsonResponse(
          {
            success: false,
            error: 'Plano sem Price ID Stripe configurado para este ciclo.',
            details: `billingCycle=${body.billingCycle}`,
          },
          400
        );
      }

      itemTitle = plan.name;
      itemDescription = plan.description || `Plano ${plan.name}`;
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('email, name')
      .eq('id', user.id)
      .maybeSingle();

    const { data: existingStripeContext } = await supabaseAdmin
      .from('user_subscriptions')
      .select('provider_customer_id')
      .eq('user_id', user.id)
      .eq('provider', 'stripe')
      .not('provider_customer_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const siteUrl = Deno.env.get('SITE_URL') || 'https://bwagro.com.br';
    const checkoutParams = new URLSearchParams();
    checkoutParams.set('mode', itemType === 'booster' ? 'payment' : 'subscription');
    checkoutParams.set(
      'success_url',
      `${siteUrl}/minha-conta/financeiro?payment=success&provider=stripe&item=${itemType}&session_id={CHECKOUT_SESSION_ID}`
    );
    checkoutParams.set('cancel_url', `${siteUrl}/planos?payment=cancelled&provider=stripe&item=${itemType}`);
    checkoutParams.set('client_reference_id', user.id);
    checkoutParams.set('line_items[0][price]', priceId);
    checkoutParams.set('line_items[0][quantity]', '1');
    checkoutParams.set('allow_promotion_codes', 'true');
    checkoutParams.set('metadata[user_id]', user.id);
    checkoutParams.set('metadata[plan_id]', itemType === 'plan' ? body.planId : '');
    checkoutParams.set('metadata[booster_id]', itemType === 'booster' ? effectiveResourceId : '');
    checkoutParams.set('metadata[billing_cycle]', body.billingCycle);
    checkoutParams.set('metadata[item_type]', itemType);
    checkoutParams.set('metadata[item_name]', body.itemName || itemTitle);

    if (itemType === 'plan') {
      checkoutParams.set('subscription_data[metadata][user_id]', user.id);
      checkoutParams.set('subscription_data[metadata][plan_id]', body.planId);
      checkoutParams.set('subscription_data[metadata][billing_cycle]', body.billingCycle);
      checkoutParams.set('subscription_data[metadata][item_type]', 'plan');
    } else {
      checkoutParams.set('customer_creation', 'always');
      checkoutParams.set('submit_type', 'pay');
    }

    if (existingStripeContext?.provider_customer_id) {
      checkoutParams.set('customer', existingStripeContext.provider_customer_id);
    } else if (profile?.email || user.email) {
      checkoutParams.set('customer_email', profile?.email || user.email || '');
    }

    const stripeResult = await stripeRequest(settings.stripe_secret_key, '/v1/checkout/sessions', checkoutParams);

    if (!stripeResult.ok || !stripeResult.payload?.url) {
      return jsonResponse(
        {
          success: false,
          error: 'Falha ao criar sessao Stripe.',
          details: stripeResult.payload || `HTTP ${stripeResult.status}`,
        },
        500
      );
    }

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: user.id,
      admin_email: profile?.email || user.email || 'unknown@unknown',
      admin_name: profile?.name || user.email || 'Unknown User',
      action: 'STRIPE_CHECKOUT_CREATED',
      resource_type: auditResourceType,
      resource_id: effectiveResourceId,
      new_value: {
        stripe_checkout_session_id: stripeResult.payload.id,
        stripe_customer_id: stripeResult.payload.customer || null,
        billing_cycle: body.billingCycle,
        provider: 'stripe',
        livemode: stripeResult.payload.livemode,
        item_type: itemType,
        item_name: body.itemName || itemTitle,
      },
      reason: 'Sessao de checkout Stripe criada',
    });

    return jsonResponse({
      success: true,
      provider: 'stripe',
      url: stripeResult.payload.url,
      sessionId: stripeResult.payload.id,
      customerId: stripeResult.payload.customer || null,
      livemode: stripeResult.payload.livemode ?? settings.is_production,
    });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500
    );
  }
});
