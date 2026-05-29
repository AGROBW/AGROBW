import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import { logSecurityEvent } from '../_shared/security.ts';

type SyncMode = 'sync_pending' | 'revert_cancelled' | 'clear_cancel_at_period_end';

interface SyncRequestBody {
  requestId?: string;
  mode?: SyncMode;
  providerSubscriptionId?: string;
}

type SubscriptionChangeRequestRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_subscription_id: string | null;
  current_plan_id: string | null;
  target_plan_id: string | null;
  current_billing_cycle: 'monthly' | 'yearly' | null;
  target_billing_cycle: 'monthly' | 'yearly' | null;
  change_kind: 'upgrade' | 'downgrade' | 'cancel';
  status: 'pending' | 'applied' | 'cancelled' | 'failed';
  effective_on: string | null;
  metadata: Record<string, unknown> | null;
};

type StripeSubscription = {
  id: string;
  customer?: string | null;
  currency?: string | null;
  cancel_at_period_end?: boolean;
  current_period_start?: number | null;
  current_period_end?: number | null;
  schedule?: string | { id?: string | null } | null;
  items?: {
    data?: Array<{
      id?: string | null;
      quantity?: number | null;
      price?: {
        id?: string | null;
      } | null;
    }>;
  } | null;
};

type StripeSchedule = {
  id: string;
  status?: string | null;
  current_phase?: {
    start_date?: number | null;
    end_date?: number | null;
  } | null;
  metadata?: Record<string, string> | null;
};

const PAYMENT_SETTINGS_ID = '00000000-0000-0000-0000-000000000005';

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });

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

const stripePost = async (secretKey: string, path: string, body: URLSearchParams) => {
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

const getScheduleIdFromSubscription = (subscription: StripeSubscription) => {
  if (typeof subscription.schedule === 'string') {
    return subscription.schedule.trim() || null;
  }

  if (subscription.schedule && typeof subscription.schedule === 'object') {
    return String(subscription.schedule.id || '').trim() || null;
  }

  return null;
};

const loadStripeSubscription = async (secretKey: string, subscriptionId: string) => {
  const query = new URLSearchParams();
  query.append('expand[]', 'items.data.price');
  query.append('expand[]', 'schedule');
  const response = await stripeGet(secretKey, `/v1/subscriptions/${subscriptionId}?${query.toString()}`);
  if (!response.ok || !response.payload?.id) {
    throw new Error(response.payload?.error?.message || 'Falha ao carregar a assinatura Stripe.');
  }

  return response.payload as StripeSubscription;
};

const loadStripeSchedule = async (secretKey: string, scheduleId: string) => {
  const response = await stripeGet(secretKey, `/v1/subscription_schedules/${scheduleId}`);
  if (!response.ok || !response.payload?.id) {
    throw new Error(response.payload?.error?.message || 'Falha ao carregar o agendamento Stripe.');
  }

  return response.payload as StripeSchedule;
};

const releaseStripeSchedule = async (secretKey: string, scheduleId: string) => {
  const body = new URLSearchParams();
  body.set('preserve_cancel_date', 'false');
  const response = await stripePost(secretKey, `/v1/subscription_schedules/${scheduleId}/release`, body);
  if (!response.ok) {
    throw new Error(response.payload?.error?.message || 'Falha ao liberar o agendamento Stripe.');
  }

  return response.payload as StripeSchedule;
};

const updateStripeSubscriptionCancellation = async (
  secretKey: string,
  subscriptionId: string,
  shouldCancelAtPeriodEnd: boolean,
) => {
  const body = new URLSearchParams();
  body.set('cancel_at_period_end', shouldCancelAtPeriodEnd ? 'true' : 'false');
  const response = await stripePost(secretKey, `/v1/subscriptions/${subscriptionId}`, body);
  if (!response.ok) {
    throw new Error(response.payload?.error?.message || 'Falha ao atualizar o cancelamento da assinatura Stripe.');
  }

  return response.payload;
};

const createScheduleFromSubscription = async (secretKey: string, subscriptionId: string) => {
  const body = new URLSearchParams();
  body.set('from_subscription', subscriptionId);
  const response = await stripePost(secretKey, '/v1/subscription_schedules', body);
  if (!response.ok || !response.payload?.id) {
    throw new Error(response.payload?.error?.message || 'Falha ao criar o agendamento da assinatura Stripe.');
  }

  return response.payload as StripeSchedule;
};

const updateStripeScheduleForNextCycle = async (
  secretKey: string,
  params: {
    scheduleId: string;
    currentPriceId: string;
    currentQuantity: number;
    currentPhaseStart: number;
    currentPhaseEnd: number;
    currentMetadata: Record<string, string>;
    targetPriceId: string;
    targetBillingCycle: 'monthly' | 'yearly';
    targetMetadata: Record<string, string>;
  },
) => {
  const body = new URLSearchParams();
  body.set('end_behavior', 'release');
  body.set('proration_behavior', 'none');

  body.set('phases[0][items][0][price]', params.currentPriceId);
  body.set('phases[0][items][0][quantity]', String(params.currentQuantity));
  body.set('phases[0][start_date]', String(params.currentPhaseStart));
  body.set('phases[0][end_date]', String(params.currentPhaseEnd));
  body.set('phases[0][proration_behavior]', 'none');

  Object.entries(params.currentMetadata).forEach(([key, value]) => {
    body.set(`phases[0][metadata][${key}]`, value);
  });

  body.set('phases[1][items][0][price]', params.targetPriceId);
  body.set('phases[1][items][0][quantity]', String(params.currentQuantity));
  body.set('phases[1][start_date]', String(params.currentPhaseEnd));
  body.set('phases[1][duration][interval]', params.targetBillingCycle === 'yearly' ? 'year' : 'month');
  body.set('phases[1][duration][interval_count]', '1');
  body.set('phases[1][proration_behavior]', 'none');

  Object.entries(params.targetMetadata).forEach(([key, value]) => {
    body.set(`phases[1][metadata][${key}]`, value);
  });

  const response = await stripePost(secretKey, `/v1/subscription_schedules/${params.scheduleId}`, body);
  if (!response.ok || !response.payload?.id) {
    throw new Error(response.payload?.error?.message || 'Falha ao agendar a troca de plano na Stripe.');
  }

  return response.payload as StripeSchedule;
};

const loadRequest = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  mode: SyncMode,
  requestId?: string,
) => {
  let query = supabaseAdmin
    .from('subscription_change_requests')
    .select(
      'id,user_id,provider,provider_subscription_id,current_plan_id,target_plan_id,current_billing_cycle,target_billing_cycle,change_kind,status,effective_on,metadata'
    )
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
    .limit(1);

  if (requestId) {
    query = query.eq('id', requestId);
  } else {
    query = query.eq('status', mode === 'revert_cancelled' ? 'cancelled' : 'pending');
  }

  if (requestId && mode === 'revert_cancelled') {
    query = query.eq('status', 'cancelled');
  }

  if (requestId && mode === 'sync_pending') {
    query = query.eq('status', 'pending');
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }

  return (data as SubscriptionChangeRequestRow | null) ?? null;
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

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  if (!authHeader.startsWith('Bearer ')) {
    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/functions/v1/sync-stripe-subscription-change-request',
      attemptedAction: 'subscription_change_missing_bearer',
      reason: 'Authorization header ausente ou sem Bearer token.',
    });
    return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    await logSecurityEvent(supabaseAdmin, {
      req,
      attemptedRoute: '/functions/v1/sync-stripe-subscription-change-request',
      attemptedAction: 'subscription_change_invalid_jwt',
      reason: authError?.message || 'JWT invalido.',
    });
    return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);
  }

  try {
    const body: SyncRequestBody = await req.json().catch(() => ({}));
    const mode: SyncMode =
      body.mode === 'revert_cancelled'
        ? 'revert_cancelled'
        : body.mode === 'clear_cancel_at_period_end'
          ? 'clear_cancel_at_period_end'
          : 'sync_pending';

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('payment_settings')
      .select('stripe_secret_key')
      .eq('id', PAYMENT_SETTINGS_ID)
      .single();

    if (settingsError || !settings?.stripe_secret_key) {
      return jsonResponse(req, { success: false, error: 'Stripe sem secret key configurada.' }, 400);
    }

    const requestRow =
      mode === 'clear_cancel_at_period_end'
        ? null
        : await loadRequest(supabaseAdmin, user.id, mode, body.requestId);

    if (mode === 'clear_cancel_at_period_end') {
      const providerSubscriptionId =
        String(body.providerSubscriptionId || '').trim() ||
        String(
          (
            await supabaseAdmin
              .from('user_subscriptions')
              .select('provider_subscription_id')
              .eq('user_id', user.id)
              .eq('provider', 'stripe')
              .in('status', ['active', 'trialing', 'past_due'])
              .order('current_period_end', { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle()
          ).data?.provider_subscription_id || ''
        ).trim();

      if (!providerSubscriptionId) {
        return jsonResponse(req, { success: false, error: 'Nenhuma assinatura Stripe ativa encontrada para esta conta.' }, 404);
      }

      const stripeSubscription = await loadStripeSubscription(settings.stripe_secret_key, providerSubscriptionId);
      const scheduleId = getScheduleIdFromSubscription(stripeSubscription);

      if (scheduleId) {
        try {
          const schedule = await loadStripeSchedule(settings.stripe_secret_key, scheduleId);
          if (schedule.status === 'active' || schedule.status === 'not_started') {
            await releaseStripeSchedule(settings.stripe_secret_key, scheduleId);
          }
        } catch (scheduleError) {
          console.warn('[sync-stripe-subscription-change-request] falha ao liberar schedule durante clear_cancel_at_period_end:', scheduleError);
        }
      }

      if (stripeSubscription.cancel_at_period_end) {
        await updateStripeSubscriptionCancellation(settings.stripe_secret_key, providerSubscriptionId, false);
      }

      return jsonResponse(req, {
        success: true,
        action: 'cancel_at_period_end_cleared',
        providerSubscriptionId,
      });
    }

    if (!requestRow) {
      return jsonResponse(req, {
        success: false,
        error:
          mode === 'revert_cancelled'
            ? 'Nenhuma alteracao cancelada encontrada para reverter.'
            : 'Nenhuma alteracao pendente encontrada para sincronizar.',
      }, 404);
    }

    if (requestRow.provider !== 'stripe') {
      return jsonResponse(req, { success: false, error: 'Apenas alteracoes Stripe sao suportadas neste fluxo.' }, 400);
    }

    const providerSubscriptionId = String(requestRow.provider_subscription_id || '').trim();
    if (!providerSubscriptionId) {
      return jsonResponse(req, { success: false, error: 'A solicitacao nao possui provider_subscription_id salvo.' }, 400);
    }

    const stripeSubscription = await loadStripeSubscription(settings.stripe_secret_key, providerSubscriptionId);
    const currentItem = stripeSubscription.items?.data?.[0] || null;
    const currentPriceId = String(currentItem?.price?.id || '').trim();
    const currentQuantity = Number(currentItem?.quantity || 1);
    const currentPeriodStart = Number(stripeSubscription.current_period_start || 0);
    const currentPeriodEnd = Number(stripeSubscription.current_period_end || 0);

    if (!currentPriceId || !currentPeriodStart || !currentPeriodEnd) {
      return jsonResponse(req, { success: false, error: 'A assinatura Stripe nao retornou dados suficientes para agendar a alteracao.' }, 400);
    }

    const requestMetadata = (requestRow.metadata && typeof requestRow.metadata === 'object'
      ? requestRow.metadata
      : {}) as Record<string, unknown>;

    if (mode === 'revert_cancelled') {
      const storedScheduleId = String(requestMetadata.stripe_schedule_id || '').trim();

      if (requestRow.change_kind === 'cancel') {
        if (stripeSubscription.cancel_at_period_end) {
          await updateStripeSubscriptionCancellation(settings.stripe_secret_key, providerSubscriptionId, false);
        }
      } else if (storedScheduleId) {
        try {
          const schedule = await loadStripeSchedule(settings.stripe_secret_key, storedScheduleId);
          if (schedule.status === 'active' || schedule.status === 'not_started') {
            await releaseStripeSchedule(settings.stripe_secret_key, storedScheduleId);
          }
        } catch (scheduleError) {
          console.warn('[sync-stripe-subscription-change-request] falha ao liberar schedule cancelado:', scheduleError);
        }
      }

      const nextMetadata = {
        ...requestMetadata,
        stripe_sync_state: 'reverted',
        stripe_reverted_at: new Date().toISOString(),
      };

      await supabaseAdmin
        .from('subscription_change_requests')
        .update({ metadata: nextMetadata })
        .eq('id', requestRow.id);

      return jsonResponse(req, {
        success: true,
        requestId: requestRow.id,
        action: 'reverted',
      });
    }

    if (requestRow.change_kind === 'cancel') {
      const scheduleId = getScheduleIdFromSubscription(stripeSubscription);
      if (scheduleId) {
        try {
          const schedule = await loadStripeSchedule(settings.stripe_secret_key, scheduleId);
          if (schedule.status === 'active' || schedule.status === 'not_started') {
            await releaseStripeSchedule(settings.stripe_secret_key, scheduleId);
          }
        } catch (scheduleError) {
          console.warn('[sync-stripe-subscription-change-request] falha ao liberar schedule antes do cancelamento:', scheduleError);
        }
      }

      await updateStripeSubscriptionCancellation(settings.stripe_secret_key, providerSubscriptionId, true);

      const nextMetadata = {
        ...requestMetadata,
        stripe_sync_state: 'cancel_at_period_end',
        stripe_synced_at: new Date().toISOString(),
      };

      await supabaseAdmin
        .from('subscription_change_requests')
        .update({ metadata: nextMetadata })
        .eq('id', requestRow.id);

      return jsonResponse(req, {
        success: true,
        requestId: requestRow.id,
        action: 'cancel_scheduled',
      });
    }

    const { data: targetPlan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('id,name,stripe_monthly_price_id,stripe_yearly_price_id')
      .eq('id', requestRow.target_plan_id || '')
      .maybeSingle();

    if (planError || !targetPlan) {
      return jsonResponse(req, { success: false, error: 'Plano de destino nao encontrado para a alteracao agendada.' }, 404);
    }

    const targetBillingCycle = requestRow.target_billing_cycle;
    const targetPriceId = String(
      targetBillingCycle === 'yearly' ? targetPlan.stripe_yearly_price_id || '' : targetPlan.stripe_monthly_price_id || ''
    ).trim();

    if (!targetBillingCycle || !targetPriceId) {
      return jsonResponse(req, { success: false, error: 'O plano de destino ainda nao possui Stripe Price ID para este ciclo.' }, 400);
    }

    if (stripeSubscription.cancel_at_period_end) {
      await updateStripeSubscriptionCancellation(settings.stripe_secret_key, providerSubscriptionId, false);
    }

    let scheduleId = getScheduleIdFromSubscription(stripeSubscription);
    if (!scheduleId) {
      const createdSchedule = await createScheduleFromSubscription(settings.stripe_secret_key, providerSubscriptionId);
      scheduleId = createdSchedule.id;
    }

    const schedule = await loadStripeSchedule(settings.stripe_secret_key, scheduleId);
    const currentPhaseStart = Number(schedule.current_phase?.start_date || currentPeriodStart);
    const currentPhaseEnd = Number(schedule.current_phase?.end_date || currentPeriodEnd);

    const currentMetadata = {
      user_id: user.id,
      plan_id: String(requestRow.current_plan_id || ''),
      billing_cycle: String(requestRow.current_billing_cycle || ''),
      item_type: 'plan',
    };

    const targetMetadata = {
      user_id: user.id,
      plan_id: String(requestRow.target_plan_id || ''),
      billing_cycle: targetBillingCycle,
      item_type: 'plan',
      subscription_change_request_id: requestRow.id,
    };

    const updatedSchedule = await updateStripeScheduleForNextCycle(settings.stripe_secret_key, {
      scheduleId,
      currentPriceId,
      currentQuantity,
      currentPhaseStart,
      currentPhaseEnd,
      currentMetadata,
      targetPriceId,
      targetBillingCycle,
      targetMetadata,
    });

    const nextMetadata = {
      ...requestMetadata,
      stripe_schedule_id: updatedSchedule.id,
      stripe_sync_state: 'scheduled',
      stripe_synced_at: new Date().toISOString(),
      stripe_target_price_id: targetPriceId,
    };

    await supabaseAdmin
      .from('subscription_change_requests')
      .update({ metadata: nextMetadata })
      .eq('id', requestRow.id);

    return jsonResponse(req, {
      success: true,
      requestId: requestRow.id,
      action: 'scheduled',
      scheduleId: updatedSchedule.id,
      effectiveOn: requestRow.effective_on,
    });
  } catch (error) {
    console.error('[sync-stripe-subscription-change-request] unexpected error:', error);
    return jsonResponse(req, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, 500);
  }
});
