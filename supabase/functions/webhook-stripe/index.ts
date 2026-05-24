import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

type StripeWebhookEvent = {
  id: string;
  type: string;
  created?: number;
  livemode?: boolean;
  data?: {
    object?: Record<string, any>;
  };
};

type PaymentRowStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'in_process'
  | 'charged_back';

type SubscriptionRowStatus =
  | 'pending'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'cancelled'
  | 'expired';

type ResolvedStripeContext = {
  userId: string | null;
  planId: string | null;
  boosterId: string | null;
  billingCycle: 'monthly' | 'yearly' | null;
  itemType: 'plan' | 'booster' | 'unknown';
  checkoutSessionId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Info, apikey, stripe-signature',
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

const textResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: corsHeaders,
  });

const encoder = new TextEncoder();
const STRIPE_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const PAYMENT_SETTINGS_ID = '00000000-0000-0000-0000-000000000005';

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
};

const parseStripeSignature = (signatureHeader: string | null) => {
  if (!signatureHeader) {
    return null;
  }

  const values = signatureHeader.split(',');
  const signatures: string[] = [];
  let timestamp: string | null = null;

  for (const rawPart of values) {
    const [rawKey, rawValue] = rawPart.split('=', 2);
    const key = rawKey?.trim();
    const value = rawValue?.trim();

    if (!key || !value) {
      continue;
    }

    if (key === 't') {
      timestamp = value;
    }

    if (key === 'v1') {
      signatures.push(value.toLowerCase());
    }
  }

  if (!timestamp || signatures.length === 0) {
    return null;
  }

  return {
    timestamp,
    signatures,
  };
};

const signStripePayload = async (secret: string, payload: string, timestamp: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const manifest = `${timestamp}.${payload}`;
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(manifest));
  return toHex(signature);
};

const toIsoFromUnix = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;

const toNumberAmount = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value / 100 : 0;

const normalizeCurrency = (value?: string | null) => String(value || 'BRL').toUpperCase();

const mapStripeSubscriptionStatus = (status?: string | null): SubscriptionRowStatus => {
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

const mapInvoiceFailureToPaymentStatus = (status?: string | null): PaymentRowStatus => {
  switch (status) {
    case 'void':
    case 'uncollectible':
      return 'cancelled';
    default:
      return 'rejected';
  }
};

const inferBillingCycle = (
  metadataCycle?: string | null,
  priceInterval?: string | null
): 'monthly' | 'yearly' | null => {
  if (metadataCycle === 'monthly' || metadataCycle === 'yearly') {
    return metadataCycle;
  }

  if (priceInterval === 'month') {
    return 'monthly';
  }

  if (priceInterval === 'year') {
    return 'yearly';
  }

  return null;
};

const getItemType = (value?: string | null): 'plan' | 'booster' | 'unknown' => {
  if (value === 'plan') {
    return 'plan';
  }

  if (value === 'booster') {
    return 'booster';
  }

  return 'unknown';
};

const stripeApiRequest = async (
  secretKey: string,
  path: string,
  options?: {
    method?: 'GET' | 'POST';
    body?: URLSearchParams;
  }
) => {
  const method = options?.method || 'GET';
  const targetUrl = new URL(`https://api.stripe.com${path}`);

  const response = await fetch(targetUrl.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? options?.body?.toString() : undefined,
  });

  const payload = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
};

const fetchStripeSubscription = async (secretKey: string, subscriptionId: string) => {
  const query = new URLSearchParams();
  query.append('expand[]', 'items.data.price');
  query.append('expand[]', 'latest_invoice.payment_intent');
  const result = await stripeApiRequest(
    secretKey,
    `/v1/subscriptions/${subscriptionId}?${query.toString()}`
  );

  return result.ok ? result.payload : null;
};

const insertNotification = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: {
    user_id: string;
    type: string;
    title: string;
    content: string;
    link?: string | null;
  }
) => {
  const primaryInsert = await supabaseAdmin.from('notifications').insert({
    user_id: payload.user_id,
    type: payload.type,
    title: payload.title,
    content: payload.content,
    link: payload.link || null,
    is_read: false,
  });

  if (!primaryInsert.error) {
    return;
  }

  if (!/content/i.test(primaryInsert.error.message || '')) {
    throw primaryInsert.error;
  }

  const fallbackInsert = await supabaseAdmin.from('notifications').insert({
    user_id: payload.user_id,
    type: payload.type,
    title: payload.title,
    message: payload.content,
    link: payload.link || null,
    is_read: false,
  });

  if (fallbackInsert.error) {
    throw fallbackInsert.error;
  }
};

const loadPlanName = async (supabaseAdmin: ReturnType<typeof createClient>, planId: string | null) => {
  if (!planId) {
    return null;
  }

  const { data } = await supabaseAdmin
    .from('plans')
    .select('name')
    .eq('id', planId)
    .maybeSingle();

  return data?.name || null;
};

const loadBoosterName = async (supabaseAdmin: ReturnType<typeof createClient>, boosterId: string | null) => {
  if (!boosterId) {
    return null;
  }

  const { data } = await supabaseAdmin
    .from('highlight_boosters')
    .select('name')
    .eq('id', boosterId)
    .maybeSingle();

  return data?.name || null;
};

const resolveContext = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  rawContext: Partial<ResolvedStripeContext>
): Promise<ResolvedStripeContext> => {
  let userId = rawContext.userId || null;
  let planId = rawContext.planId || null;
  let boosterId = rawContext.boosterId || null;
  let billingCycle = rawContext.billingCycle || null;
  let itemType = rawContext.itemType || 'unknown';
  const checkoutSessionId = rawContext.checkoutSessionId || null;
  const customerId = rawContext.customerId || null;
  const subscriptionId = rawContext.subscriptionId || null;
  const priceId = rawContext.priceId || null;

  if (!userId || !planId || !billingCycle) {
    let query = supabaseAdmin
      .from('user_subscriptions')
      .select('user_id, plan_id, billing_cycle, provider_customer_id, provider_subscription_id, provider_checkout_session_id')
      .eq('provider', 'stripe')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (subscriptionId) {
      query = query.eq('provider_subscription_id', subscriptionId);
    } else if (checkoutSessionId) {
      query = query.eq('provider_checkout_session_id', checkoutSessionId);
    } else if (customerId) {
      query = query.eq('provider_customer_id', customerId);
    }

    const { data: existingSubscription } = await query.maybeSingle();

    if (existingSubscription) {
      userId = userId || existingSubscription.user_id || null;
      planId = planId || existingSubscription.plan_id || null;
      billingCycle =
        billingCycle ||
        (existingSubscription.billing_cycle === 'monthly' || existingSubscription.billing_cycle === 'yearly'
          ? existingSubscription.billing_cycle
          : null);
    }
  }

  if (!userId || !planId || !billingCycle) {
    let paymentQuery = supabaseAdmin
      .from('payments')
      .select('user_id, plan_id, booster_id, billing_cycle, provider_customer_id, provider_subscription_id, provider_checkout_session_id')
      .eq('provider', 'stripe')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (subscriptionId) {
      paymentQuery = paymentQuery.eq('provider_subscription_id', subscriptionId);
    } else if (checkoutSessionId) {
      paymentQuery = paymentQuery.eq('provider_checkout_session_id', checkoutSessionId);
    } else if (customerId) {
      paymentQuery = paymentQuery.eq('provider_customer_id', customerId);
    }

    const { data: existingPayment } = await paymentQuery.maybeSingle();

    if (existingPayment) {
      userId = userId || existingPayment.user_id || null;
      planId = planId || existingPayment.plan_id || null;
      boosterId = boosterId || existingPayment.booster_id || null;
      billingCycle =
        billingCycle ||
        (existingPayment.billing_cycle === 'monthly' || existingPayment.billing_cycle === 'yearly'
          ? existingPayment.billing_cycle
          : null);
    }
  }

  if (itemType !== 'plan' && (planId || billingCycle)) {
    itemType = 'plan';
  }

  if (itemType !== 'booster' && boosterId) {
    itemType = 'booster';
  }

  return {
    userId,
    planId,
    boosterId,
    billingCycle,
    itemType,
    checkoutSessionId,
    customerId,
    subscriptionId,
    priceId,
  };
};

const upsertStripeSubscription = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  params: {
    context: ResolvedStripeContext;
    stripeSubscription: Record<string, any>;
    amountPaid?: number | null;
    currency?: string | null;
  }
) => {
  const { context, stripeSubscription } = params;

  if (!context.userId || !context.planId || !context.billingCycle || !context.subscriptionId) {
    return null;
  }

  const mappedStatus = mapStripeSubscriptionStatus(String(stripeSubscription.status || 'pending'));
  const currentPeriodStart =
    toIsoFromUnix(stripeSubscription.current_period_start) || new Date().toISOString();
  const currentPeriodEnd =
    toIsoFromUnix(stripeSubscription.current_period_end) || new Date().toISOString();
  const trialEndDate = toIsoFromUnix(stripeSubscription.trial_end);
  const cancelAtPeriodEnd = Boolean(stripeSubscription.cancel_at_period_end);

  const activeLikeStatuses: SubscriptionRowStatus[] = ['active', 'trialing', 'past_due'];

  const { data: existingSubscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('id')
    .eq('provider', 'stripe')
    .eq('provider_subscription_id', context.subscriptionId)
    .maybeSingle();

  if (!existingSubscription?.id && activeLikeStatuses.includes(mappedStatus)) {
    await supabaseAdmin
      .from('user_subscriptions')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', context.userId)
      .in('status', activeLikeStatuses);
  }

  const payload = {
    user_id: context.userId,
    plan_id: context.planId,
    billing_cycle: context.billingCycle,
    status: mappedStatus,
    provider: 'stripe',
    provider_customer_id: context.customerId,
    provider_subscription_id: context.subscriptionId,
    provider_price_id: context.priceId,
    provider_checkout_session_id: context.checkoutSessionId,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    trial_end_date: trialEndDate,
    amount_paid: params.amountPaid ?? 0,
    currency: normalizeCurrency(params.currency),
    updated_at: new Date().toISOString(),
  };

  if (existingSubscription?.id) {
    const { data, error } = await supabaseAdmin
      .from('user_subscriptions')
      .update(payload)
      .eq('id', existingSubscription.id)
      .select('id, user_id, plan_id, status, provider_customer_id, provider_subscription_id, provider_price_id, provider_checkout_session_id, current_period_start, current_period_end, cancel_at_period_end')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabaseAdmin
    .from('user_subscriptions')
    .insert(payload)
    .select('id, user_id, plan_id, status, provider_customer_id, provider_subscription_id, provider_price_id, provider_checkout_session_id, current_period_start, current_period_end, cancel_at_period_end')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const upsertStripePayment = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  params: {
    context: ResolvedStripeContext;
    subscriptionRowId: string | null;
    invoice: Record<string, any>;
    status: PaymentRowStatus;
    invoiceStatus: 'pending' | 'available' | 'failed' | 'not_applicable';
    paidAt?: string | null;
  }
) => {
  const { context, invoice, status, invoiceStatus, paidAt } = params;

  if (!context.userId || !context.planId || !context.billingCycle) {
    throw new Error('Contexto Stripe incompleto para persistir pagamento.');
  }

  const providerInvoiceId = String(invoice.id || '').trim();
  if (!providerInvoiceId) {
    throw new Error('Invoice Stripe sem id.');
  }

  const providerPaymentId = `stripe_invoice:${providerInvoiceId}`;
  const amount = toNumberAmount(invoice.amount_paid ?? invoice.amount_due ?? invoice.total ?? 0);

  const metadata = {
    stripe_invoice_id: providerInvoiceId,
    stripe_payment_intent_id:
      typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id || null,
    stripe_charge_id:
      invoice.charge ||
      invoice.payment_intent?.latest_charge ||
      null,
    hosted_invoice_url: invoice.hosted_invoice_url || null,
    invoice_pdf: invoice.invoice_pdf || null,
    livemode: invoice.livemode ?? null,
    item_type: context.itemType,
    raw_status: invoice.status || null,
  };

  const descriptionPlanName = await loadPlanName(supabaseAdmin, context.planId);

  const paymentPayload = {
    user_id: context.userId,
    subscription_id: subscriptionRowId,
    plan_id: context.planId,
    provider: 'stripe',
    provider_payment_id: providerPaymentId,
    provider_preference_id: null,
    provider_customer_id: context.customerId,
    provider_subscription_id: context.subscriptionId,
    provider_invoice_id: providerInvoiceId,
    provider_checkout_session_id: context.checkoutSessionId,
    external_reference: `plan|${context.userId}|${context.planId}|${context.billingCycle}`,
    billing_cycle: context.billingCycle,
    description:
      invoice.description ||
      descriptionPlanName ||
      `Assinatura Stripe - ${context.billingCycle === 'yearly' ? 'Anual' : 'Mensal'}`,
    amount,
    currency: normalizeCurrency(invoice.currency),
    status,
    status_detail: invoice.status || null,
    payment_method:
      invoice.payment_settings?.payment_method_types?.[0] ||
      invoice.default_payment_method?.type ||
      null,
    receipt_url: invoice.hosted_invoice_url || null,
    invoice_status: invoiceStatus,
    paid_at: paidAt || null,
    updated_at: new Date().toISOString(),
    metadata,
  };

  const { error } = await supabaseAdmin
    .from('payments')
    .upsert(paymentPayload, { onConflict: 'provider_payment_id' });

  if (error) {
    throw error;
  }
};

const upsertStripeBoosterPayment = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  params: {
    context: ResolvedStripeContext;
    checkoutSession: Record<string, any>;
  }
) => {
  const { context, checkoutSession } = params;

  if (!context.userId || !context.boosterId) {
    throw new Error('Contexto Stripe incompleto para persistir pagamento de booster.');
  }

  const paymentIntentId =
    typeof checkoutSession.payment_intent === 'string'
      ? checkoutSession.payment_intent
      : checkoutSession.payment_intent?.id || null;
  const sessionId = String(checkoutSession.id || '').trim();

  if (!sessionId) {
    throw new Error('Checkout Session Stripe sem id para booster.');
  }

  const providerPaymentId = paymentIntentId ? `stripe_pi:${paymentIntentId}` : `stripe_session:${sessionId}`;
  const amount = toNumberAmount(checkoutSession.amount_total ?? 0);
  const boosterName = await loadBoosterName(supabaseAdmin, context.boosterId);

  const paymentPayload = {
    user_id: context.userId,
    subscription_id: null,
    plan_id: null,
    booster_id: context.boosterId,
    provider: 'stripe',
    provider_payment_id: providerPaymentId,
    provider_preference_id: null,
    provider_customer_id: context.customerId,
    provider_subscription_id: null,
    provider_invoice_id: null,
    provider_checkout_session_id: sessionId,
    external_reference: `booster|${context.userId}|${context.boosterId}|one_time`,
    billing_cycle: context.billingCycle || 'monthly',
    description:
      boosterName ||
      checkoutSession.metadata?.item_name ||
      'Compra avulsa de booster via Stripe',
    amount,
    currency: normalizeCurrency(checkoutSession.currency),
    status: 'approved' as const,
    status_detail: checkoutSession.payment_status || null,
    payment_method: checkoutSession.payment_method_types?.[0] || 'stripe',
    receipt_url: null,
    invoice_status: 'not_applicable' as const,
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
      item_type: 'booster',
      item_name: checkoutSession.metadata?.item_name || boosterName,
      livemode: checkoutSession.livemode ?? null,
    },
  };

  const { data, error } = await supabaseAdmin
    .from('payments')
    .upsert(paymentPayload, { onConflict: 'provider_payment_id' })
    .select('id, provider_payment_id')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const markWebhookLog = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  webhookLogId: string | null,
  payload: {
    processed: boolean;
    statusCode: number;
    errorMessage?: string | null;
  }
) => {
  if (!webhookLogId) {
    return;
  }

  await supabaseAdmin
    .from('webhook_logs')
    .update({
      processed: payload.processed,
      processed_at: payload.processed ? new Date().toISOString() : null,
      status_code: payload.statusCode,
      error_message: payload.errorMessage || null,
    })
    .eq('id', webhookLogId);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return textResponse('ok');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return textResponse('Missing Supabase secrets', 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
  let webhookLogId: string | null = null;
  let eventId: string | null = null;
  let eventType = 'unknown';
  let signatureTimestampMs: number | null = null;

  try {
    const rawBody = await req.text();
    const parsedSignature = parseStripeSignature(
      req.headers.get('stripe-signature') || req.headers.get('Stripe-Signature')
    );

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('payment_settings')
      .select('stripe_secret_key, stripe_webhook_secret')
      .eq('id', PAYMENT_SETTINGS_ID)
      .single();

    if (settingsError || !settings?.stripe_secret_key || !settings?.stripe_webhook_secret) {
      return textResponse('Stripe webhook not configured', 500);
    }

    const webhookSecret = String(settings.stripe_webhook_secret || '').trim();
    if (!parsedSignature || !webhookSecret) {
      return textResponse('Unauthorized webhook', 401);
    }

    const signatureTimestamp = Number(parsedSignature.timestamp);
    signatureTimestampMs = Number.isFinite(signatureTimestamp) ? signatureTimestamp * 1000 : null;

    if (!signatureTimestampMs) {
      return textResponse('Unauthorized webhook', 401);
    }

    if (Math.abs(Date.now() - signatureTimestampMs) > STRIPE_SIGNATURE_TOLERANCE_MS) {
      return textResponse('Expired webhook signature', 401);
    }

    const expectedSignature = await signStripePayload(webhookSecret, rawBody, parsedSignature.timestamp);
    const hasValidSignature = parsedSignature.signatures.some((candidate) =>
      timingSafeEqual(expectedSignature, candidate)
    );

    if (!hasValidSignature) {
      return textResponse('Invalid webhook signature', 401);
    }

    const event = JSON.parse(rawBody) as StripeWebhookEvent;
    eventId = String(event.id || '').trim();
    eventType = String(event.type || 'unknown');

    if (!eventId) {
      return textResponse('Stripe event sem id', 400);
    }

    const { data: existingRequest } = await supabaseAdmin
      .from('webhook_request_registry')
      .select('id, processed_at')
      .eq('provider', 'stripe')
      .eq('request_id', eventId)
      .maybeSingle();

    if (existingRequest?.processed_at) {
      return textResponse('Webhook already processed');
    }

    const { data: webhookLog } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        provider: 'stripe',
        event_type: eventType,
        payload: event,
        status_code: 200,
        processed: false,
      })
      .select('id')
      .single();

    webhookLogId = webhookLog?.id || null;

    const payloadObject = event.data?.object || {};

    if (![
      'checkout.session.completed',
      'invoice.paid',
      'invoice.payment_failed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ].includes(eventType)) {
      await markWebhookLog(supabaseAdmin, webhookLogId, {
        processed: true,
        statusCode: 200,
        errorMessage: `ignored_event:${eventType}`,
      });

      await supabaseAdmin.from('webhook_request_registry').upsert(
        {
          provider: 'stripe',
          request_id: eventId,
          signature_ts_ms: signatureTimestampMs,
          event_type: eventType,
          payment_id: String(payloadObject.id || ''),
          webhook_log_id: webhookLogId,
          processed_at: new Date().toISOString(),
        },
        { onConflict: 'provider,request_id' }
      );

      return textResponse('Event ignored');
    }

    if (eventType === 'checkout.session.completed') {
      const metadata = payloadObject.metadata || {};
      const sessionSubscriptionId =
        typeof payloadObject.subscription === 'string' ? payloadObject.subscription : payloadObject.subscription?.id || null;
      const sessionId = String(payloadObject.id || '').trim() || null;
      const customerId = String(payloadObject.customer || '').trim() || null;

      const stripeSubscription = sessionSubscriptionId
        ? await fetchStripeSubscription(settings.stripe_secret_key, sessionSubscriptionId)
        : null;

      const context = await resolveContext(supabaseAdmin, {
        userId: metadata.user_id || stripeSubscription?.metadata?.user_id || null,
        planId: metadata.plan_id || stripeSubscription?.metadata?.plan_id || null,
        boosterId: metadata.booster_id || null,
        billingCycle: inferBillingCycle(
          metadata.billing_cycle || stripeSubscription?.metadata?.billing_cycle || null,
          stripeSubscription?.items?.data?.[0]?.price?.recurring?.interval || null
        ),
        itemType: getItemType(metadata.item_type || stripeSubscription?.metadata?.item_type || null),
        checkoutSessionId: sessionId,
        customerId,
        subscriptionId: sessionSubscriptionId,
        priceId: stripeSubscription?.items?.data?.[0]?.price?.id || null,
      });

      if (context.itemType === 'plan' && stripeSubscription) {
        await upsertStripeSubscription(supabaseAdmin, {
          context,
          stripeSubscription,
          amountPaid: toNumberAmount(payloadObject.amount_total ?? 0),
          currency: payloadObject.currency || stripeSubscription.currency || 'BRL',
        });
      } else if (context.itemType === 'booster') {
        if (payloadObject.payment_status !== 'paid') {
          throw new Error('Sessao Stripe de booster finalizada sem pagamento confirmado.');
        }

        const paymentRow = await upsertStripeBoosterPayment(supabaseAdmin, {
          context,
          checkoutSession: payloadObject,
        });

        const { data: existingBoosterCredit } = await supabaseAdmin
          .from('user_highlight_booster_purchases')
          .select('id')
          .eq('payment_id', paymentRow.id)
          .maybeSingle();

        if (!existingBoosterCredit?.id) {
          const registerResult = await supabaseAdmin.rpc('register_highlight_booster_purchase', {
            p_user_id: context.userId,
            p_booster_id: context.boosterId,
            p_payment_id: paymentRow.id,
            p_provider_payment_id: paymentRow.provider_payment_id,
            p_amount: toNumberAmount(payloadObject.amount_total ?? 0),
          });

          if (registerResult.error || !registerResult.data?.success) {
            throw new Error(
              registerResult.error?.message ||
                registerResult.data?.error ||
                'Nao foi possivel creditar o booster comprado via Stripe.'
            );
          }
        }

        const { data: userProfile } = await supabaseAdmin
          .from('users')
          .select('email, name')
          .eq('id', context.userId)
          .maybeSingle();

        await supabaseAdmin.from('admin_audit_logs').insert({
          admin_id: context.userId,
          admin_email: userProfile?.email || 'unknown@unknown',
          admin_name: userProfile?.name || userProfile?.email || 'Unknown User',
          action: 'STRIPE_BOOSTER_PAID',
          resource_type: 'PAYMENT',
          resource_id: paymentRow.id,
          new_value: {
            provider: 'stripe',
            provider_payment_id: paymentRow.provider_payment_id,
            provider_checkout_session_id: sessionId,
            booster_id: context.boosterId,
            amount: toNumberAmount(payloadObject.amount_total ?? 0),
          },
          reason: 'Booster creditado via pagamento Stripe.',
        });

        await insertNotification(supabaseAdmin, {
          user_id: context.userId,
          type: 'SYSTEM',
          title: 'Booster confirmado via Stripe',
          content: 'Seu pacote de destaque foi confirmado e os creditos ja estao disponiveis na plataforma.',
          link: '/minha-conta/financeiro',
        });
      }

      await markWebhookLog(supabaseAdmin, webhookLogId, {
        processed: true,
        statusCode: 200,
        errorMessage: `session_completed:${sessionId || 'unknown'}`,
      });
    }

    if (eventType === 'invoice.paid' || eventType === 'invoice.payment_failed') {
      const invoice = payloadObject;
      const subscriptionId =
        typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id || null;
      const checkoutSessionId = String(invoice.parent?.subscription_details?.metadata?.checkout_session_id || '').trim() || null;
      const stripeSubscription = subscriptionId
        ? await fetchStripeSubscription(settings.stripe_secret_key, subscriptionId)
        : null;

      const context = await resolveContext(supabaseAdmin, {
        userId:
          stripeSubscription?.metadata?.user_id ||
          invoice.parent?.subscription_details?.metadata?.user_id ||
          invoice.metadata?.user_id ||
          null,
        planId:
          stripeSubscription?.metadata?.plan_id ||
          invoice.parent?.subscription_details?.metadata?.plan_id ||
          invoice.metadata?.plan_id ||
          null,
        boosterId:
          stripeSubscription?.metadata?.booster_id ||
          invoice.parent?.subscription_details?.metadata?.booster_id ||
          invoice.metadata?.booster_id ||
          null,
        billingCycle: inferBillingCycle(
          stripeSubscription?.metadata?.billing_cycle ||
            invoice.parent?.subscription_details?.metadata?.billing_cycle ||
            invoice.metadata?.billing_cycle ||
            null,
          stripeSubscription?.items?.data?.[0]?.price?.recurring?.interval ||
            invoice.lines?.data?.[0]?.price?.recurring?.interval ||
            null
        ),
        itemType: getItemType(
          stripeSubscription?.metadata?.item_type ||
            invoice.parent?.subscription_details?.metadata?.item_type ||
            invoice.metadata?.item_type ||
            null
        ),
        checkoutSessionId,
        customerId: String(invoice.customer || stripeSubscription?.customer || '').trim() || null,
        subscriptionId,
        priceId:
          stripeSubscription?.items?.data?.[0]?.price?.id ||
          invoice.lines?.data?.[0]?.price?.id ||
          null,
      });

      if (context.itemType !== 'plan') {
        await markWebhookLog(supabaseAdmin, webhookLogId, {
          processed: true,
          statusCode: 200,
          errorMessage: `ignored_item_type:${context.itemType}`,
        });
      } else if (!stripeSubscription) {
        throw new Error('Nao foi possivel carregar a assinatura Stripe vinculada ao invoice.');
      } else {
        const subscriptionRow = await upsertStripeSubscription(supabaseAdmin, {
          context,
          stripeSubscription,
          amountPaid: toNumberAmount(invoice.amount_paid ?? invoice.amount_due ?? invoice.total ?? 0),
          currency: invoice.currency || stripeSubscription.currency || 'BRL',
        });

        const paidAt = toIsoFromUnix(invoice.status_transitions?.paid_at) || new Date().toISOString();
        const paymentStatus =
          eventType === 'invoice.paid'
            ? ('approved' as const)
            : mapInvoiceFailureToPaymentStatus(String(invoice.status || 'open'));

        await upsertStripePayment(supabaseAdmin, {
          context,
          subscriptionRowId: subscriptionRow?.id || null,
          invoice,
          status: paymentStatus,
          invoiceStatus: eventType === 'invoice.paid' ? 'pending' : 'not_applicable',
          paidAt: eventType === 'invoice.paid' ? paidAt : null,
        });

        const { data: userProfile } = await supabaseAdmin
          .from('users')
          .select('email, name')
          .eq('id', context.userId)
          .maybeSingle();

        await supabaseAdmin.from('admin_audit_logs').insert({
          admin_id: context.userId,
          admin_email: userProfile?.email || 'unknown@unknown',
          admin_name: userProfile?.name || userProfile?.email || 'Unknown User',
          action: eventType === 'invoice.paid' ? 'STRIPE_INVOICE_PAID' : 'STRIPE_INVOICE_FAILED',
          resource_type: 'SUBSCRIPTION',
          resource_id: subscriptionRow?.id || context.subscriptionId,
          new_value: {
            provider: 'stripe',
            provider_invoice_id: invoice.id,
            provider_subscription_id: context.subscriptionId,
            provider_customer_id: context.customerId,
            billing_cycle: context.billingCycle,
            amount: toNumberAmount(invoice.amount_paid ?? invoice.amount_due ?? invoice.total ?? 0),
            status: eventType === 'invoice.paid' ? 'approved' : paymentStatus,
          },
          reason:
            eventType === 'invoice.paid'
              ? 'Assinatura Stripe sincronizada com pagamento aprovado.'
              : 'Assinatura Stripe sincronizada com falha de pagamento.',
        });

        if (context.userId) {
          if (eventType === 'invoice.paid') {
            await insertNotification(supabaseAdmin, {
              user_id: context.userId,
              type: 'SYSTEM',
              title: 'Pagamento confirmado via Stripe',
              content: 'Sua assinatura foi confirmada com sucesso e ja esta sincronizada na plataforma.',
              link: '/minha-conta/financeiro',
            });

            const internalAutomationSecret = Deno.env.get('INTERNAL_AUTOMATION_SECRET');
            const siteUrl = Deno.env.get('SUPABASE_URL');
            if (internalAutomationSecret && siteUrl) {
              const { data: paymentRow } = await supabaseAdmin
                .from('payments')
                .select('id')
                .eq('provider_payment_id', `stripe_invoice:${invoice.id}`)
                .maybeSingle();

              if (paymentRow?.id) {
                try {
                  await fetch(`${siteUrl}/functions/v1/issue-nfse`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-internal-secret': internalAutomationSecret,
                    },
                    body: JSON.stringify({
                      paymentId: paymentRow.id,
                      source: 'stripe_webhook',
                    }),
                  });
                } catch (nfseError) {
                  console.error('[webhook-stripe] falha ao enfileirar NFS-e:', nfseError);
                }
              }
            }
          } else {
            await insertNotification(supabaseAdmin, {
              user_id: context.userId,
              type: 'SYSTEM',
              title: 'Falha no pagamento da assinatura',
              content: 'Nao conseguimos confirmar a cobranca da sua assinatura Stripe. Atualize o metodo de pagamento para evitar interrupcoes.',
              link: '/minha-conta/financeiro',
            });
          }
        }

        await markWebhookLog(supabaseAdmin, webhookLogId, {
          processed: true,
          statusCode: 200,
          errorMessage: eventType === 'invoice.paid' ? `invoice_paid:${invoice.id}` : `invoice_failed:${invoice.id}`,
        });
      }
    }

    if (eventType === 'customer.subscription.updated' || eventType === 'customer.subscription.deleted') {
      const stripeSubscription =
        eventType === 'customer.subscription.deleted'
          ? {
              ...payloadObject,
              status: payloadObject.status || 'canceled',
            }
          : payloadObject;

      const checkoutSessionId =
        String(stripeSubscription.metadata?.checkout_session_id || '').trim() || null;

      const context = await resolveContext(supabaseAdmin, {
        userId: stripeSubscription.metadata?.user_id || null,
        planId: stripeSubscription.metadata?.plan_id || null,
        boosterId: stripeSubscription.metadata?.booster_id || null,
        billingCycle: inferBillingCycle(
          stripeSubscription.metadata?.billing_cycle || null,
          stripeSubscription.items?.data?.[0]?.price?.recurring?.interval || null
        ),
        itemType: getItemType(stripeSubscription.metadata?.item_type || null),
        checkoutSessionId,
        customerId: String(stripeSubscription.customer || '').trim() || null,
        subscriptionId: String(stripeSubscription.id || '').trim() || null,
        priceId: stripeSubscription.items?.data?.[0]?.price?.id || null,
      });

      if (context.itemType === 'plan' && context.subscriptionId) {
        await upsertStripeSubscription(supabaseAdmin, {
          context,
          stripeSubscription,
          amountPaid: null,
          currency: stripeSubscription.currency || 'BRL',
        });
      }

      await markWebhookLog(supabaseAdmin, webhookLogId, {
        processed: true,
        statusCode: 200,
        errorMessage:
          eventType === 'customer.subscription.deleted'
            ? `subscription_deleted:${context.subscriptionId || 'unknown'}`
            : `subscription_updated:${context.subscriptionId || 'unknown'}`,
      });
    }

    await supabaseAdmin.from('webhook_request_registry').upsert(
      {
        provider: 'stripe',
        request_id: eventId,
        signature_ts_ms: signatureTimestampMs,
        event_type: eventType,
        payment_id: String(payloadObject.id || payloadObject.subscription || ''),
        webhook_log_id: webhookLogId,
        processed_at: new Date().toISOString(),
      },
      { onConflict: 'provider,request_id' }
    );

    return textResponse('Stripe webhook processed');
  } catch (error) {
    console.error('[webhook-stripe] unexpected error:', error);

    await markWebhookLog(supabaseAdmin, webhookLogId, {
      processed: false,
      statusCode: 500,
      errorMessage: error instanceof Error ? error.message : 'Internal server error',
    });

    if (eventId) {
      await supabaseAdmin.from('webhook_request_registry').upsert(
        {
          provider: 'stripe',
          request_id: eventId,
          signature_ts_ms: signatureTimestampMs,
          event_type: eventType,
          webhook_log_id: webhookLogId,
        },
        { onConflict: 'provider,request_id' }
      );
    }

    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500
    );
  }
});
