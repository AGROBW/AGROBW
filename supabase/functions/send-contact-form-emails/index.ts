import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';
import {
  connectSmtpClientWithSettings,
  loadSmtpSettings,
  validateSmtpSettings,
} from '../_shared/smtpSettings.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey, x-cron-secret',
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

type ContactFormJobRow = {
  id: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  recipient_email: string | null;
  contact_message: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    subject: string | null;
    message: string;
    created_at: string;
    source_page: string;
  } | null;
};

const clampLimit = (value: unknown, fallback = 10) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1) return 1;
  if (parsed > 50) return 50;
  return Math.floor(parsed);
};

const getContactFormTemplate = (params: {
  siteName: string;
  messageId: string;
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  createdAt: string;
}) => {
  const subjectLine = params.subject?.trim()
    ? `Novo contato pelo Fale Conosco: ${params.subject.trim()}`
    : `Novo contato pelo Fale Conosco: ${params.name}`;

  const phoneLine = params.phone?.trim()
    ? `<p style="margin:0 0 12px;font-size:14px;color:#334155;"><strong>Telefone:</strong> ${params.phone.trim()}</p>`
    : '';

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${subjectLine}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="padding:28px 32px;background:#0f172a;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#86efac;">
              Fale Conosco
            </p>
            <h1 style="margin:0;font-size:24px;line-height:1.2;">${subjectLine}</h1>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#475569;">
              Uma nova mensagem foi enviada pelo formulario publico do site.
            </p>
            <div style="margin:0 0 20px;padding:18px 20px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
              <p style="margin:0 0 12px;font-size:14px;color:#334155;"><strong>Nome:</strong> ${params.name}</p>
              <p style="margin:0 0 12px;font-size:14px;color:#334155;"><strong>E-mail:</strong> ${params.email}</p>
              ${phoneLine}
              <p style="margin:0 0 12px;font-size:14px;color:#334155;"><strong>Assunto:</strong> ${params.subject?.trim() || 'Sem assunto'}</p>
              <p style="margin:0;font-size:14px;color:#334155;"><strong>Recebido em:</strong> ${params.createdAt}</p>
            </div>
            <div style="margin:0 0 24px;padding:18px 20px;border-radius:14px;background:#ecfdf5;border:1px solid #bbf7d0;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#15803d;">
                Mensagem
              </p>
              <p style="margin:0;font-size:15px;line-height:1.7;color:#166534;white-space:pre-wrap;">${params.message}</p>
            </div>
          </div>
          <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
            ${params.siteName} • ID da mensagem: ${params.messageId}
          </div>
        </div>
      </body>
    </html>
  `.trim();

  return { subject: subjectLine, html };
};

const isAdminRequest = async (req: Request, supabaseAdmin: ReturnType<typeof createClient>, authClient: ReturnType<typeof createClient>) => {
  const cronSecret = Deno.env.get('CONTACT_FORM_EMAILS_CRON_SECRET');
  const requestSecret = req.headers.get('x-cron-secret');

  if (cronSecret && requestSecret === cronSecret) {
    return true;
  }

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user) {
    return false;
  }

  const { data: adminProfile } = await supabaseAdmin
    .from('users')
    .select('role, is_admin')
    .eq('id', user.id)
    .maybeSingle();

  return (adminProfile?.role || '').toLowerCase() === 'admin' || Boolean(adminProfile?.is_admin);
};

const processJob = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  smtpSettings: Awaited<ReturnType<typeof loadSmtpSettings>>,
  job: ContactFormJobRow,
) => {
  const { data: claimedJob, error: claimError } = await supabaseAdmin
    .from('contact_form_email_jobs')
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      attempts: (job.attempts ?? 0) + 1,
    })
    .eq('id', job.id)
    .eq('status', job.status)
    .select(`
      id,
      status,
      attempts,
      recipient_email,
      contact_message:contact_messages (
        id,
        name,
        email,
        phone,
        subject,
        message,
        created_at,
        source_page
      )
    `)
    .maybeSingle();

  if (claimError || !claimedJob) {
    return { processed: false, status: 'skipped' as const, reason: 'Nao foi possivel reservar o job' };
  }

  const contactMessage = claimedJob.contact_message;
  const recipientEmail = claimedJob.recipient_email?.trim();
  const smtpValidationError = validateSmtpSettings(smtpSettings);

  if (!contactMessage || !recipientEmail || smtpValidationError) {
    const lastError = !contactMessage
      ? 'Mensagem de contato nao encontrada'
      : !recipientEmail
        ? 'Destinatario sem e-mail valido'
        : smtpValidationError;

    await supabaseAdmin
      .from('contact_form_email_jobs')
      .update({
        status: 'skipped',
        last_error: lastError,
      })
      .eq('id', claimedJob.id);

    return { processed: true, status: 'skipped' as const, reason: lastError };
  }

  const createdAt = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(contactMessage.created_at));

  const email = getContactFormTemplate({
    siteName: smtpSettings?.from_name || 'AGRO BW',
    messageId: contactMessage.id,
    name: contactMessage.name,
    email: contactMessage.email,
    phone: contactMessage.phone,
    subject: contactMessage.subject,
    message: contactMessage.message,
    createdAt,
  });

  const client = new SmtpClient();

  try {
    await connectSmtpClientWithSettings(client, smtpSettings!);
    await client.send({
      from: `${smtpSettings!.from_name} <${smtpSettings!.from_email}>`,
      to: recipientEmail,
      subject: email.subject,
      content: email.html,
      html: email.html,
    });

    await supabaseAdmin
      .from('contact_form_email_jobs')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', claimedJob.id);

    return { processed: true, status: 'sent' as const, reason: null };
  } catch (error) {
    await supabaseAdmin
      .from('contact_form_email_jobs')
      .update({
        status: 'failed',
        last_error: error instanceof Error ? error.message : 'Unknown SMTP error',
      })
      .eq('id', claimedJob.id);

    return {
      processed: true,
      status: 'failed' as const,
      reason: error instanceof Error ? error.message : 'Unknown SMTP error',
    };
  } finally {
    await client.close();
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Missing Supabase secrets' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const messageId = typeof body?.messageId === 'string' ? body.messageId.trim() : '';
    const limit = clampLimit(body?.limit, 10);

    const smtpSettings = await loadSmtpSettings(supabaseAdmin);

    if (messageId) {
      const { data: job, error } = await supabaseAdmin
        .from('contact_form_email_jobs')
        .select(`
          id,
          status,
          attempts,
          recipient_email,
          contact_message:contact_messages (
            id,
            name,
            email,
            phone,
            subject,
            message,
            created_at,
            source_page
          )
        `)
        .eq('contact_message_id', messageId)
        .in('status', ['pending', 'failed'])
        .maybeSingle();

      if (error) {
        return jsonResponse({ success: false, error: error.message }, 400);
      }

      if (!job) {
        return jsonResponse({ success: true, processedCount: 0, sentCount: 0, failedCount: 0, skippedCount: 0 });
      }

      const result = await processJob(supabaseAdmin, smtpSettings, job as ContactFormJobRow);

      return jsonResponse({
        success: true,
        processedCount: result.processed ? 1 : 0,
        sentCount: result.status === 'sent' ? 1 : 0,
        failedCount: result.status === 'failed' ? 1 : 0,
        skippedCount: result.status === 'skipped' ? 1 : 0,
        reason: result.reason,
      });
    }

    const isAdmin = await isAdminRequest(req, supabaseAdmin, authClient);
    if (!isAdmin) {
      return jsonResponse({ success: false, error: 'Admin access required' }, 403);
    }

    const { data: jobs, error } = await supabaseAdmin
      .from('contact_form_email_jobs')
      .select(`
        id,
        status,
        attempts,
        recipient_email,
        contact_message:contact_messages (
          id,
          name,
          email,
          phone,
          subject,
          message,
          created_at,
          source_page
        )
      `)
      .in('status', ['pending', 'failed'])
      .lt('attempts', 5)
      .order('queued_at', { ascending: true })
      .limit(limit);

    if (error) {
      return jsonResponse({ success: false, error: error.message }, 400);
    }

    let processedCount = 0;
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const job of (jobs || []) as ContactFormJobRow[]) {
      const result = await processJob(supabaseAdmin, smtpSettings, job);
      if (!result.processed) continue;
      processedCount += 1;
      if (result.status === 'sent') sentCount += 1;
      if (result.status === 'failed') failedCount += 1;
      if (result.status === 'skipped') skippedCount += 1;
    }

    return jsonResponse({
      success: true,
      processedCount,
      sentCount,
      failedCount,
      skippedCount,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});
