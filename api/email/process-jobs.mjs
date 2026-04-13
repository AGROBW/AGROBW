import {
  processAllQueues,
  requireAdminByToken,
} from '../../server/email-backend-core.mjs';

const EMAIL_BACKEND_SECRET = process.env.EMAIL_BACKEND_SECRET || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-email-backend-secret');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.status(200).json({ success: true });
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const secret = req.headers['x-email-backend-secret'];
  const authHeader = req.headers.authorization || '';
  const cronToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!((EMAIL_BACKEND_SECRET && secret === EMAIL_BACKEND_SECRET) || (CRON_SECRET && cronToken === CRON_SECRET))) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const auth = await requireAdminByToken(token);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }
  }

  const limit = req.method === 'POST' ? req.body?.limit : undefined;
  const summary = await processAllQueues(limit, cronToken === CRON_SECRET ? 'cron' : 'admin');
  res.status(200).json({ success: true, summary });
}
