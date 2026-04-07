import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';

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

type RadarEmailJobRow = {
  id: string;
  recipient_email: string | null;
  recipient_name: string | null;
  announcement_id: string;
  announcement_title: string | null;
  alert_name: string | null;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  attempts: number;
};

const getRadarMatchTemplate = (params: {
  appUrl: string;
  siteName: string;
  userName: string;
  announcementTitle: string;
  alertName?: string | null;
  ctaLink: string;
}) => {
  const subject = `${params.siteName}: nova oportunidade no seu Radar`;
  const contextLine = params.alertName
    ? `Esse anuncio combinou com o alerta "${params.alertName}".`
    : 'Esse anuncio combinou com um alerta ativo do seu Radar.';

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${subject}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="padding:28px 32px;background:#0f172a;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#86efac;">
              Radar de Oportunidades
            </p>
            <h1 style="margin:0;font-size:24px;line-height:1.2;">Nova oportunidade encontrada</h1>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;">Ola, <strong>${params.userName}</strong>.</p>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">
              O Radar encontrou um anuncio que pode interessar voce:
            </p>
            <div style="padding:18px 20px;border:1px solid #dcfce7;background:#f0fdf4;border-radius:14px;margin-bottom:18px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${params.announcementTitle}</p>
            </div>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
              ${contextLine}
            </p>
            <a
              href="${params.ctaLink}"
              style="display:inline-block;padding:14px 22px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;"
            >
              Ver anuncio
            </a>
          </div>
          <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
            Esse aviso foi enviado porque voce tem um alerta ativo no Radar da ${params.siteName}.
          </div>
        </div>
      </body>
    </html>
  `.trim();

  return { subject, html };
};

const clampLimit = (value: unknown, fallback = 25) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1) return 1;
  if (parsed > 100) return 100;

  return Math.floor(parsed);
};

const connectSmtpClient = async (client: SmtpClient) => {
  const smtpHost = Deno.env.get('SMTP_HOST');
  const smtpPort = Number(Deno.env.get('SMTP_PORT') || '587');
  const smtpUser = Deno.env.get('SMTP_USER');
  const smtpPassword = Deno.env.get('SMTP_PASSWORD');
  const smtpEncryption = (Deno.env.get('SMTP_ENCRYPTION') || 'TLS').toUpperCase();

  if (!smtpHost || !smtpUser || !smtpPassword) {
    throw new Error('SMTP secrets are not configured');
  }

  if (smtpEncryption === 'SSL' || smtpPort === 465) {
    await client.connectTLS({
      hostname: smtpHost,
      port: smtpPort,
      username: smtpUser,
      password: smtpPassword,
    });
    return;
  }

  await client.connect({
    hostname: smtpHost,
    port: smtpPort,
    username: smtpUser,
    password: smtpPassword,
  });
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
      return jsonResponse({ success: false, error: 'Missing Supabase secrets' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anonKey);

    const cronSecret = Deno.env.get('RADAR_MATCH_EMAILS_CRON_SECRET');
    const requestSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('Authorization') || '';

    let triggeredBy: 'cron' | 'admin' = 'admin';

    if (cronSecret && requestSecret === cronSecret) {
      triggeredBy = 'cron';
    } else {
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

      const { data: adminProfile } = await supabaseAdmin
        .from('users')
        .select('role, is_admin')
        .eq('id', user.id)
        .maybeSingle();

      const isAdmin =
        (adminProfile?.role || '').toLowerCase() === 'admin' || Boolean(adminProfile?.is_admin);

      if (!isAdmin) {
        return jsonResponse({ success: false, error: 'Admin access required' }, 403);
      }
    }

    const body = await req.json().catch(() => ({}));
    const limit = clampLimit(body?.limit, 25);

    const { data: dispatchLog, error: dispatchInsertError } = await supabaseAdmin
      .from('radar_match_email_dispatch_logs')
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
      .from('radar_match_email_jobs')
      .select('id, recipient_email, recipient_name, announcement_id, announcement_title, alert_name, status, attempts')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
      .order('queued_at', { ascending: true })
      .limit(limit);

    if (jobsError) {
      throw new Error(jobsError.message);
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://bwagro.com.br';
    const siteName = Deno.env.get('SMTP_FROM_NAME') || 'AGRO BW';
    const smtpFromEmail = Deno.env.get('SMTP_FROM_EMAIL');
    const smtpFromName = Deno.env.get('SMTP_FROM_NAME') || 'AGRO BW';

    let processedCount = 0;
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const job of (jobRows || []) as RadarEmailJobRow[]) {
      const { data: claimedJob, error: claimError } = await supabaseAdmin
        .from('radar_match_email_jobs')
        .update({
          status: 'processing',
          processing_started_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(),
          attempts: (job.attempts ?? 0) + 1,
        })
        .eq('id', job.id)
        .eq('status', job.status)
        .select('id, recipient_email, recipient_name, announcement_id, announcement_title, alert_name, status, attempts')
        .maybeSingle();

      if (claimError || !claimedJob) {
        continue;
      }

      processedCount += 1;

      if (!claimedJob.recipient_email || !smtpFromEmail) {
        skippedCount += 1;
        await supabaseAdmin
          .from('radar_match_email_jobs')
          .update({
            status: 'skipped',
            last_error: !claimedJob.recipient_email
              ? 'Usuario sem e-mail valido para receber o Radar'
              : 'SMTP_FROM_EMAIL nao configurado',
          })
          .eq('id', claimedJob.id);
        continue;
      }

      const ctaLink = `${appUrl.replace(/\/$/, '')}/#/anuncio/${claimedJob.announcement_id}`;
      const email = getRadarMatchTemplate({
        appUrl,
        siteName,
        userName: claimedJob.recipient_name || 'Cliente',
        announcementTitle: claimedJob.announcement_title || 'Nova oportunidade no Radar',
        alertName: claimedJob.alert_name,
        ctaLink,
      });

      const client = new SmtpClient();

      try {
        await connectSmtpClient(client);
        await client.send({
          from: `${smtpFromName} <${smtpFromEmail}>`,
          to: claimedJob.recipient_email,
          subject: email.subject,
          content: email.html,
          html: email.html,
        });

        sentCount += 1;
        await supabaseAdmin
          .from('radar_match_email_jobs')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', claimedJob.id);
      } catch (error) {
        failedCount += 1;
        await supabaseAdmin
          .from('radar_match_email_jobs')
          .update({
            status: 'failed',
            last_error: error instanceof Error ? error.message : 'Unknown SMTP error',
          })
          .eq('id', claimedJob.id);
      } finally {
        await client.close();
      }
    }

    if (dispatchLogId) {
      await supabaseAdmin
        .from('radar_match_email_dispatch_logs')
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
          .from('radar_match_email_dispatch_logs')
          .update({
            status: 'failed',
            notes: error instanceof Error ? error.message : 'Unknown error',
            finished_at: new Date().toISOString(),
          })
          .eq('id', dispatchLogId);
      }
    }

    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
