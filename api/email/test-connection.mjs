import {
  getSmtpHint,
  loadSmtpSettings,
  requireAdminByToken,
  validateSmtpSettings,
  verifySmtpConnection,
} from '../../server/email-backend-core.mjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.status(200).json({ success: true });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const auth = await requireAdminByToken(token);

  if (!auth.ok) {
    res.status(auth.status).json(auth.body);
    return;
  }

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
}
