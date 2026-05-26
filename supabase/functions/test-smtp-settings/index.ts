import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
// VULN-019 fix: nodemailer via createSmtpTransporter() + sendSmtpEmail()
import {
  loadSmtpSettings,
  validateSmtpSettings,
  createSmtpTransporter,
  sendSmtpEmail,
} from '../_shared/smtpSettings.ts';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import { isAdminProfile, extractBearerToken } from '../_shared/security.ts';

// VULN-002 fix: CORS dinâmico com allowlist
const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });

const getSmtpHint = (message: string, port: number, encryption: string) => {
  const normalized = message.toLowerCase();

  if (normalized.includes('authentication') || normalized.includes('auth') || normalized.includes('login')) {
    return 'Verifique usuario, senha e se o servidor exige senha de aplicativo/autenticacao SMTP.';
  }

  if (normalized.includes('starttls')) {
    return 'Seu servidor pode nao aceitar STARTTLS. Se estiver usando porta 587, confirme TLS. Se for 465, use SSL.';
  }

  if (normalized.includes('tls') || normalized.includes('ssl') || normalized.includes('handshake')) {
    return `Revise a combinacao porta/criptografia. Hoje voce esta usando porta ${port} com ${encryption}.`;
  }

  if (normalized.includes('relay')) {
    return 'O servidor rejeitou o envio. Verifique se o remetente configurado tem permissao para enviar por esse SMTP.';
  }

  return `Revise a configuracao SMTP do painel, especialmente porta ${port}, criptografia ${encryption}, usuario e remetente.`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightBrowser(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(req, { success: false, message: 'Serviço indisponível' }, 500);
    }

    // VULN-020 fix: extractBearerToken + isAdminProfile centralizados
    const token = extractBearerToken(req);
    if (!token) {
      return jsonResponse(req, { success: false, message: 'Unauthorized' }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse(req, { success: false, message: 'Unauthorized' }, 401);
    }

    const { data: adminProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!isAdminProfile(adminProfile)) {
      return jsonResponse(req, { success: false, message: 'Admin access required' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'connection');
    const toEmail = String(body?.toEmail || '').trim();

    const smtpSettings = await loadSmtpSettings(supabaseAdmin);
    const smtpValidationError = validateSmtpSettings(smtpSettings);

    if (smtpValidationError) {
      return jsonResponse(req, { success: false, message: smtpValidationError }, 400);
    }

    // VULN-019 fix: Usando createSmtpTransporter() com nodemailer para validar conexão
    const smtpPort = Number(smtpSettings!.port || 587);
    const smtpEncryption = String(smtpSettings!.encryption || 'TLS');

    // Verifica conexão
    try {
      const transporter = createSmtpTransporter(smtpSettings!);
      await transporter.verify();
      transporter.close();
    } catch (error) {
      const smtpMessage = error instanceof Error ? error.message : 'Falha desconhecida ao conectar no SMTP';
      return jsonResponse(req, {
        success: false,
        stage: 'connect',
        message: `Falha ao conectar/autenticar no SMTP: ${smtpMessage}`,
        hint: getSmtpHint(smtpMessage, smtpPort, smtpEncryption),
      });
    }

    if (action === 'send_test_email') {
      if (!toEmail || !toEmail.includes('@')) {
        return jsonResponse(req, { success: false, message: 'Digite um e-mail valido para teste' }, 400);
      }

      const subject = 'Teste SMTP AGRO BW';
      const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${subject}</title>
          </head>
          <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
            <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
              <div style="padding:28px 32px;background:#0f172a;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#86efac;">
                  SMTP TESTE
                </p>
                <h1 style="margin:0;font-size:24px;line-height:1.2;">Configuracao validada com sucesso</h1>
              </div>
              <div style="padding:32px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
                  Este e um e-mail de teste enviado a partir da configuracao SMTP salva no painel administrativo da AGRO BW.
                </p>
              </div>
            </div>
          </body>
        </html>
      `.trim();

      const result = await sendSmtpEmail(smtpSettings!, { to: toEmail, subject, html });

      if (!result.success) {
        const smtpMessage = result.error || 'Falha desconhecida ao enviar e-mail';
        return jsonResponse(req, {
          success: false,
          stage: 'send',
          message: `Falha ao enviar o e-mail de teste: ${smtpMessage}`,
          hint: getSmtpHint(smtpMessage, smtpPort, smtpEncryption),
        });
      }

      return jsonResponse(req, {
        success: true,
        message: `E-mail de teste enviado para ${toEmail}`,
      });
    }

    return jsonResponse(req, {
      success: true,
      message: 'Conexao SMTP validada com sucesso pelo backend.',
    });
  } catch (error) {
    return jsonResponse(
      req,
      { success: false, message: 'Erro inesperado ao testar configuração SMTP' },
      500
    );
  }
});
