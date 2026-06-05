import { clearAdminAuthCookies, ensureSameOriginPost, json } from './_shared.mjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { success: false, error: 'Metodo nao permitido.' });
    return;
  }

  if (!ensureSameOriginPost(req, res)) {
    return;
  }

  clearAdminAuthCookies(res);
  json(res, 200, { success: true });
}
