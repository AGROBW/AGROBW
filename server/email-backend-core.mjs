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

const decodeBase64Url = (value) => {
  try {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
  } catch {
    return null;
  }
};

const extractAuthenticatorAssuranceLevel = (token) => {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;

  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;

  try {
    const payload = JSON.parse(decoded);
    return typeof payload?.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
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

  // VULN-020 fix: Usar apenas role === 'admin' como critério canônico
  const isAdmin = (adminProfile?.role || '').toLowerCase() === 'admin';

  if (!isAdmin) {
    return { ok: false, status: 403, body: { success: false, message: 'Admin access required' } };
  }

  if (extractAuthenticatorAssuranceLevel(token) !== 'aal2') {
    return { ok: false, status: 403, body: { success: false, message: 'Admin access required' } };
  }

  return { ok: true, user };
};

/**
 * VULN-010 fix: Substituído SHA-256 simples (ultrarrápido, sujeito a brute force)
 * por scrypt, que é resistente a força bruta por ser computacionalmente caro.
 * SHA-256 permitia bilhões de tentativas/segundo; scrypt limita a milhares.
 */
const deriveKey = () => {
  if (!EMAIL_CONFIG_SECRET) {
    throw new Error('Missing EMAIL_CONFIG_SECRET or EMAIL_BACKEND_SECRET');
  }

  // scrypt com parâmetros de trabalho moderados para contexto de servidor
  // N=16384 (2^14): custo de CPU/memória; r=8: tamanho de bloco; p=1: paralelismo
  const salt = Buffer.from('bwagro-smtp-key-derivation-v1', 'utf8');
  return crypto.scryptSync(EMAIL_CONFIG_SECRET, salt, 32, { N: 16384, r: 8, p: 1 });
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
    // VULN-006 fix: Habilitada verificação de certificado TLS
    // rejectUnauthorized: false desabilitava proteção contra MitM em SMTP
    tls: {
      rejectUnauthorized: true,  // Sempre verificar certificado em produção
      minVersion: 'TLSv1.2',    // Exigir TLS moderno
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
      ...(mail.headers ? { headers: mail.headers } : {}),
    });
  } finally {
    transporter.close();
  }
};

// ── Descadastro de marketing (token HMAC stateless) ──────────────────
const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || '';

export const buildUnsubscribeToken = (userId, consentType) => {
  if (!UNSUBSCRIBE_SECRET || !userId || !consentType) return null;
  const payload = `${userId}.${consentType}.${Date.now()}`;
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
};

export const buildUnsubscribeUrl = (userId, consentType) => {
  const token = buildUnsubscribeToken(userId, consentType);
  if (!token) return null;
  return `${APP_URL.replace(/\/$/, '')}/api/unsubscribe?t=${encodeURIComponent(token)}`;
};

// Revalida o consentimento ATUAL (versão vigente) no momento do envio.
// Retorna { ok: true } ativo, { ok: false } inativo/sem usuário, { ok: 'error' } falha transitória.
const isMarketingThirdpartyConsentActive = async (userId) => {
  if (!userId) return { ok: false };
  try {
    const { data, error } = await supabaseAdmin.rpc('is_marketing_consent_active', {
      p_user_id: userId,
      p_consent_type: 'marketing_thirdparty_opt_in',
    });
    if (error) return { ok: 'error' };
    return { ok: data === true };
  } catch {
    return { ok: 'error' };
  }
};

export const getLinkHref = (link) => {
  if (!link) return null;
  if (String(link).startsWith('http')) return link;
  const normalizedLink = String(link).startsWith('/') ? String(link) : `/${String(link)}`;
  return `${APP_URL.replace(/\/$/, '')}${normalizedLink}`;
};

const EMAIL_BRAND_LOGO_URL = process.env.EMAIL_BRAND_LOGO_URL || process.env.VITE_EMAIL_BRAND_LOGO_URL || '';
const DEFAULT_EMAIL_BRAND = {
  siteName: 'AGRO BW',
  logoUrl: EMAIL_BRAND_LOGO_URL || '',
  defaultAdImageUrl: '',
};

const EMAIL_UNSAFE_IMAGE_EXTENSIONS = new Set(['.svg', '.webp']);

const getEmailSafeImageUrl = (...candidates) => {
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value) continue;

    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;

      const pathname = parsed.pathname.toLowerCase();
      if ([...EMAIL_UNSAFE_IMAGE_EXTENSIONS].some((ext) => pathname.endsWith(ext))) continue;

      return parsed.toString();
    } catch {
      continue;
    }
  }

  return '';
};

const normalizeEmailHtmlImages = (html, fallbackImageUrl = '') => {
  const safeFallback = getEmailSafeImageUrl(fallbackImageUrl);

  return String(html || '').replace(/<img\b([^>]*)src=(["'])(.*?)\2([^>]*)>/gi, (_match, before, quote, src, after) => {
    const safeSrc = getEmailSafeImageUrl(src) || safeFallback;
    if (!safeSrc) return '';
    return `<img${before}src=${quote}${escapeHtml(safeSrc)}${quote}${after}>`;
  });
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
  const brandLogoUrl = getEmailSafeImageUrl(branding?.logoUrl, DEFAULT_EMAIL_BRAND.logoUrl);
  const brandLogo = brandLogoUrl
    ? `<img src="${escapeHtml(brandLogoUrl)}" alt="${escapeHtml(brandName)}" border="0" style="display:block;border:0;max-width:180px;max-height:46px;">`
    : `<span style="display:inline-block;padding:10px 14px;border-radius:14px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.14);font-size:15px;font-weight:800;letter-spacing:0.24em;text-transform:uppercase;color:#ffffff;">${escapeHtml(brandName)}</span>`;

  // Estrutura table-based (compatível com Outlook/Word engine):
  // - largura fixa centralizada (sem depender de max-width em div)
  // - header com bgcolor sólido (gradiente vira "progressive enhancement")
  // - espaçamento por padding de <td> (sem depender de margin de container)
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<!--[if mso]>
<style>table,td,div,p,a,h1{font-family:Arial,Helvetica,sans-serif !important;} table{border-collapse:collapse !important;}</style>
<![endif]-->
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef3f8" style="background:#eef3f8;">
  <tr>
    <td align="center" style="padding:24px;">
      <table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:680px;">
        <tr>
          <td bgcolor="#0f172a" style="background-color:#0f172a;background:linear-gradient(135deg,#0f172a 0%,#16233b 58%,#13351f 100%);border-radius:26px 26px 0 0;padding:28px 32px 30px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
            <div style="margin-bottom:20px;">${brandLogo}</div>
            <h1 style="margin:0 0 10px;font-size:28px;line-height:1.18;font-weight:800;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">${safeTitle}</h1>
            ${
              safeSubtitle
                ? `<p style="margin:0;font-size:14px;line-height:1.7;color:#e2e8f0;font-family:Arial,Helvetica,sans-serif;">${safeSubtitle}</p>`
                : ''
            }
          </td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #dbe5f0;border-top:0;padding:32px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
            <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#0f172a;">Olá, <strong>${safeRecipientName}</strong>.</p>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td bgcolor="#f8fafc" style="background:#f8fafc;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 26px 26px;padding:20px 32px 28px;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 10px;font-size:12px;line-height:1.7;color:#64748b;">${safeFooterNote}</p>
            <p style="margin:0;font-size:12px;line-height:1.7;color:#94a3b8;">
              ${escapeHtml(brandName)} · <a href="${safeSiteUrl}" style="color:#16a34a;text-decoration:none;font-weight:700;">${safeSiteUrl.replace(/^https?:\/\//, '')}</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`.trim();
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
  const isConversion = params.alertKind === 'conversion';
  const isRenewal = params.alertKind === 'renewal';
  const isEditRejected = params.alertKind === 'edit_rejected';
  const isAdPaused = params.alertKind === 'ad_paused';
  const isAdResumed = params.alertKind === 'ad_resumed';
  const isAdDeleted = params.alertKind === 'ad_deleted';
  return {
    subject: params.title,
    html: renderEmailShell({
      eyebrow: isConversion
        ? 'Conversão inteligente'
        : isRenewal
          ? 'Renovação inteligente'
          : isEditRejected
            ? 'Edição rejeitada'
            : isAdPaused
              ? 'Anúncio pausado'
              : isAdDeleted
                ? 'Anúncio removido'
                : 'Anúncio reativado',
      title: params.title,
      subtitle: isConversion
        ? 'Selecionamos uma oportunidade que pode aumentar sua exposição e acelerar resultados.'
        : isRenewal
          ? 'Seu plano precisa de atenção para manter recursos e continuidade operacional.'
          : isEditRejected
            ? 'Sua alteração foi revisada pela equipe e precisa de ajustes antes de ser aprovada.'
            : isAdPaused
              ? 'A equipe aplicou uma pausa operacional no anúncio e registrou o motivo para você acompanhar.'
              : isAdDeleted
                ? 'A equipe removeu o anúncio da plataforma e registrou o motivo para sua consulta.'
                : 'Seu anúncio voltou a ficar ativo e disponível na plataforma.',
      recipientName: params.userName,
      branding: params.branding,
      footerNote: isConversion
        ? 'Este aviso foi gerado com base no seu momento atual de uso da plataforma.'
        : isRenewal
          ? 'Renovar no tempo certo evita pausa de recursos e mantém sua operação ativa.'
          : isEditRejected
            ? 'Revise o motivo informado pela equipe, ajuste o anúncio e envie uma nova alteração quando estiver pronto.'
            : isAdPaused
              ? 'Se precisar ajustar o anúncio, revise o motivo informado pela equipe no seu painel.'
              : isAdDeleted
                ? 'Se necessário, revise o motivo informado e prepare uma nova publicação alinhada às regras da plataforma.'
                : 'Aproveite a retomada do anúncio para revisar preço, mídia e descrição, se necessário.',
      bodyHtml: `
        <div style="margin:0 0 24px;padding:22px;border-radius:18px;background:linear-gradient(180deg,#f8fbff 0%,#f3f7fb 100%);border:1px solid #dce5ef;">
          <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">Resumo</p>
          <p style="margin:0;font-size:14px;line-height:1.85;color:#334155;">${escapeHtml(params.content)}</p>
        </div>
        ${renderPrimaryButton(
          linkHref,
          isConversion
            ? 'Ver oportunidade'
            : isRenewal
              ? 'Ver meu plano'
              : isEditRejected || isAdPaused || isAdDeleted
                ? 'Revisar meu anúncio'
                : 'Ver meus anúncios'
        )}
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

export const getNewsletterCampaignTemplate = (params) => ({
  subject: params.subject,
  html: renderEmailShell({
    title: params.subject,
    subtitle: params.previewText || 'Conteúdo enviado pela central de campanhas da AGRO BW.',
    recipientName: params.recipientName || 'Cliente',
    branding: params.branding,
    footerNote:
      'Você recebeu esta campanha porque seu e-mail está em uma audiência ativa da plataforma AGRO BW.',
    bodyHtml: `
      <div style="margin:0 0 24px;padding:18px 20px;border:1px solid #dbe5f0;border-radius:22px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);">
        <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;">Campanha</p>
        <p style="margin:10px 0 0;font-size:22px;line-height:1.3;font-weight:800;color:#0f172a;">${escapeHtml(params.name || params.subject)}</p>
      </div>
      <div style="margin:0 0 24px;border:1px solid #dbe5f0;border-radius:24px;background:#ffffff;overflow:hidden;">
        <div style="padding:0;">
          ${normalizeEmailHtmlImages(params.htmlContent || '', params.branding?.defaultAdImageUrl || '')}
        </div>
      </div>
    `,
  }),
});

const loadEmailBranding = async () => {
  const { data, error } = await supabaseAdmin
    .from('layout_settings')
    .select('site_name, logo_url, logo_light_url, default_ad_image_url')
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_EMAIL_BRAND;
  }

  return {
    siteName: data.site_name || DEFAULT_EMAIL_BRAND.siteName,
    logoUrl: getEmailSafeImageUrl(data.logo_light_url, data.logo_url, DEFAULT_EMAIL_BRAND.logoUrl),
    defaultAdImageUrl: getEmailSafeImageUrl(data.default_ad_image_url),
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

const syncNewsletterCampaignStats = async (campaignIds) => {
  const ids = Array.from(new Set((campaignIds || []).filter(Boolean)));
  if (!ids.length) return;

  for (const campaignId of ids) {
    const { data: jobs, error } = await supabaseAdmin
      .from('newsletter_campaign_email_jobs')
      .select('status, sent_at')
      .eq('campaign_id', campaignId);

    if (error) {
      console.error('[syncNewsletterCampaignStats] erro ao carregar jobs:', error);
      continue;
    }

    const rows = jobs || [];
    const totalRecipients = rows.length;
    const sentCount = rows.filter((job) => job.status === 'sent').length;
    const failedCount = rows.filter((job) => job.status === 'failed').length;
    const skippedCount = rows.filter((job) => job.status === 'skipped').length;
    const pendingCount = rows.filter((job) => ['pending', 'processing'].includes(job.status)).length;

    let nextStatus = 'draft';
    if (pendingCount > 0) nextStatus = 'sending';
    else if (totalRecipients > 0 && sentCount + failedCount + skippedCount === totalRecipients) nextStatus = 'completed';
    else if (totalRecipients > 0) nextStatus = 'queued';

    await supabaseAdmin
      .from('newsletter_campaigns')
      .update({
        total_recipients: totalRecipients,
        sent_count: sentCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        status: nextStatus,
        last_sent_at: sentCount > 0 ? new Date().toISOString() : null,
      })
      .eq('id', campaignId);
  }
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
        ctaLink: `${APP_URL.replace(/\/$/, '')}/anuncio/${claimed.announcement_id}`,
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

export const processNewsletterCampaignJobs = async (smtpSettings, smtpValidationError, limit, triggeredBy = 'admin') => {
  const result = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  const branding = await loadEmailBranding();
  const touchedCampaignIds = new Set();
  const { data: log } = await supabaseAdmin
    .from('newsletter_campaign_email_dispatch_logs')
    .insert({ triggered_by: triggeredBy, status: 'processing', requested_limit: limit })
    .select('id')
    .single();

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from('newsletter_campaign_email_jobs')
      .select(`
        id,
        campaign_id,
        recipient_email,
        recipient_name,
        status,
        attempts,
        newsletter_campaigns (
          id,
          name,
          subject,
          preview_text,
          html_content,
          audience_type
        )
      `)
      .in('status', ['pending', 'failed'])
      .lt('attempts', 3)
      .order('queued_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    for (const job of jobs || []) {
      const claimed = await claimJob('newsletter_campaign_email_jobs', job);
      if (!claimed) continue;
      result.processed += 1;
      touchedCampaignIds.add(claimed.campaign_id);

      const campaign = Array.isArray(job.newsletter_campaigns)
        ? job.newsletter_campaigns[0]
        : job.newsletter_campaigns;

      if (!claimed.recipient_email || smtpValidationError || !campaign?.subject || !campaign?.html_content) {
        result.skipped += 1;
        await supabaseAdmin.from('newsletter_campaign_email_jobs').update({
          status: 'skipped',
          last_error: !claimed.recipient_email
            ? 'Destinatário sem e-mail válido'
            : smtpValidationError || 'Campanha sem conteúdo válido',
        }).eq('id', claimed.id);
        continue;
      }

      // Descadastro por destinatário (apenas campanhas de divulgação de terceiros).
      let htmlContent = campaign.html_content;
      let unsubscribeUrl = null;
      if (campaign.audience_type === 'marketing_thirdparty') {
        const { data: recipientUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', claimed.recipient_email)
          .maybeSingle();

        // LGPD: revalida o consentimento ATUAL no momento do envio (o filtro do
        // enfileiramento pode ter ficado obsoleto se o usuário revogou depois).
        const consent = await isMarketingThirdpartyConsentActive(recipientUser?.id || null);
        if (consent.ok !== true) {
          if (consent.ok === false) {
            // Sem consentimento ativo -> NÃO envia; marca skipped com motivo.
            result.skipped += 1;
            await supabaseAdmin.from('newsletter_campaign_email_jobs').update({
              status: 'skipped',
              last_error: 'Consentimento de divulgações de terceiros revogado/inativo no envio.',
            }).eq('id', claimed.id);
            continue;
          }
          // consent.ok === 'error' -> falha transitória ao validar: não arrisca; deixa para retry.
          result.failed += 1;
          await supabaseAdmin.from('newsletter_campaign_email_jobs').update({
            status: 'failed',
            last_error: 'Falha ao revalidar consentimento; reprocessar.',
          }).eq('id', claimed.id);
          continue;
        }

        if (recipientUser?.id) {
          unsubscribeUrl = buildUnsubscribeUrl(recipientUser.id, 'marketing_thirdparty_opt_in');
        }
        // Garante que o placeholder nunca vaze cru: usa o link real ou a página de preferências.
        const fallbackUrl = `${APP_URL.replace(/\/$/, '')}/minha-conta/perfil`;
        htmlContent = String(htmlContent || '').split('{{unsubscribe_url}}').join(unsubscribeUrl || fallbackUrl);
      }

      const email = getNewsletterCampaignTemplate({
        recipientName: claimed.recipient_name || 'Cliente',
        name: campaign.name,
        subject: campaign.subject,
        previewText: campaign.preview_text,
        htmlContent,
        branding,
      });

      try {
        await sendMail(smtpSettings, {
          to: claimed.recipient_email,
          subject: email.subject,
          html: email.html,
          ...(unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
        });
        result.sent += 1;
        await supabaseAdmin.from('newsletter_campaign_email_jobs').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null,
        }).eq('id', claimed.id);
      } catch (error) {
        result.failed += 1;
        await supabaseAdmin.from('newsletter_campaign_email_jobs').update({
          status: 'failed',
          last_error: error instanceof Error ? error.message : 'Unknown SMTP error',
        }).eq('id', claimed.id);
      }
    }

    await syncNewsletterCampaignStats(Array.from(touchedCampaignIds));

    await finalizeLog('newsletter_campaign_email_dispatch_logs', log?.id, {
      status: 'completed',
      processed_count: result.processed,
      sent_count: result.sent,
      failed_count: result.failed,
      skipped_count: result.skipped,
      finished_at: new Date().toISOString(),
    });
  } catch (error) {
    await syncNewsletterCampaignStats(Array.from(touchedCampaignIds));
    await finalizeLog('newsletter_campaign_email_dispatch_logs', log?.id, {
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

  const [contact, planAlert, radar, newsletterCampaign] = await Promise.all([
    processContactJobs(smtpSettings, smtpValidationError, safeLimit, triggeredBy),
    processPlanAlertJobs(smtpSettings, smtpValidationError, safeLimit, triggeredBy),
    processRadarJobs(smtpSettings, smtpValidationError, safeLimit, triggeredBy),
    processNewsletterCampaignJobs(smtpSettings, smtpValidationError, safeLimit, triggeredBy),
  ]);

  return { contact, planAlert, radar, newsletterCampaign, smtpValidationError };
};
