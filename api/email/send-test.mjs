import {
  getSmtpHint,
  loadSmtpSettings,
  requireAdminByToken,
  sendMail,
  validateSmtpSettings,
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
}
