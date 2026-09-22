import {
  getSmtpHint,
  getStoredSmtpSettings,
  loadSmtpSettings,
  mapStoredSmtpSettingsToClient,
  processAllQueues,
  requireAdminByToken,
  saveSmtpSettings,
  sendMail,
  validateSmtpSettings,
  verifySmtpConnection,
} from '../../server/email-backend-core.mjs';

const EMAIL_BACKEND_SECRET = process.env.EMAIL_BACKEND_SECRET || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

const getAction = (req) => {
  const value = req.query?.action;
  return String(Array.isArray(value) ? value[0] : value || '').trim().toLowerCase();
};

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
};

const allowCors = (res, methods, extraHeaders = '') => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    ['Content-Type', 'Authorization', extraHeaders].filter(Boolean).join(', '),
  );
  res.setHeader('Access-Control-Allow-Methods', methods);
};

const requireAdmin = async (req, res) => {
  const auth = await requireAdminByToken(getBearerToken(req));
  if (auth.ok) return true;
  res.status(auth.status).json(auth.body);
  return false;
};

const handleSettings = async (req, res) => {
  if (req.method === 'OPTIONS') {
    allowCors(res, 'GET, POST, OPTIONS');
    res.status(200).json({ success: true });
    return;
  }
  if (!await requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    const settings = await getStoredSmtpSettings();
    res.status(200).json({
      success: true,
      data: settings ? mapStoredSmtpSettingsToClient(settings) : null,
    });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const saved = await saveSmtpSettings({
    host: String(body.host || '').trim(),
    port: Number(body.port || 587),
    user_name: String(body.user_name || '').trim(),
    password: String(body.password || ''),
    encryption: String(body.encryption || 'TLS').toUpperCase(),
    from_email: String(body.from_email || '').trim(),
    from_name: String(body.from_name || '').trim(),
    is_active: Boolean(body.is_active),
  });
  res.status(200).json({
    success: true,
    data: mapStoredSmtpSettingsToClient({ ...saved, updated_at: new Date().toISOString() }),
  });
};

const handleTestConnection = async (req, res) => {
  if (req.method === 'OPTIONS') {
    allowCors(res, 'POST, OPTIONS');
    res.status(200).json({ success: true });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }
  if (!await requireAdmin(req, res)) return;

  const smtpSettings = await loadSmtpSettings();
  const validationError = validateSmtpSettings(smtpSettings);
  if (validationError) {
    res.status(400).json({ success: false, message: validationError });
    return;
  }
  try {
    await verifySmtpConnection(smtpSettings);
    res.status(200).json({ success: true, message: 'Conexao SMTP validada com sucesso pelo backend.' });
  } catch (error) {
    const smtpMessage = error instanceof Error ? error.message : 'Falha desconhecida ao conectar no SMTP';
    res.status(400).json({
      success: false,
      stage: 'connect',
      message: `Falha ao conectar/autenticar no SMTP: ${smtpMessage}`,
      hint: getSmtpHint(smtpMessage, Number(smtpSettings.port || 587), String(smtpSettings.encryption || 'TLS')),
    });
  }
};

const handleSendTest = async (req, res) => {
  if (req.method === 'OPTIONS') {
    allowCors(res, 'POST, OPTIONS');
    res.status(200).json({ success: true });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }
  if (!await requireAdmin(req, res)) return;

  const toEmail = String(req.body?.toEmail || '').trim();
  if (!toEmail || !toEmail.includes('@')) {
    res.status(400).json({ success: false, message: 'Digite um e-mail valido para teste' });
    return;
  }
  const smtpSettings = await loadSmtpSettings();
  const validationError = validateSmtpSettings(smtpSettings);
  if (validationError) {
    res.status(400).json({ success: false, message: validationError });
    return;
  }

  const subject = 'Teste SMTP AGRO BW';
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="padding:28px 32px;background:#0f172a;color:#ffffff;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#86efac;">SMTP TESTE</p>
        <h1 style="margin:0;font-size:24px;line-height:1.2;">Configuracao validada com sucesso</h1>
      </div>
      <div style="padding:32px;">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">Este e um e-mail de teste enviado pelo backend tradicional da AGRO BW.</p>
      </div>
    </div></body></html>
  `.trim();
  try {
    await sendMail(smtpSettings, { to: toEmail, subject, html });
    res.status(200).json({ success: true, message: `E-mail de teste enviado para ${toEmail}` });
  } catch (error) {
    const smtpMessage = error instanceof Error ? error.message : 'Falha desconhecida ao enviar e-mail';
    res.status(400).json({
      success: false,
      stage: 'send',
      message: `Falha ao enviar o e-mail de teste: ${smtpMessage}`,
      hint: getSmtpHint(smtpMessage, Number(smtpSettings.port || 587), String(smtpSettings.encryption || 'TLS')),
    });
  }
};

const handleProcessJobs = async (req, res) => {
  if (req.method === 'OPTIONS') {
    allowCors(res, 'GET, POST, OPTIONS', 'x-email-backend-secret');
    res.status(200).json({ success: true });
    return;
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const backendSecret = req.headers['x-email-backend-secret'];
  const token = getBearerToken(req);
  const isCron = Boolean(CRON_SECRET && token === CRON_SECRET);
  const isBackend = Boolean(EMAIL_BACKEND_SECRET && backendSecret === EMAIL_BACKEND_SECRET);
  if (!isCron && !isBackend && !await requireAdmin(req, res)) return;

  const limit = req.method === 'POST' ? req.body?.limit : undefined;
  const summary = await processAllQueues(limit, isCron ? 'cron' : 'admin');
  res.status(200).json({ success: true, summary });
};

export default async function handler(req, res) {
  const action = getAction(req);
  if (action === 'settings') return handleSettings(req, res);
  if (action === 'test-connection') return handleTestConnection(req, res);
  if (action === 'send-test') return handleSendTest(req, res);
  if (action === 'process-jobs') return handleProcessJobs(req, res);
  res.status(404).json({ success: false, message: 'Endpoint not found' });
}
