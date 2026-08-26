import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_PROPOSAL_STATUS,
  isCommercialProposalExpired,
  normalizeCommercialProposal,
  validateCommercialProposalInput,
} from '../commercialProposal';

describe('commercialProposal', () => {
  it('normaliza uma relacao PostgREST em array', () => {
    const proposal = normalizeCommercialProposal([{
      id: 'proposal-1',
      lead_id: 'lead-1',
      chat_id: 'chat-1',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      amount: '125000.50',
      valid_until: '2026-09-10',
      payment_terms: '  Entrada + parcelas  ',
      status: 'accepted',
      created_at: '2026-08-26T12:00:00Z',
    }]);

    expect(proposal).toMatchObject({
      id: 'proposal-1',
      amount: 125000.5,
      paymentTerms: 'Entrada + parcelas',
      status: COMMERCIAL_PROPOSAL_STATUS.ACCEPTED,
    });
  });

  it('rejeita relacao vazia ou valor invalido', () => {
    expect(normalizeCommercialProposal([])).toBeNull();
    expect(normalizeCommercialProposal({ id: 'x', amount: 0 })).toBeNull();
  });

  it('valida os limites do formulario', () => {
    expect(validateCommercialProposalInput({ amount: 0, validUntil: '2026-09-10' })).toContain('valor');
    expect(validateCommercialProposalInput({ amount: 100, validUntil: 'invalida' })).toContain('data');
    expect(validateCommercialProposalInput({ amount: 100, validUntil: '2999-09-10' })).toBeNull();
    expect(validateCommercialProposalInput({ amount: 100, validUntil: '2999-09-10', notes: 'x'.repeat(1001) })).toContain('1.000');
  });

  it('considera expirada apenas proposta enviada fora da validade', () => {
    const base = normalizeCommercialProposal({
      id: 'proposal-1', lead_id: 'lead-1', chat_id: 'chat-1', buyer_id: 'buyer-1', seller_id: 'seller-1',
      amount: 100, valid_until: '2026-08-20', status: 'sent', created_at: '2026-08-10T00:00:00Z',
    })!;
    expect(isCommercialProposalExpired(base, new Date('2026-08-21T12:00:00'))).toBe(true);
    expect(isCommercialProposalExpired({ ...base, status: 'accepted' }, new Date('2026-08-21T12:00:00'))).toBe(false);
  });
});
