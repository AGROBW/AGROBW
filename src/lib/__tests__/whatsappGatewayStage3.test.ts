import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createWhatsappGatewayTextPayload,
  createWhatsappGatewayTransactionalCardPayload,
} from '../../../supabase/functions/_shared/whatsappGateway';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('sql/create_whatsapp_central_stage3_2026-09-14.sql');
const rollback = read('sql/ROLLBACK_create_whatsapp_central_stage3_2026-09-14.sql');
const validation = read('sql/VALIDATE_whatsapp_central_stage3_2026-09-14.sql');
const worker = read('supabase/functions/sync-whatsapp-gateway-jobs/index.ts');
const dispatcher = read('supabase/functions/_shared/whatsappGatewayDispatch.ts');
const config = read('supabase/config.toml');

describe('Central WhatsApp stage 3 queue', () => {
  it('cria fila idempotente, privada e sem copiar segredo ou telefone', () => {
    expect(migration).toContain('unique index if not exists idx_whatsapp_gateway_jobs_event_unique');
    expect(migration).toContain('idx_whatsapp_gateway_jobs_idempotency_key');
    expect(migration).toContain('idx_whatsapp_gateway_jobs_moderation_cycle_unique');
    expect(migration).toContain('whatsapp_announcement_moderation_state');
    expect(migration).toContain('after insert or update on public.announcements');
    expect(migration).not.toContain('create trigger trg_track_whatsapp_announcement_moderation_cycle');
    expect(migration).toContain('on conflict (event_type, event_key) do nothing');
    expect(migration).toContain('force row level security');
    expect(migration).toContain('revoke all on table public.whatsapp_gateway_jobs from public, anon, authenticated');
    expect(migration).not.toMatch(/whatsapp_gateway_jobs[\s\S]{0,900}(auth_secret|recipient_phone)/);
  });

  it('reserva lotes atomicamente e recupera leases abandonados', () => {
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain("locked_at < now() - interval '10 minutes'");
    expect(migration).toContain("last_error_code = 'LEASE_EXPIRED'");
    expect(migration).toContain("last_error_code = 'ADMIN_EVENT_EXPIRED'");
    expect(migration).toContain('attempts = jobs.attempts + 1');
    expect(migration).toContain("else 'dead_letter'");
    expect(migration).toContain('power(2, greatest(v_job.attempts - 1, 0))');
  });

  it('limita notificacoes de suporte com horario confiavel e limite global', () => {
    expect(migration).toContain('pg_try_advisory_xact_lock');
    expect(migration).not.toContain('perform pg_advisory_xact_lock');
    expect(migration).toContain('for v_limit_lock_attempt in 1..20 loop');
    expect(migration).toContain('pg_sleep(0.01)');
    expect(migration).toContain('SUPPORT_RATE_LIMIT_BUSY');
    expect(migration).toContain('if v_recent_jobs >= 5 then');
    expect(migration).toContain('floor(extract(epoch from now()) / 600)');
    expect(migration).not.toContain('floor(extract(epoch from new.created_at) / 600)');
    expect(migration).toContain('Falha isolada no limite WhatsApp do suporte');
    expect(migration).toContain("'admin_support_rate_limit'");
  });

  it('mantem diagnostico privado para falhas antes da criacao do job', () => {
    expect(migration).toContain('whatsapp_gateway_enqueue_failures');
    expect(migration).toContain('enqueue_failure_count bigint');
    expect(migration).toContain('revoke all on table public.whatsapp_gateway_enqueue_failures from public, anon, authenticated');
    expect(validation).toContain('autenticado_sem_diagnostico');
    expect(migration).toContain('revoke all on sequence public.whatsapp_gateway_enqueue_failures_id_seq');
    expect(validation).toContain('sequencia_diagnostico_privada');
  });

  it('cobre os cinco eventos administrativos previstos', () => {
    [
      'admin_announcement_pending',
      'admin_edit_request_pending',
      'admin_announcement_reported',
      'admin_support_message',
      'admin_store_campaign_pending',
    ].forEach((eventType) => expect(migration).toContain(eventType));
    [
      'trg_queue_whatsapp_admin_announcement',
      'trg_queue_whatsapp_admin_edit_request',
      'trg_queue_whatsapp_admin_support_message',
      'trg_queue_whatsapp_admin_store_campaign',
    ].forEach((trigger) => expect(migration).toContain(trigger));
  });

  it('separa RPCs administrativas das operacoes exclusivas do worker', () => {
    expect(migration).toContain('grant execute on function public.get_whatsapp_gateway_templates_admin_safe() to authenticated');
    expect(migration).toContain('grant execute on function public.claim_whatsapp_gateway_jobs(integer, uuid) to service_role');
    expect(migration).toContain("if coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain('auth.uid() is null or not public.is_admin()');
    expect(migration).not.toContain('grant execute on function public.claim_whatsapp_gateway_jobs(integer, uuid) to authenticated');
  });

  it('inclui rollback e validacao operacional', () => {
    expect(rollback).toContain('drop trigger if exists trg_queue_whatsapp_admin_announcement');
    expect(rollback).toContain('drop table if exists public.whatsapp_gateway_jobs');
    expect(validation).toContain('fila_sem_segredo_ou_telefone');
    expect(validation).toContain('worker_reserva_fila');
    expect(rollback).toContain('Rollback recusado: remova primeiro a etapa 4');
  });
});

describe('Central WhatsApp stage 3 worker', () => {
  it('exige segredo interno, limita entrada e usa transporte endurecido', () => {
    expect(worker).toContain("Deno.env.get('WHATSAPP_GATEWAY_CRON_SECRET')");
    expect(worker).toContain("req.headers.get('x-cron-secret')");
    expect(worker).toContain('timingSafeEqual');
    expect(worker).toContain('MAX_REQUEST_BYTES');
    expect(worker).toContain('MAX_BATCH_RUNTIME_MS = 90_000');
    expect(worker).toContain('return Math.min(25');
    expect(worker).toMatch(/supabaseAdmin\.rpc\(\r?\n\s*'release_whatsapp_gateway_jobs'/);
    expect(worker).toContain('dispatchWhatsappGatewayRequest');
    expect(worker).toContain("CANONICAL_APP_URL = 'https://agrobw.com.br'");
    expect(worker).toContain('idempotencyKey: job.idempotency_key');
    expect(worker).toContain("kind: 'transactional_card'");
    expect(worker).toContain("await validateWhatsappGatewayDestination(gatewaySettings, 'text')");
    expect(worker.indexOf("await validateWhatsappGatewayDestination(gatewaySettings, 'text')"))
      .toBeLessThan(worker.indexOf("supabaseAdmin.rpc('claim_whatsapp_gateway_jobs'"));
    expect(worker).not.toContain('await fetch(');
    expect(dispatcher).toContain("redirect: 'error'");
  });

  it('classifica falhas transitorias e registra erros de transicao', () => {
    expect(worker).toContain('status === 408 || status === 425 || status === 429 || status >= 500');
    expect(worker).toContain('transitionErrorCount');
    expect(worker).toContain('p_retryable: !securityError && !terminalPayloadError');
    expect(worker).toContain('RECIPIENT_LOOKUP_FAILED');
    expect(worker).toContain("errorCode === 'INVALID_EVENT_TYPE'");
    expect(worker).toContain('GATEWAY_DNS_UNAVAILABLE');
    expect(dispatcher).toContain("typeof request.eventType !== 'string'");
  });

  it('registra a funcao interna no Supabase', () => {
    expect(config).toContain('[functions.sync-whatsapp-gateway-jobs]');
    expect(config).toMatch(/\[functions\.sync-whatsapp-gateway-jobs\][\s\S]*verify_jwt = false/);
  });

  it('gera payload universal com origem, evento e idempotencia', () => {
    const payload = createWhatsappGatewayTextPayload({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      idempotencyKey: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      recipientPhone: '5564999999999',
      message: 'Novo anuncio',
      source: 'bwagro_queue',
      eventType: 'admin_announcement_pending',
    });
    expect(payload).toMatchObject({
      to: '5564999999999',
      idempotency_key: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      text: { body: 'Novo anuncio' },
      metadata: {
        source: 'bwagro_queue',
        event_type: 'admin_announcement_pending',
      },
    });
  });

  it('gera cartao transacional versionado com fallback e acao', () => {
    const payload = createWhatsappGatewayTransactionalCardPayload({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      idempotencyKey: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      recipientPhone: '5564999999999',
      imageUrl: 'https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/ad.webp',
      message: 'Novo interessado',
      actionLabel: 'Ver mensagem',
      actionUrl: 'https://agrobw.com.br/minha-conta/mensagens?chat=550e8400-e29b-41d4-a716-446655440000',
      fallback: 'Novo interessado. Veja a conversa.',
      source: 'bwagro_queue',
      eventType: 'seller_new_lead',
    });
    expect(payload).toMatchObject({
      version: '2026-09-18',
      type: 'transactional_card',
      image: { url: expect.stringContaining('/ads-images/') },
      action: { type: 'url', label: 'Ver mensagem', url: expect.stringContaining('agrobw.com.br') },
      fallback: { body: 'Novo interessado. Veja a conversa.' },
      metadata: { source: 'bwagro_queue', event_type: 'seller_new_lead' },
    });
  });
});
