const SESSION_STORAGE_KEY = 'bwagro:analytics-session-id';

export const ensureSiteAnalyticsSessionId = () => {
  if (typeof window === 'undefined') return '';

  const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (stored) return stored;

  const sessionId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
};

export const getSiteAnalyticsDeviceType = () => {
  if (typeof window === 'undefined') return 'unknown';

  const ua = window.navigator.userAgent.toLowerCase();
  if (/mobile|iphone|android(?!.*tablet)/.test(ua)) return 'mobile';
  if (/ipad|tablet/.test(ua)) return 'tablet';
  return 'desktop';
};
