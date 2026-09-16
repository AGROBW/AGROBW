import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve('sql/create_contextual_upsell_2026-09-16.sql'), 'utf8');
const rollback = readFileSync(resolve('sql/rollback_contextual_upsell_2026-09-16.sql'), 'utf8');
const validator = readFileSync(resolve('sql/validate_contextual_upsell_2026-09-16.sql'), 'utf8');
const behaviorValidator = readFileSync(resolve('sql/validate_contextual_upsell_behavior_2026-09-16.sql'), 'utf8');
const emergency = readFileSync(resolve('sql/emergency_disable_contextual_upsell_attribution.sql'), 'utf8');
const purgeWorker = readFileSync(resolve('supabase/functions/purge-contextual-upsell-data/index.ts'), 'utf8');

describe('contextual upsell security contract', () => {
  it('nasce desligado e nao concede acesso direto ao cliente', () => {
    expect(migration).toContain('is_enabled boolean not null default false');
    expect(migration).toContain('recovery_enabled boolean not null default false');
    expect(migration).toContain('force row level security');
    expect(migration).toContain('revoke all on table public.contextual_upsell_events from public, anon, authenticated');
    expect(migration).toContain("enabled_contexts text[] not null default '{}'::text[]");
  });

  it('exige autenticacao e separa operacoes administrativas', () => {
    expect(migration).toContain("if v_user_id is null then");
    expect(migration).toContain('not public.is_admin()');
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain('revoke all on function public.attribute_contextual_upsell_conversion(uuid, uuid, text)');
  });

  it('nao armazena contato na fila e limita abuso da telemetria', () => {
    const recoveryTable = migration.match(
      /create table if not exists public\.contextual_upsell_recovery_queue \(([\s\S]*?)\n\);/i,
    )?.[1] || '';

    expect(migration).toContain("'rate_limited'::text");
    expect(migration).toContain('v_available_contexts');
    expect(migration).toContain("events.event_type = 'impression'");
    expect(migration).toContain('idx_contextual_upsell_recovery_one_pending_offer');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("hashtextextended('contextual-upsell:' || v_user_id::text, 0)");
    expect(migration).toContain('plans.show_in_public_pricing is true');
    expect(validator).toContain('fila_sem_contato');
    expect(recoveryTable).not.toMatch(/\b(email|phone|recipient|message)\b/i);
  });

  it('inclui atribuicao, retencao e rollback integral', () => {
    expect(migration).toContain('attribute_contextual_upsell_conversion');
    expect(migration).toContain('purge_contextual_upsell_data');
    expect(migration).toContain("p_plan_id, v_checkout.id, trim(p_conversion_key), '/checkout'");
    expect(migration).toContain('on conflict do nothing');
    expect(migration).toContain('idx_contextual_upsell_conversion_source_once');
    expect(migration).toContain('on delete cascade');
    expect(migration).toContain('order by events.created_at desc, events.id desc');
    expect(migration).toContain('p_conversion_key text');
    expect(migration).not.toContain("'subscription_trigger'");
    expect(migration.trim().startsWith('-- Upsell contextual')).toBe(true);
    expect(migration).toContain("set local lock_timeout = '5s'");
    expect(migration.trim().endsWith('commit;')).toBe(true);
    expect(rollback).toContain('drop table if exists public.contextual_upsell_events');
    expect(rollback).toContain('drop table if exists public.contextual_upsell_settings');
  });

  it('valida com papel real sem alterar assinaturas e mantem contingencia reaplicavel', () => {
    expect(behaviorValidator).toContain('set local role anon');
    expect(behaviorValidator).not.toMatch(/update\s+public\.user_subscriptions/i);
    expect(behaviorValidator).toContain("'checkout-validation-1'");
    expect(behaviorValidator).toContain("'checkout-validation-same-source'");
    expect(behaviorValidator).toContain("'checkout-validation-2'");
    expect(behaviorValidator).toContain("set created_at = created_at - interval '1 minute'");
    expect(emergency).toContain("to_regclass('public.contextual_upsell_settings') is not null");
  });

  it('protege e operacionaliza a retencao periodica', () => {
    expect(purgeWorker).toContain("Deno.env.get('CONTEXTUAL_UPSELL_CRON_SECRET')");
    expect(purgeWorker).toContain("req.headers.get('x-cron-secret')");
    expect(purgeWorker).toContain("supabaseAdmin.rpc('purge_contextual_upsell_data')");
    expect(purgeWorker).toContain("req.method !== 'POST'");
  });
});
