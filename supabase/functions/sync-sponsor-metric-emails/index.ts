import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
// VULN-019 fix: nodemailer via sendSmtpEmail()
import { loadSmtpSettings, validateSmtpSettings, sendSmtpEmail } from '../_shared/smtpSettings.ts';
import { getCorsHeadersInternal } from '../_shared/cors.ts';
import { isAdminAal2Profile, extractBearerToken } from '../_shared/security.ts';

// VULN-002 fix: Função interna/cron
const corsHeaders = getCorsHeadersInternal();

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type SponsorMetricJobRow = {
  id: string;
  sponsor_id: string;
  sponsor_name: string;
  period_start: string;
  period_end: string;
  recipient_email: string;
  recipient_name: string | null;
  report_payload: {
    impressions?: number;
    clicks?: number;
    ctr?: number;
    primaryRegion?: string;
    topRegions?: Array<{ region: string; clicks: number }>;
  } | null;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';
  attempts: number;
};

type AutoSponsorRow = {
  id: string;
  company_name: string;
  status: 'active' | 'paused' | 'expired';
  starts_on: string;
  ends_on: string | null;
  metric_recipient_emails: string[] | null;
  metric_auto_send_enabled: boolean;
  metric_auto_send_frequency: 'weekly' | 'monthly';
  metric_auto_send_day: number;
  metric_auto_last_queued_at: string | null;
};

const clampLimit = (value: unknown, fallback = 25) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1) return 1;
  if (parsed > 100) return 100;
  return Math.floor(parsed);
};

const getSaoPauloNow = () =>
  new Date(
    new Date().toLocaleString('en-US', {
      timeZone: 'America/Sao_Paulo',
    }),
  );

const startOfLocalDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const startOfLocalWeek = (date: Date) => {
  const copy = startOfLocalDay(date);
  const currentDay = copy.getDay();
  const isoDay = currentDay === 0 ? 7 : currentDay;
  copy.setDate(copy.getDate() - (isoDay - 1));
  return copy;
};

const startOfLocalMonth = (date: Date) => {
  const copy = startOfLocalDay(date);
  copy.setDate(1);
  return copy;
};

const toLocalComparableDate = (value: string | null) => {
  if (!value) return null;
  return new Date(
    new Date(value).toLocaleString('en-US', {
      timeZone: 'America/Sao_Paulo',
    }),
  );
};

const toDateOnly = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : '';
};

const isSponsorActiveNow = (sponsor: AutoSponsorRow) => {
  const today = toDateOnly(new Date());
  return sponsor.status === 'active' && sponsor.starts_on <= today && (!sponsor.ends_on || sponsor.ends_on >= today);
};

const shouldQueueSponsorToday = (sponsor: AutoSponsorRow, referenceDate: Date) => {
  if (!sponsor.metric_auto_send_enabled || !isSponsorActiveNow(sponsor)) return false;
  if (!Array.isArray(sponsor.metric_recipient_emails) || sponsor.metric_recipient_emails.length === 0) return false;

  const lastQueued = toLocalComparableDate(sponsor.metric_auto_last_queued_at);

  if (sponsor.metric_auto_send_frequency === 'weekly') {
    const currentWeekStart = startOfLocalWeek(referenceDate);
    const targetDate = new Date(currentWeekStart);
    const targetDay = Math.min(Math.max(Number(sponsor.metric_auto_send_day || 1), 1), 7);
    targetDate.setDate(currentWeekStart.getDate() + (targetDay - 1));

    if (referenceDate < targetDate) return false;
    if (lastQueued && startOfLocalDay(lastQueued).getTime() >= startOfLocalDay(targetDate).getTime()) return false;
    return true;
  }

  const currentMonthStart = startOfLocalMonth(referenceDate);
  const targetDate = new Date(currentMonthStart);
  const targetDay = Math.min(Math.max(Number(sponsor.metric_auto_send_day || 1), 1), 28);
  targetDate.setDate(targetDay);

  if (referenceDate < targetDate) return false;
  if (lastQueued && startOfLocalDay(lastQueued).getTime() >= startOfLocalDay(targetDate).getTime()) return false;
  return true;
};

const buildAutoReportPeriod = (frequency: 'weekly' | 'monthly') => {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - (frequency === 'weekly' ? 7 : 30));
  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
};

const getReportTemplate = (params: {
  appUrl: string;
  siteName: string;
  sponsorName: string;
  recipientName: string;
  periodStart: string;
  periodEnd: string;
  impressions: number;
  clicks: number;
  ctr: number;
  primaryRegion: string;
  topRegions: Array<{ region: string; clicks: number }>;
}) => {
  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
  const formatPercent = (value: number) => `${value.toFixed(2).replace('.', ',')}%`;

  const topRegionsHtml = params.topRegions.length
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px;">
        ${params.topRegions
          .map(
            (region, index) => `
              <tr>
                <td style="padding:10px 0;border-bottom:${index < params.topRegions.length - 1 ? '1px solid #e2e8f0' : '0'};font-size:14px;color:#0f172a;">${region.region}</td>
                <td style="padding:10px 0;border-bottom:${index < params.topRegions.length - 1 ? '1px solid #e2e8f0' : '0'};font-size:14px;font-weight:700;color:#16a34a;text-align:right;">${formatNumber(region.clicks)} clique(s)</td>
              </tr>
            `,
          )
          .join('')}
      </table>
    `
    : '<p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:#64748b;">Ainda não houve cliques suficientes para formar um ranking regional neste período.</p>';

  const subject = `Relatório da Vitrine Premium - ${params.sponsorName}`;
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${subject}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="padding:28px 32px;background:#0f172a;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#86efac;">
              Vitrine Premium
            </p>
            <h1 style="margin:0;font-size:28px;line-height:1.2;">${subject}</h1>
            <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:rgba(226,232,240,0.88);">
              Período analisado: ${formatDate(params.periodStart)} até ${formatDate(params.periodEnd)}.
            </p>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">Olá, <strong>${params.recipientName}</strong>.</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#475569;">
              Segue o resumo consolidado do patrocinador <strong>${params.sponsorName}</strong> na Vitrine Premium da ${params.siteName}.
            </p>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:24px;">
              <div style="padding:18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">Impressões</p>
                <p style="margin:0;font-size:26px;font-weight:800;color:#0f172a;">${formatNumber(params.impressions)}</p>
              </div>
              <div style="padding:18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">Cliques</p>
                <p style="margin:0;font-size:26px;font-weight:800;color:#0f172a;">${formatNumber(params.clicks)}</p>
              </div>
              <div style="padding:18px;border-radius:16px;background:#f0fdf4;border:1px solid #bbf7d0;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#15803d;">CTR</p>
                <p style="margin:0;font-size:26px;font-weight:800;color:#166534;">${formatPercent(params.ctr)}</p>
              </div>
              <div style="padding:18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">Região principal</p>
                <p style="margin:0;font-size:20px;font-weight:800;color:#0f172a;">${params.primaryRegion}</p>
              </div>
            </div>

            <div style="padding:22px;border-radius:18px;background:linear-gradient(180deg,#f8fbff 0%,#f3f7fb 100%);border:1px solid #dce5ef;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">Top regiões por clique</p>
              ${topRegionsHtml}
            </div>
          </div>
          <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.7;color:#64748b;">
            Relatório gerado manualmente pela equipe da ${params.siteName}. Para novas análises, responda este e-mail ou fale com o time comercial.
          </div>
        </div>
      </body>
    </html>
  `.trim();

  return { subject, html };
};

const queueDueSponsorMetricReports = async (supabaseAdmin: ReturnType<typeof createClient>) => {
  const referenceDate = getSaoPauloNow();
  const { data, error } = await supabaseAdmin
    .from('site_sponsors')
    .select(`
      id,
      company_name,
      status,
      starts_on,
      ends_on,
      metric_recipient_emails,
      metric_auto_send_enabled,
      metric_auto_send_frequency,
      metric_auto_send_day,
      metric_auto_last_queued_at
    `)
    .eq('metric_auto_send_enabled', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  let queuedCount = 0;

  for (const sponsor of ((data || []) as AutoSponsorRow[])) {
    if (!shouldQueueSponsorToday(sponsor, referenceDate)) continue;

    const recipients = Array.from(
      new Set(
        (sponsor.metric_recipient_emails || [])
          .map((item) => String(item || '').trim().toLowerCase())
          .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)),
      ),
    );

    if (!recipients.length) continue;

    const { periodStart, periodEnd } = buildAutoReportPeriod(sponsor.metric_auto_send_frequency);
    const { data: reportRows, error: reportError } = await supabaseAdmin.rpc('get_site_sponsor_metrics_report', {
      p_sponsor_id: sponsor.id,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });

    if (reportError) {
      console.error('[sync-sponsor-metric-emails] erro ao gerar relatório automático:', reportError);
      continue;
    }

    const reportRow = Array.isArray(reportRows) ? reportRows[0] : reportRows;
    if (!reportRow) continue;

    const payload = recipients.map((recipientEmail) => ({
      sponsor_id: sponsor.id,
      sponsor_name: sponsor.company_name,
      period_start: periodStart,
      period_end: periodEnd,
      recipient_email: recipientEmail,
      recipient_name: null,
      report_payload: {
        impressions: Number(reportRow.impressions ?? 0),
        clicks: Number(reportRow.clicks ?? 0),
        ctr: Number(reportRow.ctr ?? 0),
        primaryRegion: String(reportRow.primary_region ?? 'Região não identificada'),
        topRegions: Array.isArray(reportRow.top_regions) ? reportRow.top_regions : [],
      },
      requested_by: null,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('sponsor_metric_email_jobs')
      .upsert(payload, {
        onConflict: 'sponsor_id,recipient_email,period_start,period_end',
        ignoreDuplicates: true,
      });

    if (insertError) {
      console.error('[sync-sponsor-metric-emails] erro ao enfileirar relatório automático:', insertError);
      continue;
    }

    queuedCount += recipients.length;

    await supabaseAdmin
      .from('site_sponsors')
      .update({
        metric_auto_last_queued_at: new Date().toISOString(),
      })
      .eq('id', sponsor.id);
  }

  return queuedCount;
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

    const cronSecret = Deno.env.get('SPONSOR_METRIC_EMAILS_CRON_SECRET');
    const requestSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('Authorization') || '';

    // VULN-020 fix: timing-safe cron secret
    let triggeredBy: 'cron' | 'admin' = 'admin';

    if (cronSecret && requestSecret) {
      let mismatch = cronSecret.length !== requestSecret.length ? 1 : 0;
      for (let i = 0; i < Math.min(cronSecret.length, requestSecret.length); i++) {
        mismatch |= cronSecret.charCodeAt(i) ^ requestSecret.charCodeAt(i);
      }
      if (mismatch === 0) triggeredBy = 'cron';
    }

    if (triggeredBy === 'admin') {
      const token = extractBearerToken(req);
      if (!token) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const { data: { user }, error: authError } = await authClient.auth.getUser(token);
      if (authError || !user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const { data: adminProfile } = await supabaseAdmin
        .from('users').select('role').eq('id', user.id).maybeSingle();

      if (!isAdminAal2Profile(adminProfile, token)) {
        return jsonResponse({ success: false, error: 'Admin access required' }, 403);
      }
    }

    const body = await req.json().catch(() => ({}));
    const limit = clampLimit(body?.limit, 25);
    const queueDue = Boolean(body?.queue_due);

    const { data: dispatchLog, error: dispatchInsertError } = await supabaseAdmin
      .from('sponsor_metric_email_dispatch_logs')
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

    let queuedCount = 0;

    if (queueDue) {
      queuedCount = await queueDueSponsorMetricReports(supabaseAdmin);
    }

    const { data: jobRows, error: jobsError } = await supabaseAdmin
      .from('sponsor_metric_email_jobs')
      .select('id, sponsor_id, sponsor_name, period_start, period_end, recipient_email, recipient_name, report_payload, status, attempts')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
      .order('queued_at', { ascending: true })
      .limit(limit);

    if (jobsError) {
      throw new Error(jobsError.message);
    }

    const smtpSettings = await loadSmtpSettings(supabaseAdmin);
    const smtpValidationError = validateSmtpSettings(smtpSettings);
    const appUrl = Deno.env.get('APP_URL') || 'https://bwagro.com.br';
    const siteName = smtpSettings?.from_name || 'AGRO BW';

    let processedCount = 0;
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const job of (jobRows || []) as SponsorMetricJobRow[]) {
      const { data: claimedJob, error: claimError } = await supabaseAdmin
        .from('sponsor_metric_email_jobs')
        .update({
          status: 'processing',
          processing_started_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(),
          attempts: (job.attempts ?? 0) + 1,
        })
        .eq('id', job.id)
        .eq('status', job.status)
        .select('id, sponsor_id, sponsor_name, period_start, period_end, recipient_email, recipient_name, report_payload, status, attempts')
        .maybeSingle();

      if (claimError || !claimedJob) continue;

      processedCount += 1;

      if (!claimedJob.recipient_email || smtpValidationError) {
        skippedCount += 1;
        await supabaseAdmin
          .from('sponsor_metric_email_jobs')
          .update({
            status: 'skipped',
            last_error: !claimedJob.recipient_email ? 'Destinatário sem e-mail válido' : smtpValidationError,
          })
          .eq('id', claimedJob.id);
        continue;
      }

      const payload = claimedJob.report_payload || {};
      const email = getReportTemplate({
        appUrl,
        siteName,
        sponsorName: claimedJob.sponsor_name,
        recipientName: claimedJob.recipient_name || 'Cliente',
        periodStart: claimedJob.period_start,
        periodEnd: claimedJob.period_end,
        impressions: Number(payload.impressions ?? 0),
        clicks: Number(payload.clicks ?? 0),
        ctr: Number(payload.ctr ?? 0),
        primaryRegion: String(payload.primaryRegion ?? 'Região não identificada'),
        topRegions: Array.isArray(payload.topRegions) ? payload.topRegions : [],
      });

      // VULN-019 fix: sendSmtpEmail() com nodemailer
      const result = await sendSmtpEmail(smtpSettings!, {
        to: claimedJob.recipient_email,
        subject: email.subject,
        html: email.html,
      });

      if (result.success) {
        sentCount += 1;
        await supabaseAdmin.from('sponsor_metric_email_jobs')
          .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
          .eq('id', claimedJob.id);
      } else {
        failedCount += 1;
        await supabaseAdmin.from('sponsor_metric_email_jobs')
          .update({ status: 'failed', last_error: result.error || 'Falha ao enviar email' })
          .eq('id', claimedJob.id);
      }
    }

    if (dispatchLogId) {
      await supabaseAdmin
        .from('sponsor_metric_email_dispatch_logs')
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
      queuedCount,
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
          .from('sponsor_metric_email_dispatch_logs')
          .update({
            status: 'failed',
            notes: error instanceof Error ? error.message : 'Unknown error',
            finished_at: new Date().toISOString(),
          })
          .eq('id', dispatchLogId);
      }
    }

    return jsonResponse({ success: false, error: 'Erro interno ao processar métricas de sponsor' }, 500);
  }
});
