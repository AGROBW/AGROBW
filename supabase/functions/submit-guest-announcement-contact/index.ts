import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import {
  handleCorsPreflightBrowser,
  jsonResponseWithCors,
} from '../_shared/cors.ts';
import {
  normalizeGuestContactInput,
  type GuestContactInput,
} from './core.ts';

const getClientIp = (req: Request) => {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return req.headers.get('cf-connecting-ip')?.trim() || forwarded || '';
};

const hmacHex = async (secret: string, value: string) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const verifyCaptcha = async (input: GuestContactInput, remoteIp: string) => {
  const secretName = input.captchaProvider === 'turnstile'
    ? 'TURNSTILE_SECRET_KEY'
    : 'HCAPTCHA_SECRET_KEY';
  const secret = Deno.env.get(secretName);
  if (!secret) return { success: false, unavailable: true };

  const endpoint = input.captchaProvider === 'turnstile'
    ? 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    : 'https://api.hcaptcha.com/siteverify';
  const payload = new URLSearchParams({
    secret,
    response: input.captchaToken,
  });
  if (remoteIp) payload.set('remoteip', remoteIp);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    return { success: response.ok && result?.success === true, unavailable: false };
  } catch (error) {
    console.error('[guest-contact] captcha verification failed', error);
    return { success: false, unavailable: true };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightBrowser(req);
  if (req.method !== 'POST') {
    return jsonResponseWithCors(req, { success: false, error: 'Metodo nao permitido.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const hashSecret = Deno.env.get('GUEST_CONTACT_HASH_SECRET');
    if (!supabaseUrl || !serviceRoleKey || !hashSecret) {
      return jsonResponseWithCors(req, { success: false, error: 'Servico temporariamente indisponivel.' }, 503);
    }

    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 16_384) {
      return jsonResponseWithCors(req, { success: false, error: 'Dados enviados excedem o limite.' }, 413);
    }

    const input = normalizeGuestContactInput(await req.json().catch(() => null));
    if (!input) {
      return jsonResponseWithCors(req, { success: false, error: 'Revise os dados informados.' }, 400);
    }

    const clientIp = getClientIp(req);
    if (!clientIp) {
      return jsonResponseWithCors(req, { success: false, error: 'Nao foi possivel validar a origem do contato.' }, 400);
    }

    const captcha = await verifyCaptcha(input, clientIp);
    if (!captcha.success) {
      const status = captcha.unavailable ? 503 : 400;
      const error = captcha.unavailable
        ? 'A verificacao de seguranca esta indisponivel. Tente novamente.'
        : 'Verificacao de seguranca invalida ou expirada.';
      return jsonResponseWithCors(req, { success: false, error }, status);
    }

    const emailHash = await hmacHex(hashSecret, input.email);
    const ipHash = await hmacHex(hashSecret, clientIp);
    const dedupeHash = await hmacHex(
      hashSecret,
      `${input.announcementId}:${input.email}:${input.message.toLowerCase()}`,
    );

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabaseAdmin.rpc('create_guest_announcement_contact', {
      p_announcement_id: input.announcementId,
      p_visitor_name: input.name,
      p_visitor_email: input.email,
      p_visitor_phone: input.phone,
      p_message: input.message,
      p_email_hash: emailHash,
      p_ip_hash: ipHash,
      p_dedupe_hash: dedupeHash,
      p_user_agent: input.userAgent,
    });

    if (error) {
      if (error.message?.includes('GUEST_CONTACT_RATE_LIMITED')) {
        return jsonResponseWithCors(req, {
          success: false,
          error: 'Muitas tentativas de contato. Aguarde antes de tentar novamente.',
        }, 429);
      }
      if (error.message?.includes('GUEST_CONTACT_ANNOUNCEMENT_UNAVAILABLE')) {
        return jsonResponseWithCors(req, {
          success: false,
          error: 'Este anuncio nao aceita novos contatos.',
        }, 409);
      }
      console.error('[guest-contact] database error', error);
      return jsonResponseWithCors(req, { success: false, error: 'Nao foi possivel entregar seu contato.' }, 500);
    }

    const result = Array.isArray(data) ? data[0] : data;
    return jsonResponseWithCors(req, {
      success: true,
      status: result?.created === false ? 'already_received' : 'received',
    }, result?.created === false ? 200 : 201);
  } catch (error) {
    console.error('[guest-contact] unexpected error', error);
    return jsonResponseWithCors(req, { success: false, error: 'Nao foi possivel entregar seu contato.' }, 500);
  }
});
