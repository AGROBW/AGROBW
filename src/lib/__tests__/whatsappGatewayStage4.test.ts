import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('sql/create_whatsapp_central_stage4_2026-09-14.sql');
const rollback = read('sql/ROLLBACK_create_whatsapp_central_stage4_2026-09-14.sql');
const validation = read('sql/VALIDATE_whatsapp_central_stage4_2026-09-14.sql');
const worker = read('supabase/functions/sync-whatsapp-gateway-jobs/index.ts');
const adminEdge = read('supabase/functions/whatsapp-gateway-admin/index.ts');
const queueHook = read('src/hooks/useWhatsappGatewayQueue.ts');

describe('Central WhatsApp stage 4 routing', () => {
  it('usa um unico roteador com Central e fallback legado', () => {
    expect(migration).toContain('drop trigger if exists on_lead_queue_whatsapp on public.leads');
    expect(migration).toContain('create trigger trg_route_whatsapp_lead_notification');
    expect(migration).toContain("'seller_new_lead'");
    expect(migration).toContain("to_regclass('public.whatsapp_notification_jobs') is not null");
    expect(migration).toContain('if v_job_id is not null then');
    expect(migration).toContain('exception when others then');
    expect(migration).toContain("then 'Contato bloqueado'");
  });

  it('resolve o telefone somente no worker e aponta para mensagens do usuario', () => {
    expect(migration).toContain("'/minha-conta/mensagens'");
    expect(migration).toContain("'user',");
    expect(migration).not.toMatch(/insert into public\.whatsapp_gateway_jobs[\s\S]{0,500}recipient_phone/);
    expect(worker).toContain("job.recipient_kind === 'user'");
    expect(worker).toContain(".select('phone')");
  });

  it('mantem campanha de anuncio inativa ate existir opt-in de WhatsApp', () => {
    expect(migration).toMatch(/'marketing_announcement_campaign'[\s\S]{0,180}false/);
    const stage3Migration = read('sql/create_whatsapp_central_stage3_2026-09-14.sql');
    expect(stage3Migration).toContain("p_event_type = 'marketing_announcement_campaign'");
    expect(stage3Migration).toContain('Campanhas de WhatsApp exigem opt-in especifico');
    expect(stage3Migration).toContain("p_event_type like 'marketing_%'");
    expect(migration).toContain('whatsapp_gateway_templates_marketing_disabled');
  });
});

describe('Central WhatsApp stage 4 operations and security', () => {
  it('expoe historico sanitizado e reenvio limitado para admin', () => {
    expect(migration).toContain('get_recent_whatsapp_gateway_jobs_admin_safe');
    expect(migration).toContain("jobs.status in ('retry', 'dead_letter')");
    expect(migration).toContain('auth.uid() is null or not public.is_admin()');
    expect(migration).not.toMatch(/returns table \([\s\S]{0,500}(message_body|auth_secret|recipient_phone)/);
    expect(queueHook).toContain('get_recent_whatsapp_gateway_jobs_admin_safe');
    expect(queueHook).toContain('retry_whatsapp_gateway_job_admin_safe');
  });

  it('audita mutacoes no banco sem registrar segredo ou corpo de template', () => {
    expect(migration).toContain('create or replace function public.audit_whatsapp_gateway_admin_change');
    expect(migration).toContain("'credential_changed'");
    expect(migration).toContain("'body_changed'");
    expect(migration).not.toContain("'auth_secret', new.auth_secret");
    expect(migration).not.toContain("'body_template', new.body_template");
  });

  it('limita corpos com e sem Content-Length e sinaliza falha de transicao', () => {
    expect(adminEdge).toContain('new TextEncoder().encode(rawBody).byteLength');
    expect(worker).toContain('new TextEncoder().encode(rawBody).byteLength');
    expect(worker).toContain('transitionErrorCount === 0 ? 200 : 500');
    expect(worker).toContain('move_pending_whatsapp_seller_jobs_to_legacy');
    expect(worker).toContain('purge_terminal_whatsapp_gateway_jobs');
    expect(worker).toContain(".select('is_enabled')");
    expect(worker).toContain('release after disable');
    expect(migration).toContain("jobs.status = 'processing' and jobs.locked_at < now() - interval '10 minutes'");
  });

  it('inclui validacao e rollback do roteamento', () => {
    expect(validation).toContain('gatilho_legado_substituido');
    expect(validation).toContain('historico_sem_mensagem');
    expect(rollback).toContain('create trigger on_lead_queue_whatsapp');
    expect(rollback).toContain('nem todos os leads pendentes foram migrados para a Meta');
    expect(rollback).toContain('lock table public.leads in share row exclusive mode');
    expect(migration).toContain("last_error_code = 'ORPHANED_SOURCE'");
    expect(rollback).toContain('drop function if exists public.audit_whatsapp_gateway_admin_change');
  });

  it('valida templates, limita frequencia e inclui teste transacional', () => {
    const stage3Migration = read('sql/create_whatsapp_central_stage3_2026-09-14.sql');
    const transactionalValidation = read('sql/VALIDATE_whatsapp_central_routing_transactional_2026-09-15.sql');
    expect(stage3Migration).toContain('allowed_placeholders');
    expect(stage3Migration).toContain('Placeholder nao permitido');
    expect(stage3Migration).toContain('public.try_enqueue_whatsapp_gateway_event');
    expect(stage3Migration).toContain('/ 600)::bigint::text');
    expect(stage3Migration).toContain("'waiting_user'");
    expect(transactionalValidation).toContain('v_central_active_count = 1');
    expect(transactionalValidation).toContain('v_legacy_fallback_count = 1');
    expect(transactionalValidation).toContain('rollback;');
    expect(transactionalValidation).toContain('VALIDACAO APROVADA');
    expect(transactionalValidation).toContain('VALIDACAO REPROVADA');
    expect(transactionalValidation).toContain('exception when others then');
  });
});
