import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeadersWebhook, handleCorsPreflightWebhook } from '../_shared/cors.ts';

type JsonRecord = Record<string, unknown>;
type BillingModel = 'one_time' | 'recurring';

type ResolvedCheckoutReference = {
  itemType: 'plan' | 'booster' | 'unknown';
  userId: string | null;
  planId: string | null;
  boosterId: string | null;
  billingCycle: 'monthly' | 'yearly' | null;
  billingModel: BillingModel | null;
};

type ExistingSubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  billing_model: BillingModel | null;
  billing_cycle: 'monthly' | 'yearly' | null;
  category_highlights_carryover: number | null;
  home_highlights_carryover: number | null;
  status: string;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
};

type ExistingPaymentRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  booster_id: string | null;
  billing_model: BillingModel | null;
  billing_cycle: 'monthly' | 'yearly' | null;
  subscription_id: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  metadata: Record<string, unknown> | null;
};

const PAYMENT_SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000005';
const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'pending'];
const APPROVED_PAYMENT_STATUSES = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
const PENDING_PAYMENT_STATUSES = new Set([
  'PENDING',
  'AWAITING_RISK_ANALYSIS',
  'AWAITING_CHARGEBACK_REVERSAL',
]);
const REFUNDED_PAYMENT_STATUSES = new Set(['REFUNDED']);
const CANCELLED_PAYMENT_STATUSES = new Set(['DELETED']);
const CHARGEDBACK_PAYMENT_STATUSES = new Set([
  'CHARGEBACK_REQUESTED',
  'CHARGEBACK_DISPUTE',
  'DUNNING_REQUESTED',
  'DUNNING_RECEIVED',
  'DUNNING_CREDIT_PROTECTION',
  'DUNNING_CREDIT_BUREAU',
]);

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeadersWebhook(),
      'Content-Type': 'application/json',
    },
  });

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const readString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
};

const readNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }

  return null;
};

const normalizeBillingCycle = (value: unknown): 'monthly' | 'yearly' | null => {
  const raw = readString(value)?.toUpperCase();

  if (!raw) return null;
  if (raw.includes('YEAR')) return 'yearly';
  if (raw.includes('ANNUAL')) return 'yearly';
  if (raw.includes('MONTH')) return 'monthly';
  if (raw.includes('MENS')) return 'monthly';

  return null;
};

const normalizeBillingModel = (value: unknown): BillingModel | null => {
  const raw = readString(value)?.toLowerCase();

  if (!raw) return null;
  if (raw === 'recurring') return 'recurring';
  if (raw === 'one_time') return 'one_time';

  return null;
};

const toIsoDateTime = (value: unknown, options?: { endOfDay?: boolean }): string | null => {
  const raw = readString(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const suffix = options?.endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    return `${raw}${suffix}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const addBillingCycleFallbackEnd = (
  startIso: string,
  billingCycle: 'monthly' | 'yearly' | null
): string => {
  const date = new Date(startIso);
  if (billingCycle === 'yearly') {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }

  return date.toISOString();
};

const parseExternalReference = (externalReference: string | null): ResolvedCheckoutReference => {
  if (!externalReference) {
    return {
      itemType: 'unknown',
      userId: null,
      planId: null,
      boosterId: null,
      billingCycle: null,
      billingModel: null,
    };
  }

  const [kind, userId, resourceId, billingCycleRaw, billingModelRaw] = externalReference.split('|');

  if (kind === 'plan') {
    return {
      itemType: 'plan',
      userId: userId || null,
      planId: resourceId || null,
      boosterId: null,
      billingCycle: normalizeBillingCycle(billingCycleRaw),
      billingModel: normalizeBillingModel(billingModelRaw),
    };
  }

  if (kind === 'booster') {
    return {
      itemType: 'booster',
      userId: userId || null,
      planId: null,
      boosterId: resourceId || null,
      billingCycle: null,
      billingModel: null,
    };
  }

  return {
    itemType: 'unknown',
    userId: null,
    planId: null,
    boosterId: null,
    billingCycle: null,
    billingModel: null,
  };
};

const mapPaymentStatus = (asaasStatus: string | null): string => {
  const normalized = asaasStatus?.toUpperCase() || '';

  if (APPROVED_PAYMENT_STATUSES.has(normalized)) return 'approved';
  if (REFUNDED_PAYMENT_STATUSES.has(normalized)) return 'refunded';
  if (CANCELLED_PAYMENT_STATUSES.has(normalized)) return 'cancelled';
  if (CHARGEDBACK_PAYMENT_STATUSES.has(normalized)) return 'charged_back';
  if (normalized === 'OVERDUE') return 'rejected';
  if (PENDING_PAYMENT_STATUSES.has(normalized)) return 'pending';

  return 'pending';
};

const mapSubscriptionStatus = (eventType: string | null, asaasStatus: string | null): string => {
  const normalizedEvent = (eventType || '').toUpperCase();
  const normalizedStatus = (asaasStatus || '').toUpperCase();

  if (normalizedEvent === 'SUBSCRIPTION_DELETED' || CANCELLED_PAYMENT_STATUSES.has(normalizedStatus)) {
    return 'cancelled';
  }

  if (normalizedStatus === 'OVERDUE') {
    return 'past_due';
  }

  if (APPROVED_PAYMENT_STATUSES.has(normalizedStatus)) {
    return 'active';
  }

  return 'pending';
};

const buildWebhookError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Internal server error';
  }
};

const shouldCreditBooster = (paymentStatus: string, eventType: string | null) => {
  const normalizedEvent = (eventType || '').toUpperCase();
  return paymentStatus === 'approved' || normalizedEvent === 'PAYMENT_RECEIVED' || normalizedEvent === 'PAYMENT_CONFIRMED';
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightWebhook();
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse({ success: false, error: 'Configuracao incompleta do Supabase.' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  let logId: string | null = null;
  let eventType: string | null = null;
  let payload: JsonRecord = {};

  const updateWebhookLog = async (statusCode: number, processed: boolean, errorMessage?: string | null) => {
    if (!logId) return;

    await supabaseAdmin
      .from('webhook_logs')
      .update({
        status_code: statusCode,
        processed,
        error_message: errorMessage ?? null,
        processed_at: processed ? new Date().toISOString() : null,
      })
      .eq('id', logId);
  };

  try {
    payload = asRecord(await req.json());
    eventType = readString(payload.event, payload.type);

    const { data: insertedLog } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        provider: 'asaas',
        event_type: eventType,
        payload,
        processed: false,
      })
      .select('id')
      .single();

    logId = insertedLog?.id ?? null;

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('payment_settings')
      .select('asaas_webhook_token')
      .eq('id', PAYMENT_SETTINGS_SINGLETON_ID)
      .single();

    if (settingsError) {
      await updateWebhookLog(500, false, settingsError.message);
      return jsonResponse({ success: false, error: settingsError.message }, 500);
    }

    const expectedToken = readString(settings?.asaas_webhook_token);
    const receivedToken = readString(
      req.headers.get('asaas-access-token'),
      req.headers.get('x-webhook-secret')
    );

    if (!expectedToken || receivedToken !== expectedToken) {
      await updateWebhookLog(401, false, 'Webhook token invalido.');
      return jsonResponse({ success: false, error: 'Unauthorized webhook token' }, 401);
    }

    const payment = asRecord(payload.payment);
    const subscription = asRecord(payload.subscription);
    const paymentStatus = mapPaymentStatus(readString(payment.status, payload.status));

    const lineItems = asArray(payment.installmentDetails);

    const externalReference = readString(
      payment.externalReference,
      payment.external_reference,
      subscription.externalReference,
      subscription.external_reference,
      payload.externalReference,
      payload.external_reference
    );

    const parsedReference = parseExternalReference(externalReference);

    const providerPaymentId = readString(payment.id, payload.paymentId);
    const providerSubscriptionId = readString(
      payment.subscription,
      payment.subscriptionId,
      subscription.id,
      subscription.subscription
    );
    const providerCustomerId = readString(
      payment.customer,
      payment.customerId,
      subscription.customer
    );
    const providerInvoiceId = readString(payment.invoiceNumber, payment.invoiceId);
    const paymentMethod = readString(payment.billingType, payment.paymentMethod);
    const amount = readNumber(payment.value, payment.netValue, payment.amount) ?? 0;
    const currency = readString(payment.currency)?.toUpperCase() || 'BRL';
    const receiptUrl = readString(
      payment.transactionReceiptUrl,
      payment.invoiceUrl,
      payment.bankSlipUrl,
      payment.pixTransaction,
      payment.receiptUrl
    );
    const paymentDescription = readString(payment.description, subscription.description);
    const paidAt = toIsoDateTime(
      payment.clientPaymentDate,
      payment.paymentDate,
      payment.confirmedDate,
      payment.creditDate
    );
    const currentPeriodStart =
      toIsoDateTime(payment.dateCreated, subscription.dateCreated) ||
      new Date().toISOString();
    const normalizedBillingCycle =
      parsedReference.billingCycle ||
      normalizeBillingCycle(subscription.cycle) ||
      normalizeBillingCycle(payment.cycle) ||
      'monthly';
    const currentPeriodEnd =
      toIsoDateTime(subscription.nextDueDate, { endOfDay: true }) ||
      toIsoDateTime(payment.nextDueDate, { endOfDay: true }) ||
      toIsoDateTime(payment.dueDate, { endOfDay: true }) ||
      addBillingCycleFallbackEnd(currentPeriodStart, normalizedBillingCycle);

    let userId = parsedReference.userId;
    let planId = parsedReference.planId;
    let boosterId = parsedReference.boosterId;
    let billingModel =
      parsedReference.billingModel ||
      (providerSubscriptionId ? 'recurring' : 'one_time');
    let billingCycle = parsedReference.billingCycle || normalizedBillingCycle;
    let itemType = parsedReference.itemType;
    let existingSubscription: ExistingSubscriptionRow | null = null;
    let existingPayment: ExistingPaymentRow | null = null;

    if (providerSubscriptionId) {
      const { data } = await supabaseAdmin
        .from('user_subscriptions')
        .select('id,user_id,plan_id,billing_model,billing_cycle,category_highlights_carryover,home_highlights_carryover,status,provider,provider_customer_id,provider_subscription_id,current_period_start,current_period_end')
        .eq('provider_subscription_id', providerSubscriptionId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      existingSubscription = (data as ExistingSubscriptionRow | null) ?? null;
    }

    if (!existingSubscription && providerCustomerId) {
      const { data } = await supabaseAdmin
        .from('user_subscriptions')
        .select('id,user_id,plan_id,billing_model,billing_cycle,category_highlights_carryover,home_highlights_carryover,status,provider,provider_customer_id,provider_subscription_id,current_period_start,current_period_end')
        .eq('provider_customer_id', providerCustomerId)
        .in('status', ACTIVE_SUBSCRIPTION_STATUSES)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      existingSubscription = (data as ExistingSubscriptionRow | null) ?? null;
    }

    if (providerPaymentId) {
      const { data } = await supabaseAdmin
        .from('payments')
        .select('id,user_id,plan_id,booster_id,billing_model,billing_cycle,subscription_id,provider_customer_id,provider_subscription_id,metadata')
        .eq('provider_payment_id', providerPaymentId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      existingPayment = (data as ExistingPaymentRow | null) ?? null;
    }

    if (!existingSubscription && existingPayment?.subscription_id) {
      const { data } = await supabaseAdmin
        .from('user_subscriptions')
        .select('id,user_id,plan_id,billing_model,billing_cycle,category_highlights_carryover,home_highlights_carryover,status,provider,provider_customer_id,provider_subscription_id,current_period_start,current_period_end')
        .eq('id', existingPayment.subscription_id)
        .maybeSingle();

      existingSubscription = (data as ExistingSubscriptionRow | null) ?? null;
    }

    if (!userId) {
      userId = existingSubscription?.user_id || existingPayment?.user_id || null;
    }

    if (!planId) {
      planId = existingSubscription?.plan_id || existingPayment?.plan_id || null;
    }

    if (!boosterId) {
      boosterId = existingPayment?.booster_id || null;
    }

    if (!billingModel) {
      billingModel =
        existingSubscription?.billing_model ||
        existingPayment?.billing_model ||
        (providerSubscriptionId ? 'recurring' : 'one_time');
    }

    if (!billingCycle) {
      billingCycle = existingSubscription?.billing_cycle || existingPayment?.billing_cycle || normalizedBillingCycle;
    }

    if (itemType === 'unknown') {
      itemType = planId ? 'plan' : boosterId ? 'booster' : 'unknown';
    }

    if (!userId || (itemType === 'plan' && !planId && !existingSubscription) || (itemType === 'booster' && !boosterId)) {
      await updateWebhookLog(200, true, 'Evento ignorado por falta de contexto comercial local.');
      return jsonResponse({
        success: true,
        ignored: true,
        reason: 'missing_context',
      });
    }

    const isFuturePeriod = (value: string | null | undefined) => {
      const timestamp = value ? new Date(value).getTime() : Number.NaN;
      return Number.isFinite(timestamp) && timestamp > Date.now();
    };

    const getPlanHighlightCarryover = async (
      subscriptionRow: ExistingSubscriptionRow | null
    ): Promise<{ category: number; home: number }> => {
      if (
        !subscriptionRow?.id ||
        !userId ||
        !subscriptionRow.plan_id ||
        !subscriptionRow.current_period_start ||
        !subscriptionRow.current_period_end ||
        !isFuturePeriod(subscriptionRow.current_period_end)
      ) {
        return { category: 0, home: 0 };
      }

      const { data: planRecord, error: planRecordError } = await supabaseAdmin
        .from('plans')
        .select('category_highlights_count,home_highlight_count')
        .eq('id', subscriptionRow.plan_id)
        .maybeSingle();

      if (planRecordError) {
        throw planRecordError;
      }

      const categoryLimit =
        Math.max(Number(planRecord?.category_highlights_count ?? 0), 0) +
        Math.max(Number(subscriptionRow.category_highlights_carryover ?? 0), 0);
      const homeLimit =
        Math.max(Number(planRecord?.home_highlight_count ?? 0), 0) +
        Math.max(Number(subscriptionRow.home_highlights_carryover ?? 0), 0);

      if (categoryLimit <= 0 && homeLimit <= 0) {
        return { category: 0, home: 0 };
      }

      const { data: usageWindowData, error: usageWindowError } = await supabaseAdmin.rpc(
        'calculate_subscription_usage_window',
        {
          p_period_start: subscriptionRow.current_period_start,
          p_period_end: subscriptionRow.current_period_end,
          p_reference: new Date().toISOString(),
        }
      );

      if (usageWindowError) {
        throw usageWindowError;
      }

      const usageWindow = (
        Array.isArray(usageWindowData) ? usageWindowData[0] : usageWindowData
      ) as JsonRecord | null;
      const usageStart = readString(
        usageWindow?.usage_period_start,
        subscriptionRow.current_period_start
      );
      const usageEnd = readString(
        usageWindow?.usage_period_end,
        subscriptionRow.current_period_end
      );

      if (!usageStart || !usageEnd) {
        return { category: 0, home: 0 };
      }

      let categoryUsed = 0;
      let homeUsed = 0;

      if (categoryLimit > 0) {
        const { count, error: categoryUsageError } = await supabaseAdmin
          .from('announcement_highlights_history')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('highlight_type', 'category')
          .eq('credit_source', 'plan')
          .gte('applied_at', usageStart)
          .lte('applied_at', usageEnd);

        if (categoryUsageError) {
          throw categoryUsageError;
        }

        categoryUsed = Number(count ?? 0);
      }

      if (homeLimit > 0) {
        const { count, error: homeUsageError } = await supabaseAdmin
          .from('announcement_highlights_history')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('highlight_type', 'home')
          .eq('credit_source', 'plan')
          .gte('applied_at', usageStart)
          .lte('applied_at', usageEnd);

        if (homeUsageError) {
          throw homeUsageError;
        }

        homeUsed = Number(count ?? 0);
      }

      return {
        category: Math.max(categoryLimit - categoryUsed, 0),
        home: Math.max(homeLimit - homeUsed, 0),
      };
    };

    const resolveSubscriptionRowId = async (): Promise<string | null> => {
      if (itemType !== 'plan' || !userId || !planId) {
        return existingSubscription?.id || existingPayment?.subscription_id || null;
      }

      const subscriptionStatus = mapSubscriptionStatus(eventType, readString(payment.status, subscription.status));

      const { data: activeUserSubscription } = await supabaseAdmin
        .from('user_subscriptions')
        .select('id,user_id,plan_id,billing_model,billing_cycle,category_highlights_carryover,home_highlights_carryover,status,provider,provider_customer_id,provider_subscription_id,current_period_start,current_period_end')
        .eq('user_id', userId)
        .in('status', ACTIVE_SUBSCRIPTION_STATUSES)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const reusableSubscription =
        existingSubscription ||
        (activeUserSubscription as ExistingSubscriptionRow | null) ||
        null;

      if (
        reusableSubscription?.id &&
        subscriptionStatus !== 'active' &&
        reusableSubscription.status === 'active' &&
        reusableSubscription.billing_model !== 'recurring' &&
        isFuturePeriod(reusableSubscription.current_period_end)
      ) {
        return reusableSubscription.id;
      }

      const isReplayForExistingPayment =
        Boolean(existingPayment?.subscription_id) &&
        existingPayment?.subscription_id === reusableSubscription?.id;

      const carryoverCredits = isReplayForExistingPayment
        ? {
            category: Math.max(Number(reusableSubscription?.category_highlights_carryover ?? 0), 0),
            home: Math.max(Number(reusableSubscription?.home_highlights_carryover ?? 0), 0),
          }
        : subscriptionStatus === 'active' &&
            reusableSubscription?.id &&
            reusableSubscription.billing_model !== 'recurring' &&
            isFuturePeriod(reusableSubscription.current_period_end)
          ? await getPlanHighlightCarryover(reusableSubscription)
          : { category: 0, home: 0 };

      const basePayload = {
        user_id: userId,
        plan_id: planId,
        billing_model: billingModel || 'one_time',
        billing_cycle: billingCycle || 'monthly',
        category_highlights_carryover: carryoverCredits.category,
        home_highlights_carryover: carryoverCredits.home,
        status: subscriptionStatus,
        provider: 'asaas',
        provider_customer_id: providerCustomerId,
        provider_subscription_id: providerSubscriptionId,
        amount_paid: amount,
        currency,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: false,
      };

      if (reusableSubscription?.id) {
        const { error: updateError } = await supabaseAdmin
          .from('user_subscriptions')
          .update(basePayload)
          .eq('id', reusableSubscription.id);

        if (updateError) {
          throw updateError;
        }

        if (subscriptionStatus === 'active') {
          await supabaseAdmin
            .from('user_subscriptions')
            .update({
              status: 'expired',
              current_period_end: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .neq('id', reusableSubscription.id)
            .in('status', ['active', 'trialing', 'past_due']);
        }

        return reusableSubscription.id;
      }

      if (subscriptionStatus === 'active') {
        await supabaseAdmin
          .from('user_subscriptions')
          .update({
            status: 'expired',
            current_period_end: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .in('status', ['active', 'trialing', 'past_due']);
      }

      const { data: insertedSubscription, error: insertError } = await supabaseAdmin
        .from('user_subscriptions')
        .insert(basePayload)
        .select('id')
        .single();

      if (insertError) {
        throw insertError;
      }

      return insertedSubscription?.id || null;
    };

    const subscriptionRowId = await resolveSubscriptionRowId();

    if (providerPaymentId) {
      const paymentPayload = {
        user_id: userId,
        subscription_id: subscriptionRowId,
        plan_id: planId,
        booster_id: boosterId,
        provider: 'asaas',
        provider_payment_id: providerPaymentId,
        provider_customer_id: providerCustomerId,
        provider_subscription_id: providerSubscriptionId,
        provider_invoice_id: providerInvoiceId,
        external_reference: externalReference,
        billing_model: itemType === 'plan' ? billingModel || 'one_time' : 'one_time',
        billing_cycle: itemType === 'plan' ? billingCycle : null,
        description:
          paymentDescription ||
          (itemType === 'plan'
            ? `Assinatura ${planId}`
            : itemType === 'booster'
              ? `Booster ${boosterId}`
              : 'Pagamento Asaas'),
        amount,
        currency,
        status: paymentStatus,
        payment_method: paymentMethod,
        receipt_url: receiptUrl,
        paid_at: paymentStatus === 'approved' ? paidAt || new Date().toISOString() : null,
        invoice_status: itemType === 'plan' ? 'pending' : 'not_applicable',
        metadata: {
          ...(existingPayment?.metadata || {}),
          item_type: itemType,
          item_name: paymentDescription,
          billing_model: itemType === 'plan' ? billingModel || 'one_time' : 'one_time',
          external_reference: externalReference,
          asaas_event: eventType,
          asaas_status: readString(payment.status, subscription.status),
        },
      };

      if (existingPayment?.id) {
        const { error: updatePaymentError } = await supabaseAdmin
          .from('payments')
          .update(paymentPayload)
          .eq('id', existingPayment.id);

        if (updatePaymentError) {
          throw updatePaymentError;
        }
      } else {
        const { error: insertPaymentError } = await supabaseAdmin
          .from('payments')
          .insert(paymentPayload);

        if (insertPaymentError) {
          throw insertPaymentError;
        }
      }
    }

    if (
      itemType === 'booster' &&
      boosterId &&
      userId &&
      providerPaymentId &&
      shouldCreditBooster(paymentStatus, eventType)
    ) {
      const { data: existingBoosterPurchase } = await supabaseAdmin
        .from('user_highlight_booster_purchases')
        .select('id')
        .eq('provider_payment_id', providerPaymentId)
        .limit(1)
        .maybeSingle();

      if (!existingBoosterPurchase?.id) {
        const { data: paymentRow } = await supabaseAdmin
          .from('payments')
          .select('id')
          .eq('provider_payment_id', providerPaymentId)
          .limit(1)
          .maybeSingle();

        const { error: boosterCreditError } = await supabaseAdmin.rpc(
          'register_highlight_booster_purchase',
          {
            p_user_id: userId,
            p_booster_id: boosterId,
            p_payment_id: paymentRow?.id || null,
            p_provider_payment_id: providerPaymentId,
            p_amount: amount,
          }
        );

        if (boosterCreditError) {
          throw boosterCreditError;
        }
      }
    }

    if (
      itemType === 'plan' &&
      subscriptionRowId &&
      (eventType || '').toUpperCase() === 'SUBSCRIPTION_DELETED'
    ) {
      const { error: cancelSubscriptionError } = await supabaseAdmin
        .from('user_subscriptions')
        .update({
          status: 'cancelled',
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionRowId);

      if (cancelSubscriptionError) {
        throw cancelSubscriptionError;
      }
    }

    await updateWebhookLog(200, true, null);
    return jsonResponse({ success: true });
  } catch (error) {
    const message = buildWebhookError(error);
    await updateWebhookLog(500, false, message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
