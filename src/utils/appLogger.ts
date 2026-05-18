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

export const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: import.meta.env.DEV ? error.stack : undefined,
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
  const payload = {
    ...(context || {}),
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  };

  if (level === 'warn') {
    console.warn(message, payload);
  } else {
    console.error(message, payload);
  }

  emitBrowserReport(level, message, payload);
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
