import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';

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

const EMAIL_CONFIG_SECRET = process.env.EMAIL_CONFIG_SECRET || process.env.EMAIL_BACKEND_SECRET || '';

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

const deriveKey = () => {
  if (!EMAIL_CONFIG_SECRET) {
    throw new Error('Missing EMAIL_CONFIG_SECRET or EMAIL_BACKEND_SECRET');
  }

  return crypto.createHash('sha256').update(EMAIL_CONFIG_SECRET).digest();
};

const isEncryptedValue = (value) => typeof value === 'string' && value.startsWith('enc:v1:');

export const encryptSecret = (plainText) => {
  if (!plainText) return '';

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

export const decryptSecret = (value) => {
  if (!value) return '';
  if (!isEncryptedValue(value)) return value;

  const [, , ivB64, tagB64, dataB64] = value.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(),
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
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

  return {
    ...data,
    password: decryptSecret(data.password || ''),
  };
};

export const validateSmtpSettings = (settings) => {
  if (!settings) return 'Configuracao SMTP do painel nao encontrada ou inativa';
  if (!settings.host || !settings.user_name || !settings.password || !settings.from_email) {
    return 'Configuracao SMTP do painel esta incompleta';
  }
  return null;
};

export const getStoredSmtpSettings = async () => {
  const { data, error } = await supabaseAdmin
    .from('smtp_settings')
    .select('id, host, port, user_name, password, encryption, from_email, from_name, is_active, updated_at')
    .eq('id', 'smtp_config_1')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load SMTP settings: ${error.message}`);
  }

  if (!data) return null;

  return data;
};

export const saveSmtpSettings = async (payload) => {
  const current = await getStoredSmtpSettings();
  const nextPassword = payload.password
    ? encryptSecret(payload.password)
    : current?.password || '';

  const record = {
    id: 'smtp_config_1',
    host: payload.host,
    port: payload.port,
    user_name: payload.user_name,
    password: nextPassword,
    encryption: payload.encryption,
    from_email: payload.from_email,
    from_name: payload.from_name,
    is_active: payload.is_active,
  };

  const { error } = await supabaseAdmin.from('smtp_settings').upsert(record);
  if (error) {
    throw new Error(error.message);
  }

  return record;
};

export const mapStoredSmtpSettingsToClient = (row) => ({
  id: row.id,
  host: row.host,
  port: row.port,
  user: row.user_name,
  password: '',
  encryption: row.encryption,
  fromEmail: row.from_email,
  fromName: row.from_name,
  isActive: row.is_active,
  updatedAt: row.updated_at,
});

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

const EMAIL_BRAND_LOGO_URL = process.env.EMAIL_BRAND_LOGO_URL || process.env.VITE_EMAIL_BRAND_LOGO_URL || '';
const DEFAULT_EMAIL_BRAND = {
  siteName: 'AGRO BW',
  logoUrl: EMAIL_BRAND_LOGO_URL || '',
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderEmailShell = ({
  title,
  subtitle = '',
  recipientName,
  bodyHtml,
  footerNote,
  branding = DEFAULT_EMAIL_BRAND,
}) => {
  const safeTitle = escapeHtml(title);
  const safeRecipientName = escapeHtml(recipientName || 'Cliente');
  const safeSubtitle = subtitle ? escapeHtml(subtitle) : '';
  const safeFooterNote = escapeHtml(
    footerNote || 'Você recebeu este aviso porque existe uma interação ativa vinculada à sua conta.'
  );
  const safeSiteUrl = APP_URL.replace(/\/$/, '');
  const brandName = branding?.siteName || DEFAULT_EMAIL_BRAND.siteName;
  const brandLogoUrl = branding?.logoUrl || DEFAULT_EMAIL_BRAND.logoUrl;
  const brandLogo = brandLogoUrl
    ? `<img src="${escapeHtml(brandLogoUrl)}" alt="${escapeHtml(brandName)}" style="display:block;max-width:180px;max-height:46px;">`
    : `<div style="display:inline-block;padding:10px 14px;border-radius:14px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.14);font-size:15px;font-weight:800;letter-spacing:0.24em;text-transform:uppercase;color:#ffffff;">${escapeHtml(brandName)}</div>`;

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <body style="margin:0;padding:24px;background:#eef3f8;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:680px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#0f172a 0%,#16233b 58%,#13351f 100%);border-radius:26px 26px 0 0;padding:28px 32px 30px;color:#ffffff;">
            <div style="margin-bottom:20px;">${brandLogo}</div>
            <h1 style="margin:0 0 10px;font-size:28px;line-height:1.18;font-weight:800;color:#ffffff;">${safeTitle}</h1>
            ${
              safeSubtitle
                ? `<p style="margin:0;max-width:500px;font-size:14px;line-height:1.75;color:rgba(226,232,240,0.92);">${safeSubtitle}</p>`
                : ''
            }
          </div>
          <div style="background:#ffffff;border:1px solid #dbe5f0;border-top:0;border-radius:0 0 26px 26px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,0.08);">
            <div style="padding:32px;">
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#0f172a;">Olá, <strong>${safeRecipientName}</strong>.</p>
              ${bodyHtml}
            </div>
            <div style="padding:20px 32px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 10px;font-size:12px;line-height:1.7;color:#64748b;">${safeFooterNote}</p>
              <p style="margin:0;font-size:12px;line-height:1.7;color:#94a3b8;">
                ${escapeHtml(brandName)} · <a href="${safeSiteUrl}" style="color:#16a34a;text-decoration:none;font-weight:700;">${safeSiteUrl.replace(/^https?:\/\//, '')}</a>
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `.trim();
};

const renderPrimaryButton = (href, label) => {
  if (!href) return '';
  return `
    <a href="${href}" style="display:inline-block;padding:15px 24px;border-radius:14px;background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;box-shadow:0 12px 24px rgba(22,163,74,0.18);">
      ${escapeHtml(label)}
    </a>
  `.trim();
};

export const getContactTemplate = (params) => {
  const isLead = params.sourceKind === 'new_lead';
  const title = isLead
    ? `Novo lead no anúncio ${params.announcementTitle}`
    : `Nova mensagem sobre ${params.announcementTitle}`;
  const linkHref = getLinkHref(params.link);
  const isPlanLocked = params.lockReason === 'lead_contact_expired';
  const isAnnouncementExpired = params.lockReason === 'announcement_expired';
  const ctaLabel = isPlanLocked ? 'Ver meu plano' : isLead ? 'Ver lead' : 'Abrir conversa';
  const preview = isPlanLocked || isAnnouncementExpired ? null : params.messagePreview?.trim();
  const intro = isPlanLocked
    ? 'Uma nova interação foi registrada, mas o acesso ao conteúdo completo deste lead está bloqueado pelas regras do seu plano atual.'
    : isAnnouncementExpired
      ? 'Uma nova interação foi registrada, mas este anúncio já expirou e a conversa está congelada para novas ações.'
      : isLead
        ? `${params.senderName} demonstrou interesse no seu anúncio e abriu um novo contato na ${params.siteName}.`
        : `${params.senderName} enviou uma nova mensagem para você na ${params.siteName}.`;
  const accentBlock = isPlanLocked
    ? `<div style="margin:0 0 24px;padding:18px 20px;border-radius:14px;background:#fff7ed;border:1px solid #fdba74;">
         <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#c2410c;">Conteúdo protegido</p>
         <p style="margin:0;font-size:14px;line-height:1.75;color:#9a3412;">Seu plano atual não permite visualizar os dados completos e o conteúdo desta conversa. Faça upgrade para desbloquear o lead e responder normalmente.</p>
       </div>`
    : isAnnouncementExpired
      ? `<div style="margin:0 0 24px;padding:18px 20px;border-radius:14px;background:#fef2f2;border:1px solid #fecaca;">
           <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#b91c1c;">Conversa congelada</p>
           <p style="margin:0;font-size:14px;line-height:1.75;color:#991b1b;">Este anúncio expirou. O histórico continua registrado, mas novas mensagens e detalhes comerciais ficam bloqueados até a republicação ou renovação adequada.</p>
         </div>`
      : '';

  return {
    subject: title,
    html: renderEmailShell({
      eyebrow: isLead ? 'Novo lead' : 'Nova mensagem',
      title,
      subtitle: isLead
        ? 'Um novo interesse comercial chegou para um dos seus anúncios.'
        : 'Uma conversa ativa recebeu uma nova resposta e pode pedir ação rápida.',
      recipientName: params.recipientName,
      branding: params.branding,
      footerNote: isPlanLocked
        ? 'Os detalhes deste contato continuam protegidos até a renovação ou upgrade do seu plano.'
        : isAnnouncementExpired
          ? 'Como o anúncio está expirado, o conteúdo fica visível apenas dentro das regras atuais da plataforma.'
          : 'Para sua segurança, responda e conduza a negociação sempre dentro da plataforma.',
      bodyHtml: `
        <p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:#475569;">${escapeHtml(intro)}</p>
        <div style="margin:0 0 20px;padding:20px 22px;border-radius:18px;background:linear-gradient(180deg,#f8fbff 0%,#f3f7fb 100%);border:1px solid #dce5ef;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">Anúncio</p>
          <p style="margin:0;font-size:18px;font-weight:800;line-height:1.4;color:#0f172a;">${escapeHtml(params.announcementTitle)}</p>
        </div>
        ${accentBlock}
        ${
          preview
            ? `<div style="margin:0 0 24px;padding:20px 22px;border-radius:18px;background:linear-gradient(180deg,#ecfdf5 0%,#dff8eb 100%);border:1px solid #bbf7d0;">
                 <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#15803d;">${isLead ? 'Mensagem inicial' : 'Conteúdo da mensagem'}</p>
                 <p style="margin:0;font-size:14px;line-height:1.8;color:#166534;">${escapeHtml(preview)}</p>
               </div>`
            : ''
        }
        ${renderPrimaryButton(linkHref, ctaLabel)}
      `,
    }),
  };
};

export const getPlanAlertTemplate = (params) => {
  const linkHref = getLinkHref(params.link);
  return {
    subject: params.title,
    html: renderEmailShell({
      eyebrow: params.alertKind === 'conversion' ? 'Conversão inteligente' : 'Renovação inteligente',
      title: params.title,
      subtitle:
        params.alertKind === 'conversion'
          ? 'Selecionamos uma oportunidade que pode aumentar sua exposição e acelerar resultados.'
          : 'Seu plano precisa de atenção para manter recursos e continuidade operacional.',
      recipientName: params.userName,
      branding: params.branding,
      footerNote:
        params.alertKind === 'conversion'
          ? 'Este aviso foi gerado com base no seu momento atual de uso da plataforma.'
          : 'Renovar no tempo certo evita pausa de recursos e mantém sua operação ativa.',
      bodyHtml: `
        <div style="margin:0 0 24px;padding:22px;border-radius:18px;background:linear-gradient(180deg,#f8fbff 0%,#f3f7fb 100%);border:1px solid #dce5ef;">
          <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">Resumo</p>
          <p style="margin:0;font-size:14px;line-height:1.85;color:#334155;">${escapeHtml(params.content)}</p>
        </div>
        ${renderPrimaryButton(linkHref, params.alertKind === 'conversion' ? 'Ver oportunidade' : 'Ver meu plano')}
      `,
    }),
  };
};

export const getRadarTemplate = (params) => ({
  subject: `${params.siteName}: nova oportunidade no seu Radar`,
  html: renderEmailShell({
    eyebrow: 'Radar de oportunidades',
    title: 'Nova oportunidade encontrada',
    subtitle: 'Seu Radar identificou um anúncio aderente aos filtros que você deixou ativos.',
    recipientName: params.userName,
    branding: params.branding,
    footerNote: 'Acompanhar o Radar com frequência ajuda você a responder mais rápido e aproveitar oportunidades quentes.',
    bodyHtml: `
      <div style="margin:0 0 18px;padding:22px;border-radius:18px;background:linear-gradient(180deg,#f0fdf4 0%,#e3f8ec 100%);border:1px solid #bbf7d0;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#15803d;">Anúncio em destaque</p>
        <p style="margin:0;font-size:18px;font-weight:800;line-height:1.4;color:#0f172a;">${escapeHtml(params.announcementTitle)}</p>
      </div>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.8;color:#475569;">${escapeHtml(
        params.alertName
          ? `Esse anúncio combinou com o alerta "${params.alertName}".`
          : 'Esse anúncio combinou com um alerta ativo do seu Radar.'
      )}</p>
      ${renderPrimaryButton(params.ctaLink, 'Ver anúncio')}
    `,
  }),
});

const loadEmailBranding = async () => {
  const { data, error } = await supabaseAdmin
    .from('layout_settings')
    .select('site_name, logo_url')
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_EMAIL_BRAND;
  }

  return {
    siteName: data.site_name || DEFAULT_EMAIL_BRAND.siteName,
    logoUrl: data.logo_url || DEFAULT_EMAIL_BRAND.logoUrl,
  };
};

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

const getContactAccessContext = async (claimedJob) => {
  if (claimedJob.lead_id) {
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, chat_id, contact_expires_at, announcement_id')
      .eq('id', claimedJob.lead_id)
      .maybeSingle();

    if (lead) {
      const { data: announcement } = await supabaseAdmin
        .from('announcements')
        .select('status, expires_at')
        .eq('id', lead.announcement_id)
        .maybeSingle();

      if (announcement?.status === 'EXPIRED' || (announcement?.expires_at && new Date(announcement.expires_at).getTime() <= Date.now())) {
        return { lockReason: 'announcement_expired' };
      }

      if (lead.contact_expires_at && new Date(lead.contact_expires_at).getTime() <= Date.now()) {
        return { lockReason: 'lead_contact_expired' };
      }
    }
  }

  if (claimedJob.message_id) {
    const { data: message } = await supabaseAdmin
      .from('messages')
      .select('id, chat_id')
      .eq('id', claimedJob.message_id)
      .maybeSingle();

    if (message?.chat_id) {
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('contact_expires_at, announcement_id')
        .eq('chat_id', message.chat_id)
        .maybeSingle();

      if (lead) {
        const { data: announcement } = await supabaseAdmin
          .from('announcements')
          .select('status, expires_at')
          .eq('id', lead.announcement_id)
          .maybeSingle();

        if (announcement?.status === 'EXPIRED' || (announcement?.expires_at && new Date(announcement.expires_at).getTime() <= Date.now())) {
          return { lockReason: 'announcement_expired' };
        }

        if (lead.contact_expires_at && new Date(lead.contact_expires_at).getTime() <= Date.now()) {
          return { lockReason: 'lead_contact_expired' };
        }
      }
    }
  }

  return { lockReason: null };
};

export const processContactJobs = async (smtpSettings, smtpValidationError, limit, triggeredBy = 'admin') => {
  const result = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  const branding = await loadEmailBranding();
  const { data: log } = await supabaseAdmin
    .from('contact_notification_email_dispatch_logs')
    .insert({ triggered_by: triggeredBy, status: 'processing', requested_limit: limit })
    .select('id')
    .single();

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('contact_notification_email_jobs')
      .select('id, source_kind, message_id, lead_id, recipient_email, recipient_name, sender_name, announcement_title, message_preview, link, status, attempts')
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

      const accessContext = await getContactAccessContext(claimed);
      const email = getContactTemplate({
        siteName: smtpSettings?.from_name || 'AGRO BW',
        recipientName: claimed.recipient_name || 'Cliente',
        senderName: claimed.sender_name || 'Usuario',
        announcementTitle: claimed.announcement_title,
        messagePreview: claimed.message_preview,
        link: claimed.link,
        sourceKind: claimed.source_kind,
        lockReason: accessContext.lockReason,
        branding,
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
  const branding = await loadEmailBranding();
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
        branding,
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
  const branding = await loadEmailBranding();
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
        branding,
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

