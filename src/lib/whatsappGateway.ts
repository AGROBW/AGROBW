export const WHATSAPP_GATEWAY_PROVIDER = 'external_gateway' as const;

export type WhatsappGatewayProvider = 'meta_cloud' | typeof WHATSAPP_GATEWAY_PROVIDER;
export type WhatsappGatewayAuthType = 'bearer' | 'hmac_sha256';

export interface WhatsappGatewaySettings {
  id: string;
  provider: typeof WHATSAPP_GATEWAY_PROVIDER;
  base_url: string | null;
  send_path: string;
  health_path: string;
  auth_type: WhatsappGatewayAuthType;
  auth_secret_configured: boolean;
  default_recipient_phone: string | null;
  is_enabled: boolean;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappGatewaySettingsDraft {
  base_url: string;
  send_path: string;
  health_path: string;
  auth_type: WhatsappGatewayAuthType;
  auth_secret: string;
  default_recipient_phone: string;
  is_enabled: boolean;
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];

export const normalizeWhatsappPhone = (value: string) => value.replace(/\D/g, '');

export const normalizeWhatsappGatewayBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

export const isSafeWhatsappGatewayBaseUrl = (value: string) => {
  const normalized = normalizeWhatsappGatewayBaseUrl(value);
  if (!normalized) return false;

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();

    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.pathname !== '/' || url.search || url.hash) return false;
    if (!hostname.includes('.') || hostname.includes(':')) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) return false;
    return true;
  } catch {
    return false;
  }
};

export const isSafeWhatsappGatewayPath = (value: string) => {
  const normalized = value.trim();
  return /^\/[a-zA-Z0-9/_-]*$/.test(normalized) && !normalized.includes('//');
};

export const validateWhatsappGatewaySettings = (
  draft: WhatsappGatewaySettingsDraft,
  options: { authSecretConfigured?: boolean } = {},
) => {
  const errors: string[] = [];
  const baseUrl = normalizeWhatsappGatewayBaseUrl(draft.base_url);
  const phone = normalizeWhatsappPhone(draft.default_recipient_phone);

  if (baseUrl && !isSafeWhatsappGatewayBaseUrl(baseUrl)) {
    errors.push('Informe uma URL publica HTTPS, sem caminho, credenciais ou endereco de rede privada.');
  }
  if (!isSafeWhatsappGatewayPath(draft.send_path)) {
    errors.push('O endpoint de envio deve ser um caminho seguro iniciado por /.');
  }
  if (!isSafeWhatsappGatewayPath(draft.health_path)) {
    errors.push('O endpoint de saude deve ser um caminho seguro iniciado por /.');
  }
  if (!['bearer', 'hmac_sha256'].includes(draft.auth_type)) {
    errors.push('Selecione um tipo de autenticacao valido.');
  }
  if (phone && (!/^[1-9]\d{9,14}$/.test(phone))) {
    errors.push('Informe o telefone com DDI e apenas 10 a 15 digitos.');
  }

  if (draft.is_enabled) {
    if (!baseUrl) errors.push('Informe a URL da API antes de ativar a integracao.');
    if (!phone) errors.push('Informe o numero de destino antes de ativar a integracao.');
    if (!draft.auth_secret.trim() && !options.authSecretConfigured) {
      errors.push('Informe a credencial da API antes de ativar a integracao.');
    }
  }

  return errors;
};

export const buildWhatsappGatewayEndpoint = (baseUrl: string, path: string) =>
  `${normalizeWhatsappGatewayBaseUrl(baseUrl)}${path.trim()}`;
