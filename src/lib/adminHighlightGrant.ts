export type AdminHighlightType = 'home' | 'category';

export type AdminHighlightPeriod = '3' | '7' | '15' | '30' | 'custom';

export const ADMIN_HIGHLIGHT_PERIOD_OPTIONS: Array<{
  value: AdminHighlightPeriod;
  label: string;
}> = [
  { value: '3', label: '3 dias' },
  { value: '7', label: '7 dias' },
  { value: '15', label: '15 dias' },
  { value: '30', label: '30 dias' },
  { value: 'custom', label: 'Escolher data e hora' },
];

const MAX_ADMIN_HIGHLIGHT_DAYS = 90;

export const calculateAdminHighlightExpiry = (
  period: AdminHighlightPeriod,
  customValue: string,
  nowMs: number
): { expiresAt: string | null; error: string | null } => {
  let expiresAtMs: number;

  if (period === 'custom') {
    if (!customValue) {
      return { expiresAt: null, error: 'Informe a data e hora de encerramento.' };
    }

    expiresAtMs = new Date(customValue).getTime();
  } else {
    expiresAtMs = nowMs + Number(period) * 24 * 60 * 60 * 1000;
  }

  if (!Number.isFinite(expiresAtMs)) {
    return { expiresAt: null, error: 'A data informada é inválida.' };
  }

  if (expiresAtMs <= nowMs) {
    return { expiresAt: null, error: 'O encerramento precisa estar no futuro.' };
  }

  if (expiresAtMs > nowMs + MAX_ADMIN_HIGHLIGHT_DAYS * 24 * 60 * 60 * 1000) {
    return { expiresAt: null, error: 'O destaque administrativo pode durar no máximo 90 dias.' };
  }

  return { expiresAt: new Date(expiresAtMs).toISOString(), error: null };
};

export const getActiveAdminHighlightType = (announcement: {
  highlight_home?: boolean | null;
  highlight_category?: boolean | null;
}): AdminHighlightType | null => {
  if (announcement.highlight_home) return 'home';
  if (announcement.highlight_category) return 'category';
  return null;
};

export const getAdminHighlightTypeLabel = (type: AdminHighlightType) =>
  type === 'home' ? 'Home' : 'Categoria';
