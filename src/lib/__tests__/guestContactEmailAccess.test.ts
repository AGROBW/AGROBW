import { describe, expect, it } from 'vitest';
import { isGuestContactContentLocked } from '../../../supabase/functions/sync-contact-notification-emails/access';

describe('isGuestContactContentLocked', () => {
  const now = Date.parse('2026-09-14T12:00:00.000Z');

  it('libera somente contatos encontrados e sem expiracao ativa', () => {
    expect(isGuestContactContentLocked({
      lookupFailed: false,
      contactFound: true,
      contactExpiresAt: null,
      now,
    })).toBe(false);

    expect(isGuestContactContentLocked({
      lookupFailed: false,
      contactFound: true,
      contactExpiresAt: '2026-09-14T12:01:00.000Z',
      now,
    })).toBe(false);
  });

  it('bloqueia datas expiradas, invalidas e falhas de consulta', () => {
    expect(isGuestContactContentLocked({
      lookupFailed: false,
      contactFound: true,
      contactExpiresAt: '2026-09-14T11:59:00.000Z',
      now,
    })).toBe(true);

    expect(isGuestContactContentLocked({
      lookupFailed: false,
      contactFound: true,
      contactExpiresAt: 'data-invalida',
      now,
    })).toBe(true);

    expect(isGuestContactContentLocked({
      lookupFailed: true,
      contactFound: true,
      contactExpiresAt: null,
      now,
    })).toBe(true);

    expect(isGuestContactContentLocked({
      lookupFailed: false,
      contactFound: false,
      contactExpiresAt: null,
      now,
    })).toBe(true);
  });
});
