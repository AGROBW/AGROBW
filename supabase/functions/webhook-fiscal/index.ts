import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeadersWebhook } from '../_shared/cors.ts';

/**
 * Comparação de strings resistente a timing attacks.
 * Essencial para verificação de secrets de webhook.
 */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

// VULN-002 fix: Webhooks são chamados por servidores, nunca por browsers
const textResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: getCorsHeadersWebhook(),
  });

const mapFocusStatus = (body: any) =>
  String(
    body?.status ||
      body?.data?.status ||
      body?.documento?.status ||
      body?.nota_fiscal?.status ||
      ''
  )
    .trim()
    .toLowerCase();

const resolveReference = (body: any) =>
  String(
    body?.ref ||
      body?.data?.ref ||
      body?.referencia ||
      body?.metadata?.focus_reference ||
      body?.metadata?.providerPaymentId ||
      ''
  ).trim();

const resolveInvoiceNumber = (body: any) =>
  body?.numero || body?.numero_nfse || body?.data?.numero || body?.numero_rps || null;

const resolvePdfUrl = (body: any) =>
  body?.url_danfe || body?.pdf_url || body?.data?.url_danfe || body?.url || null;

const resolveXmlUrl = (body: any) =>
  body?.caminho_xml_nota_fiscal || body?.xml_url || body?.data?.caminho_xml_nota_fiscal || null;

const isIssuedStatus = (status: string) =>
  ['autorizado', 'authorized', 'issued', 'completed', 'success'].includes(status);

const toSaoPauloDateOnly = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return textResponse('ok');
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return textResponse('Serviço indisponível', 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));

    const { data: fiscalSettings } = await supabaseAdmin
      .from('fiscal_settings')
      .select('provider_webhook_secret')
      .limit(1)
      .maybeSingle();

    const expectedSecret = (fiscalSettings?.provider_webhook_secret || '').trim();

    // VULN-004 fix: Rejeitar se o secret não está configurado.
    // Anteriormente, se expectedSecret era null, qualquer request passava sem auth.
    if (!expectedSecret) {
      console.error('[webhook-fiscal] FISCAL_WEBHOOK_SECRET não configurado em fiscal_settings!');
      return textResponse('Webhook not configured — contact the platform administrator', 503);
    }

    // VULN-021 fix: Aceitar APENAS via header — nunca via query string
    // (tokens em URLs aparecem em logs de servidor e histórico de browser)
    const providedSecret =
      req.headers.get('x-webhook-secret') ||
      req.headers.get('x-fiscal-webhook-secret') ||
      '';

    // VULN-004 fix: Comparação timing-safe para evitar timing attacks
    if (!timingSafeEqual(expectedSecret, providedSecret)) {
      console.warn('[webhook-fiscal] Secret inválido recebido:', {
        hasSecret: Boolean(providedSecret),
        secretLength: providedSecret.length,
      });
      return textResponse('Invalid webhook secret', 401);
    }

    const providerStatus = mapFocusStatus(body);
    const reference = resolveReference(body);

    if (!reference) {
      return textResponse('Webhook payload missing ref', 400);
    }

    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('*')
      .or(`fiscal_external_id.eq.${reference},provider_payment_id.eq.${reference}`)
      .limit(1)
      .maybeSingle();

    if (!payment) {
      const { data: fallbackPayment } = await supabaseAdmin
        .from('payments')
        .select('*')
        .contains('metadata', { focus_reference: reference })
        .limit(1)
        .maybeSingle();

      if (!fallbackPayment) {
        return textResponse('Payment not found', 404);
      }
    }

    const targetPayment =
      payment ||
      (
        await supabaseAdmin
          .from('payments')
          .select('*')
          .contains('metadata', { focus_reference: reference })
          .limit(1)
          .maybeSingle()
      ).data;

    if (!targetPayment) {
      return textResponse('Payment not found', 404);
    }

    const nowIso = new Date().toISOString();
    const invoiceNumber = resolveInvoiceNumber(body);
    const invoicePdfUrl = resolvePdfUrl(body);
    const invoiceXmlUrl = resolveXmlUrl(body);
    const invoiceIssuedAt =
      body?.data_emissao || body?.autorizado_em || body?.data?.data_emissao || nowIso;
    const providerError =
      body?.mensagem || body?.message || body?.erros?.[0]?.mensagem || body?.erro || null;
    const issued = isIssuedStatus(providerStatus);

    await supabaseAdmin
      .from('payments')
      .update({
        fiscal_external_id: reference,
        fiscal_status: issued ? 'issued' : 'failed',
        fiscal_last_attempt_at: nowIso,
        fiscal_error_message: issued ? null : providerError,
        invoice_status: issued ? 'available' : 'failed',
        invoice_number: invoiceNumber || targetPayment.invoice_number,
        invoice_pdf_url: invoicePdfUrl || targetPayment.invoice_pdf_url,
        invoice_xml_url: invoiceXmlUrl || targetPayment.invoice_xml_url,
        invoice_issued_at: issued ? invoiceIssuedAt : targetPayment.invoice_issued_at,
        invoice_issued_on: issued
          ? toSaoPauloDateOnly(invoiceIssuedAt)
          : targetPayment.invoice_issued_on,
        updated_at: nowIso,
        metadata: {
          ...(targetPayment.metadata || {}),
          focus_reference: reference,
          focus_status: providerStatus,
        },
      })
      .eq('id', targetPayment.id);

    await supabaseAdmin
      .from('fiscal_document_jobs')
      .update({
        status: issued ? 'completed' : 'failed',
        provider_document_id: reference,
        response_payload: body,
        last_error: issued ? null : providerError,
        completed_at: issued ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('payment_id', targetPayment.id);

    if (issued) {
      await supabaseAdmin.from('notifications').insert({
        user_id: targetPayment.user_id,
        type: 'SYSTEM',
        title: 'Nota fiscal disponivel',
        content: 'Sua NFS-e foi emitida e ja pode ser baixada na central financeira.',
        link: '/minha-conta/assinatura',
      });
    }

    return textResponse('ok');
  } catch (error) {
    console.error('[webhook-fiscal] unexpected error:', error);
    return textResponse('Unexpected error', 500);
  }
});
