import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

interface PreferenceRequest {
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  userId: string;
  itemType?: 'plan' | 'booster';
  boosterId?: string;
  itemName?: string;
}

interface PlanRecord {
  id: string;
  name: string;
  description: string | null;
  monthly_price: number;
  yearly_price: number;
  is_active: boolean;
  button_text: string;
  is_default_signup_plan?: boolean | null;
}

interface BoosterRecord {
  id: string;
  name: string;
  description: string | null;
  monthly_price: number;
  is_active: boolean;
  button_text: string | null;
  max_purchases_per_30_days: number | null;
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

const resolveAmount = (plan: PlanRecord, billingCycle: 'monthly' | 'yearly') => {
  const amount = billingCycle === 'yearly' ? plan.yearly_price : plan.monthly_price;
  return Number(amount || 0);
};

const normalizePlanName = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const isLegacyStartSignupPlanName = (planName: string) =>
  ['start', 'start agro', 'safra'].includes(normalizePlanName(planName || ''));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse(
        {
          success: false,
          error: 'Configuracao incompleta do Supabase',
          details: 'Missing SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY',
        },
        500
      );
    }

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse(
        {
          success: false,
          error: 'Unauthorized',
          details: 'Expected Authorization: Bearer <JWT>',
        },
        401
      );
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse(
        {
          success: false,
          error: 'Invalid token',
          details: authError?.message || 'User not found',
        },
        401
      );
    }

    const body: PreferenceRequest = await req.json();
    const { planId, billingCycle, userId, itemType = 'plan', boosterId } = body;

    if (!planId || !billingCycle || userId !== user.id) {
      return jsonResponse(
        {
          success: false,
          error: 'Invalid request data',
        },
        400
      );
    }

    let amount = 0;
    let itemTitle = '';
    let itemDescription = '';
    let resourceId = planId;

    if (itemType === 'booster') {
      const effectiveBoosterId = boosterId || planId;
      const { data: booster, error: boosterError } = await supabaseAdmin
        .from('highlight_boosters')
        .select('id, name, description, monthly_price, is_active, button_text, max_purchases_per_30_days')
        .eq('id', effectiveBoosterId)
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
        return jsonResponse(
          {
            success: false,
            error: 'Booster inativo',
          },
          400
        );
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: recentPurchasesCount, error: limitError } = await supabaseAdmin
        .from('user_highlight_booster_purchases')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('booster_id', effectiveBoosterId)
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

      amount = Number(booster.monthly_price || 0);
      itemTitle = booster.name;
      itemDescription = booster.description || `Compra do booster ${booster.name}`;
      resourceId = effectiveBoosterId;
    } else {
      const { data: plan, error: planError } = await supabaseAdmin
        .from('plans')
        .select('id, name, description, monthly_price, yearly_price, is_active, button_text, is_default_signup_plan')
        .eq('id', planId)
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
        return jsonResponse(
          {
            success: false,
            error: 'Plano inativo',
          },
          400
        );
      }

      const { count: defaultSignupPlanCount, error: defaultSignupPlanCountError } = await supabaseAdmin
        .from('plans')
        .select('id', { count: 'exact', head: true })
        .eq('is_default_signup_plan', true);

      if (defaultSignupPlanCountError) {
        return jsonResponse(
          {
            success: false,
            error: 'Nao foi possivel validar a configuracao do plano inicial.',
            details: defaultSignupPlanCountError.message,
          },
          500
        );
      }

      const isCurrentSignupPlan =
        (defaultSignupPlanCount || 0) > 0
          ? Boolean(plan.is_default_signup_plan)
          : isLegacyStartSignupPlanName(plan.name || '');

      if (isCurrentSignupPlan) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('users')
          .select('start_plan_consumed_at')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          return jsonResponse(
            {
              success: false,
              error: 'Nao foi possivel validar elegibilidade do plano.',
              details: profileError.message,
            },
            500
          );
        }

        if (profile?.start_plan_consumed_at) {
          return jsonResponse(
            {
              success: false,
              error: 'O plano Start esta disponivel apenas uma vez, no cadastro.',
            },
            403
          );
        }
      }

      amount = resolveAmount(plan as PlanRecord, billingCycle);
      itemTitle = `${plan.name} - ${billingCycle === 'monthly' ? 'Mensal' : 'Anual'}`;
      itemDescription = plan.description || `Assinatura ${plan.name}`;
    }

    if (amount <= 0) {
      return jsonResponse(
        {
          success: false,
          error:
            itemType === 'plan'
              ? 'Este plano gratuito nao pode ser contratado manualmente pelo checkout.'
              : 'Item sem valor valido para checkout.',
          details:
            itemType === 'plan'
              ? 'Planos gratuitos ou de cadastro devem ser atribuídos internamente, sem checkout.'
              : `billingCycle=${billingCycle}`,
        },
        400
      );
    }

    const { data: credentials, error: credentialsError } = await supabaseAdmin
      .from('payment_settings')
      .select('mp_access_token, is_production')
      .eq('id', '00000000-0000-0000-0000-000000000005')
      .single();

    if (credentialsError || !credentials?.mp_access_token) {
      return jsonResponse(
        {
          success: false,
          error: 'Mercado Pago nao configurado',
          details: credentialsError?.message || 'payment_settings not found',
        },
        500
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('email, name')
      .eq('id', user.id)
      .maybeSingle();

    const externalReference =
      itemType === 'booster'
        ? `booster|${user.id}|${resourceId}|one_time`
        : `plan|${user.id}|${resourceId}|${billingCycle}`;
    const projectFunctionsBaseUrl = `${supabaseUrl}/functions/v1`;
    const siteUrl = Deno.env.get('SITE_URL') || 'https://bwagro.com.br';

    const preference = {
      items: [
        {
          id: resourceId,
          title: itemTitle,
          description: itemDescription,
          quantity: 1,
          unit_price: amount,
          currency_id: 'BRL',
        },
      ],
      payer: {
        email: profile?.email || user.email || '',
      },
      external_reference: externalReference,
      back_urls: {
        success: `${siteUrl}/#/minha-conta/financeiro?payment=success`,
        failure: `${siteUrl}/#/minha-conta/financeiro?payment=failure`,
        pending: `${siteUrl}/#/minha-conta/financeiro?payment=pending`,
      },
      notification_url: `${projectFunctionsBaseUrl}/webhook-mercadopago`,
      metadata: {
        user_id: user.id,
        item_type: itemType,
        plan_id: itemType === 'plan' ? resourceId : null,
        booster_id: itemType === 'booster' ? resourceId : null,
        item_name: itemTitle,
        billing_cycle: billingCycle,
      },
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.mp_access_token}`,
      },
      body: JSON.stringify(preference),
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json().catch(() => ({}));
      console.error('Mercado Pago error:', errorData);

      return jsonResponse(
        {
          success: false,
          error: 'Failed to create preference',
          details: errorData,
        },
        500
      );
    }

    const mpData = await mpResponse.json();

    await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: user.id,
      admin_email: profile?.email || user.email || 'unknown@unknown',
      admin_name: profile?.name || user.email || 'Unknown User',
      action: 'CHECKOUT_CREATED',
      resource_type: itemType === 'booster' ? 'PAYMENT' : 'PLAN',
      resource_id: resourceId,
      new_value: {
        preference_id: mpData.id,
        amount,
        billing_cycle: billingCycle,
        item_type: itemType,
      },
      reason: 'Preferencia de pagamento criada com sucesso',
    });

    return jsonResponse({
      success: true,
      preferenceId: mpData.id,
      initPoint: mpData.init_point,
      sandboxInitPoint: mpData.sandbox_init_point,
      amount,
      planName: itemTitle,
    });
  } catch (error) {
    console.error('Edge function error:', error);

    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500
    );
  }
});
