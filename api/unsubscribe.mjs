import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || '';
const APP_URL = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://bwagro.com.br').replace(/\/$/, '');

const ALLOWED_CONSENT_TYPES = new Set(['marketing_opt_in', 'marketing_thirdparty_opt_in']);

const page = (title, message) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:40px 16px;color:#0f172a">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 20px">${message}</p>
<a href="${APP_URL}/minha-conta/perfil" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:bold;font-size:14px">Gerenciar minhas preferências</a>
</div></body></html>`;

const confirmPage = (token) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>Confirmar descadastro</title></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:40px 16px;color:#0f172a">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">Cancelar divulgações de terceiros</h1>
<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 20px">Clique no botão abaixo para confirmar que não quer mais receber e-mails de divulgação de anúncios e campanhas de terceiros. As comunicações da própria BWAGRO não são afetadas.</p>
<form method="POST" action="/api/unsubscribe?t=${encodeURIComponent(token)}">
  <button type="submit" style="display:inline-block;background:#dc2626;color:#fff;border:0;cursor:pointer;padding:12px 24px;border-radius:10px;font-weight:bold;font-size:14px">Confirmar descadastro</button>
</form>
<p style="margin:20px 0 0;font-size:13px"><a href="${APP_URL}/minha-conta/perfil" style="color:#64748b">Prefiro gerenciar minhas preferências</a></p>
</div></body></html>`;

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
    res.status(400).send(page('Link inválido', 'Este link de descadastro é inválido ou expirou. Você pode gerenciar suas preferências na sua conta.'));
    return;
  }

  // GET NÃO tem efeito colateral (evita prefetch/scanners/secure-link bots revogarem
  // sem ação humana). Apenas renderiza a confirmação com um POST.
  if (!isPost) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(confirmPage(token));
    return;
  }

  // Só confirma sucesso se a revogação executou (ou já estava revogada/idempotente).
  // Erro real de infra/DB -> falha temporária, sem afirmar descadastro.
  let revoked = false;
  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Revoga ativos. select() permite distinguir erro de DB de "nada a revogar".
      const { error: revokeError } = await supabase
        .from('user_legal_consents')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', parsed.userId)
        .eq('consent_type', parsed.consentType)
        .is('revoked_at', null)
        .select('id');

      if (!revokeError) {
        // Idempotência: já estava revogado -> também é sucesso (nada ativo restou).
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
