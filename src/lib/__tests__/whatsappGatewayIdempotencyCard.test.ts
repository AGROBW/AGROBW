import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isAllowedWhatsappCardActionUrl,
  isAllowedWhatsappCardImageUrl,
} from '../../../supabase/functions/_shared/whatsappGatewayDispatch';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('sql/fix_whatsapp_gateway_idempotency_card_2026-09-21.sql');
const validation = read('sql/VALIDATE_fix_whatsapp_gateway_idempotency_card_2026-09-21.sql');
const transactionalValidation = read('sql/VALIDATE_fix_whatsapp_gateway_idempotency_card_transactional_2026-09-21.sql');
const rollback = read('sql/ROLLBACK_fix_whatsapp_gateway_idempotency_card_2026-09-21.sql');
const deployGuide = read('docs/WHATSAPP_IDEMPOTENCY_CARD_DEPLOY_2026-09-21.md');
const worker = read('supabase/functions/sync-whatsapp-gateway-jobs/index.ts');
const dispatcher = read('supabase/functions/_shared/whatsappGatewayDispatch.ts');

describe('WhatsApp gateway idempotency and transactional card patch', () => {
  it('recusa migracao ativa e persiste uma chave UUID por job', () => {
    expect(migration).toContain('Desative a Central WhatsApp antes de aplicar esta correcao');
    expect(migration).toContain('add column if not exists idempotency_key uuid');
    expect(migration).toContain('idx_whatsapp_gateway_jobs_idempotency_key');
    expect(migration).toContain('idempotency_key = id');
    expect(migration).not.toContain('set idempotency_key = gen_random_uuid()');
    expect(migration).toContain("idempotency_contract_version = 'legacy-job-id-2026-09-21'");
    expect(migration).toContain("default 'persisted-key-2026-09-21'");
    expect(worker).toContain('idempotencyKey: job.idempotency_key');
    expect(worker).not.toContain('idempotencyKey: crypto.randomUUID()');
  });

  it('normaliza o evento pela transicao e ciclo persistido', () => {
    expect(migration).toContain('whatsapp_announcement_moderation_state');
    expect(migration).toContain('not v_old_in_moderation');
    expect(migration).toContain("':moderation:' || v_cycle::text");
    expect(migration).toContain('idx_whatsapp_gateway_jobs_moderation_cycle_unique');
    expect(migration).toContain("last_error_code = 'DUPLICATE_MODERATION_EVENT'");
    expect(migration).toContain('event_cycle = state.moderation_cycle');
    expect(migration).toContain('and state.in_moderation');
    expect(migration).toContain("jobs.idempotency_contract_version = 'legacy-job-id-2026-09-21'");
    expect(migration).toContain("set event_cycle = split_part(jobs.event_key, ':', 3)::bigint");
    expect(migration).toContain('select max(jobs.event_cycle) as max_cycle');
    expect(migration).toContain('after insert or update on public.announcements');
    expect(migration).not.toContain('create trigger trg_track_whatsapp_announcement_moderation_cycle');
  });

  it('congela imagem e conversa no nascimento do job', () => {
    expect(migration).toContain("'image_url', v_image_url");
    expect(migration).toContain("'action_url'");
    expect(migration).toContain('https://agrobw.com.br/minha-conta/mensagens?chat=');
    expect(migration).toContain('dockpbyzrvgewgdoaibn\\.supabase\\.co');
    expect(migration).toContain("'gateway_contract_version', '2026-09-18'");
    expect(worker).toContain("job.metadata?.gateway_contract_version === '2026-09-18'");
  });

  it('aplica limites e allowlists do contrato 2026-09-18', () => {
    expect(dispatcher).toContain("request.kind === 'transactional_card' ? 1024 : 1800");
    expect(dispatcher).toContain("request.actionLabel.length > 20");
    expect(dispatcher).toContain("request.fallback.length > 1800");
    expect(dispatcher).toContain("imageUrl.hostname === 'dockpbyzrvgewgdoaibn.supabase.co'");
    expect(dispatcher).toContain("actionUrl.hostname === 'agrobw.com.br'");
    expect(worker).toContain('isAllowedWhatsappCardImageUrl(imageUrl)');
    expect(worker).toContain('truncateUtf16Safe(job.message_body, 1024)');
    expect(dispatcher).toContain("'Content-Type': 'application/json; charset=utf-8'");
    expect(isAllowedWhatsappCardImageUrl(
      'https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/ad.webp',
    )).toBe(true);
    expect(isAllowedWhatsappCardImageUrl(
      'https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/../private/ad.webp',
    )).toBe(false);
    expect(isAllowedWhatsappCardActionUrl('https://agrobw.com.br/minha-conta/mensagens?chat=abc')).toBe(true);
    expect(isAllowedWhatsappCardActionUrl('https://evilagrobw.com.br/minha-conta/mensagens')).toBe(false);
  });

  it('inclui validador e rollback fail-closed', () => {
    expect(validation).toContain('sem_chaves_duplicadas');
    expect(validation).toContain('sem_moderacoes_pendentes_duplicadas');
    expect(validation).toContain('moderacoes_pendentes_normalizadas');
    expect(validation).toContain('retries_antigos_preservam_job_id');
    expect(validation).toContain('gatilho_fila_after_sem_colunas');
    expect(validation).toContain('dominio_canonico');
    expect(transactionalValidation).toContain('trg_zzzz_whatsapp_validation_force_pending');
    expect(transactionalValidation).toContain('Ciclo 1 nao foi criado');
    expect(transactionalValidation).toContain('A reentrada por trigger BEFORE tardio nao criou o ciclo 2');
    expect(transactionalValidation).toContain('A reconstrucao do estado nao preservou o maior ciclo historico');
    expect(transactionalValidation).toContain('A reentrada apos reconstruir o estado nao criou o ciclo 3');
    expect(transactionalValidation).toContain('rollback;');
    expect(rollback).toContain('Desative a Central WhatsApp antes do rollback');
    expect(rollback).toContain('drop column if exists idempotency_key');
    expect(rollback).toContain('create or replace function public.queue_whatsapp_admin_announcement_event()');
    expect(deployGuide).toContain('migration must be applied before the new worker');
    expect(deployGuide).toContain('worker version from before this change');
  });
});
