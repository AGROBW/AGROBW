import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'sql/add_guest_contacts_to_seller_inbox_stage1_2026-09-14.sql'),
  'utf8',
);

const rollback = readFileSync(
  resolve(process.cwd(), 'sql/ROLLBACK_add_guest_contacts_to_seller_inbox_stage1_2026-09-14.sql'),
  'utf8',
);

describe('guest contact seller inbox stage 1 migration', () => {
  it('expoe somente RPCs autenticadas e isoladas pelo vendedor atual', () => {
    expect(migration).toContain('list_my_guest_announcement_contacts');
    expect(migration).toContain('get_my_guest_announcement_contact');
    expect(migration).toContain('mark_my_guest_announcement_contact_read');
    expect(migration).toContain('set_my_guest_announcement_contact_archived');
    expect(migration).toContain('count_my_unread_guest_announcement_contacts');
    expect(migration).toContain('v_actor_id uuid := auth.uid()');
    expect(migration).toContain('contacts.seller_id = v_actor_id');
    expect(migration).toMatch(/revoke all on function public\.list_my_guest_announcement_contacts[\s\S]*from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.list_my_guest_announcement_contacts[\s\S]*to authenticated/);
    expect(migration).not.toContain('guest_announcement_contacts_seller_select');
  });

  it('protege identidade e mensagem enquanto o contato estiver bloqueado', () => {
    expect(migration).toContain("when access_state.locked then 'Contato bloqueado'");
    expect(migration).toContain('when access_state.locked then null else contacts.visitor_email');
    expect(migration).toContain('when access_state.locked then null else contacts.visitor_phone');
    expect(migration).toContain('when access_state.locked then null else contacts.message');
    expect(migration).toContain('content_locked');
    expect(migration).toContain('case when v_content_locked then null else new.message');
    expect(migration).toContain('case when v_content_locked then null else new.visitor_email');
    expect(migration).toContain('case when v_content_locked then null else new.visitor_phone');
  });

  it('preserva contatos recebidos ou liberados com acesso ao plano', () => {
    expect(migration).toContain('received_with_active_access');
    expect(migration).toContain('unlocked_once_at');
    expect(migration).toContain('when contacts.unlocked_once_at is not null then null');
    expect(migration).toContain('coalesce(contacts.unlocked_once_at, now())');
    expect(migration).toContain('v_first_install boolean');
    expect(migration).toContain('unlocked_once_at = coalesce(unlocked_once_at, created_at, now())');
    expect(migration).toContain('jobs.reply_to_email is not null');
    expect(migration).toContain('and contacts.unlocked_once_at is null');
    expect(migration).toContain("else contacts.created_at - interval '1 second'");
    expect(migration).toMatch(/if v_first_install then[\s\S]*received_with_active_access = public\.seller_has_active_plan_contact_access[\s\S]*where contacts\.unlocked_once_at is null;[\s\S]*end if;/);
  });

  it('valida o isolamento dentro de cada RPC sensivel', () => {
    const isolatedFunctions = [
      'list_my_guest_announcement_contacts',
      'get_my_guest_announcement_contact',
      'mark_my_guest_announcement_contact_read',
      'set_my_guest_announcement_contact_archived',
      'count_my_unread_guest_announcement_contacts',
    ];

    for (const [index, functionName] of isolatedFunctions.entries()) {
      const start = migration.indexOf(`create or replace function public.${functionName}`);
      const end = index + 1 < isolatedFunctions.length
        ? migration.indexOf(`create or replace function public.${isolatedFunctions[index + 1]}`, start)
        : migration.indexOf('create or replace function public.queue_guest_announcement_contact_email', start);
      const body = migration.slice(start, end);

      expect(start, `${functionName} deve existir`).toBeGreaterThanOrEqual(0);
      expect(body, `${functionName} deve exigir auth.uid()`).toContain('auth.uid()');
      expect(body, `${functionName} deve filtrar pelo vendedor`).toContain('contacts.seller_id = v_actor_id');
    }
  });

  it('inclui rollback completo da etapa', () => {
    expect(rollback).toContain('drop function if exists public.list_my_guest_announcement_contacts');
    expect(rollback).toContain('drop function if exists public.get_my_guest_announcement_contact');
    expect(rollback).toContain('drop column if exists content_locked');
    expect(rollback).toContain('drop column if exists unlocked_once_at');
    expect(rollback).toContain('drop column if exists received_with_active_access');
  });
});
