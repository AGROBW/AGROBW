import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const validator = read('sql/VALIDATE_seller_store_insights_rollout_stage6_2026-09-29.sql');
const runbook = read('docs/SELLER_STORE_INSIGHTS_STAGE6_2026-09-29.md');
const contract = read('docs/seller-store-insights-metric-contract.md');

describe('Seller Store Insights stage 6', () => {
  it('combines structural, authorization and privacy readiness', () => {
    expect(validator).toContain('estrutura_completa');
    expect(validator).toContain('rls_forcada');
    expect(validator).toContain('eventos_privados');
    expect(validator).toContain('cliente_sem_escrita_direta');
    expect(validator).toContain('evento_sistema_protegido');
    expect(validator).toContain('painel_so_autenticado');
    expect(validator).toContain('sem_dados_sensiveis');
  });

  it('checks the complete metric and catalog attribution contracts', () => {
    expect(validator).toContain('periodos_fixos');
    expect(validator).toContain('visitas_unicas');
    expect(validator).toContain('ranking_anuncios');
    expect(validator).toContain('qr_validado');
    expect(validator).toContain('eventos_catalogo_protegidos');
    expect(validator).toContain('qr_sem_referencia_invalida');
    expect(validator).toContain('catalogo_sem_referencia_invalida');
  });

  it('reports live counters without mutating production data', () => {
    expect(validator).toContain('eventos_24h');
    expect(validator).toContain('catalogos_gerados_24h');
    expect(validator).toContain('downloads_24h');
    expect(validator).toContain('qr_abertos_24h');
    expect(validator).toMatch(/^with object_checks as/i);
    expect(validator).not.toMatch(/^\s*(insert into|update|delete from|truncate|drop|alter|create)\b/im);
  });

  it('documents controlled release, stop conditions and safe rollback', () => {
    expect(runbook).toContain('Deployment order');
    expect(runbook).toContain('Acceptance evidence');
    expect(runbook).toContain('Stop conditions');
    expect(runbook).toContain('Rollback');
    expect(runbook).toContain('seller-store-catalog-download');
    expect(runbook).toContain('purge_seller_store_insight_events(180)');
    expect(runbook).toContain('final implementation stage');
    expect(contract).toContain('Stage 6');
  });
});
