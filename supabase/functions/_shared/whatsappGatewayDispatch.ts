import {
  buildWhatsappGatewayUrl,
  createWhatsappGatewayAuthHeaders,
  createWhatsappGatewayTextPayload,
  isAllowedWhatsappGatewayHostname,
  isBlockedWhatsappGatewayAddress,
  type WhatsappGatewayAuthType,
} from './whatsappGateway.ts';

export interface WhatsappGatewayRuntimeSettings {
  baseUrl: string;
  sendPath: string;
  healthPath: string;
  authType: WhatsappGatewayAuthType;
  authSecret: string;
}

export type WhatsappGatewayDispatchRequest =
  | { kind: 'health'; requestId: string }
  | {
      kind: 'text';
      requestId: string;
      recipientPhone: string;
      message: string;
      source: string;
      eventType?: string | null;
    };

export interface WhatsappGatewayDispatchResult {
  ok: boolean;
  httpStatus: number;
  requestId: string;
}

const resolvePublicHostname = async (hostname: string) => {
  const resolved = new Set<string>();
  let timedOut = false;
  for (const recordType of ['A', 'AAAA'] as const) {
    let timeoutId: number | undefined;
    try {
      const addresses = await Promise.race([
        Deno.resolveDns(hostname, recordType),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('GATEWAY_DNS_TIMEOUT')), 3000);
        }),
      ]);
      addresses.forEach((address) => resolved.add(address));
    } catch (error) {
      if (error instanceof Error && error.message === 'GATEWAY_DNS_TIMEOUT') timedOut = true;
      // A hostname does not need to publish both record types.
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  if (resolved.size === 0) {
    throw new Error(timedOut ? 'GATEWAY_DNS_TIMEOUT' : 'GATEWAY_DNS_UNAVAILABLE');
  }
  if ([...resolved].some(isBlockedWhatsappGatewayAddress)) {
    throw new Error('GATEWAY_PRIVATE_ADDRESS_BLOCKED');
  }
};

export const validateWhatsappGatewayDestination = async (
  settings: WhatsappGatewayRuntimeSettings,
  kind: WhatsappGatewayDispatchRequest['kind'],
) => {
  const path = kind === 'health' ? settings.healthPath : settings.sendPath;
  const endpoint = buildWhatsappGatewayUrl(settings.baseUrl, path);
  const hostname = new URL(endpoint).hostname;
  if (!isAllowedWhatsappGatewayHostname(hostname, Deno.env.get('WHATSAPP_GATEWAY_ALLOWED_HOSTS'))) {
    throw new Error('GATEWAY_HOST_NOT_ALLOWED');
  }
  await resolvePublicHostname(hostname);
  return endpoint;
};

export const dispatchWhatsappGatewayRequest = async (
  settings: WhatsappGatewayRuntimeSettings,
  request: WhatsappGatewayDispatchRequest,
): Promise<WhatsappGatewayDispatchResult> => {
  const isHealth = request.kind === 'health';
  const endpoint = await validateWhatsappGatewayDestination(settings, request.kind);

  if (!isHealth) {
    if (!/^[1-9]\d{9,14}$/.test(request.recipientPhone)) throw new Error('INVALID_RECIPIENT_PHONE');
    if (!request.message.trim() || request.message.length > 1800) throw new Error('INVALID_MESSAGE');
  }

  const payload = isHealth
    ? null
    : createWhatsappGatewayTextPayload({
        requestId: request.requestId,
        recipientPhone: request.recipientPhone,
        message: request.message,
        source: request.source,
        eventType: request.eventType,
      });
  const serializedBody = payload ? JSON.stringify(payload) : '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const authHeaders = await createWhatsappGatewayAuthHeaders(
    settings.authType,
    settings.authSecret,
    serializedBody,
    timestamp,
  );

  const upstreamResponse = await fetch(endpoint, {
    method: isHealth ? 'GET' : 'POST',
    redirect: 'error',
    headers: {
      ...authHeaders,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Request-Id': request.requestId,
    },
    body: payload ? serializedBody : undefined,
    signal: AbortSignal.timeout(8000),
  });
  await upstreamResponse.body?.cancel().catch(() => undefined);

  return {
    ok: upstreamResponse.ok,
    httpStatus: upstreamResponse.status,
    requestId: request.requestId,
  };
};
