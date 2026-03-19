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

    console.log('Webhook received:', body);

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

    const eventType = body.type || body.topic || '';
    const paymentId = body.data?.id || (body.topic === 'payment' ? body.resource : undefined);

    if (eventType !== 'payment' || !paymentId) {
      await supabaseAdmin
        .from('webhook_logs')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          status_code: 200,
          error_message: `ignored:${eventType || 'unknown'}`,
        })
        .eq('id', webhookLog?.id);

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

    console.log('Payment details:', {
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      external_reference: payment.external_reference,
      transaction_amount: payment.transaction_amount,
    });

    const externalReference = String(payment.external_reference || '');
    const [userId, planId, billingCycle] = externalReference.split('|');

    if (!userId || !planId || !billingCycle) {
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
      provider: 'mercadopago',
      provider_payment_id: String(payment.id),
      provider_preference_id: payment.metadata?.preference_id || null,
      external_reference: externalReference,
      billing_cycle: billingCycle,
      description:
        payment.description ||
        `Assinatura BWAGRO - ${billingCycle === 'yearly' ? 'Anual' : 'Mensal'}`,
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
      periodEndDate.setUTCDate(periodEndDate.getUTCDate() + (billingCycle === 'yearly' ? 365 : 30));

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

      const { error: approvedPaymentUpdateError } = await supabaseAdmin
        .from('payments')
        .update({
          subscription_id: subscription.id,
          status: 'approved',
          invoice_status: 'pending',
          fiscal_status: 'queued',
          paid_at: payment.date_approved || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
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
        resource_type: 'SUBSCRIPTION',
        resource_id: subscription.id,
        new_value: {
          plan_id: planId,
          billing_cycle: billingCycle,
          mp_payment_id: String(payment.id),
          amount: payment.transaction_amount,
        },
        reason: 'Assinatura ativada via pagamento Mercado Pago',
      });

      await supabaseAdmin.from('notifications').insert({
        user_id: userId,
        type: 'SYSTEM',
        title: 'Pagamento Aprovado!',
        content: 'Sua assinatura foi ativada com sucesso. Aproveite todos os recursos do seu plano.',
        link: '/#/minha-conta/financeiro',
      });

      const { data: approvedPaymentRecord } = await supabaseAdmin
        .from('payments')
        .select('id')
        .eq('provider_payment_id', String(payment.id))
        .maybeSingle();

      const internalAutomationSecret = Deno.env.get('INTERNAL_AUTOMATION_SECRET');

      if (approvedPaymentRecord?.id && internalAutomationSecret) {
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

      return textResponse('Payment processed');
    }

    if (payment.status === 'rejected' || payment.status === 'cancelled') {
      await supabaseAdmin.from('notifications').insert({
        user_id: userId,
        type: 'SYSTEM',
        title: 'Pagamento Recusado',
        content: `Seu pagamento foi recusado. Status: ${payment.status_detail || payment.status}.`,
        link: '/#/minha-conta/financeiro',
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

    return textResponse(`Payment ${payment.status || 'ignored'}`);
  } catch (error) {
    console.error('Webhook error:', error);
    return textResponse(error instanceof Error ? error.message : 'Internal server error', 500);
  }
});
