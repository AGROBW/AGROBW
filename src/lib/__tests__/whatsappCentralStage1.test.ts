import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'sql/create_whatsapp_central_stage1_2026-09-14.sql'),
  'utf8',
);
const rollback = readFileSync(
  resolve(process.cwd(), 'sql/ROLLBACK_create_whatsapp_central_stage1_2026-09-14.sql'),
  'utf8',
);
const validation = readFileSync(
  resolve(process.cwd(), 'sql/VALIDATE_whatsapp_central_stage1_2026-09-14.sql'),
  'utf8',
);

describe('Central WhatsApp stage 1 migration', () => {
  it('mantem a tabela sem acesso direto de clientes', () => {
    expect(migration).toContain('alter table public.whatsapp_gateway_settings enable row level security');
    expect(migration).toContain('alter table public.whatsapp_gateway_settings force row level security');
    expect(migration).toContain('revoke all on table public.whatsapp_gateway_settings from public, anon, authenticated');
    expect(migration).not.toMatch(/create policy[\s\S]*whatsapp_gateway_settings/i);
  });

  it('protege leitura e escrita com admin MFA e nao devolve o segredo', () => {
    expect(migration.match(/auth\.uid\(\) is null or not public\.is_admin\(\)/g)).toHaveLength(2);
    expect(migration).toContain('auth_secret_configured boolean');

    const getStart = migration.indexOf('create or replace function public.get_whatsapp_gateway_settings_admin_safe');
    const updateStart = migration.indexOf('create or replace function public.update_whatsapp_gateway_settings_admin_safe');
    const getBody = migration.slice(getStart, updateStart);
    expect(getBody).not.toMatch(/returns table \([\s\S]*auth_secret text/);
    expect(getBody).not.toContain('settings.auth_secret,');
  });

  it('bloqueia destinos inseguros e exige configuracao completa para ativacao', () => {
    expect(migration).toContain("v_url !~ '^https://");
    expect(migration).toContain("v_host like '192.168.%'");
    expect(migration).toContain("v_host like '127.%'");
    expect(migration).toContain("v_host ~ '^[0-9]{1,3}(\\.[0-9]{1,3}){3}$'");
    expect(migration).toContain('v_port::integer > 65535');
    expect(migration).toContain("v_auth_type not in ('bearer', 'hmac_sha256')");
    expect(migration).toContain('Preencha URL, credencial e numero de destino antes de ativar o gateway');
  });

  it('revoga o acesso padrao das RPCs antes de liberar somente authenticated', () => {
    expect(migration).toMatch(/revoke all on function public\.get_whatsapp_gateway_settings_admin_safe\(\)[\s\S]*from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.get_whatsapp_gateway_settings_admin_safe\(\)[\s\S]*to authenticated/);
    expect(migration).toMatch(/revoke all on function public\.update_whatsapp_gateway_settings_admin_safe[\s\S]*from public, anon, authenticated/);
  });

  it('inclui validacao operacional e rollback completo', () => {
    expect(validation).toContain('segredo_nao_exposto');
    expect(validation).toContain('anon_sem_leitura');
    expect(validation).toContain('ip_privado_recusado');
    expect(validation).toContain('ip_literal_recusado');
    expect(validation).toContain('porta_invalida_recusada');
    expect(rollback).toContain('drop table if exists public.whatsapp_gateway_settings');
    expect(rollback).toContain('drop function if exists public.is_safe_whatsapp_gateway_base_url');
  });
});
