import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET || '';
const WHATSAPP_BACKEND_SECRET = process.env.WHATSAPP_BACKEND_SECRET || '';

const SETTINGS_ID = '00000000-0000-0000-0000-000000000010';
const GRAPH_VERSION = 'v21.0';
const MAX_ATTEMPTS = 4;

const json = (res, status, body) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
};

const isAuthorized = (req) => {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const headerSecret = req.headers['x-whatsapp-backend-secret'];
  return (
    (CRON_SECRET && bearer === CRON_SECRET) ||
    (WHATSAPP_BACKEND_SECRET && headerSecret === WHATSAPP_BACKEND_SECRET)
  );
};

const sendTemplate = async ({ phoneNumberId, token, templateName, templateLang, to, params }) => {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang || 'pt_BR' },
      components: [
        {
          type: 'body',
          parameters: params.map((text) => ({ type: 'text', text: String(text || '').slice(0, 300) })),
        },
      ],
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error?.message || `HTTP ${response.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, messageId: data?.messages?.[0]?.id || null };
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-whatsapp-backend-secret');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    json(res, 405, { success: false, error: 'Method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    json(res, 401, { success: false, error: 'Unauthorized' });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    json(res, 500, { success: false, error: 'Missing Supabase service role env' });
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Config
  const { data: settings, error: settingsError } = await supabase
    .from('whatsapp_settings')
    .select('access_token, phone_number_id, template_name, template_lang, is_enabled')
    .eq('id', SETTINGS_ID)
    .maybeSingle();

  if (settingsError) {
    json(res, 500, { success: false, error: `Settings error: ${settingsError.message}` });
    return;
  }

  if (!settings?.is_enabled) {
    json(res, 200, { success: true, summary: { skipped: 'disabled', processed: 0 } });
    return;
  }
  if (!settings.access_token || !settings.phone_number_id || !settings.template_name) {
    json(res, 200, { success: true, summary: { skipped: 'not_configured', processed: 0 } });
    return;
  }

  const limit = Math.min(Number(req.body?.limit) || 25, 100);

  const { data: jobs, error: jobsError } = await supabase
    .from('whatsapp_notification_jobs')
    .select('id, recipient_phone, recipient_name, buyer_name, announcement_title, attempts')
    .eq('status', 'pending')
    .not('recipient_phone', 'is', null)
    .order('queued_at', { ascending: true })
    .limit(limit);

  if (jobsError) {
    json(res, 500, { success: false, error: `Jobs error: ${jobsError.message}` });
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const job of jobs || []) {
    await supabase
      .from('whatsapp_notification_jobs')
      .update({ status: 'processing', processing_started_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'pending');

    const result = await sendTemplate({
      phoneNumberId: settings.phone_number_id,
      token: settings.access_token,
      templateName: settings.template_name,
      templateLang: settings.template_lang,
      to: job.recipient_phone,
      params: [job.recipient_name, job.announcement_title, job.buyer_name],
    });

    const attempts = (job.attempts || 0) + 1;
    const now = new Date().toISOString();

    if (result.ok) {
      sent += 1;
      await supabase
        .from('whatsapp_notification_jobs')
        .update({
          status: 'sent',
          attempts,
          last_attempt_at: now,
          sent_at: now,
          provider_message_id: result.messageId,
          last_error: null,
        })
        .eq('id', job.id);
    } else {
      failed += 1;
      await supabase
        .from('whatsapp_notification_jobs')
        .update({
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          last_attempt_at: now,
          last_error: result.error,
        })
        .eq('id', job.id);
    }
  }

  json(res, 200, { success: true, summary: { processed: (jobs || []).length, sent, failed } });
}
