import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeadersInternal } from '../_shared/cors.ts';
import {
  dispatchWhatsappGatewayRequest,
  validateWhatsappGatewayDestination,
} from '../_shared/whatsappGatewayDispatch.ts';

const corsHeaders = getCorsHeadersInternal();
const MAX_REQUEST_BYTES = 2048;
const MAX_BATCH_RUNTIME_MS = 90_000;
const MIN_REMAINING_RUNTIME_MS = 12_000;

type WhatsappGatewayJob = {
  id: string;
  event_type: string;
  recipient_kind: 'admin_default' | 'user';
  recipient_user_id: string | null;
  message_body: string;
  link_path: string | null;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const timingSafeEqual = (expected: string, received: string) => {
  let mismatch = expected.length === received.length ? 0 : 1;
  const length = Math.max(expected.length, received.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (expected.charCodeAt(index) || 0) ^ (received.charCodeAt(index) || 0);
  }
  return mismatch === 0;
};

const clampLimit = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(25, Math.max(1, Math.floor(parsed)));
};

const normalizeUserPhone = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  if (/^[1-9]\d{9,14}$/.test(digits)) return digits;
  return null;
};

const isRetryableStatus = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500;

serve(async (req) => {
  const batchStartedAt = Date.now();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Metodo nao permitido.' }, 405);

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ success: false, error: 'Requisicao excede o limite permitido.' }, 413);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('WHATSAPP_GATEWAY_CRON_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
    return jsonResponse({ success: false, error: 'Configuracao indisponivel.' }, 500);
  }

  const requestSecret = req.headers.get('x-cron-secret') || '';
  if (!requestSecret || !timingSafeEqual(cronSecret, requestSecret)) {
    return jsonResponse({ success: false, error: 'Nao autorizado.' }, 401);
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ success: false, error: 'Requisicao excede o limite permitido.' }, 413);
  }
  let body: { limit?: unknown } = {};
  try {
    body = rawBody ? JSON.parse(rawBody) as { limit?: unknown } : {};
  } catch {
    return jsonResponse({ success: false, error: 'Corpo da requisicao invalido.' }, 400);
  }
  const limit = clampLimit(body?.limit);
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from('whatsapp_gateway_settings')
    .select('base_url, send_path, health_path, auth_type, auth_secret, default_recipient_phone, is_enabled')
    .eq('id', '00000000-0000-0000-0000-000000000020')
    .maybeSingle();

  if (settingsError) {
    console.error('[sync-whatsapp-gateway-jobs] settings lookup failed', settingsError.code);
    return jsonResponse({ success: false, error: 'Nao foi possivel carregar a configuracao.' }, 500);
  }
  if (!settings) {
    return jsonResponse({ success: false, error: 'Central WhatsApp nao configurada.' }, 409);
  }
  if (!settings.is_enabled) {
    const [fallbackResult, purgeResult] = await Promise.all([
      supabaseAdmin.rpc('move_pending_whatsapp_seller_jobs_to_legacy'),
      supabaseAdmin.rpc('purge_terminal_whatsapp_gateway_jobs'),
    ]);
    const { data: fallbackMoved, error: fallbackError } = fallbackResult;
    if (fallbackError) {
      console.error('[sync-whatsapp-gateway-jobs] disabled fallback failed', fallbackError.code);
      return jsonResponse({ success: false, disabled: true, error: 'Fallback da Meta indisponivel.' }, 500);
    }
    if (purgeResult.error) {
      console.error('[sync-whatsapp-gateway-jobs] disabled retention purge failed', purgeResult.error.code);
      return jsonResponse({ success: false, disabled: true, error: 'Retencao da fila indisponivel.' }, 500);
    }
    return jsonResponse({
      success: true,
      disabled: true,
      processedCount: 0,
      fallbackMovedCount: Number(fallbackMoved) || 0,
    });
  }
  if (!settings.base_url || !settings.auth_secret) {
    return jsonResponse({ success: false, error: 'Configuracao incompleta da Central WhatsApp.' }, 409);
  }

  const gatewaySettings = {
    baseUrl: settings.base_url,
    sendPath: settings.send_path,
    healthPath: settings.health_path,
    authType: settings.auth_type,
    authSecret: settings.auth_secret,
  };
  try {
    await validateWhatsappGatewayDestination(gatewaySettings, 'text');
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'GATEWAY_PREFLIGHT_FAILED';
    console.error('[sync-whatsapp-gateway-jobs] gateway preflight failed', errorCode);
    const configurationError = errorCode === 'GATEWAY_HOST_NOT_ALLOWED'
      || errorCode === 'UNSAFE_GATEWAY_BASE_URL'
      || errorCode === 'UNSAFE_GATEWAY_PATH'
      || errorCode === 'GATEWAY_PRIVATE_ADDRESS_BLOCKED';
    return jsonResponse({
      success: false,
      error: configurationError
        ? 'Destino do gateway recusado pela politica de seguranca.'
        : 'Nao foi possivel validar o destino do gateway.',
      errorCode,
    }, configurationError ? 409 : 503);
  }

  const workerId = crypto.randomUUID();
  const { data: claimedRows, error: claimError } = await supabaseAdmin.rpc('claim_whatsapp_gateway_jobs', {
    p_limit: limit,
    p_worker_id: workerId,
  });
  if (claimError) {
    console.error('[sync-whatsapp-gateway-jobs] claim failed', claimError.code);
    return jsonResponse({ success: false, error: 'Nao foi possivel reservar a fila.' }, 500);
  }

  const jobs = (Array.isArray(claimedRows) ? claimedRows : []) as WhatsappGatewayJob[];
  const appUrl = (Deno.env.get('APP_URL') || 'https://agrobw.com.br').replace(/\/$/, '');
  let sentCount = 0;
  let retryCount = 0;
  let deadLetterCount = 0;
  let transitionErrorCount = 0;
  let processedCount = 0;
  let deferredCount = 0;

  for (let jobIndex = 0; jobIndex < jobs.length; jobIndex += 1) {
    if (Date.now() - batchStartedAt > MAX_BATCH_RUNTIME_MS - MIN_REMAINING_RUNTIME_MS) {
      const deferredJobIds = jobs.slice(jobIndex).map((job) => job.id);
      const { data: released, error: releaseError } = await supabaseAdmin.rpc(
        'release_whatsapp_gateway_jobs',
        { p_worker_id: workerId, p_job_ids: deferredJobIds },
      );
      if (releaseError || Number(released) !== deferredJobIds.length) {
        console.error('[sync-whatsapp-gateway-jobs] release transition failed', releaseError?.code || 'LEASE_LOST');
        transitionErrorCount += 1;
      } else {
        deferredCount = deferredJobIds.length;
      }
      break;
    }

    const remainingJobIds = jobs.slice(jobIndex).map((item) => item.id);
    const { data: runtimeSettings, error: runtimeSettingsError } = await supabaseAdmin
      .from('whatsapp_gateway_settings')
      .select('is_enabled')
      .eq('id', '00000000-0000-0000-0000-000000000020')
      .maybeSingle();
    if (runtimeSettingsError || !runtimeSettings) {
      console.error('[sync-whatsapp-gateway-jobs] runtime settings check failed', runtimeSettingsError?.code);
      const { error: releaseError } = await supabaseAdmin.rpc('release_whatsapp_gateway_jobs', {
        p_worker_id: workerId,
        p_job_ids: remainingJobIds,
      });
      if (releaseError) console.error('[sync-whatsapp-gateway-jobs] release after settings failure failed', releaseError.code);
      transitionErrorCount += 1;
      break;
    }
    if (!runtimeSettings.is_enabled) {
      const { data: released, error: releaseError } = await supabaseAdmin.rpc('release_whatsapp_gateway_jobs', {
        p_worker_id: workerId,
        p_job_ids: remainingJobIds,
      });
      if (releaseError || Number(released) !== remainingJobIds.length) {
        console.error('[sync-whatsapp-gateway-jobs] release after disable failed', releaseError?.code || 'LEASE_LOST');
        transitionErrorCount += 1;
        break;
      }
      deferredCount += remainingJobIds.length;
      const { error: fallbackError } = await supabaseAdmin.rpc('move_pending_whatsapp_seller_jobs_to_legacy');
      if (fallbackError) {
        console.error('[sync-whatsapp-gateway-jobs] fallback after disable failed', fallbackError.code);
        transitionErrorCount += 1;
      }
      break;
    }

    const job = jobs[jobIndex];
    processedCount += 1;
    let recipientPhone = settings.default_recipient_phone as string | null;
    if (job.recipient_kind === 'user') {
      if (!job.recipient_user_id) {
        recipientPhone = null;
      } else {
        const { data: recipient, error: recipientError } = await supabaseAdmin
          .from('users')
          .select('phone')
          .eq('id', job.recipient_user_id)
          .maybeSingle();
        if (recipientError) {
          console.error('[sync-whatsapp-gateway-jobs] recipient lookup failed', recipientError.code);
          const { data: nextStatus, error: failError } = await supabaseAdmin.rpc('fail_whatsapp_gateway_job', {
            p_job_id: job.id,
            p_worker_id: workerId,
            p_error_code: 'RECIPIENT_LOOKUP_FAILED',
            p_http_status: null,
            p_retryable: true,
          });
          if (failError || !nextStatus) {
            transitionErrorCount += 1;
          } else if (nextStatus === 'retry') {
            retryCount += 1;
          } else {
            deadLetterCount += 1;
          }
          continue;
        }
        recipientPhone = normalizeUserPhone(recipient?.phone);
      }
    }

    if (!recipientPhone) {
      const { error: transitionError } = await supabaseAdmin.rpc('fail_whatsapp_gateway_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error_code: 'RECIPIENT_UNAVAILABLE',
        p_http_status: null,
        p_retryable: false,
      });
      if (transitionError) {
        console.error('[sync-whatsapp-gateway-jobs] recipient failure transition failed', transitionError.code);
        transitionErrorCount += 1;
      } else {
        deadLetterCount += 1;
      }
      continue;
    }

    const linkSuffix = job.link_path ? `\n\nAcessar: ${appUrl}${job.link_path}` : '';
    const maxBodyLength = Math.max(1, 1800 - linkSuffix.length);
    const message = `${job.message_body.slice(0, maxBodyLength)}${linkSuffix}`;
    const requestId = job.id;

    try {
      const result = await dispatchWhatsappGatewayRequest(
        gatewaySettings,
        {
          kind: 'text',
          requestId,
          recipientPhone,
          message,
          source: 'bwagro_queue',
          eventType: job.event_type,
        },
      );

      if (result.ok) {
        const { data: completed, error: completeError } = await supabaseAdmin.rpc('complete_whatsapp_gateway_job', {
          p_job_id: job.id,
          p_worker_id: workerId,
          p_http_status: result.httpStatus,
          p_provider_message_id: null,
        });
        if (completeError || !completed) {
          console.error('[sync-whatsapp-gateway-jobs] completion transition failed', completeError?.code || 'LEASE_LOST');
          transitionErrorCount += 1;
        } else {
          sentCount += 1;
        }
        continue;
      }

      const retryable = isRetryableStatus(result.httpStatus);
      const { data: nextStatus, error: failError } = await supabaseAdmin.rpc('fail_whatsapp_gateway_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error_code: `UPSTREAM_HTTP_${result.httpStatus}`,
        p_http_status: result.httpStatus,
        p_retryable: retryable,
      });
      if (failError || !nextStatus) {
        console.error('[sync-whatsapp-gateway-jobs] HTTP failure transition failed', failError?.code || 'LEASE_LOST');
        transitionErrorCount += 1;
      } else if (nextStatus === 'retry') {
        retryCount += 1;
      } else {
        deadLetterCount += 1;
      }
    } catch (error) {
      const errorCode = error instanceof Error ? error.message.slice(0, 80) : 'NETWORK_ERROR';
      const securityError = errorCode === 'GATEWAY_PRIVATE_ADDRESS_BLOCKED'
        || errorCode === 'UNSAFE_GATEWAY_BASE_URL'
        || errorCode === 'UNSAFE_GATEWAY_PATH'
        || errorCode === 'GATEWAY_HOST_NOT_ALLOWED';
      const terminalPayloadError = errorCode === 'INVALID_RECIPIENT_PHONE'
        || errorCode === 'INVALID_MESSAGE';
      const persistedErrorCode = securityError || terminalPayloadError
        || errorCode === 'GATEWAY_DNS_UNAVAILABLE'
        || errorCode === 'GATEWAY_DNS_TIMEOUT'
        ? errorCode
        : 'NETWORK_ERROR';
      const { data: nextStatus, error: failError } = await supabaseAdmin.rpc('fail_whatsapp_gateway_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error_code: persistedErrorCode,
        p_http_status: null,
        p_retryable: !securityError && !terminalPayloadError,
      });
      if (failError || !nextStatus) {
        console.error('[sync-whatsapp-gateway-jobs] network failure transition failed', failError?.code || 'LEASE_LOST');
        transitionErrorCount += 1;
      } else if (nextStatus === 'retry') {
        retryCount += 1;
      } else {
        deadLetterCount += 1;
      }
    }
  }

  const { error: purgeError } = await supabaseAdmin.rpc('purge_terminal_whatsapp_gateway_jobs');
  if (purgeError) {
    console.error('[sync-whatsapp-gateway-jobs] retention purge failed', purgeError.code);
    transitionErrorCount += 1;
  }

  return jsonResponse({
    success: transitionErrorCount === 0,
    claimedCount: jobs.length,
    processedCount,
    deferredCount,
    sentCount,
    retryCount,
    deadLetterCount,
    transitionErrorCount,
  }, transitionErrorCount === 0 ? 200 : 500);
});
