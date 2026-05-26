/**
 * Módulo compartilhado de configurações e cliente SMTP para Edge Functions.
 *
 * VULN-019 fix: Migrado de 'deno.land/x/smtp@v0.7.0' (biblioteca sem manutenção ativa,
 * sem verificação de certificado configurável, sem suporte a STARTTLS seguro) para
 * 'npm:nodemailer', que é battle-tested, auditado e amplamente usado em produção.
 *
 * npm: prefix é suportado no Supabase Edge Functions (Deno 1.30+).
 */

// deno-lint-ignore-file no-explicit-any
import nodemailer from 'npm:nodemailer@6.9.13';

export type SmtpSettings = {
  id: string;
  host: string;
  port: number;
  user_name: string;
  password: string;
  encryption: 'SSL' | 'TLS' | 'NONE';
  from_email: string;
  from_name: string;
  is_active: boolean;
};

/**
 * Carrega as configurações SMTP da tabela smtp_settings do Supabase.
 * Retorna null se não encontrado ou inativo.
 */
export const loadSmtpSettings = async (supabaseAdmin: any): Promise<SmtpSettings | null> => {
  const { data, error } = await supabaseAdmin
    .from('smtp_settings')
    .select('id, host, port, user_name, password, encryption, from_email, from_name, is_active')
    .eq('id', 'smtp_config_1')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load SMTP settings: ${error.message}`);
  }

  if (!data || !data.is_active) {
    return null;
  }

  return data as SmtpSettings;
};

/**
 * Valida que as configurações SMTP estão completas e ativas.
 * Retorna uma mensagem de erro se inválidas, null se OK.
 */
export const validateSmtpSettings = (settings: SmtpSettings | null): string | null => {
  if (!settings) {
    return 'Configuracao SMTP do painel nao encontrada ou inativa';
  }

  if (!settings.host || !settings.user_name || !settings.password || !settings.from_email) {
    return 'Configuracao SMTP do painel esta incompleta';
  }

  return null;
};

/**
 * Cria um transporter nodemailer com as configurações SMTP.
 *
 * VULN-019 fix: nodemailer verifica certificados TLS por padrão e suporta
 * STARTTLS seguro. A biblioteca deno.land/x/smtp@v0.7.0 não tinha manutenção
 * ativa nem suporte adequado a configurações de segurança TLS.
 *
 * VULN-006: rejectUnauthorized: true já definido — verifica certificados.
 */
export const createSmtpTransporter = (settings: SmtpSettings): nodemailer.Transporter => {
  const port = Number(settings.port || 587);
  const encryption = String(settings.encryption || 'TLS').toUpperCase();
  const secure = encryption === 'SSL' || port === 465;
  const requireTLS = encryption === 'TLS' && port !== 465;

  return nodemailer.createTransport({
    host: settings.host,
    port,
    secure,
    requireTLS,
    auth: {
      user: settings.user_name,
      pass: settings.password,
    },
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
};

/**
 * Envia um email usando nodemailer.
 * Retorna um objeto com a resposta ou um erro formatado.
 */
export const sendSmtpEmail = async (
  settings: SmtpSettings,
  options: {
    to: string | string[];
    subject: string;
    html: string;
    replyTo?: string;
  },
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  let transporter: nodemailer.Transporter | null = null;

  try {
    transporter = createSmtpTransporter(settings);

    const result = await transporter.sendMail({
      from: `"${settings.from_name}" <${settings.from_email}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
    });

    return { success: true, messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[smtp] Erro ao enviar email:', message);
    return { success: false, error: message };
  } finally {
    if (transporter) {
      transporter.close();
    }
  }
};

/**
 * @deprecated Usar sendSmtpEmail() em vez desta função.
 * Mantida por compatibilidade com funções que ainda usam SmtpClient diretamente.
 * Será removida após migração completa de todas as funções de email.
 */
export const connectSmtpClientWithSettings = async (
  _client: unknown,
  _settings: SmtpSettings,
): Promise<void> => {
  throw new Error(
    '[smtp] connectSmtpClientWithSettings está depreciada. ' +
      'Use createSmtpTransporter() ou sendSmtpEmail() do _shared/smtpSettings.ts',
  );
};
