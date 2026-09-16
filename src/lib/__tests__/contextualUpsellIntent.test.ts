import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { rpc } }));

import {
  clearContextualUpsellCheckoutIntent,
  readContextualUpsellCheckoutIntent,
  recordContextualUpsellCheckoutStarted,
  saveContextualUpsellCheckoutIntent,
} from '../contextualUpsellIntent';

const planId = '11111111-1111-4111-8111-111111111111';

describe('contextual upsell checkout intent', () => {
  beforeEach(() => {
    rpc.mockReset();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/minha-conta/financeiro');
  });

  it('transporta apenas contexto, plano e horario pela sessao', () => {
    saveContextualUpsellCheckoutIntent('ad_limit', planId);
    expect(readContextualUpsellCheckoutIntent()).toMatchObject({ context: 'ad_limit', targetPlanId: planId });
    expect(window.sessionStorage.getItem('bwagro:contextual-upsell-checkout-intent')).not.toMatch(/email|phone|message/i);
  });

  it('descarta intencao invalida ou expirada', () => {
    window.sessionStorage.setItem('bwagro:contextual-upsell-checkout-intent', JSON.stringify({
      context: 'invalid', targetPlanId: planId, createdAt: Date.now() - 31 * 60 * 1000,
    }));
    expect(readContextualUpsellCheckoutIntent()).toBeNull();
  });

  it('limpa a intencao somente depois que o banco aceita o checkout', async () => {
    saveContextualUpsellCheckoutIntent('lead_locked', planId);
    const intent = readContextualUpsellCheckoutIntent();
    expect(intent).not.toBeNull();
    rpc.mockResolvedValueOnce({ data: [{ accepted: false }], error: null });
    expect(await recordContextualUpsellCheckoutStarted(intent!)).toBe(false);
    expect(readContextualUpsellCheckoutIntent()).not.toBeNull();

    rpc.mockResolvedValueOnce({ data: [{ accepted: true }], error: null });
    expect(await recordContextualUpsellCheckoutStarted(intent!)).toBe(true);
    expect(readContextualUpsellCheckoutIntent()).toBeNull();
    expect(rpc).toHaveBeenLastCalledWith('record_my_contextual_upsell_event', expect.objectContaining({
      p_event_type: 'checkout_started', p_target_plan_id: planId, p_source_path: '/minha-conta/financeiro',
    }));
  });

  it('permite limpeza explicita', () => {
    saveContextualUpsellCheckoutIntent('ad_limit', planId);
    clearContextualUpsellCheckoutIntent();
    expect(readContextualUpsellCheckoutIntent()).toBeNull();
  });
});
