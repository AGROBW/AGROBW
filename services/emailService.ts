import { SMTPConfig } from '../types';
import { supabase } from '../src/lib/supabaseClient';

const SMTP_CONFIG_ID = 'smtp_config_1';
const configuredEmailBackendUrl = import.meta.env.VITE_EMAIL_BACKEND_URL?.replace(/\/$/, '');

const isLocalHostname = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1';

const resolveEmailBackendBaseUrl = () => {
  if (typeof window === 'undefined') {
    return configuredEmailBackendUrl || '';
  }

  const currentOrigin = window.location.origin.replace(/\/$/, '');
  if (!configuredEmailBackendUrl) {
    return '';
  }

  try {
    const targetUrl = new URL(configuredEmailBackendUrl);
    if (targetUrl.origin === currentOrigin) {
      return '';
    }

    // Em desenvolvimento local, permitimos backend separado (ex.: localhost:4010).
    if (isLocalHostname(window.location.hostname) && isLocalHostname(targetUrl.hostname)) {
      return targetUrl.origin;
    }
  } catch {
    return '';
  }

  // Em produção, evita domínio hardcoded/antigo e força uso do mesmo host atual.
  return '';
};

const emailBackendBaseUrl = resolveEmailBackendBaseUrl();
const buildEmailBackendUrl = (path: string) => `${emailBackendBaseUrl}${path}`;

const getAccessToken = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
};

const fetchEmailBackend = async (path: string, init: RequestInit = {}) => {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${accessToken}`);

  return fetch(buildEmailBackendUrl(path), {
    ...init,
    headers,
  });
};

export const getSMTPConfig = async (): Promise<SMTPConfig | null> => {
  const response = await fetchEmailBackend('/api/email/settings', { method: 'GET' });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message || `Falha ao carregar configuracao SMTP (${response.status})`);
  }

  return payload?.data ? (payload.data as SMTPConfig) : null;
};

export const saveSMTPConfig = async (config: SMTPConfig): Promise<void> => {
  const response = await fetchEmailBackend('/api/email/settings', {
    method: 'POST',
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
};

const invokeSmtpFunction = async (body: Record<string, unknown>) => {
  const backendPath = body.action === 'send_test_email'
    ? '/api/email/send-test'
    : '/api/email/test-connection';

  const backendPayload = body.action === 'send_test_email'
    ? { toEmail: body.toEmail }
    : {};

  const response = await fetchEmailBackend(backendPath, {
    method: 'POST',
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
