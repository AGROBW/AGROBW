/**
 * ==========================================
 * CONSTANTES DE STATUS DO SISTEMA
 * ==========================================
 * 
 * Este arquivo centraliza todos os valores de status usados no sistema,
 * garantindo consistência com os constraints do banco de dados.
 * 
 * ⚠️ IMPORTANTE: Os valores aqui DEVEM corresponder exatamente aos
 * constraints CHECK definidos no banco de dados Supabase.
 */

// ==========================================
// STATUS DE CHATS (Português)
// ==========================================

/**
 * Status possíveis para a tabela `chats`
 * 
 * Constraint no banco:
 * CHECK (status IN ('novo', 'contatado', 'negociando', 'fechado', 'perdido'))
 */
export const CHAT_STATUS = {
  NOVO: 'novo',
  CONTATADO: 'contatado',
  NEGOCIANDO: 'negociando',
  FECHADO: 'fechado',
  PERDIDO: 'perdido'
} as const;

export type ChatStatus = typeof CHAT_STATUS[keyof typeof CHAT_STATUS];

// ==========================================
// STATUS DE LEADS (Português)
// ==========================================

/**
 * Status possíveis para a tabela `leads`
 * 
 * Constraint no banco:
 * CHECK (status IN ('novo', 'contatado', 'negociando', 'fechado', 'perdido'))
 */
export const LEAD_STATUS = {
  NEW: 'novo',
  CONTACTED: 'contatado',
  NEGOTIATING: 'negociando',
  CLOSED: 'fechado',
  LOST: 'perdido'
} as const;

export type LeadStatus = typeof LEAD_STATUS[keyof typeof LEAD_STATUS];

// ==========================================
// MAPEAMENTO PARA LABELS EM PORTUGUÊS
// ==========================================

/**
 * Labels em português para exibição na UI
 */
export const CHAT_STATUS_LABELS: Record<ChatStatus, string> = {
  [CHAT_STATUS.NOVO]: 'Novo',
  [CHAT_STATUS.CONTATADO]: 'Contatado',
  [CHAT_STATUS.NEGOCIANDO]: 'Negociando',
  [CHAT_STATUS.FECHADO]: 'Fechado',
  [CHAT_STATUS.PERDIDO]: 'Perdido'
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  [LEAD_STATUS.NEW]: 'Novo',
  [LEAD_STATUS.CONTACTED]: 'Contatado',
  [LEAD_STATUS.NEGOTIATING]: 'Negociando',
  [LEAD_STATUS.CLOSED]: 'Fechado',
  [LEAD_STATUS.LOST]: 'Perdido'
};

// ==========================================
// CONFIGURAÇÃO DE CORES PARA BADGES
// ==========================================

/**
 * Configuração de cores Tailwind para badges de status
 */
export const CHAT_STATUS_COLORS: Record<ChatStatus, string> = {
  [CHAT_STATUS.NOVO]: 'bg-blue-100 text-blue-700',
  [CHAT_STATUS.CONTATADO]: 'bg-yellow-100 text-yellow-700',
  [CHAT_STATUS.NEGOCIANDO]: 'bg-purple-100 text-purple-700',
  [CHAT_STATUS.FECHADO]: 'bg-green-100 text-green-700',
  [CHAT_STATUS.PERDIDO]: 'bg-red-100 text-red-700'
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  [LEAD_STATUS.NEW]: 'bg-blue-100 text-blue-700',
  [LEAD_STATUS.CONTACTED]: 'bg-yellow-100 text-yellow-700',
  [LEAD_STATUS.NEGOTIATING]: 'bg-purple-100 text-purple-700',
  [LEAD_STATUS.CLOSED]: 'bg-green-100 text-green-700',
  [LEAD_STATUS.LOST]: 'bg-red-100 text-red-700'
};

// ==========================================
// HELPERS DE VALIDAÇÃO
// ==========================================

/**
 * Verifica se um valor é um ChatStatus válido
 */
export function isValidChatStatus(value: string): value is ChatStatus {
  return Object.values(CHAT_STATUS).includes(value as ChatStatus);
}

/**
 * Verifica se um valor é um LeadStatus válido
 */
export function isValidLeadStatus(value: string): value is LeadStatus {
  return Object.values(LEAD_STATUS).includes(value as LeadStatus);
}

/**
 * Converte status de lead (inglês) para label em português
 */
export function getLeadStatusLabel(status: LeadStatus): string {
  return LEAD_STATUS_LABELS[status] || status;
}

/**
 * Converte status de chat (português) para label
 */
export function getChatStatusLabel(status: ChatStatus): string {
  return CHAT_STATUS_LABELS[status] || status;
}

// ==========================================
// FLUXOS DE TRANSIÇÃO
// ==========================================

/**
 * Define transições válidas de status para leads
 */
export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LEAD_STATUS.NEW]: [LEAD_STATUS.CONTACTED, LEAD_STATUS.LOST],
  [LEAD_STATUS.CONTACTED]: [LEAD_STATUS.NEGOTIATING, LEAD_STATUS.LOST],
  [LEAD_STATUS.NEGOTIATING]: [LEAD_STATUS.CLOSED, LEAD_STATUS.LOST],
  [LEAD_STATUS.CLOSED]: [], // Estado final
  [LEAD_STATUS.LOST]: [] // Estado final
};

/**
 * Define transições válidas de status para chats
 */
export const CHAT_STATUS_TRANSITIONS: Record<ChatStatus, ChatStatus[]> = {
  [CHAT_STATUS.NOVO]: [CHAT_STATUS.CONTATADO, CHAT_STATUS.PERDIDO],
  [CHAT_STATUS.CONTATADO]: [CHAT_STATUS.NEGOCIANDO, CHAT_STATUS.PERDIDO],
  [CHAT_STATUS.NEGOCIANDO]: [CHAT_STATUS.FECHADO, CHAT_STATUS.PERDIDO],
  [CHAT_STATUS.FECHADO]: [], // Estado final
  [CHAT_STATUS.PERDIDO]: [] // Estado final
};

/**
 * Verifica se uma transição de status é válida
 */
export function canTransitionLeadStatus(from: LeadStatus, to: LeadStatus): boolean {
  return LEAD_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Verifica se uma transição de status é válida
 */
export function canTransitionChatStatus(from: ChatStatus, to: ChatStatus): boolean {
  return CHAT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
