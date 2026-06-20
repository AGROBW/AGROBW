import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || '';
const APP_URL = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://bwagro.com.br').replace(/\/$/, '');

const ALLOWED_CONSENT_TYPES = new Set(['marketing_opt_in', 'marketing_thirdparty_opt_in']);

const renderShell = ({ title, eyebrow, message, actionsHtml = '' }) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;background:radial-gradient(circle at top,#e9f7ee 0,#f8fafc 42%,#eef3f8 100%);font-family:Arial,sans-serif;color:#0f172a">
<div style="max-width:760px;margin:0 auto;padding:48px 20px 72px">
  <div style="margin:0 auto 18px;max-width:560px;text-align:center">
    <div style="display:inline-block;padding:10px 14px;border-radius:999px;background:#ffffff;border:1px solid #dbe5f0;font-size:11px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:#166534">AGRO BW</div>
  </div>
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe5f0;border-radius:28px;box-shadow:0 30px 70px rgba(15,23,42,.08);overflow:hidden">
    <div style="padding:28px 30px;background:linear-gradient(135deg,#0f172a 0%,#16233b 58%,#13351f 100%);color:#ffffff">
      <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:rgba(226,232,240,.82)">${eyebrow}</p>
      <h1 style="margin:0;font-size:30px;line-height:1.15">${title}</h1>
    </div>
    <div style="padding:28px 30px 30px">
      <p style="margin:0 0 22px;font-size:15px;line-height:1.75;color:#475569">${message}</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">${actionsHtml}</div>
    </div>
  </div>
</div>
</body></html>`;

const page = (title, message) =>
  renderShell({
    title,
    eyebrow: 'Preferências de comunicação',
    message,
    actionsHtml: `<a href="${APP_URL}/minha-conta/perfil" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700;font-size:14px">Gerenciar minhas preferências</a>`,
  });

const confirmPage = (token) =>
  renderShell({
    title: 'Cancelar divulgações de terceiros',
    eyebrow: 'Confirmação',
    message:
      'Você está prestes a parar de receber e-mails de divulgação de anúncios e campanhas de terceiros. As comunicações essenciais e as campanhas da própria AGRO BW não são alteradas aqui.',
    actionsHtml: `<form method="POST" action="/api/unsubscribe?t=${encodeURIComponent(token)}" style="margin:0">
  <button type="submit" style="display:inline-block;background:#dc2626;color:#fff;border:0;cursor:pointer;padding:13px 22px;border-radius:12px;font-weight:700;font-size:14px">Confirmar descadastro</button>
</form>
<a href="${APP_URL}/minha-conta/perfil" style="display:inline-block;color:#64748b;text-decoration:none;padding:13px 4px;font-weight:700;font-size:14px">Prefiro gerenciar minhas preferências</a>`,
  });

const verifyToken = (token) => {
  if (!token || !UNSUBSCRIBE_SECRET) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET).update(payloadB64).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const [userId, consentType] = payload.split('.');
  if (!userId || !ALLOWED_CONSENT_TYPES.has(consentType)) return null;
  return { userId, consentType };
};

export default async function handler(req, res) {
  const isPost = req.method === 'POST';
  if (req.method !== 'GET' && !isPost) {
    res.status(405).send('Method not allowed');
    return;
  }

  const token = req.query?.t || req.query?.token;
  const parsed = verifyToken(token);

  if (!parsed) {
    if (isPost) {
      res.status(400).json({ success: false });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(400).send(
      page(
        'Link inválido',
        'Este link de descadastro é inválido ou expirou. Você ainda pode revisar tudo diretamente na área de preferências da sua conta.'
      )
    );
    return;
  }

  if (!isPost) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(confirmPage(token));
    return;
  }

  let revoked = false;
  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { error: revokeError } = await supabase
        .from('user_legal_consents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', parsed.userId)
        .eq('consent_type', parsed.consentType)
        .is('revoked_at', null)
        .select('id');

      if (!revokeError) {
        const { count, error: checkError } = await supabase
          .from('user_legal_consents')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', parsed.userId)
          .eq('consent_type', parsed.consentType)
          .is('revoked_at', null);
        revoked = !checkError && (count ?? 0) === 0;
      }
    } catch {
      revoked = false;
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!revoked) {
    res.status(503).send(
      page(
        'Não foi possível concluir agora',
        'Tivemos uma instabilidade ao processar seu descadastro. Tente novamente em instantes ou ajuste suas preferências diretamente na sua conta.'
      )
    );
    return;
  }

  res.status(200).send(
    page(
      'Descadastro concluído',
      'Você não receberá mais e-mails de divulgação de anúncios e campanhas de terceiros. Se quiser, pode reativar ou ajustar suas preferências a qualquer momento na sua conta.'
    )
  );
}
