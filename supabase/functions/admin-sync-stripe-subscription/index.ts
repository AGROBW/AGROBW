import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { logSecurityEvent } from '../_shared/security.ts';

interface SyncRequestBody {
  userSubscriptionId?: string;
  providerSubscriptionId?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

const normalizeCurrency = (value?: string | null) => String(value || 'BRL').toUpperCase();
const toIsoFromUnix = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
const toNumberAmount = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value / 100 : 0;

const mapStripeSubscriptionStatus = (status?: string | null) => {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'unpaid':
    case 'incomplete':
    case 'paused':
      return 'past_due';
    case 'incomplete_expired':
      return 'expired';
    default:
      return 'pending';
  }
};

const stripeGet = async (secretKey: string, path: string) => {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
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
    return jsonResponse({ success: false, error: 'Configuracao incompleta do Supabase' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  if (!authHeader.startsWith('Bearer ')) {
    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/functions/v1/admin-sync-stripe-subscription',
      attemptedAction: 'admin_sync_stripe_missing_bearer',
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
      attemptedRoute: '/functions/v1/admin-sync-stripe-subscription',
      attemptedAction: 'admin_sync_stripe_invalid_jwt',
      reason: authError?.message || 'JWT invalido.',
    });
    return jsonResponse({ success: false, error: 'Invalid token' }, 401);
  }

  const { data: operator } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, is_admin')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = Boolean(operator?.is_admin) || operator?.role === 'admin';
  if (!isAdmin) {
    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/functions/v1/admin-sync-stripe-subscription',
      attemptedAction: 'admin_sync_stripe_not_admin',
      reason: 'Usuario sem permissao administrativa.',
      userId: user.id,
      email: user.email || null,
    });
    return jsonResponse({ success: false, error: 'Forbidden' }, 403);
  }

  try {
    const body: SyncRequestBody = await req.json().catch(() => ({}));

    if (!body.userSubscriptionId && !body.providerSubscriptionId) {
      return jsonResponse({ success: false, error: 'Informe userSubscriptionId ou providerSubscriptionId.' }, 400);
    }

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('payment_settings')
      .select('stripe_secret_key')
      .eq('id', '00000000-0000-0000-0000-000000000005')
      .single();

    if (settingsError || !settings?.stripe_secret_key) {
      return jsonResponse({ success: false, error: 'Stripe sem secret key configurada.' }, 400);
    }

    let subscriptionQuery = supabaseAdmin
      .from('user_subscriptions')
      .select('id,user_id,plan_id,billing_cycle,provider,provider_customer_id,provider_subscription_id,provider_price_id,provider_checkout_session_id,status,current_period_start,current_period_end,cancel_at_period_end')
      .eq('provider', 'stripe');

    if (body.userSubscriptionId) {
      subscriptionQuery = subscriptionQuery.eq('id', body.userSubscriptionId);
    } else {
      subscriptionQuery = subscriptionQuery.eq('provider_subscription_id', body.providerSubscriptionId || '');
    }

    const { data: subscriptionRow, error: subscriptionLookupError } = await subscriptionQuery.maybeSingle();

    if (subscriptionLookupError || !subscriptionRow) {
      return jsonResponse(
        {
          success: false,
          error: 'Assinatura Stripe nao encontrada.',
          details: subscriptionLookupError?.message || null,
        },
        404
      );
    }

    if (!subscriptionRow.provider_subscription_id) {
      return jsonResponse(
        {
          success: false,
          error: 'A assinatura ainda nao possui provider_subscription_id salvo.',
        },
        400
      );
    }

    const query = new URLSearchParams();
    query.append('expand[]', 'items.data.price');
    query.append('expand[]', 'latest_invoice.payment_intent');
    query.append('expand[]', 'latest_invoice.charge');

    const stripeResult = await stripeGet(
      settings.stripe_secret_key,
      `/v1/subscriptions/${subscriptionRow.provider_subscription_id}?${query.toString()}`
    );

    if (!stripeResult.ok || !stripeResult.payload?.id) {
      return jsonResponse(
        {
          success: false,
          error: 'Falha ao consultar a assinatura na Stripe.',
          details: stripeResult.payload || `HTTP ${stripeResult.status}`,
        },
        500
      );
    }

    const stripeSubscription = stripeResult.payload;
    const mappedStatus = mapStripeSubscriptionStatus(String(stripeSubscription.status || 'pending'));
    const nextPeriodStart = toIsoFromUnix(stripeSubscription.current_period_start) || subscriptionRow.current_period_start;
    const nextPeriodEnd = toIsoFromUnix(stripeSubscription.current_period_end) || subscriptionRow.current_period_end;
    const nextTrialEnd = toIsoFromUnix(stripeSubscription.trial_end);
    const nextPriceId = stripeSubscription.items?.data?.[0]?.price?.id || subscriptionRow.provider_price_id;
    const nextCustomerId = stripeSubscription.customer || subscriptionRow.provider_customer_id;

    const { data: updatedSubscription, error: updateError } = await supabaseAdmin
      .from('user_subscriptions')
      .update({
        status: mappedStatus,
        provider_customer_id: nextCustomerId,
        provider_price_id: nextPriceId,
        current_period_start: nextPeriodStart,
        current_period_end: nextPeriodEnd,
        cancel_at_period_end: Boolean(stripeSubscription.cancel_at_period_end),
        trial_end_date: nextTrialEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriptionRow.id)
      .select('id,user_id,plan_id,status,provider_customer_id,provider_subscription_id,provider_price_id,current_period_start,current_period_end,cancel_at_period_end')
      .single();

    if (updateError) {
      throw updateError;
    }

    const latestInvoice = stripeSubscription.latest_invoice;
    if (latestInvoice?.id && latestInvoice.status === 'paid') {
      const paymentPayload = {
        user_id: subscriptionRow.user_id,
        subscription_id: subscriptionRow.id,
        plan_id: subscriptionRow.plan_id,
        provider: 'stripe',
        provider_payment_id: `stripe_invoice:${latestInvoice.id}`,
        provider_preference_id: null,
        provider_customer_id: nextCustomerId,
        provider_subscription_id: subscriptionRow.provider_subscription_id,
        provider_invoice_id: latestInvoice.id,
        provider_checkout_session_id: subscriptionRow.provider_checkout_session_id,
        external_reference: `plan|${subscriptionRow.user_id}|${subscriptionRow.plan_id}|${subscriptionRow.billing_cycle}`,
        billing_cycle: subscriptionRow.billing_cycle,
        description: `Assinatura Stripe - ${subscriptionRow.billing_cycle === 'yearly' ? 'Anual' : 'Mensal'}`,
        amount: toNumberAmount(latestInvoice.amount_paid ?? latestInvoice.amount_due ?? latestInvoice.total ?? 0),
        currency: normalizeCurrency(latestInvoice.currency),
        status: 'approved',
        status_detail: latestInvoice.status || null,
        payment_method:
          latestInvoice.payment_settings?.payment_method_types?.[0] ||
          latestInvoice.default_payment_method?.type ||
          null,
        receipt_url: latestInvoice.hosted_invoice_url || null,
        invoice_status: 'pending',
        paid_at: toIsoFromUnix(latestInvoice.status_transitions?.paid_at) || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          stripe_invoice_id: latestInvoice.id,
          stripe_payment_intent_id:
            typeof latestInvoice.payment_intent === 'string'
              ? latestInvoice.payment_intent
              : latestInvoice.payment_intent?.id || null,
          stripe_charge_id:
            latestInvoice.charge ||
            latestInvoice.payment_intent?.latest_charge ||
            null,
          hosted_invoice_url: latestInvoice.hosted_invoice_url || null,
          invoice_pdf: latestInvoice.invoice_pdf || null,
          livemode: latestInvoice.livemode ?? null,
          item_type: 'plan',
          raw_status: latestInvoice.status || null,
          source: 'admin_sync_stripe_subscription',
        },
      };

      const { error: paymentError } = await supabaseAdmin
        .from('payments')
        .upsert(paymentPayload, { onConflict: 'provider_payment_id' });

      if (paymentError) {
        throw paymentError;
      }
    }

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: user.id,
      admin_email: operator?.email || user.email || 'unknown@unknown',
      admin_name: operator?.name || user.email || 'Unknown User',
      action: 'STRIPE_SUBSCRIPTION_SYNC',
      resource_type: 'SUBSCRIPTION',
      resource_id: subscriptionRow.id,
      old_value: {
        status: subscriptionRow.status,
        current_period_start: subscriptionRow.current_period_start,
        current_period_end: subscriptionRow.current_period_end,
        cancel_at_period_end: subscriptionRow.cancel_at_period_end,
        provider_price_id: subscriptionRow.provider_price_id,
      },
      new_value: updatedSubscription,
      reason: 'Sincronizacao manual de assinatura Stripe pelo painel admin.',
    });

    return jsonResponse({
      success: true,
      subscription: updatedSubscription,
      latestInvoiceStatus: latestInvoice?.status || null,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[admin-sync-stripe-subscription] unexpected error:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500
    );
  }
});
