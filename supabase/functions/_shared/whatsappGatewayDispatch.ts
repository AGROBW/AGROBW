import {
  buildWhatsappGatewayUrl,
  createWhatsappGatewayAuthHeaders,
  createWhatsappGatewayTransactionalCardPayload,
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
      idempotencyKey: string;
      recipientPhone: string;
      message: string;
      source: string;
      eventType: string;
    }
  | {
      kind: 'transactional_card';
      requestId: string;
      idempotencyKey: string;
      recipientPhone: string;
      imageUrl: string;
      message: string;
      actionLabel: string;
      actionUrl: string;
      fallback: string;
      source: string;
      eventType: string;
    };

export interface WhatsappGatewayDispatchResult {
  ok: boolean;
  httpStatus: number;
  requestId: string;
}

export const isAllowedWhatsappCardImageUrl = (value: string) => {
  try {
    const imageUrl = new URL(value);
    const decodedPath = decodeURIComponent(imageUrl.pathname);
    return imageUrl.protocol === 'https:'
      && imageUrl.hostname === 'dockpbyzrvgewgdoaibn.supabase.co'
      && imageUrl.pathname.startsWith('/storage/v1/object/public/ads-images/')
      && decodedPath.startsWith('/storage/v1/object/public/ads-images/')
      && !decodedPath.split('/').includes('..')
      && /\.(?:jpe?g|png|webp)$/i.test(decodedPath);
  } catch {
    return false;
  }
};

export const isAllowedWhatsappCardActionUrl = (value: string) => {
  try {
    const actionUrl = new URL(value);
    return actionUrl.protocol === 'https:'
      && (actionUrl.hostname === 'agrobw.com.br' || actionUrl.hostname.endsWith('.agrobw.com.br'));
  } catch {
    return false;
  }
};

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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.requestId)) {
      throw new Error('INVALID_REQUEST_ID');
    }
    if (!/^[1-9]\d{9,14}$/.test(request.recipientPhone)) throw new Error('INVALID_RECIPIENT_PHONE');
    if (typeof request.eventType !== 'string' || !request.eventType.trim() || request.eventType.length > 80) {
      throw new Error('INVALID_EVENT_TYPE');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.idempotencyKey)) {
      throw new Error('INVALID_IDEMPOTENCY_KEY');
    }
    if (!request.message.trim() || request.message.length > (request.kind === 'transactional_card' ? 1024 : 1800)) {
      throw new Error('INVALID_MESSAGE');
    }
    if (request.kind === 'transactional_card') {
      if (!isAllowedWhatsappCardImageUrl(request.imageUrl)) throw new Error('INVALID_CARD_IMAGE_URL');
      if (!isAllowedWhatsappCardActionUrl(request.actionUrl)) throw new Error('INVALID_CARD_ACTION_URL');
      if (!request.actionLabel.trim() || request.actionLabel.length > 20) throw new Error('INVALID_CARD_ACTION_LABEL');
      if (!request.fallback.trim() || request.fallback.length > 1800) throw new Error('INVALID_CARD_FALLBACK');
    }
  }

  const payload = isHealth
    ? null
    : request.kind === 'transactional_card'
      ? createWhatsappGatewayTransactionalCardPayload({
          requestId: request.requestId,
          idempotencyKey: request.idempotencyKey,
          recipientPhone: request.recipientPhone,
          imageUrl: request.imageUrl,
          message: request.message,
          actionLabel: request.actionLabel,
          actionUrl: request.actionUrl,
          fallback: request.fallback,
          source: request.source,
          eventType: request.eventType,
        })
      : createWhatsappGatewayTextPayload({
        requestId: request.requestId,
        idempotencyKey: request.idempotencyKey,
        recipientPhone: request.recipientPhone,
        message: request.message,
        source: request.source,
        eventType: request.eventType,
      });
  const serializedBody = payload ? JSON.stringify(payload) : '';
  if (new TextEncoder().encode(serializedBody).byteLength > 32_768) throw new Error('PAYLOAD_TOO_LARGE');
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
      'Content-Type': 'application/json; charset=utf-8',
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
