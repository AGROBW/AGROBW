import { beforeEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({
  getSmtpHint: vi.fn(() => 'hint'),
  getStoredSmtpSettings: vi.fn(async () => null),
  loadSmtpSettings: vi.fn(async () => ({})),
  mapStoredSmtpSettingsToClient: vi.fn((value) => value),
  processAllQueues: vi.fn(async () => ({ processed: 0 })),
  requireAdminByToken: vi.fn(async () => ({ ok: true })),
  saveSmtpSettings: vi.fn(async (value) => value),
  sendMail: vi.fn(async () => undefined),
  validateSmtpSettings: vi.fn(() => null),
  verifySmtpConnection: vi.fn(async () => undefined),
}));

vi.mock('../../../server/email-backend-core.mjs', () => core);

import handler from '../../../api/email/[action].mjs';

const response = () => {
  const state: { status: number; body: unknown; headers: Record<string, string> } = {
    status: 0,
    body: null,
    headers: {},
  };
  return {
    state,
    setHeader: vi.fn((name: string, value: string) => { state.headers[name] = value; }),
    status: vi.fn((status: number) => {
      state.status = status;
      return {
        json: (body: unknown) => { state.body = body; },
      };
    }),
  };
};

describe('Email API dispatcher', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves the authenticated settings route', async () => {
    const res = response();
    await handler({ method: 'GET', query: { action: 'settings' }, headers: {} }, res);

    expect(core.requireAdminByToken).toHaveBeenCalledWith(null);
    expect(core.getStoredSmtpSettings).toHaveBeenCalledOnce();
    expect(res.state).toMatchObject({ status: 200, body: { success: true, data: null } });
    expect(res.state.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('preserves preflight behavior for process-jobs', async () => {
    const res = response();
    await handler({ method: 'OPTIONS', query: { action: 'process-jobs' }, headers: {} }, res);

    expect(res.state.status).toBe(200);
    expect(res.state.headers['Access-Control-Allow-Headers']).toContain('x-email-backend-secret');
    expect(core.requireAdminByToken).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown email actions', async () => {
    const res = response();
    await handler({ method: 'GET', query: { action: 'unknown' }, headers: {} }, res);

    expect(res.state).toMatchObject({ status: 404, body: { success: false, message: 'Endpoint not found' } });
  });
});
