export type WhatsappGatewayAdminAction = 'health' | 'test_message';
export type WhatsappGatewayAuthType = 'bearer' | 'hmac_sha256';

export interface WhatsappGatewayConnectionSettings {
  baseUrl: string;
  sendPath: string;
  healthPath: string;
  authType: WhatsappGatewayAuthType;
  authSecret: string;
  recipientPhone: string | null;
}

export const WHATSAPP_GATEWAY_TEST_MESSAGE =
  'Teste de integracao da Central WhatsApp BW Agro. Nenhuma acao e necessaria.';

export const parseWhatsappGatewayAdminAction = (value: unknown): WhatsappGatewayAdminAction | null => {
  if (value === 'health' || value === 'test_message') return value;
  return null;
};

export const isBlockedWhatsappGatewayAddress = (rawAddress: string) => {
  const address = rawAddress.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!address) return true;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) {
    const octets = address.split('.').map(Number);
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
    const [first, second, third] = octets;
    return first === 0
      || first === 10
      || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 0 && (third === 0 || third === 2))
      || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19))
      || (first === 198 && second === 51 && third === 100)
      || (first === 203 && second === 0 && third === 113)
      || first >= 224;
  }

  if (address.includes(':')) {
    const withoutZone = address.split('%', 1)[0];
    let normalized = withoutZone;
    const dottedTail = normalized.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
    if (dottedTail) {
      const octets = dottedTail.split('.').map(Number);
      if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
      normalized = normalized.slice(0, -dottedTail.length)
        + `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    }

    if ((normalized.match(/::/g) || []).length > 1) return true;
    const [leftRaw, rightRaw = ''] = normalized.split('::');
    const left = leftRaw ? leftRaw.split(':') : [];
    const right = rightRaw ? rightRaw.split(':') : [];
    if (![...left, ...right].every((part) => /^[0-9a-f]{1,4}$/.test(part))) return true;
    const missing = 8 - left.length - right.length;
    if ((normalized.includes('::') && missing < 1) || (!normalized.includes('::') && missing !== 0)) return true;
    const hextets = [
      ...left,
      ...Array.from({ length: Math.max(0, missing) }, () => '0'),
      ...right,
    ].map((part) => Number.parseInt(part, 16));
    if (hextets.length !== 8) return true;

    const [first, second] = hextets;
    if (hextets.slice(0, 7).every((part) => part === 0) && hextets[7] <= 1) return true;
    if ((first & 0xfe00) === 0xfc00) return true;
    if ((first & 0xffc0) === 0xfe80) return true;
    if ((first & 0xff00) === 0xff00) return true;
    if (first === 0x2001 && second === 0x0db8) return true;
    if (first === 0x2002) return true;
    if (first === 0x0064 && second === 0xff9b && hextets.slice(2, 6).every((part) => part === 0)) return true;

    const isMapped = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
    const isCompatible = hextets.slice(0, 6).every((part) => part === 0);
    const isTranslated = hextets.slice(0, 4).every((part) => part === 0)
      && hextets[4] === 0xffff
      && hextets[5] === 0;
    if (isMapped || isCompatible || isTranslated) return true;
    return false;
  }

  return true;
};

export const isAllowedWhatsappGatewayHostname = (hostname: string, rawAllowlist: string | null | undefined) => {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!normalizedHostname || !rawAllowlist?.trim()) return false;
  return rawAllowlist
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ''))
    .filter((entry) => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(entry))
    .some((entry) => entry === normalizedHostname);
};

export const buildWhatsappGatewayUrl = (baseUrl: string, path: string) => {
  const base = new URL(baseUrl);
  const hostname = base.hostname.toLowerCase();
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('UNSAFE_GATEWAY_BASE_URL');
  }
  if (!hostname.includes('.') || hostname.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    throw new Error('UNSAFE_GATEWAY_BASE_URL');
  }
  if (!/^\/[A-Za-z0-9/_-]*$/.test(path) || path.includes('//')) {
    throw new Error('UNSAFE_GATEWAY_PATH');
  }
  return `${base.origin}${path}`;
};

const bytesToHex = (value: ArrayBuffer) => Array.from(new Uint8Array(value))
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

export const createWhatsappGatewayAuthHeaders = async (
  authType: WhatsappGatewayAuthType,
  secret: string,
  body: string,
  timestamp: string,
) => {
  if (!secret.trim()) throw new Error('MISSING_GATEWAY_SECRET');

  if (authType === 'bearer') {
    return { Authorization: `Bearer ${secret}` };
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${body}`),
  );

  return {
    'X-BWAgro-Timestamp': timestamp,
    'X-BWAgro-Signature': `sha256=${bytesToHex(signature)}`,
  };
};

export const createWhatsappGatewayTestPayload = (
  requestId: string,
  recipientPhone: string,
) => createWhatsappGatewayTextPayload({
  requestId,
  recipientPhone,
  message: WHATSAPP_GATEWAY_TEST_MESSAGE,
  source: 'bwagro_admin_test',
  eventType: 'message_send',
});

export const createWhatsappGatewayTextPayload = (params: {
  requestId: string;
  recipientPhone: string;
  message: string;
  source: string;
  eventType: string;
}) => ({
  version: '2026-09-14',
  request_id: params.requestId,
  idempotency_key: params.requestId,
  to: params.recipientPhone,
  type: 'text',
  text: { body: params.message },
  metadata: {
    source: params.source,
    event_type: params.eventType,
  },
});
