import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
// VULN-019 fix: nodemailer via sendSmtpEmail()
import {
  loadSmtpSettings,
  validateSmtpSettings,
  sendSmtpEmail,
} from '../_shared/smtpSettings.ts';
import { getCorsHeadersInternal } from '../_shared/cors.ts';
import { isAdminAal2Profile, extractBearerToken } from '../_shared/security.ts';

// VULN-002 fix: Função interna/cron - sem acesso de browser
const corsHeaders = getCorsHeadersInternal();

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type ContactNotificationEmailJobRow = {
  id: string;
  source_kind: 'new_message' | 'new_lead';
  recipient_email: string | null;
  recipient_name: string | null;
  sender_name: string | null;
  announcement_title: string | null;
  message_preview: string | null;
  link: string | null;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  attempts: number;
};

const clampLimit = (value: unknown, fallback = 25) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1) return 1;
  if (parsed > 100) return 100;
  return Math.floor(parsed);
};

const getContactNotificationTemplate = (params: {
  appUrl: string;
  siteName: string;
  recipientName: string;
  senderName: string;
  announcementTitle: string;
  messagePreview?: string | null;
  link?: string | null;
  sourceKind: 'new_message' | 'new_lead';
}) => {
  const isLead = params.sourceKind === 'new_lead';
  const title = isLead
    ? `Novo lead no anuncio ${params.announcementTitle}`
    : `Nova mensagem sobre ${params.announcementTitle}`;
  const badge = isLead ? 'Novo lead' : 'Nova mensagem';
  const ctaLabel = isLead ? 'Ver lead' : 'Abrir conversa';
  const intro = isLead
    ? `${params.senderName} demonstrou interesse no seu anuncio e abriu um novo contato na ${params.siteName}.`
    : `${params.senderName} enviou uma nova mensagem para voce na ${params.siteName}.`;
  const footer = isLead
    ? 'Acompanhe esse lead o quanto antes para aumentar suas chances de conversao.'
    : 'Entre na conversa para responder rapido e manter a negociacao ativa.';

  const linkHref = params.link
    ? params.link.startsWith('http')
      ? params.link
      : `${params.appUrl.replace(/\/$/, '')}/#${params.link}`
    : null;

  const preview = params.messagePreview?.trim();

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="padding:28px 32px;background:#0f172a;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#86efac;">
              ${badge}
            </p>
            <h1 style="margin:0;font-size:24px;line-height:1.2;">${title}</h1>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;">Ola, <strong>${params.recipientName}</strong>.</p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
              ${intro}
            </p>
            <div style="margin:0 0 20px;padding:18px 20px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">
                Anuncio
              </p>
              <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">${params.announcementTitle}</p>
            </div>
            ${
              preview
                ? `<div style="margin:0 0 24px;padding:18px 20px;border-radius:14px;background:#ecfdf5;border:1px solid #bbf7d0;">
                    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#15803d;">
                      ${isLead ? 'Mensagem inicial' : 'Conteudo da mensagem'}
                    </p>
                    <p style="margin:0;font-size:15px;line-height:1.7;color:#166534;">${preview}</p>
                  </div>`
                : ''
            }
            ${
              linkHref
                ? `<a
                    href="${linkHref}"
                    style="display:inline-block;padding:14px 22px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;"
                  >
                    ${ctaLabel}
                  </a>`
                : ''
            }
          </div>
          <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
            ${footer}
          </div>
        </div>
      </body>
    </html>
  `.trim();

  return { subject: title, html };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let dispatchLogId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Serviço indisponível' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anonKey);

    const cronSecret = Deno.env.get('CONTACT_NOTIFICATION_EMAILS_CRON_SECRET');
    const requestSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('Authorization') || '';

    // VULN-020 fix + timing-safe para cron secret
    let triggeredBy: 'cron' | 'admin' = 'admin';

    if (cronSecret && requestSecret) {
      // Timing-safe comparison
      let mismatch = 0;
      if (cronSecret.length !== requestSecret.length) {
        mismatch = 1;
      } else {
        for (let i = 0; i < cronSecret.length; i++) {
          mismatch |= cronSecret.charCodeAt(i) ^ requestSecret.charCodeAt(i);
        }
      }
      if (mismatch === 0) triggeredBy = 'cron';
    }

    if (triggeredBy === 'admin') {
      const token = extractBearerToken(req);
      if (!token) {
        return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      }

      const {
        data: { user },
        error: authError,
      } = await authClient.auth.getUser(token);

      if (authError || !user) {
        return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      }

      const { data: adminProfile } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (!isAdminAal2Profile(adminProfile, token)) {
        return jsonResponse({ success: false, error: 'Admin access required' }, 403);
      }
    }

    const body = await req.json().catch(() => ({}));
    const limit = clampLimit(body?.limit, 25);

    const { data: dispatchLog, error: dispatchInsertError } = await supabaseAdmin
      .from('contact_notification_email_dispatch_logs')
      .insert({
        triggered_by: triggeredBy,
        status: 'processing',
        requested_limit: limit,
      })
      .select('id')
      .single();

    if (!dispatchInsertError) {
      dispatchLogId = dispatchLog?.id ?? null;
    }

    const { data: jobRows, error: jobsError } = await supabaseAdmin
      .from('contact_notification_email_jobs')
      .select('id, source_kind, recipient_email, recipient_name, sender_name, announcement_title, message_preview, link, status, attempts')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
      .order('queued_at', { ascending: true })
      .limit(limit);

    if (jobsError) {
      throw new Error(jobsError.message);
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://agrobw.com.br';
    const smtpSettings = await loadSmtpSettings(supabaseAdmin);
    const smtpValidationError = validateSmtpSettings(smtpSettings);
    const siteName = smtpSettings?.from_name || 'AGRO BW';

    let processedCount = 0;
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const job of (jobRows || []) as ContactNotificationEmailJobRow[]) {
      const { data: claimedJob, error: claimError } = await supabaseAdmin
        .from('contact_notification_email_jobs')
        .update({
          status: 'processing',
          processing_started_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(),
          attempts: (job.attempts ?? 0) + 1,
        })
        .eq('id', job.id)
        .eq('status', job.status)
        .select('id, source_kind, recipient_email, recipient_name, sender_name, announcement_title, message_preview, link, status, attempts')
        .maybeSingle();

      if (claimError || !claimedJob) continue;

      processedCount += 1;

      if (!claimedJob.recipient_email || smtpValidationError || !claimedJob.announcement_title) {
        skippedCount += 1;
        await supabaseAdmin
          .from('contact_notification_email_jobs')
          .update({
            status: 'skipped',
            last_error: !claimedJob.recipient_email
              ? 'Destinatario sem e-mail valido'
              : smtpValidationError
                ? smtpValidationError
                : 'Anuncio nao encontrado para composicao do e-mail',
          })
          .eq('id', claimedJob.id);
        continue;
      }

      const email = getContactNotificationTemplate({
        appUrl,
        siteName,
        recipientName: claimedJob.recipient_name || 'Cliente',
        senderName: claimedJob.sender_name || 'Usuario',
        announcementTitle: claimedJob.announcement_title,
        messagePreview: claimedJob.message_preview,
        link: claimedJob.link,
        sourceKind: claimedJob.source_kind,
      });

      // VULN-019 fix: Usando sendSmtpEmail() com nodemailer (TLS verificado)
      const result = await sendSmtpEmail(smtpSettings!, {
        to: claimedJob.recipient_email,
        subject: email.subject,
        html: email.html,
      });

      if (result.success) {
        sentCount += 1;
        await supabaseAdmin
          .from('contact_notification_email_jobs')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', claimedJob.id);
      } else {
        failedCount += 1;
        await supabaseAdmin
          .from('contact_notification_email_jobs')
          .update({
            status: 'failed',
            last_error: result.error || 'Falha ao enviar email',
          })
          .eq('id', claimedJob.id);
      }
    }

    if (dispatchLogId) {
      await supabaseAdmin
        .from('contact_notification_email_dispatch_logs')
        .update({
          status: 'completed',
          processed_count: processedCount,
          sent_count: sentCount,
          failed_count: failedCount,
          skipped_count: skippedCount,
          finished_at: new Date().toISOString(),
        })
        .eq('id', dispatchLogId);
    }

    return jsonResponse({
      success: true,
      triggeredBy,
      processedCount,
      sentCount,
      failedCount,
      skippedCount,
      dispatchLogId,
    });
  } catch (error) {
    if (dispatchLogId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (supabaseUrl && serviceRoleKey) {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        await supabaseAdmin
          .from('contact_notification_email_dispatch_logs')
          .update({
            status: 'failed',
            notes: error instanceof Error ? error.message : 'Unknown error',
            finished_at: new Date().toISOString(),
          })
          .eq('id', dispatchLogId);
      }
    }

    return jsonResponse({
      success: false,
      error: 'Erro interno ao processar emails de notificação',
    }, 500);
  }
});
