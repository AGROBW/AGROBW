const COUNTS_REFRESH_EVENT = 'bwagro:counts-refresh';

export const emitCountsRefresh = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COUNTS_REFRESH_EVENT));
};

export const subscribeToCountsRefresh = (callback: () => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener(COUNTS_REFRESH_EVENT, callback);
  return () => window.removeEventListener(COUNTS_REFRESH_EVENT, callback);
};
