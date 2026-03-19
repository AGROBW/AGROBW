import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey, x-internal-secret',
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

const normalizeDigits = (value?: string | null) => (value || '').replace(/\D/g, '');
const trimToNull = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const buildFocusEndpoint = (baseUrl: string, endpointPath: string, reference: string) => {
  const safeBase = baseUrl.replace(/\/$/, '');
  const safeReference = encodeURIComponent(reference);
  const path = endpointPath.replace('{reference}', safeReference);
  return `${safeBase}${path.startsWith('/') ? path : `/${path}`}`;
};

const mapFocusStatus = (status?: string | null) => String(status || '').trim().toLowerCase();

const isIssuedStatus = (status: string) =>
  ['autorizado', 'authorized', 'issued', 'completed', 'success'].includes(status);

const isFailureStatus = (status: string) =>
  ['erro_autorizacao', 'error', 'failed', 'rejeitado', 'cancelado'].includes(status);

const buildFocusReference = (prefix: string, providerPaymentId: string) =>
  `${prefix || 'BWAGRO'}-${providerPaymentId}`.replace(/[^A-Za-z0-9_-]/g, '');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const fiscalProviderApiKey = Deno.env.get('FISCAL_PROVIDER_API_KEY');
    const internalAutomationSecret = Deno.env.get('INTERNAL_AUTOMATION_SECRET');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Missing Supabase secrets' }, 500);
    }

    if (!fiscalProviderApiKey) {
      return jsonResponse({ success: false, error: 'Missing FISCAL_PROVIDER_API_KEY' }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const internalSecret = req.headers.get('x-internal-secret');
    const authHeader = req.headers.get('Authorization') || '';
    const isInternalCall = Boolean(
      internalAutomationSecret && internalSecret && internalSecret === internalAutomationSecret
    );

    if (!isInternalCall) {
      if (!authHeader.startsWith('Bearer ')) {
        return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      }

      const token = authHeader.slice(7).trim();
      const {
        data: { user },
        error: authError,
      } = await authClient.auth.getUser(token);

      if (authError || !user) {
        return jsonResponse({ success: false, error: 'Invalid JWT', details: authError?.message }, 401);
      }

      const { data: userProfile } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if ((userProfile?.role || '').toLowerCase() !== 'admin') {
        return jsonResponse({ success: false, error: 'Admin access required' }, 403);
      }
    }

    const body = await req.json().catch(() => ({}));
    const paymentId = String(body.paymentId || '').trim();

    if (!paymentId) {
      return jsonResponse({ success: false, error: 'paymentId is required' }, 400);
    }

    const { data: fiscalSettings, error: fiscalSettingsError } = await supabaseAdmin
      .from('fiscal_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (fiscalSettingsError || !fiscalSettings) {
      return jsonResponse({ success: false, error: 'Fiscal settings not configured' }, 500);
    }

    if (!fiscalSettings.auto_issue_enabled && isInternalCall) {
      return jsonResponse({ success: true, skipped: true, reason: 'auto_issue_disabled' });
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select(`
        *,
        users:user_id (
          id,
          name,
          email,
          document,
          cep,
          logradouro,
          numero,
          complemento,
          bairro,
          cidade,
          estado
        ),
        plans:plan_id (
          id,
          name
        )
      `)
      .eq('id', paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return jsonResponse({ success: false, error: 'Payment not found' }, 404);
    }

    if (payment.status !== 'approved') {
      return jsonResponse({ success: false, error: 'Only approved payments can issue NFS-e' }, 400);
    }

    if (payment.invoice_status === 'available' || payment.fiscal_status === 'issued') {
      return jsonResponse({
        success: true,
        alreadyIssued: true,
        paymentId: payment.id,
        invoiceNumber: payment.invoice_number,
      });
    }

    const customer = Array.isArray(payment.users) ? payment.users[0] : payment.users;
    const plan = Array.isArray(payment.plans) ? payment.plans[0] : payment.plans;
    const customerDocument = normalizeDigits(customer?.document);

    if (!fiscalSettings.legal_name || !normalizeDigits(fiscalSettings.cnpj)) {
      return jsonResponse({ success: false, error: 'Issuer fiscal data is incomplete' }, 400);
    }

    if (!fiscalSettings.service_code || !fiscalSettings.service_city_code) {
      return jsonResponse(
        {
          success: false,
          error: 'Focus fiscal settings are incomplete',
          details: 'service_code and service_city_code are required',
        },
        400
      );
    }

    if (!customer?.name || !customer?.email || !customerDocument) {
      return jsonResponse(
        {
          success: false,
          error: 'Customer fiscal data is incomplete',
          details: 'name, email and CPF/CNPJ are required',
        },
        400
      );
    }

    const nowIso = new Date().toISOString();
    const reference = buildFocusReference(
      fiscalSettings.focus_nfse_reference_prefix || 'BWAGRO',
      String(payment.provider_payment_id)
    );
    const focusStatus = mapFocusStatus(payment.metadata?.focus_status as string | undefined);
    const attemptsReference = payment.fiscal_external_id || reference;

    const existingJob = await supabaseAdmin
      .from('fiscal_document_jobs')
      .select('*')
      .eq('payment_id', payment.id)
      .maybeSingle();

    const attempts = (existingJob.data?.attempts || 0) + 1;

    const requestPayload = {
      data_emissao: nowIso,
      natureza_operacao: Number(fiscalSettings.focus_natureza_operacao || 1),
      optante_simples_nacional: Boolean(fiscalSettings.focus_simple_national),
      regime_especial_tributacao: trimToNull(fiscalSettings.focus_special_tax_regime),
      prestador: {
        cnpj: normalizeDigits(fiscalSettings.cnpj),
        inscricao_municipal: trimToNull(fiscalSettings.municipal_registration),
        codigo_municipio: Number(fiscalSettings.service_city_code),
      },
      tomador: {
        ...(customerDocument.length > 11
          ? { cnpj: customerDocument }
          : { cpf: customerDocument }),
        razao_social: customer.name,
        email: customer.email,
        endereco: {
          logradouro: trimToNull(customer.logradouro),
          numero: trimToNull(customer.numero),
          complemento: trimToNull(customer.complemento),
          bairro: trimToNull(customer.bairro),
          uf: trimToNull(customer.estado),
          cep: normalizeDigits(customer.cep),
        },
      },
      servico: {
        discriminacao:
          trimToNull(fiscalSettings.service_description) ||
          trimToNull(payment.description) ||
          trimToNull(plan?.name) ||
          'Assinatura BWAGRO',
        item_lista_servico:
          trimToNull(fiscalSettings.focus_service_list_item) || trimToNull(fiscalSettings.service_code),
        codigo_municipio_prestacao: trimToNull(fiscalSettings.service_city_code),
        codigo_tributario_municipio: trimToNull(fiscalSettings.focus_municipal_tax_code),
        iss_retido: Boolean(fiscalSettings.focus_iss_withheld),
        valor_servicos: Number(payment.amount || 0),
        aliquota: fiscalSettings.focus_iss_rate != null ? Number(fiscalSettings.focus_iss_rate) : undefined,
      },
    };

    const { error: queueError } = await supabaseAdmin
      .from('fiscal_document_jobs')
      .upsert(
        {
          payment_id: payment.id,
          provider: 'FOCUSNFE',
          status: 'processing',
          attempts,
          request_payload: requestPayload,
          response_payload: {},
          requested_at: existingJob.data?.requested_at || nowIso,
          last_attempt_at: nowIso,
          updated_at: nowIso,
          provider_document_id: attemptsReference,
          last_error: null,
        },
        { onConflict: 'payment_id' }
      );

    if (queueError) {
      return jsonResponse({ success: false, error: queueError.message }, 500);
    }

    await supabaseAdmin
      .from('payments')
      .update({
        fiscal_provider: 'FOCUSNFE',
        fiscal_external_id: attemptsReference,
        fiscal_status: 'processing',
        fiscal_last_attempt_at: nowIso,
        fiscal_error_message: null,
        invoice_status: 'pending',
        updated_at: nowIso,
        metadata: {
          ...(payment.metadata || {}),
          focus_reference: reference,
          focus_status: focusStatus || 'processando_autorizacao',
        },
      })
      .eq('id', payment.id);

    const endpoint = buildFocusEndpoint(
      fiscalSettings.provider_api_base_url || 'https://homologacao.focusnfe.com.br',
      fiscalSettings.provider_invoice_endpoint_path || '/v2/nfse?ref={reference}',
      reference
    );

    const providerResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${fiscalProviderApiKey}:`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });

    const rawResponseText = await providerResponse.text();
    const providerData = rawResponseText ? JSON.parse(rawResponseText) : {};

    if (!providerResponse.ok) {
      const errorMessage =
        providerData?.mensagem ||
        providerData?.message ||
        providerData?.error ||
        `Focus error ${providerResponse.status}`;

      await supabaseAdmin
        .from('payments')
        .update({
          fiscal_provider: 'FOCUSNFE',
          fiscal_external_id: reference,
          fiscal_status: 'failed',
          fiscal_last_attempt_at: nowIso,
          fiscal_error_message: errorMessage,
          invoice_status: 'failed',
          updated_at: nowIso,
          metadata: {
            ...(payment.metadata || {}),
            focus_reference: reference,
            focus_status: 'erro_autorizacao',
          },
        })
        .eq('id', payment.id);

      await supabaseAdmin
        .from('fiscal_document_jobs')
        .update({
          status: 'failed',
          response_payload: providerData,
          last_error: errorMessage,
          updated_at: nowIso,
        })
        .eq('payment_id', payment.id);

      return jsonResponse({ success: false, error: errorMessage, response: providerData }, 502);
    }

    const providerStatus = mapFocusStatus(providerData?.status || 'processando_autorizacao');
    const providerDocumentId = String(providerData?.ref || reference);
    const invoiceNumber =
      providerData?.numero ||
      providerData?.numero_nfse ||
      providerData?.numero_rps ||
      null;
    const invoicePdfUrl =
      providerData?.url_danfe ||
      providerData?.pdf_url ||
      providerData?.url ||
      null;
    const invoiceXmlUrl =
      providerData?.caminho_xml_nota_fiscal ||
      providerData?.xml_url ||
      null;
    const invoiceIssuedAt =
      providerData?.data_emissao ||
      providerData?.autorizado_em ||
      null;
    const isIssued = isIssuedStatus(providerStatus);
    const hasFailed = isFailureStatus(providerStatus);

    await supabaseAdmin
      .from('fiscal_document_jobs')
      .update({
        status: isIssued ? 'completed' : hasFailed ? 'failed' : 'awaiting_webhook',
        provider_document_id: providerDocumentId,
        response_payload: providerData,
        last_error: hasFailed ? providerData?.mensagem || providerData?.message || null : null,
        completed_at: isIssued ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('payment_id', payment.id);

    await supabaseAdmin
      .from('payments')
      .update({
        fiscal_provider: 'FOCUSNFE',
        fiscal_external_id: providerDocumentId,
        fiscal_status: isIssued ? 'issued' : hasFailed ? 'failed' : 'processing',
        fiscal_last_attempt_at: nowIso,
        fiscal_error_message: hasFailed ? providerData?.mensagem || providerData?.message || null : null,
        invoice_status: isIssued ? 'available' : hasFailed ? 'failed' : 'pending',
        invoice_number: invoiceNumber,
        invoice_pdf_url: invoicePdfUrl,
        invoice_xml_url: invoiceXmlUrl,
        invoice_issued_at: invoiceIssuedAt,
        updated_at: nowIso,
        metadata: {
          ...(payment.metadata || {}),
          focus_reference: reference,
          focus_status: providerStatus,
        },
      })
      .eq('id', payment.id);

    if (isIssued) {
      await supabaseAdmin.from('notifications').insert({
        user_id: payment.user_id,
        type: 'SYSTEM',
        title: 'Nota fiscal disponivel',
        content: 'Sua NFS-e foi emitida e ja esta disponivel para download na central financeira.',
        link: '/#/minha-conta/financeiro',
      });
    }

    return jsonResponse({
      success: true,
      paymentId: payment.id,
      issued: isIssued,
      providerDocumentId,
      providerStatus,
      invoiceNumber,
      invoicePdfUrl,
      reference,
    });
  } catch (error) {
    console.error('[issue-nfse] unexpected error:', error);
    return jsonResponse(
      {
        success: false,
        error: 'Unexpected error while issuing NFS-e',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
