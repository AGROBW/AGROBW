import {
  getStoredSmtpSettings,
  mapStoredSmtpSettingsToClient,
  requireAdminByToken,
  saveSmtpSettings,
} from '../../server/email-backend-core.mjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.status(200).json({ success: true });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const auth = await requireAdminByToken(token);

  if (!auth.ok) {
    res.status(auth.status).json(auth.body);
    return;
  }

  if (req.method === 'GET') {
    const settings = await getStoredSmtpSettings();
    res.status(200).json({
      success: true,
      data: settings ? mapStoredSmtpSettingsToClient(settings) : null,
    });
    return;
  }

  if (req.method === 'POST') {
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
      data: mapStoredSmtpSettingsToClient({
        ...saved,
        updated_at: new Date().toISOString(),
      }),
    });
    return;
  }

  res.status(405).json({ success: false, message: 'Method not allowed' });
}
