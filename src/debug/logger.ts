const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const encoder = new TextEncoder();

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'error';
  action: string;
  componentIds: string[];
  /** Diagram occurrences, distinct from shared component identities. */
  nodeIds?: string[];
  message?: string;
  stack?: string | null;
  truncated?: boolean;
}

export interface ActionOptions { componentIds?: string[]; nodeIds?: string[] }
export interface ExportOptions { projectState?: unknown }
export interface LoggerOptions {
  appVersion?: string;
  commitId?: string;
  browserVersion?: string;
  maxBytes?: number;
  debugEnabled?: boolean;
  now?: () => string;
}

function byteLength(value: string) {
  return encoder.encode(value).byteLength;
}

function normalizeIds(ids: string[]) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map(String))];
}

function errorFields(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null };
  }
  return { message: String(error), stack: null };
}

/** A bounded, in-memory log for browser applications. No user input events are captured. */
export function createDebugLogger({
  appVersion = 'unknown',
  commitId = 'unknown',
  browserVersion = globalThis.navigator?.userAgent ?? 'unknown',
  maxBytes = DEFAULT_MAX_BYTES,
  debugEnabled = false,
  now = () => new Date().toISOString(),
}: LoggerOptions = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 256) {
    throw new RangeError('maxBytes must be an integer of at least 256');
  }

  const entries: { value: LogEntry; size: number }[] = [];
  const listeners = new Set<() => void>();
  let totalBytes = 0;
  let enabled = Boolean(debugEnabled);

  function append(entry: LogEntry) {
    // Keep even an oversized exception: trim its text until the record fits.
    const record = { ...entry };
    let serialized = JSON.stringify(record);
    while (byteLength(serialized) > maxBytes) {
      const field = record.stack ? 'stack' : record.message ? 'message' : null;
      if (!field) {
        record.componentIds = [];
        if (record.nodeIds !== undefined) record.nodeIds = [];
        record.action = 'oversized-record';
        record.truncated = true;
        serialized = JSON.stringify(record);
        if (byteLength(serialized) > maxBytes) return false;
        break;
      }
      const text = record[field] ?? '';
      record[field] = text.slice(0, Math.floor(text.length / 2));
      record.truncated = true;
      serialized = JSON.stringify(record);
    }

    const size = byteLength(serialized);
    while (totalBytes + size > maxBytes) {
      totalBytes -= entries.shift()!.size;
    }
    entries.push({ value: record, size });
    totalBytes += size;
    return true;
  }

  function logAction(action: string, { componentIds = [], nodeIds }: ActionOptions = {}) {
    if (!enabled) return false;
    return append({
      timestamp: now(), level: 'debug', action: String(action),
      componentIds: normalizeIds(componentIds),
      ...(nodeIds === undefined ? {} : { nodeIds: normalizeIds(nodeIds) }),
    });
  }

  function logError(action: string, error: unknown, { componentIds = [], nodeIds }: ActionOptions = {}) {
    return append({
      timestamp: now(), level: 'error', action: String(action),
      componentIds: normalizeIds(componentIds),
      ...(nodeIds === undefined ? {} : { nodeIds: normalizeIds(nodeIds) }), ...errorFields(error),
    });
  }

  function runAction<T>(action: string, callback: () => T, options: ActionOptions = {}): T {
    logAction(action, options);
    try {
      const result = callback();
      if (result && typeof (result as { then?: unknown }).then === 'function') {
        return Promise.resolve(result).catch((error) => {
          logError(action, error, options);
          throw error;
        }) as T;
      }
      return result;
    } catch (error) {
      logError(action, error, options);
      throw error;
    }
  }

  function getEntries() {
    return entries.map(({ value }) => structuredClone(value));
  }

  function exportJson({ projectState }: ExportOptions = {}) {
    const payload = {
      formatVersion: 1,
      exportedAt: now(),
      appVersion: String(appVersion),
      commitId: String(commitId),
      browserVersion: String(browserVersion),
      debugEnabled: enabled,
      entries: getEntries(),
      ...(projectState === undefined ? {} : { projectState }),
    };
    return JSON.stringify(payload, null, 2);
  }

  return {
    logAction, logError, runAction, getEntries, exportJson,
    get debugEnabled() { return enabled; },
    setDebugEnabled(value: boolean) {
      enabled = value;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    get byteLength() { return totalBytes; },
    get maxBytes() { return maxBytes; },
  };
}

/** Capture uncaught browser exceptions and rejected promises, including in normal mode. */
export type DebugLogger = ReturnType<typeof createDebugLogger>;

export function installGlobalErrorHandlers(logger: DebugLogger, target: Window = window) {
  const onError = (event: ErrorEvent) => logger.logError('uncaught-exception', event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => logger.logError('unhandled-rejection', event.reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
