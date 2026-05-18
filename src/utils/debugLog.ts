const hasWindow = typeof window !== 'undefined';

const isLocalStorageDebugEnabled = () => {
  if (!hasWindow) return false;

  try {
    return window.localStorage.getItem('bwagro:debug') === 'true';
  } catch {
    return false;
  }
};

export const isDebugEnabled = import.meta.env.DEV || isLocalStorageDebugEnabled();

export const debugLog = (...args: unknown[]) => {
  if (!isDebugEnabled) return;
  console.log(...args);
};
