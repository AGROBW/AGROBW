import { createServer } from 'node:http';
import {
  clampLimit,
  getSmtpHint,
  loadSmtpSettings,
  processAllQueues,
  requireAdminByToken,
  sendMail,
  validateSmtpSettings,
  verifySmtpConnection,
} from './email-backend-core.mjs';

const PORT = Number(process.env.EMAIL_BACKEND_PORT || 4010);
const EMAIL_BACKEND_SECRET = process.env.EMAIL_BACKEND_SECRET || '';
const AUTO_START = String(process.env.EMAIL_PROCESSOR_AUTO_START || 'false').toLowerCase() === 'true';
const PROCESS_INTERVAL_MS = Number(process.env.EMAIL_PROCESSOR_INTERVAL_MS || 60000);
const DEFAULT_LIMIT = Number(process.env.EMAIL_PROCESSOR_LIMIT || 25);

const sendJson = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-email-backend-secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
};

const parseBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
};

const getAuthToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
};

const requireProcessorAuth = async (req) => {
  const secret = req.headers['x-email-backend-secret'];
  if (EMAIL_BACKEND_SECRET && secret === EMAIL_BACKEND_SECRET) {
    return { ok: true, mode: 'secret' };
  }

  return requireAdminByToken(getAuthToken(req));
};

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 404, { success: false, message: 'Not found' });
    return;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { success: true });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { success: true, status: 'ok' });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/email/test-connection') {
      const auth = await requireAdminByToken(getAuthToken(req));
      if (!auth.ok) {
        sendJson(res, auth.status, auth.body);
        return;
      }

      const smtpSettings = await loadSmtpSettings();
      const validationError = validateSmtpSettings(smtpSettings);

      if (validationError) {
        sendJson(res, 400, { success: false, message: validationError });
        return;
      }

      try {
        await verifySmtpConnection(smtpSettings);
        sendJson(res, 200, { success: true, message: 'Conexao SMTP validada com sucesso pelo backend.' });
      } catch (error) {
        const smtpMessage = error instanceof Error ? error.message : 'Falha desconhecida ao conectar no SMTP';
        sendJson(res, 400, {
          success: false,
          stage: 'connect',
          message: `Falha ao conectar/autenticar no SMTP: ${smtpMessage}`,
          hint: getSmtpHint(smtpMessage, Number(smtpSettings.port || 587), String(smtpSettings.encryption || 'TLS')),
        });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/email/send-test') {
      const auth = await requireAdminByToken(getAuthToken(req));
      if (!auth.ok) {
        sendJson(res, auth.status, auth.body);
        return;
      }

      const body = await parseBody(req);
      const toEmail = String(body.toEmail || '').trim();

      if (!toEmail || !toEmail.includes('@')) {
        sendJson(res, 400, { success: false, message: 'Digite um e-mail valido para teste' });
        return;
      }

      const smtpSettings = await loadSmtpSettings();
      const validationError = validateSmtpSettings(smtpSettings);

      if (validationError) {
        sendJson(res, 400, { success: false, message: validationError });
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
        sendJson(res, 200, { success: true, message: `E-mail de teste enviado para ${toEmail}` });
      } catch (error) {
        const smtpMessage = error instanceof Error ? error.message : 'Falha desconhecida ao enviar e-mail';
        sendJson(res, 400, {
          success: false,
          stage: 'send',
          message: `Falha ao enviar o e-mail de teste: ${smtpMessage}`,
          hint: getSmtpHint(smtpMessage, Number(smtpSettings.port || 587), String(smtpSettings.encryption || 'TLS')),
        });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/email/process-jobs') {
      const auth = await requireProcessorAuth(req);
      if (!auth.ok) {
        sendJson(res, auth.status, auth.body);
        return;
      }

      const body = await parseBody(req);
      const summary = await processAllQueues(body.limit, 'admin');
      sendJson(res, 200, { success: true, summary });
      return;
    }

    sendJson(res, 404, { success: false, message: 'Not found' });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`[email-backend] listening on port ${PORT}`);
  if (AUTO_START) {
    console.log(`[email-backend] automatic job processing enabled every ${PROCESS_INTERVAL_MS}ms`);
    setInterval(() => {
      void processAllQueues(DEFAULT_LIMIT, 'admin')
        .then((summary) => {
          console.log('[email-backend] auto cycle completed', JSON.stringify(summary));
        })
        .catch((error) => {
          console.error('[email-backend] auto cycle failed', error);
        });
    }, PROCESS_INTERVAL_MS);
  }
});
