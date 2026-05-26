import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
// VULN-019 fix: nodemailer via sendSmtpEmail()
import { loadSmtpSettings, validateSmtpSettings, sendSmtpEmail } from '../_shared/smtpSettings.ts';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import { isAdminProfile, extractBearerToken } from '../_shared/security.ts';
import { validateNotifySupportTicketInput } from '../_shared/validation.ts';

// VULN-002 fix: CORS dinâmico com allowlist
const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });

type TicketEventType = 'admin_reply' | 'ticket_resolved';

const getEmailTemplate = (params: {
  appUrl: string;
  siteName: string;
  userName: string;
  subject: string;
  bodyTitle: string;
  bodyText: string;
  ctaLabel: string;
  ctaLink: string;
}) => ({
  subject: `${params.siteName}: ${params.subject}`,
  html: `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${params.siteName}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="padding:28px 32px;background:#15803d;color:#ffffff;">
            <h1 style="margin:0;font-size:24px;">${params.siteName}</h1>
            <p style="margin:8px 0 0;font-size:14px;opacity:0.92;">Atualizacao da sua Central de Ajuda</p>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;">Ola, <strong>${params.userName}</strong>.</p>
            <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${params.bodyTitle}</h2>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">${params.bodyText}</p>
            <a
              href="${params.ctaLink}"
              style="display:inline-block;padding:14px 22px;background:#15803d;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;"
            >
              ${params.ctaLabel}
            </a>
          </div>
          <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
            <p style="margin:0;">Acesse tambem pelo site: <a href="${params.appUrl}" style="color:#15803d;text-decoration:none;">${params.appUrl}</a></p>
          </div>
        </div>
      </body>
    </html>
  `.trim(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightBrowser(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(req, { success: false, error: 'Serviço indisponível' }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // VULN-020 fix: extractBearerToken + isAdminProfile centralizados
    const token = extractBearerToken(req);
    if (!token) {
      return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);
    }

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse(req, { success: false, error: 'Unauthorized' }, 401);
    }

    const { data: adminProfile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!isAdminProfile(adminProfile)) {
      return jsonResponse(req, { success: false, error: 'Admin access required' }, 403);
    }

    const rawBody = await req.json().catch(() => ({}));

    // VULN-023 fix: Valida schema antes de processar
    const validation = validateNotifySupportTicketInput(rawBody);
    if (!validation.success) {
      return jsonResponse(req, { success: false, error: 'Parâmetros inválidos' }, 400);
    }

    const { ticketId, eventType } = validation.data;

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id, subject, status')
      .eq('id', ticketId)
      .maybeSingle();

    if (ticketError || !ticket) {
      return jsonResponse(req, { success: false, error: 'Ticket não encontrado' }, 404);
    }

    const { data: ticketUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .eq('id', ticket.user_id)
      .maybeSingle();

    if (userError || !ticketUser) {
      return jsonResponse(req, { success: false, error: 'Usuário do ticket não encontrado' }, 404);
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://bwagro.com';
    const helpLink = `${appUrl.replace(/\/$/, '')}/minha-conta/ajuda`;
    const smtpSettings = await loadSmtpSettings(supabaseAdmin);
    const smtpValidationError = validateSmtpSettings(smtpSettings);
    const siteName = smtpSettings?.from_name || 'AGRO BW';

    const title =
      eventType === 'ticket_resolved'
        ? 'Seu ticket foi resolvido'
        : 'Seu ticket recebeu uma nova resposta';

    const content =
      eventType === 'ticket_resolved'
        ? `O ticket "${ticket.subject}" foi marcado como resolvido e encerrado para novas respostas.`
        : `O suporte respondeu ao ticket "${ticket.subject}". Acesse a Central de Ajuda para ler a resposta.`;

    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: ticket.user_id,
        type: 'system',
        title,
        content,
        link: '/minha-conta/ajuda',
      });

    if (notificationError) {
      console.error('[notify-support-ticket-update] failed to insert site notification:', notificationError);
    }

    let emailSent = false;
    let emailError: string | null = null;

    if (ticketUser.email && !smtpValidationError) {
      const email = getEmailTemplate({
        appUrl,
        siteName,
        userName: ticketUser.name || 'Cliente',
        subject: title,
        bodyTitle: title,
        bodyText: content,
        ctaLabel: 'Abrir Central de Ajuda',
        ctaLink: helpLink,
      });

      // VULN-019 fix: Usando sendSmtpEmail() com nodemailer (TLS verificado)
      const result = await sendSmtpEmail(smtpSettings!, {
        to: ticketUser.email,
        subject: email.subject,
        html: email.html,
      });

      emailSent = result.success;
      if (!result.success) {
        emailError = result.error || 'Falha ao enviar email';
        console.error('[notify-support-ticket-update] failed to send email:', result.error);
      }
    } else if (!ticketUser.email) {
      emailError = 'User does not have email';
    } else {
      emailError = smtpValidationError || 'Configuracao SMTP do painel nao encontrada ou inativa';
    }

    return jsonResponse(req, {
      success: true,
      ticketId,
      eventType,
      notificationSent: !notificationError,
      emailSent,
      emailError,
    });
  } catch (error) {
    console.error('[notify-support-ticket-update] unexpected error:', error);
    return jsonResponse(
      req,
      { success: false, error: 'Erro inesperado ao notificar ticket de suporte' },
      500
    );
  }
});
