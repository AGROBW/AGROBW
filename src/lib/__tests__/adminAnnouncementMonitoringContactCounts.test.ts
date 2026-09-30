import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const page = read('pages/admin/AnnouncementsMonitoring.tsx');
const migration = read('sql/fix_admin_announcement_monitoring_contact_counts_2026-09-30.sql');
const validator = read('sql/VALIDATE_fix_admin_announcement_monitoring_contact_counts_2026-09-30.sql');
const transactionalValidator = read('sql/VALIDATE_fix_admin_announcement_monitoring_contact_counts_transactional_2026-09-30.sql');

describe('Admin announcement monitoring contact counts', () => {
  it('counts registered and guest contacts in the protected RPC', () => {
    expect(migration).toContain('leads_count bigint');
    expect(migration).toContain('messages_count bigint');
    expect(migration).toContain('public.leads');
    expect(migration).toContain('public.chats');
    expect(
      migration.match(/public\.guest_announcement_contacts/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(migration).toContain('guest_announcement_contacts_announcement_idx');
  });

  it('keeps the aggregate exclusive to authenticated administrators', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain("upper(coalesce(users.role, '')) = 'ADMIN'");
    expect(migration).toContain('revoke all on function public.admin_list_announcements_monitoring()');
    expect(migration).toContain('to authenticated');
  });

  it('uses RPC counts instead of reading commercial tables from the browser', () => {
    expect(page).toContain('leadsCount: Number(row.leads_count || 0)');
    expect(page).toContain('messagesCount: Number(row.messages_count || 0)');
    expect(page).not.toContain("supabase.from('leads')");
    expect(page).not.toContain("supabase.from('chats')");
  });

  it('ships structural and rollback-safe validation', () => {
    expect(validator).toContain('inclui_visitantes');
    expect(validator).toContain('indice_contatos_visitantes');
    expect(transactionalValidator).toContain('ADMIN_MONITORING_CONTACT_COUNTS_MISMATCH');
    expect(transactionalValidator.trimEnd()).toMatch(/rollback;$/);
  });
});
