import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://bwagro.com.br';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY');
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const clampLimit = (value, fallback = 25) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1) return 1;
  if (parsed > 100) return 100;
  return Math.floor(parsed);
};

export const requireAdminByToken = async (token) => {
  if (!token) {
    return { ok: false, status: 401, body: { success: false, message: 'Unauthorized' } };
  }

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user) {
    return { ok: false, status: 401, body: { success: false, message: 'Invalid JWT' } };
  }

  const { data: adminProfile } = await supabaseAdmin
    .from('users')
    .select('role, is_admin')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = (adminProfile?.role || '').toLowerCase() === 'admin' || Boolean(adminProfile?.is_admin);

  if (!isAdmin) {
    return { ok: false, status: 403, body: { success: false, message: 'Admin access required' } };
  }

  return { ok: true, user };
};

export const loadSmtpSettings = async () => {
  const { data, error } = await supabaseAdmin
    .from('smtp_settings')
    .select('id, host, port, user_name, password, encryption, from_email, from_name, is_active')
    .eq('id', 'smtp_config_1')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load SMTP settings: ${error.message}`);
  }

  if (!data || !data.is_active) {
    return null;
  }

  return data;
};

export const validateSmtpSettings = (settings) => {
  if (!settings) return 'Configuracao SMTP do painel nao encontrada ou inativa';
  if (!settings.host || !settings.user_name || !settings.password || !settings.from_email) {
    return 'Configuracao SMTP do painel esta incompleta';
  }
  return null;
};

export const buildTransporter = (settings) => {
  const port = Number(settings.port || 587);
  const encryption = String(settings.encryption || 'TLS').toUpperCase();
  const secure = encryption === 'SSL' || port === 465;
  const requireTLS = encryption === 'TLS';

  return nodemailer.createTransport({
    host: settings.host,
    port,
    secure,
    requireTLS,
    auth: {
      user: settings.user_name,
      pass: settings.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

export const getSmtpHint = (message, port, encryption) => {
  const normalized = String(message || '').toLowerCase();

  if (normalized.includes('authentication') || normalized.includes('auth') || normalized.includes('login')) {
    return 'Verifique usuario, senha e se a conta permite autenticacao SMTP externa.';
  }

  if (normalized.includes('tls') || normalized.includes('ssl') || normalized.includes('handshake')) {
    return `Revise a combinacao porta/criptografia. Hoje voce esta usando porta ${port} com ${encryption}.`;
  }

  if (normalized.includes('relay')) {
    return 'O servidor rejeitou o envio. Verifique se esse remetente tem permissao de relay.';
  }

  return `Revise a configuracao SMTP do painel, especialmente porta ${port}, criptografia ${encryption}, usuario e remetente.`;
};

export const verifySmtpConnection = async (settings) => {
  const transporter = buildTransporter(settings);
  try {
    await transporter.verify();
  } finally {
    transporter.close();
  }
};

export const sendMail = async (settings, mail) => {
  const transporter = buildTransporter(settings);
  try {
    await transporter.sendMail({
      from: `${settings.from_name} <${settings.from_email}>`,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
    });
  } finally {
    transporter.close();
  }
};

export const getLinkHref = (link) => {
  if (!link) return null;
  if (String(link).startsWith('http')) return link;
  return `${APP_URL.replace(/\/$/, '')}/#${link}`;
};

export const getContactTemplate = (params) => {
  const isLead = params.sourceKind === 'new_lead';
  const title = isLead
    ? `Novo lead no anuncio ${params.announcementTitle}`
    : `Nova mensagem sobre ${params.announcementTitle}`;
  const linkHref = getLinkHref(params.link);
  const ctaLabel = isLead ? 'Ver lead' : 'Abrir conversa';
  const preview = params.messagePreview?.trim();

  return {
    subject: title,
    html: `
      <!DOCTYPE html>
      <html lang="pt-BR"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="padding:28px 32px;background:#0f172a;color:#ffffff;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#86efac;">${isLead ? 'Novo lead' : 'Nova mensagem'}</p>
      <h1 style="margin:0;font-size:24px;line-height:1.2;">${title}</h1></div>
      <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">Ola, <strong>${params.recipientName}</strong>.</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">${
        isLead
          ? `${params.senderName} demonstrou interesse no seu anuncio e abriu um novo contato na ${params.siteName}.`
          : `${params.senderName} enviou uma nova mensagem para voce na ${params.siteName}.`
      }</p>
      <div style="margin:0 0 20px;padding:18px 20px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">Anuncio</p>
      <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">${params.announcementTitle}</p></div>
      ${
        preview
          ? `<div style="margin:0 0 24px;padding:18px 20px;border-radius:14px;background:#ecfdf5;border:1px solid #bbf7d0;"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#15803d;">${isLead ? 'Mensagem inicial' : 'Conteudo da mensagem'}</p><p style="margin:0;font-size:15px;line-height:1.7;color:#166534;">${preview}</p></div>`
          : ''
      }
      ${
        linkHref
          ? `<a href="${linkHref}" style="display:inline-block;padding:14px 22px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;">${ctaLabel}</a>`
          : ''
      }</div></div></body></html>
    `.trim(),
  };
};

export const getPlanAlertTemplate = (params) => {
  const linkHref = getLinkHref(params.link);
  return {
    subject: params.title,
    html: `
      <!DOCTYPE html>
      <html lang="pt-BR"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="padding:28px 32px;background:#0f172a;color:#ffffff;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#86efac;">${params.alertKind === 'conversion' ? 'Conversao inteligente' : 'Renovacao inteligente'}</p>
      <h1 style="margin:0;font-size:24px;line-height:1.2;">${params.title}</h1></div>
      <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">Ola, <strong>${params.userName}</strong>.</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">${params.content}</p>
      ${
        linkHref
          ? `<a href="${linkHref}" style="display:inline-block;padding:14px 22px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;">${params.alertKind === 'conversion' ? 'Ver oportunidade' : 'Ver meu plano'}</a>`
          : ''
      }</div></div></body></html>
    `.trim(),
  };
};

export const getRadarTemplate = (params) => ({
  subject: `${params.siteName}: nova oportunidade no seu Radar`,
  html: `
    <!DOCTYPE html>
    <html lang="pt-BR"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="padding:28px 32px;background:#0f172a;color:#ffffff;">
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#86efac;">Radar de Oportunidades</p>
    <h1 style="margin:0;font-size:24px;line-height:1.2;">Nova oportunidade encontrada</h1></div>
    <div style="padding:32px;">
    <p style="margin:0 0 16px;font-size:15px;">Ola, <strong>${params.userName}</strong>.</p>
    <div style="padding:18px 20px;border:1px solid #dcfce7;background:#f0fdf4;border-radius:14px;margin-bottom:18px;">
    <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${params.announcementTitle}</p></div>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">${params.alertName ? `Esse anuncio combinou com o alerta "${params.alertName}".` : 'Esse anuncio combinou com um alerta ativo do seu Radar.'}</p>
    <a href="${params.ctaLink}" style="display:inline-block;padding:14px 22px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;">Ver anuncio</a>
    </div></div></body></html>
  `.trim(),
});

const claimJob = async (table, job) => {
  const { data, error } = await supabaseAdmin
    .from(table)
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      attempts: (job.attempts ?? 0) + 1,
    })
    .eq('id', job.id)
    .eq('status', job.status)
    .select('*')
    .maybeSingle();

  if (error || !data) return null;
  return data;
};

const finalizeLog = async (table, id, payload) => {
  if (!id) return;
  await supabaseAdmin.from(table).update(payload).eq('id', id);
};

export const processContactJobs = async (smtpSettings, smtpValidationError, limit, triggeredBy = 'admin') => {
  const result = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  const { data: log } = await supabaseAdmin
    .from('contact_notification_email_dispatch_logs')
    .insert({ triggered_by: triggeredBy, status: 'processing', requested_limit: limit })
    .select('id')
    .single();

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('contact_notification_email_jobs')
      .select('id, source_kind, recipient_email, recipient_name, sender_name, announcement_title, message_preview, link, status, attempts')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
      .order('queued_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    for (const job of jobs || []) {
      const claimed = await claimJob('contact_notification_email_jobs', job);
      if (!claimed) continue;
      result.processed += 1;

      if (!claimed.recipient_email || smtpValidationError || !claimed.announcement_title) {
        result.skipped += 1;
        await supabaseAdmin.from('contact_notification_email_jobs').update({
          status: 'skipped',
          last_error: !claimed.recipient_email
            ? 'Destinatario sem e-mail valido'
            : smtpValidationError || 'Anuncio nao encontrado para composicao do e-mail',
        }).eq('id', claimed.id);
        continue;
      }

      const email = getContactTemplate({
        siteName: smtpSettings?.from_name || 'AGRO BW',
        recipientName: claimed.recipient_name || 'Cliente',
        senderName: claimed.sender_name || 'Usuario',
        announcementTitle: claimed.announcement_title,
        messagePreview: claimed.message_preview,
        link: claimed.link,
        sourceKind: claimed.source_kind,
      });

      try {
        await sendMail(smtpSettings, { to: claimed.recipient_email, subject: email.subject, html: email.html });
        result.sent += 1;
        await supabaseAdmin.from('contact_notification_email_jobs').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null,
        }).eq('id', claimed.id);
      } catch (error) {
        result.failed += 1;
        await supabaseAdmin.from('contact_notification_email_jobs').update({
          status: 'failed',
          last_error: error instanceof Error ? error.message : 'Unknown SMTP error',
        }).eq('id', claimed.id);
      }
    }

    await finalizeLog('contact_notification_email_dispatch_logs', log?.id, {
      status: 'completed',
      processed_count: result.processed,
      sent_count: result.sent,
      failed_count: result.failed,
      skipped_count: result.skipped,
      finished_at: new Date().toISOString(),
    });
  } catch (error) {
    await finalizeLog('contact_notification_email_dispatch_logs', log?.id, {
      status: 'failed',
      notes: error instanceof Error ? error.message : 'Unknown error',
      finished_at: new Date().toISOString(),
    });
    throw error;
  }

  return result;
};

export const processPlanAlertJobs = async (smtpSettings, smtpValidationError, limit, triggeredBy = 'admin') => {
  const result = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  const { data: log } = await supabaseAdmin
    .from('plan_alert_email_dispatch_logs')
    .insert({ triggered_by: triggeredBy, status: 'processing', requested_limit: limit })
    .select('id')
    .single();

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('plan_alert_email_jobs')
      .select('id, recipient_email, recipient_name, alert_kind, notification_title, notification_content, link, status, attempts')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
      .order('queued_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    for (const job of jobs || []) {
      const claimed = await claimJob('plan_alert_email_jobs', job);
      if (!claimed) continue;
      result.processed += 1;

      if (!claimed.recipient_email || smtpValidationError) {
        result.skipped += 1;
        await supabaseAdmin.from('plan_alert_email_jobs').update({
          status: 'skipped',
          last_error: !claimed.recipient_email ? 'Usuario sem e-mail valido' : smtpValidationError,
        }).eq('id', claimed.id);
        continue;
      }

      const email = getPlanAlertTemplate({
        userName: claimed.recipient_name || 'Cliente',
        title: claimed.notification_title,
        content: claimed.notification_content,
        link: claimed.link,
        alertKind: claimed.alert_kind,
      });

      try {
        await sendMail(smtpSettings, { to: claimed.recipient_email, subject: email.subject, html: email.html });
        result.sent += 1;
        await supabaseAdmin.from('plan_alert_email_jobs').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null,
        }).eq('id', claimed.id);
      } catch (error) {
        result.failed += 1;
        await supabaseAdmin.from('plan_alert_email_jobs').update({
          status: 'failed',
          last_error: error instanceof Error ? error.message : 'Unknown SMTP error',
        }).eq('id', claimed.id);
      }
    }

    await finalizeLog('plan_alert_email_dispatch_logs', log?.id, {
      status: 'completed',
      processed_count: result.processed,
      sent_count: result.sent,
      failed_count: result.failed,
      skipped_count: result.skipped,
      finished_at: new Date().toISOString(),
    });
  } catch (error) {
    await finalizeLog('plan_alert_email_dispatch_logs', log?.id, {
      status: 'failed',
      notes: error instanceof Error ? error.message : 'Unknown error',
      finished_at: new Date().toISOString(),
    });
    throw error;
  }

  return result;
};

export const processRadarJobs = async (smtpSettings, smtpValidationError, limit, triggeredBy = 'admin') => {
  const result = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  const { data: log } = await supabaseAdmin
    .from('radar_match_email_dispatch_logs')
    .insert({ triggered_by: triggeredBy, status: 'processing', requested_limit: limit })
    .select('id')
    .single();

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('radar_match_email_jobs')
      .select('id, recipient_email, recipient_name, announcement_id, announcement_title, alert_name, status, attempts')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
      .order('queued_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    for (const job of jobs || []) {
      const claimed = await claimJob('radar_match_email_jobs', job);
      if (!claimed) continue;
      result.processed += 1;

      if (!claimed.recipient_email || smtpValidationError) {
        result.skipped += 1;
        await supabaseAdmin.from('radar_match_email_jobs').update({
          status: 'skipped',
          last_error: !claimed.recipient_email ? 'Usuario sem e-mail valido para receber o Radar' : smtpValidationError,
        }).eq('id', claimed.id);
        continue;
      }

      const email = getRadarTemplate({
        siteName: smtpSettings?.from_name || 'AGRO BW',
        userName: claimed.recipient_name || 'Cliente',
        announcementTitle: claimed.announcement_title || 'Nova oportunidade no Radar',
        alertName: claimed.alert_name,
        ctaLink: `${APP_URL.replace(/\/$/, '')}/#/anuncio/${claimed.announcement_id}`,
      });

      try {
        await sendMail(smtpSettings, { to: claimed.recipient_email, subject: email.subject, html: email.html });
        result.sent += 1;
        await supabaseAdmin.from('radar_match_email_jobs').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null,
        }).eq('id', claimed.id);
      } catch (error) {
        result.failed += 1;
        await supabaseAdmin.from('radar_match_email_jobs').update({
          status: 'failed',
          last_error: error instanceof Error ? error.message : 'Unknown SMTP error',
        }).eq('id', claimed.id);
      }
    }

    await finalizeLog('radar_match_email_dispatch_logs', log?.id, {
      status: 'completed',
      processed_count: result.processed,
      sent_count: result.sent,
      failed_count: result.failed,
      skipped_count: result.skipped,
      finished_at: new Date().toISOString(),
    });
  } catch (error) {
    await finalizeLog('radar_match_email_dispatch_logs', log?.id, {
      status: 'failed',
      notes: error instanceof Error ? error.message : 'Unknown error',
      finished_at: new Date().toISOString(),
    });
    throw error;
  }

  return result;
};

export const processAllQueues = async (limit = 25, triggeredBy = 'admin') => {
  const smtpSettings = await loadSmtpSettings();
  const smtpValidationError = validateSmtpSettings(smtpSettings);
  const safeLimit = clampLimit(limit, 25);

  const [contact, planAlert, radar] = await Promise.all([
    processContactJobs(smtpSettings, smtpValidationError, safeLimit, triggeredBy),
    processPlanAlertJobs(smtpSettings, smtpValidationError, safeLimit, triggeredBy),
    processRadarJobs(smtpSettings, smtpValidationError, safeLimit, triggeredBy),
  ]);

  return { contact, planAlert, radar, smtpValidationError };
};
