export const COMMERCIAL_PROPOSAL_STATUS = {
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const;

export type CommercialProposalStatus =
  (typeof COMMERCIAL_PROPOSAL_STATUS)[keyof typeof COMMERCIAL_PROPOSAL_STATUS];

export interface CommercialProposal {
  id: string;
  leadId: string;
  chatId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  validUntil: string;
  notes: string | null;
  status: CommercialProposalStatus;
  createdAt: string;
  respondedAt: string | null;
}

export interface CommercialProposalInput {
  amount: number;
  validUntil: string;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  notes?: string | null;
}

const asOptionalText = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const asProposalStatus = (value: unknown): CommercialProposalStatus => {
  if (value === COMMERCIAL_PROPOSAL_STATUS.ACCEPTED) return value;
  if (value === COMMERCIAL_PROPOSAL_STATUS.REJECTED) return value;
  return COMMERCIAL_PROPOSAL_STATUS.SENT;
};

export const normalizeCommercialProposal = (raw: any): CommercialProposal | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'object' || !value.id) return null;

  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    id: String(value.id),
    leadId: String(value.lead_id || ''),
    chatId: String(value.chat_id || ''),
    buyerId: String(value.buyer_id || ''),
    sellerId: String(value.seller_id || ''),
    amount,
    paymentTerms: asOptionalText(value.payment_terms),
    deliveryTerms: asOptionalText(value.delivery_terms),
    validUntil: String(value.valid_until || ''),
    notes: asOptionalText(value.notes),
    status: asProposalStatus(value.status),
    createdAt: String(value.created_at || ''),
    respondedAt: value.responded_at ? String(value.responded_at) : null,
  };
};

export const validateCommercialProposalInput = (input: CommercialProposalInput): string | null => {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return 'Informe um valor de proposta válido.';
  if (input.amount > 999_999_999_999.99) return 'O valor da proposta excede o limite permitido.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil)) return 'Informe uma data de validade válida.';

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (input.validUntil < todayKey) return 'A validade não pode estar no passado.';
  if ((input.paymentTerms || '').trim().length > 500) return 'As condições de pagamento excedem 500 caracteres.';
  if ((input.deliveryTerms || '').trim().length > 500) return 'As condições de entrega excedem 500 caracteres.';
  if ((input.notes || '').trim().length > 1000) return 'As observações excedem 1.000 caracteres.';
  return null;
};

export const isCommercialProposalExpired = (proposal: CommercialProposal, now = new Date()) => {
  if (proposal.status !== COMMERCIAL_PROPOSAL_STATUS.SENT) return false;
  const endOfValidity = new Date(`${proposal.validUntil}T23:59:59.999`);
  return Number.isFinite(endOfValidity.getTime()) && endOfValidity.getTime() < now.getTime();
};

export const formatCommercialProposalAmount = (amount: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);

