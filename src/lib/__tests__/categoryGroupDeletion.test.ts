import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'sql/create_safe_category_group_deletion_2026-09-15.sql'),
  'utf8',
);
const validation = readFileSync(
  resolve(process.cwd(), 'sql/VALIDATE_safe_category_group_deletion_2026-09-15.sql'),
  'utf8',
);
const rollback = readFileSync(
  resolve(process.cwd(), 'sql/ROLLBACK_safe_category_group_deletion_2026-09-15.sql'),
  'utf8',
);

describe('safe category group deletion', () => {
  it('exige administrador com MFA e restringe as RPCs ao authenticated', () => {
    expect(migration.match(/auth\.uid\(\) is null or not public\.is_admin\(\)/g)).toHaveLength(2);
    expect(migration).toMatch(/revoke all on function public\.delete_category_group_admin_safe[\s\S]*from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.delete_category_group_admin_safe[\s\S]*to authenticated/);
  });

  it('bloqueia dependencias, o ultimo grupo e confirmacoes incorretas', () => {
    expect(migration).toContain("p_confirmation_name, '') <> v_group.name");
    expect(migration).toContain('v_category_count > 0');
    expect(migration).toContain('v_mapping_count > 0');
    expect(migration).toContain('v_announcement_count > 0');
    expect(migration).toContain('v_alert_count > 0');
    expect(migration).toContain('v_total_group_count <= 1');
    expect(migration).toContain('v_group.is_active and v_active_group_count <= 1');
  });

  it('serializa a verificacao e registra a auditoria na mesma transacao', () => {
    expect(migration).toContain('lock table public.categories in share row exclusive mode');
    expect(migration).toContain('lock table public.announcements in share row exclusive mode');
    expect(migration).toContain("'DELETE_CATEGORY_GROUP'");
    expect(migration.indexOf('delete from public.category_groups')).toBeLessThan(
      migration.indexOf('insert into public.admin_audit_logs'),
    );
  });

  it('inclui validador estrutural e rollback limitado as RPCs', () => {
    expect(validation).toContain('anon_sem_exclusao');
    expect(validation).toContain('search_path_protegido');
    expect(rollback).toContain('drop function if exists public.delete_category_group_admin_safe');
    expect(rollback).not.toContain('drop table');
  });
});
