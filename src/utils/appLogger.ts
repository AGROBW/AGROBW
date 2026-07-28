import { isDebugEnabled } from './debugLog';

type LogLevel = 'warn' | 'error';

type BrowserErrorReporter = (payload: {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}) => void;

let customReporter: BrowserErrorReporter | null = null;

declare global {
  interface Window {
    __BWAGRO_REPORT_ERROR__?: BrowserErrorReporter;
  }
}

const hasWindow = typeof window !== 'undefined';

export const serializeError = (error: unknown, options?: { includeStack?: boolean }) => {
  const includeStack = options?.includeStack ?? false;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: includeStack ? error.stack : undefined,
    };
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch {
      return { message: String(error) };
    }
  }

  return { message: String(error) };
};

const emitBrowserReport = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
  if (typeof customReporter === 'function') {
    try {
      customReporter({ level, message, context });
    } catch {
      // silencioso para não mascarar o erro original
    }
  }

  if (!hasWindow || typeof window.__BWAGRO_REPORT_ERROR__ !== 'function') return;

  try {
    window.__BWAGRO_REPORT_ERROR__({ level, message, context });
  } catch {
    // silencioso para não mascarar o erro original
  }
};

const logWithLevel = (
  level: LogLevel,
  message: string,
  error?: unknown,
  context?: Record<string, unknown>
) => {
  const consolePayload = {
    ...(context || {}),
    ...(error !== undefined
      ? { error: serializeError(error, { includeStack: import.meta.env.DEV }) }
      : {}),
  };

  const reporterPayload = {
    ...(context || {}),
    ...(error !== undefined ? { error: serializeError(error, { includeStack: true }) } : {}),
  };

  if (level === 'warn') {
    if (isDebugEnabled) {
      console.warn(message, consolePayload);
    }
  } else {
    console.error(message, consolePayload);
  }

  emitBrowserReport(level, message, reporterPayload);
};

export const appWarn = (message: string, context?: Record<string, unknown>) => {
  logWithLevel('warn', message, undefined, context);
};

export const appError = (
  message: string,
  error?: unknown,
  context?: Record<string, unknown>
) => {
  logWithLevel('error', message, error, context);
};

export const setAppErrorReporter = (reporter: BrowserErrorReporter | null) => {
  customReporter = reporter;
};
