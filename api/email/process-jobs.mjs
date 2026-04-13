import {
  processAllQueues,
  requireAdminByToken,
} from '../../server/email-backend-core.mjs';

const EMAIL_BACKEND_SECRET = process.env.EMAIL_BACKEND_SECRET || '';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-email-backend-secret');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.status(200).json({ success: true });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const secret = req.headers['x-email-backend-secret'];
  if (!(EMAIL_BACKEND_SECRET && secret === EMAIL_BACKEND_SECRET)) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const auth = await requireAdminByToken(token);

    if (!auth.ok) {
      res.status(auth.status).json(auth.body);
      return;
    }
  }

  const summary = await processAllQueues(req.body?.limit, 'admin');
  res.status(200).json({ success: true, summary });
}
