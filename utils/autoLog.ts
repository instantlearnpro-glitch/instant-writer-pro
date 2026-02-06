type AutoLogLevel = 'info' | 'warn' | 'error';
type AutoLogType = 'app_start' | 'app_close' | 'error' | 'unhandled_rejection' | 'resource_error' | 'console_error' | 'stall';

export type AutoLogEntry = {
  id: string;
  ts: number;
  level: AutoLogLevel;
  type: AutoLogType;
  message: string;
  stack?: string;
  url?: string;
  extra?: Record<string, string | number | boolean | null>;
};

type AutoLogContext = {
  fileName?: string;
};

type AutoLogOptions = {
  captureConsole?: boolean;
  maxEntries?: number;
  stallIntervalMs?: number;
  stallThresholdMs?: number;
  getContext?: () => AutoLogContext;
};

const LOG_KEY = 'spywriter_autolog_v1';

const safeParse = (raw: string | null): AutoLogEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readLogs = (): AutoLogEntry[] => safeParse(localStorage.getItem(LOG_KEY));

const writeLogs = (entries: AutoLogEntry[]) => {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage errors
  }
};

const toMessage = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || 'Error';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatArgs = (args: unknown[]): string => {
  return args.map(toMessage).join(' ');
};

const createEntry = (data: Omit<AutoLogEntry, 'id' | 'ts'>): AutoLogEntry => ({
  id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  ts: Date.now(),
  ...data
});

const appendLog = (entry: AutoLogEntry, maxEntries: number) => {
  const next = [...readLogs(), entry].slice(-maxEntries);
  writeLogs(next);
};

const buildExtra = (getContext?: () => AutoLogContext): Record<string, string> => {
  const context = getContext ? getContext() : {};
  return {
    fileName: context.fileName || '',
    userAgent: navigator.userAgent,
    url: window.location.href
  };
};

export const initAutoLog = (options?: AutoLogOptions) => {
  const maxEntries = options?.maxEntries ?? 200;
  const captureConsole = options?.captureConsole ?? true;
  const stallIntervalMs = options?.stallIntervalMs ?? 2000;
  const stallThresholdMs = options?.stallThresholdMs ?? 1200;
  const getContext = options?.getContext;

  appendLog(createEntry({
    level: 'info',
    type: 'app_start',
    message: 'App started',
    extra: buildExtra(getContext)
  }), maxEntries);

  const handleError = (event: ErrorEvent) => {
    const message = event.message || 'Unhandled error';
    const stack = event.error && event.error.stack ? String(event.error.stack) : undefined;
    const url = event.filename || undefined;
    appendLog(createEntry({
      level: 'error',
      type: 'error',
      message,
      stack,
      url,
      extra: buildExtra(getContext)
    }), maxEntries);
  };

  const handleResourceError = (event: Event) => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName ? target.tagName.toLowerCase() : 'resource';
    const src = (target && 'src' in target ? (target as HTMLImageElement).src : '') || '';
    if (!src) return;
    appendLog(createEntry({
      level: 'warn',
      type: 'resource_error',
      message: `${tag} failed to load: ${src}`,
      extra: buildExtra(getContext)
    }), maxEntries);
  };

  const handleRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason as unknown;
    const message = reason instanceof Error ? reason.message : toMessage(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    appendLog(createEntry({
      level: 'error',
      type: 'unhandled_rejection',
      message,
      stack,
      extra: buildExtra(getContext)
    }), maxEntries);
  };

  window.addEventListener('error', handleError);
  window.addEventListener('error', handleResourceError, true);
  window.addEventListener('unhandledrejection', handleRejection);

  let originalConsoleError: ((...args: unknown[]) => void) | null = null;
  if (captureConsole) {
    originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      appendLog(createEntry({
        level: 'error',
        type: 'console_error',
        message: formatArgs(args),
        extra: buildExtra(getContext)
      }), maxEntries);
      originalConsoleError?.(...args);
    };
  }

  let lastTick = performance.now();
  let lastStallLoggedAt = 0;
  const stallTimer = window.setInterval(() => {
    const now = performance.now();
    const drift = now - lastTick - stallIntervalMs;
    if (drift > stallThresholdMs && Date.now() - lastStallLoggedAt > 10000) {
      lastStallLoggedAt = Date.now();
      appendLog(createEntry({
        level: 'warn',
        type: 'stall',
        message: `Event loop blocked for ${Math.round(drift)}ms`,
        extra: buildExtra(getContext)
      }), maxEntries);
    }
    lastTick = now;
  }, stallIntervalMs);

  const handleBeforeUnload = () => {
    appendLog(createEntry({
      level: 'info',
      type: 'app_close',
      message: 'App closed',
      extra: buildExtra(getContext)
    }), maxEntries);
  };

  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('error', handleResourceError, true);
    window.removeEventListener('unhandledrejection', handleRejection);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.clearInterval(stallTimer);
    if (captureConsole && originalConsoleError) {
      console.error = originalConsoleError;
    }
  };
};

export const getAutoLog = () => readLogs();

export const clearAutoLog = () => {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    // ignore
  }
};

export const downloadAutoLog = (fileName = 'spywriter-autolog.json') => {
  const entries = readLogs();
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
