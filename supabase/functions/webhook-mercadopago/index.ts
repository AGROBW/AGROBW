import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

interface WebhookBody {
  action?: string;
  data?: {
    id?: string;
  };
  id?: number;
  resource?: string;
  topic?: string;
  type?: string;
}

type PaymentRowStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'in_process'
  | 'charged_back';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Info, apikey, x-signature, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const textResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: corsHeaders,
  });

const encoder = new TextEncoder();
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

const parseMercadoPagoSignature = (signatureHeader: string | null) => {
  if (!signatureHeader) {
    return null;
  }

  const parts = signatureHeader.split(',');
  let ts: string | null = null;
  let v1: string | null = null;

  for (const part of parts) {
    const [rawKey, rawValue] = part.split('=', 2);
    const key = rawKey?.trim();
    const value = rawValue?.trim();

    if (!key || !value) {
      continue;
    }

    if (key === 'ts') {
      ts = value;
    }

    if (key === 'v1') {
      v1 = value.toLowerCase();
    }
  }

  if (!ts || !v1) {
    return null;
  }

  return { ts, v1 };
};

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

const buildMercadoPagoManifest = (notificationId: string, requestId: string, ts: string) =>
  `id:${notificationId};request-id:${requestId};ts:${ts};`;

const signManifest = async (secret: string, manifest: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(manifest));
  return toHex(signature);
};

const normalizePaymentStatus = (status?: string): PaymentRowStatus => {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    case 'in_process':
      return 'in_process';
    case 'charged_back':
      return 'charged_back';
    default:
      return 'pending';
  }
};

const resolveInvoiceStatus = (status: PaymentRowStatus) => {
  if (status === 'approved') {
    return 'pending';
  }

  if (status === 'rejected' || status === 'cancelled' || status === 'charged_back') {
    return 'not_applicable';
  }

  return 'pending';
};

const resolvePlanValidityDays = (
  billingCycle: string | null | undefined,
  monthlyDays: number | null | undefined,
  yearlyDays: number | null | undefined
) => (billingCycle === 'yearly' ? yearlyDays ?? 365 : monthlyDays ?? 30);

const normalizePlanName = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const isStartSignupPlan = (plan?: { name?: string | null; is_default_signup_plan?: boolean | null }) =>
  Boolean(plan?.is_default_signup_plan) || ['start', 'start agro', 'safra'].includes(normalizePlanName(plan?.name || ''));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return textResponse('ok');
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return textResponse('Missing Supabase secrets', 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body: WebhookBody = await req.json();
    const requestUrl = new URL(req.url);
    const requestId = req.headers.get('x-request-id');
    const signatureHeader = req.headers.get('x-signature');

    const eventType = body.type || body.topic || '';
    const paymentId = body.data?.id || (body.topic === 'payment' ? body.resource : undefined);
    const notificationId =
      requestUrl.searchParams.get('data.id') ||
      body.data?.id ||
      String(body.id || '') ||
      String(paymentId || '');

    if (eventType !== 'payment' || !paymentId) {
      return textResponse('OK - ignored');
    }

    const { data: credentials, error: credentialsError } = await supabaseAdmin
      .from('payment_settings')
      .select('mp_access_token, mp_webhook_secret')
      .eq('id', '00000000-0000-0000-0000-000000000005')
      .single();

    if (credentialsError || !credentials?.mp_access_token) {
      console.error('Mercado Pago not configured:', credentialsError);
      return textResponse('Configuration error', 500);
    }

    const parsedSignature = parseMercadoPagoSignature(signatureHeader);
    const webhookSecret = String(credentials.mp_webhook_secret || '').trim();

    if (!requestId || !parsedSignature || !webhookSecret || !notificationId) {
      await supabaseAdmin.from('webhook_logs').insert({
        provider: 'mercadopago',
        event_type: body.action || body.type || 'unknown',
        payload: body,
        status_code: 401,
        processed: false,
        error_message: 'invalid_webhook_signature_context',
      });

      return textResponse('Unauthorized webhook', 401);
    }

    const signatureTimestamp = Number(parsedSignature.ts);
    if (!Number.isFinite(signatureTimestamp)) {
      await supabaseAdmin.from('webhook_logs').insert({
        provider: 'mercadopago',
        event_type: body.action || body.type || 'unknown',
        payload: body,
        status_code: 401,
        processed: false,
        error_message: 'invalid_webhook_signature_ts',
      });

      return textResponse('Unauthorized webhook', 401);
    }

    if (Math.abs(Date.now() - signatureTimestamp) > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
      await supabaseAdmin.from('webhook_logs').insert({
        provider: 'mercadopago',
        event_type: body.action || body.type || 'unknown',
        payload: body,
        status_code: 401,
        processed: false,
        error_message: 'expired_webhook_signature_ts',
      });

      return textResponse('Expired webhook signature', 401);
    }

    const manifest = buildMercadoPagoManifest(notificationId, requestId, parsedSignature.ts);
    const expectedSignature = await signManifest(webhookSecret, manifest);

    if (!timingSafeEqual(expectedSignature, parsedSignature.v1)) {
      await supabaseAdmin.from('webhook_logs').insert({
        provider: 'mercadopago',
        event_type: body.action || body.type || 'unknown',
        payload: body,
        status_code: 401,
        processed: false,
        error_message: 'webhook_signature_mismatch',
      });

      return textResponse('Invalid webhook signature', 401);
    }

    const { data: existingRequest } = await supabaseAdmin
      .from('webhook_request_registry')
      .select('id, processed_at')
      .eq('provider', 'mercadopago')
      .eq('request_id', requestId)
      .maybeSingle();

    if (existingRequest?.processed_at) {
      return textResponse('Webhook already processed');
    }

    const { data: webhookLog } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        provider: 'mercadopago',
        event_type: body.action || body.type || 'unknown',
        payload: body,
        status_code: 200,
        processed: false,
      })
      .select('id')
      .single();

    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.mp_access_token}`,
        },
      }
    );

    if (!paymentResponse.ok) {
      console.error('Failed to fetch payment from MP:', paymentResponse.status);
      return textResponse('Failed to fetch payment', 500);
    }

    const payment = await paymentResponse.json();

    const externalReference = String(payment.external_reference || '');
    const externalParts = externalReference.split('|');
    const itemType = externalParts[0] === 'booster' || externalParts[0] === 'plan' ? externalParts[0] : 'plan';
    const [, userId, resourceId, billingCycle] =
      itemType === 'plan' || itemType === 'booster'
        ? externalParts
        : [null, externalParts[0], externalParts[1], externalParts[2]];
    const planId = itemType === 'plan' ? resourceId : null;
    const boosterId = itemType === 'booster' ? resourceId : null;

    if (!userId || !resourceId || !billingCycle) {
      await supabaseAdmin
        .from('webhook_logs')
        .update({
          processed: false,
          error_message: 'Invalid external_reference format',
        })
        .eq('id', webhookLog?.id);

      return textResponse('Invalid external_reference', 400);
    }

    const normalizedStatus = normalizePaymentStatus(payment.status);
    const paymentRecordBase = {
      user_id: userId,
      plan_id: planId,
      booster_id: boosterId,
      provider: 'mercadopago',
      provider_payment_id: String(payment.id),
      provider_preference_id: payment.metadata?.preference_id || null,
      external_reference: externalReference,
      billing_cycle: itemType === 'booster' ? null : billingCycle,
      description:
        payment.description ||
        (itemType === 'booster'
          ? 'Booster de destaques BWAGRO'
          : `Assinatura BWAGRO - ${billingCycle === 'yearly' ? 'Anual' : 'Mensal'}`),
      amount: Number(payment.transaction_amount || 0),
      currency: payment.currency_id || 'BRL',
      status: normalizedStatus,
      status_detail: payment.status_detail || null,
      payment_method: payment.payment_method_id || payment.payment_type_id || null,
      receipt_url: payment.transaction_details?.external_resource_url || null,
      invoice_status: resolveInvoiceStatus(normalizedStatus),
      paid_at: payment.date_approved || null,
      updated_at: new Date().toISOString(),
      metadata: {
        mercadopago_id: payment.id,
        item_type: itemType,
        item_name: payment.description || null,
        booster_id: boosterId,
        live_mode: payment.live_mode ?? null,
        order_id: payment.order?.id ?? null,
        status_detail: payment.status_detail ?? null,
        raw_status: payment.status ?? null,
      },
    };

    const { error: paymentRecordError } = await supabaseAdmin
      .from('payments')
      .upsert(paymentRecordBase, { onConflict: 'provider_payment_id' });

    if (paymentRecordError) {
      console.error('Failed to persist payment record:', paymentRecordError);

      await supabaseAdmin
        .from('webhook_logs')
        .update({
          processed: false,
          error_message: paymentRecordError.message,
        })
        .eq('id', webhookLog?.id);

      return textResponse('Failed to persist payment record', 500);
    }

    if (payment.status === 'approved') {
      const processedMarker = `payment_processed:${payment.id}`;
      const { data: processedPayment, error: processedPaymentError } = await supabaseAdmin
        .from('mp_processed_payments')
        .upsert(
          {
            payment_id: String(payment.id),
            provider: 'mercadopago',
            user_id: userId,
            plan_id: planId,
            webhook_log_id: webhookLog?.id || null,
          },
          {
            onConflict: 'payment_id',
            ignoreDuplicates: true,
          }
        )
        .select('payment_id')
        .maybeSingle();

      if (processedPaymentError) {
        console.error('Failed to reserve payment id:', processedPaymentError);

        await supabaseAdmin
          .from('webhook_logs')
          .update({
            processed: false,
            error_message: processedPaymentError.message,
          })
          .eq('id', webhookLog?.id);

        return textResponse('Failed to reserve payment', 500);
      }

      if (!processedPayment?.payment_id) {
        await supabaseAdmin
          .from('webhook_logs')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            status_code: 200,
            error_message: processedMarker,
          })
          .eq('id', webhookLog?.id);

        return textResponse('Payment already processed');
      }

      let subscriptionId: string | null = null;

      if (itemType === 'plan' && planId) {
        const { data: selectedPlan, error: selectedPlanError } = await supabaseAdmin
          .from('plans')
          .select('name, is_default_signup_plan, plan_validity_days_monthly, plan_validity_days_yearly')
          .eq('id', planId)
          .maybeSingle();

        if (selectedPlanError) {
          console.error('Failed to load selected plan validity:', selectedPlanError);

          await supabaseAdmin
            .from('webhook_logs')
            .update({
              processed: false,
              error_message: selectedPlanError.message,
            })
            .eq('id', webhookLog?.id);

          return textResponse('Failed to load plan', 500);
        }

        if (isStartSignupPlan(selectedPlan)) {
          const { data: profile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('start_plan_consumed_at')
            .eq('id', userId)
            .maybeSingle();

          if (profileError) {
            console.error('Failed to validate Start plan eligibility:', profileError);

            await supabaseAdmin
              .from('webhook_logs')
              .update({
                processed: false,
                error_message: profileError.message,
              })
              .eq('id', webhookLog?.id);

            return textResponse('Failed to validate plan eligibility', 500);
          }

          if (profile?.start_plan_consumed_at) {
            await supabaseAdmin
              .from('webhook_logs')
              .update({
                processed: true,
                processed_at: new Date().toISOString(),
                status_code: 403,
                error_message: 'Start plan already consumed by user',
              })
              .eq('id', webhookLog?.id);

            return textResponse('Start plan already consumed', 403);
          }
        }

        const { data: activeSubscription } = await supabaseAdmin
          .from('user_subscriptions')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('current_period_end', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeSubscription?.id) {
          await supabaseAdmin
            .from('user_subscriptions')
            .update({
              status: 'expired',
            })
            .eq('id', activeSubscription.id);
        }

        const periodStart = new Date().toISOString();
        const periodEndDate = new Date();
        periodEndDate.setUTCDate(
          periodEndDate.getUTCDate() +
            resolvePlanValidityDays(
              billingCycle,
              selectedPlan?.plan_validity_days_monthly,
              selectedPlan?.plan_validity_days_yearly
            )
        );

        const { data: subscription, error: subscriptionError } = await supabaseAdmin
          .from('user_subscriptions')
          .insert({
            user_id: userId,
            plan_id: planId,
            status: 'active',
            current_period_start: periodStart,
            current_period_end: periodEndDate.toISOString(),
            cancel_at_period_end: false,
            trial_end_date: null,
          })
          .select('id')
          .single();

        if (subscriptionError) {
          console.error('Failed to create subscription:', subscriptionError);

          await supabaseAdmin
            .from('webhook_logs')
            .update({
              processed: false,
              error_message: subscriptionError.message,
            })
            .eq('id', webhookLog?.id);

          return textResponse('Processing error', 500);
        }

        subscriptionId = subscription.id;
      }

      const paymentUpdatePayload =
        itemType === 'booster'
          ? {
              subscription_id: null,
              status: 'approved',
              invoice_status: 'not_applicable',
              fiscal_status: 'not_requested',
              paid_at: payment.date_approved || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : {
              subscription_id: subscriptionId,
              status: 'approved',
              invoice_status: 'pending',
              fiscal_status: 'queued',
              paid_at: payment.date_approved || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

      const { error: approvedPaymentUpdateError } = await supabaseAdmin
        .from('payments')
        .update(paymentUpdatePayload)
        .eq('provider_payment_id', String(payment.id));

      if (approvedPaymentUpdateError) {
        console.error('Failed to link payment to subscription:', approvedPaymentUpdateError);
      }

      const { data: userProfile } = await supabaseAdmin
        .from('users')
        .select('email, name')
        .eq('id', userId)
        .maybeSingle();

      await supabaseAdmin.from('admin_audit_logs').insert({
        admin_id: userId,
        admin_email: userProfile?.email || 'unknown@unknown',
        admin_name: userProfile?.name || userProfile?.email || 'Unknown User',
        action: 'SUBSCRIPTION_ACTIVATED',
        resource_type: itemType === 'booster' ? 'payment' : 'SUBSCRIPTION',
        resource_id: itemType === 'booster' ? String(payment.id) : subscriptionId,
        new_value: {
          plan_id: planId,
          booster_id: boosterId,
          billing_cycle: billingCycle,
          mp_payment_id: String(payment.id),
          amount: payment.transaction_amount,
          item_type: itemType,
        },
        reason: itemType === 'booster' ? 'Booster creditado via pagamento Mercado Pago' : 'Assinatura ativada via pagamento Mercado Pago',
      });

      if (itemType === 'booster' && boosterId) {
        const { data: approvedPaymentRecord } = await supabaseAdmin
          .from('payments')
          .select('id')
          .eq('provider_payment_id', String(payment.id))
          .maybeSingle();

        const { data: boosterCreditResult, error: boosterCreditError } = await supabaseAdmin.rpc(
          'register_highlight_booster_purchase',
          {
            p_user_id: userId,
            p_booster_id: boosterId,
            p_payment_id: approvedPaymentRecord?.id || null,
            p_provider_payment_id: String(payment.id),
            p_amount: Number(payment.transaction_amount || 0),
          }
        );

        if (boosterCreditError || !boosterCreditResult?.success) {
          await supabaseAdmin
            .from('webhook_logs')
            .update({
              processed: false,
              error_message: boosterCreditError?.message || boosterCreditResult?.error || 'Failed to credit booster',
            })
            .eq('id', webhookLog?.id);

          return textResponse('Failed to credit booster', 500);
        }

        await supabaseAdmin.from('notifications').insert({
          user_id: userId,
          type: 'SYSTEM',
          title: 'Booster creditado com sucesso',
          content: `Seu booster foi ativado com ${boosterCreditResult.category_credits} destaque(s) em categoria e ${boosterCreditResult.home_credits} destaque(s) na home.`,
          link: '/minha-conta/meus-anuncios',
        });
      } else {
        await supabaseAdmin.from('notifications').insert({
          user_id: userId,
          type: 'SYSTEM',
          title: 'Pagamento Aprovado!',
          content: 'Sua assinatura foi ativada com sucesso. Aproveite todos os recursos do seu plano.',
          link: '/minha-conta/financeiro',
        });
      }

      const { data: approvedPaymentRecord } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('provider_payment_id', String(payment.id))
        .maybeSingle();

      const internalAutomationSecret = Deno.env.get('INTERNAL_AUTOMATION_SECRET');

      if (itemType === 'plan' && approvedPaymentRecord?.id && internalAutomationSecret) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/issue-nfse`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': internalAutomationSecret,
            },
            body: JSON.stringify({
              paymentId: approvedPaymentRecord.id,
              source: 'mercadopago_webhook',
            }),
          });
        } catch (nfseError) {
          console.error('Failed to enqueue NFS-e issuance:', nfseError);
        }
      }

      await supabaseAdmin
        .from('webhook_logs')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          status_code: 200,
          error_message: processedMarker,
        })
        .eq('id', webhookLog?.id);

      await supabaseAdmin
        .from('webhook_request_registry')
        .upsert({
          provider: 'mercadopago',
          request_id: requestId,
          signature_ts_ms: signatureTimestamp,
          event_type: eventType,
          payment_id: String(paymentId),
          webhook_log_id: webhookLog?.id ?? null,
          processed_at: new Date().toISOString(),
        }, {
          onConflict: 'provider,request_id',
        });

      return textResponse('Payment processed');
    }

    if (payment.status === 'rejected' || payment.status === 'cancelled') {
      await supabaseAdmin.from('notifications').insert({
        user_id: userId,
        type: 'SYSTEM',
        title: 'Pagamento Recusado',
        content: `Seu pagamento foi recusado. Status: ${payment.status_detail || payment.status}.`,
        link: '/minha-conta/financeiro',
      });
    }

    await supabaseAdmin
      .from('webhook_logs')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        status_code: 200,
        error_message: `payment_status:${payment.status || 'unknown'}`,
      })
      .eq('id', webhookLog?.id);

    await supabaseAdmin
      .from('webhook_request_registry')
      .upsert({
        provider: 'mercadopago',
        request_id: requestId,
        signature_ts_ms: signatureTimestamp,
        event_type: eventType,
        payment_id: String(paymentId),
        webhook_log_id: webhookLog?.id ?? null,
        processed_at: new Date().toISOString(),
      }, {
        onConflict: 'provider,request_id',
      });

    return textResponse(`Payment ${payment.status || 'ignored'}`);
  } catch (error) {
    console.error('Webhook error:', error);
    return textResponse(error instanceof Error ? error.message : 'Internal server error', 500);
  }
});
