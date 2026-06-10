import { SMTPConfig } from '../types';
import { supabase } from '../src/lib/supabaseClient';

const SMTP_CONFIG_ID = 'smtp_config_1';
const supabaseFunctionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const emailBackendUrl = import.meta.env.VITE_EMAIL_BACKEND_URL?.replace(/\/$/, '');

export const getSMTPConfig = async (): Promise<SMTPConfig | null> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (emailBackendUrl) {
    const response = await fetch(`${emailBackendUrl}/api/email/settings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || `Falha ao carregar configuracao SMTP (${response.status})`);
    }

    return payload?.data ? (payload.data as SMTPConfig) : null;
  }

  // Credencial SMTP NUNCA é lida no browser: exige backend server-side.
  throw new Error('Backend de e-mail não configurado (VITE_EMAIL_BACKEND_URL). Leitura de SMTP indisponível no cliente.');
};

export const saveSMTPConfig = async (config: SMTPConfig): Promise<void> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (emailBackendUrl) {
    const response = await fetch(`${emailBackendUrl}/api/email/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        id: SMTP_CONFIG_ID,
        host: config.host,
        port: config.port,
        user_name: config.user,
        password: config.password,
        encryption: config.encryption,
        from_email: config.fromEmail,
        from_name: config.fromName,
        is_active: config.isActive,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || `Falha ao salvar configuracao SMTP (${response.status})`);
    }
    return;
  }

  // Gravação de credencial SMTP só via backend server-side.
  throw new Error('Backend de e-mail não configurado (VITE_EMAIL_BACKEND_URL). Gravação de SMTP indisponível no cliente.');
};

const invokeSmtpFunction = async (body: Record<string, unknown>) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (emailBackendUrl) {
    const backendPath = body.action === 'send_test_email' ? '/api/email/send-test' : '/api/email/test-connection';
    const backendPayload = body.action === 'send_test_email'
      ? { toEmail: body.toEmail }
      : {};

    const response = await fetch(`${emailBackendUrl}${backendPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify(backendPayload),
    });

    const payload = await response.json().catch(() => ({}));
    const rawMessage = payload?.message || payload?.error;
    const hint = payload?.hint;

    return {
      success: response.ok && Boolean(payload?.success),
      message: hint && rawMessage
        ? `${rawMessage} ${hint}`
        : String(rawMessage || hint || `Falha ao chamar o backend de e-mail (${response.status})`),
    };
  }

  const response = await fetch(`${supabaseFunctionsUrl}/test-smtp-settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const rawMessage = payload?.message || payload?.error;
    const hint = payload?.hint;

    return {
      success: false,
      message: hint && rawMessage
        ? `${rawMessage} ${hint}`
        : String(rawMessage || hint || `Falha ao chamar a edge function (${response.status})`),
    };
  }

  const rawMessage = payload?.message;
  const hint = payload?.hint;

  return {
    success: Boolean(payload?.success),
    message: hint && rawMessage ? `${rawMessage} ${hint}` : String(rawMessage || hint || 'Teste concluido'),
  };
};

export const testSMTPConnection = async (): Promise<{ success: boolean; message: string }> => {
  return invokeSmtpFunction({ action: 'connection' });
};

export const sendTestEmail = async (toEmail: string): Promise<{ success: boolean; message: string }> => {
  return invokeSmtpFunction({ action: 'send_test_email', toEmail });
};

export const sendPriceDropEmail = async (
  to: string,
  _userName: string,
  _adTitle: string,
  _adId: string,
  _oldPrice: number,
  _newPrice: number,
  _percentDrop: number
): Promise<{ success: boolean; message: string }> => {
  return sendTestEmail(to);
};

export const validateSMTPConfig = (config: Partial<SMTPConfig>): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!config.host || config.host.trim() === '') {
    errors.push('Host SMTP e obrigatorio');
  }

  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.push('Porta deve estar entre 1 e 65535');
  }

  if (!config.user || config.user.trim() === '') {
    errors.push('Usuario (e-mail) e obrigatorio');
  }

  if (!config.password || config.password.trim() === '') {
    errors.push('Senha e obrigatoria');
  }

  if (!config.fromEmail || !config.fromEmail.includes('@')) {
    errors.push('E-mail do remetente invalido');
  }

  if (!config.fromName || config.fromName.trim() === '') {
    errors.push('Nome do remetente e obrigatorio');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
