export const ALLOWED_PERIODS = [7, 15, 30] as const;

export type SearchConsolePeriod = (typeof ALLOWED_PERIODS)[number];
export type PageSpeedStrategy = 'mobile' | 'desktop';

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

export const buildSearchConsoleDateRange = (
  periodDays: SearchConsolePeriod,
  now = new Date(),
  dataDelayDays = 3,
) => {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - dataDelayDays);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - periodDays + 1);

  return {
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
    dataDelayDays,
  };
};

export const normalizePeriod = (value: unknown): SearchConsolePeriod | null => {
  const period = Number(value);
  return ALLOWED_PERIODS.includes(period as SearchConsolePeriod)
    ? (period as SearchConsolePeriod)
    : null;
};

export const normalizeMetric = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export type SearchConsoleMetric = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchConsoleDimensionMetric = SearchConsoleMetric & {
  key: string;
};

export type SeoOpportunity = {
  kind: 'quick-win' | 'low-ctr' | 'declining';
  target: string;
  title: string;
  detail: string;
  priority: 'high' | 'medium';
};

export type IndexMonitorHealth = 'healthy' | 'attention' | 'critical';

export type IndexMonitorInput = {
  url: string;
  type: 'announcement' | 'news' | 'store';
  label: string;
  verdict?: string | null;
  coverageState?: string | null;
  robotsTxtState?: string | null;
  indexingState?: string | null;
  pageFetchState?: string | null;
  googleCanonical?: string | null;
  userCanonical?: string | null;
  lastCrawlTime?: string | null;
};

const normalizeCanonical = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
};

export const evaluateIndexMonitorItem = (input: IndexMonitorInput) => {
  const expectedCanonical = normalizeCanonical(input.url);
  const googleCanonical = normalizeCanonical(input.googleCanonical);
  const userCanonical = normalizeCanonical(input.userCanonical);
  const criticalFetchStates = new Set([
    'ACCESS_DENIED',
    'NOT_FOUND',
    'ROBOTS_TXT_BLOCKED',
    'SERVER_ERROR',
    'SOFT_404',
  ]);
  const blockedIndexingStates = new Set(['BLOCKED_BY_META_TAG', 'BLOCKED_BY_ROBOTS_TXT']);

  let health: IndexMonitorHealth = 'healthy';
  let issueCode: string | null = null;
  let issue = 'Indexada normalmente pelo Google.';

  if (
    input.verdict === 'FAIL'
    || input.robotsTxtState === 'DISALLOWED'
    || blockedIndexingStates.has(input.indexingState || '')
    || criticalFetchStates.has(input.pageFetchState || '')
  ) {
    health = 'critical';
    issueCode = 'blocked-or-fetch-failed';
    issue = 'O Google encontrou um bloqueio ou não conseguiu carregar esta página.';
  } else if (googleCanonical && expectedCanonical && googleCanonical !== expectedCanonical) {
    health = 'critical';
    issueCode = 'canonical-mismatch';
    issue = 'O Google escolheu outra URL como canônica.';
  } else if (userCanonical && expectedCanonical && userCanonical !== expectedCanonical) {
    health = 'critical';
    issueCode = 'declared-canonical-mismatch';
    issue = 'A página declara uma URL canônica diferente da esperada.';
  } else if (input.verdict !== 'PASS') {
    health = 'attention';
    issueCode = 'not-indexed-yet';
    issue = input.coverageState || 'A página ainda não foi confirmada no índice do Google.';
  }

  return {
    url: input.url,
    type: input.type,
    label: input.label,
    health,
    issueCode,
    issue,
    verdict: input.verdict || 'VERDICT_UNSPECIFIED',
    coverageState: input.coverageState || null,
    lastCrawlTime: input.lastCrawlTime || null,
    googleCanonical: input.googleCanonical || null,
    userCanonical: input.userCanonical || null,
  };
};

export const summarizeIndexMonitor = (
  items: Array<ReturnType<typeof evaluateIndexMonitorItem>>,
  checkedAt: string,
  partial = false,
) => ({
  checkedAt,
  checked: items.length,
  healthy: items.filter((item) => item.health === 'healthy').length,
  attention: items.filter((item) => item.health === 'attention').length,
  critical: items.filter((item) => item.health === 'critical').length,
  partial,
  items,
});

export const normalizePageSpeedStrategy = (value: unknown): PageSpeedStrategy | null =>
  value === 'mobile' || value === 'desktop' ? value : null;

export const scoreToPercent = (value: unknown) => {
  const score = Number(value);
  return Number.isFinite(score) ? Math.round(Math.max(0, Math.min(1, score)) * 100) : null;
};

export const buildPageSpeedRecommendations = (
  audits: Record<string, Record<string, unknown>> | null | undefined,
  limit = 4,
) => Object.values(audits || {})
  .filter((audit) => {
    const mode = String(audit.scoreDisplayMode || '');
    const score = Number(audit.score);
    const details = audit.details as Record<string, unknown> | undefined;
    const savingsMs = Number(details?.overallSavingsMs || 0);
    const savingsBytes = Number(details?.overallSavingsBytes || 0);
    return mode !== 'notApplicable'
      && mode !== 'manual'
      && Number.isFinite(score)
      && score < 0.9
      && (savingsMs > 0 || savingsBytes > 0 || mode === 'binary');
  })
  .map((audit) => {
    const details = audit.details as Record<string, unknown> | undefined;
    const savingsMs = Math.max(0, Number(details?.overallSavingsMs || 0));
    const savingsBytes = Math.max(0, Number(details?.overallSavingsBytes || 0));
    return {
      id: String(audit.id || ''),
      title: String(audit.title || 'Melhoria recomendada'),
      displayValue: typeof audit.displayValue === 'string' ? audit.displayValue : null,
      savingsMs: Math.round(savingsMs),
      savingsBytes: Math.round(savingsBytes),
      priority: savingsMs + (savingsBytes / 1000),
    };
  })
  .sort((a, b) => b.priority - a.priority)
  .slice(0, Math.max(0, Math.min(limit, 4)))
  .map(({ priority: _priority, ...item }) => item);

export const buildPreviousSearchConsoleDateRange = (
  current: ReturnType<typeof buildSearchConsoleDateRange>,
  periodDays: SearchConsolePeriod,
) => {
  const end = new Date(`${current.startDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - periodDays + 1);

  return {
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
    dataDelayDays: current.dataDelayDays,
  };
};

const percentChange = (current: number, previous: number) =>
  previous > 0 ? Number(((((current - previous) / previous) * 100)).toFixed(4)) : null;

export const buildMetricComparison = (
  current: SearchConsoleMetric,
  previous: SearchConsoleMetric,
) => ({
  previous,
  changes: {
    clicksPercent: percentChange(current.clicks, previous.clicks),
    impressionsPercent: percentChange(current.impressions, previous.impressions),
    ctrPoints: Number(((current.ctr - previous.ctr) * 100).toFixed(4)),
    position: previous.position > 0 && current.position > 0
      ? Number((previous.position - current.position).toFixed(4))
      : null,
  },
});

const compactTarget = (value: string) => {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || '/';
  } catch {
    return value;
  }
};

export const buildSeoOpportunities = ({
  queries,
  pages,
  previousPages,
  limit = 5,
}: {
  queries: SearchConsoleDimensionMetric[];
  pages: SearchConsoleDimensionMetric[];
  previousPages: SearchConsoleDimensionMetric[];
  limit?: number;
}): SeoOpportunity[] => {
  const candidates: Array<SeoOpportunity & { score: number }> = [];

  for (const query of queries) {
    if (!query.key || query.impressions < 3 || query.position < 4 || query.position > 15) continue;
    candidates.push({
      kind: 'quick-win',
      target: query.key,
      title: 'Consulta perto da primeira página',
      detail: `${query.impressions} impressões · posição média ${query.position.toFixed(1)}`,
      priority: query.impressions >= 20 ? 'high' : 'medium',
      score: query.impressions * (16 - query.position) * Math.max(0.15, 1 - query.ctr),
    });
  }

  for (const page of pages) {
    if (!page.key || page.impressions < 5 || page.ctr >= 0.03 || page.position > 20) continue;
    candidates.push({
      kind: 'low-ctr',
      target: compactTarget(page.key),
      title: 'Página aparece, mas recebe poucos cliques',
      detail: `${page.impressions} impressões · CTR ${(page.ctr * 100).toFixed(1)}%`,
      priority: page.impressions >= 20 ? 'high' : 'medium',
      score: page.impressions * Math.max(0.1, 0.03 - page.ctr) * 100,
    });
  }

  const currentByPage = new Map(pages.map((page) => [page.key, page]));
  for (const previous of previousPages) {
    if (!previous.key || previous.impressions < 5) continue;
    const current = currentByPage.get(previous.key);
    const currentImpressions = current?.impressions || 0;
    const loss = previous.impressions - currentImpressions;
    if (loss <= 0 || currentImpressions > previous.impressions * 0.7) continue;
    candidates.push({
      kind: 'declining',
      target: compactTarget(previous.key),
      title: 'Queda de visibilidade no Google',
      detail: `${previous.impressions} → ${currentImpressions} impressões`,
      priority: loss >= 20 ? 'high' : 'medium',
      score: loss * 4,
    });
  }

  const seen = new Set<string>();
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const key = `${item.kind}:${item.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(0, Math.min(limit, 5)))
    .map(({ score: _score, ...item }) => item);
};

export const normalizeSearchConsoleAction = (value: unknown) =>
  value === 'inspect-url' || value === 'pagespeed'
    ? value
    : value === 'overview' || value == null ? 'overview' : null;

export const normalizeInspectionUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 2048) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'agrobw.com.br') return null;
    if (url.username || url.password || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
};
