export type CommunitySummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type DirectoryFailure = 'http' | 'network' | 'malformed' | 'timeout';
export type DirectoryState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; communities: CommunitySummary[] }
  | { kind: 'error'; reason: DirectoryFailure };

export const DIRECTORY_TIMEOUT_MS = 10_000;
export const DIRECTORY_MAX_BYTES = 128 * 1024;

class DirectoryReadError extends Error {
  constructor(readonly reason: DirectoryFailure) {
    super(reason);
  }
}

const malformed = (): never => { throw new DirectoryReadError('malformed'); };
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= limit;

/** Project only the public directory fields; never use `mine` or deployment labels. */
export function decodeDirectory(value: unknown): CommunitySummary[] {
  if (!object(value) || Object.hasOwn(value, 'error') || !Array.isArray(value.discover) || value.discover.length > 20) return malformed();
  const ids = new Set<string>();
  const slugs = new Set<string>();
  return value.discover.map((entry: unknown) => {
    if (!object(entry) || !text(entry.id, 128) || !text(entry.name, 200) ||
        typeof entry.slug !== 'string' || !/^[a-z0-9-]{1,50}$/.test(entry.slug) ||
        !(entry.description === null || (typeof entry.description === 'string' && entry.description.length <= 8192))) return malformed();
    const id = entry.id.trim();
    if (ids.has(id) || slugs.has(entry.slug)) return malformed();
    ids.add(id);
    slugs.add(entry.slug);
    return { id, slug: entry.slug, name: entry.name.trim(), description: entry.description };
  });
}

type Clock = { setTimer: (callback: () => void, delay: number) => unknown; clearTimer: (handle: unknown) => void };
type Read = { controller: AbortController; timer?: unknown; body?: ReadableStream<Uint8Array> | null; reader?: ReadableStreamDefaultReader<Uint8Array> };
type Options = { emit: (state: DirectoryState) => void; fetcher?: typeof fetch; clock?: Clock };

/** One request at a time. The deadline includes response-body reading. */
export function createDirectoryReader({ emit, fetcher = fetch, clock = {
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
} }: Options) {
  let active: Read | null = null;
  let disposed = false;
  const current = (read: Read) => !disposed && active === read;
  const cancel = (read: Read) => {
    read.controller.abort();
    void (read.reader ? read.reader.cancel() : read.body?.cancel())?.catch(() => undefined);
  };
  const finish = (read: Read, state: DirectoryState) => {
    if (!current(read)) return;
    active = null;
    clock.clearTimer(read.timer);
    if (state.kind === 'error') cancel(read);
    emit(state);
  };

  async function readBody(response: Response, read: Read) {
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (type !== 'application/json' && !type?.endsWith('+json')) return malformed();
    const length = response.headers.get('content-length');
    if (length && /^\d+$/.test(length) && Number(length) > DIRECTORY_MAX_BYTES) return malformed();
    if (!response.body) return malformed();
    const reader = response.body.getReader();
    read.reader = reader;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let body = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (!current(read)) throw new DirectoryReadError('network');
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > DIRECTORY_MAX_BYTES) return malformed();
        try { body += decoder.decode(chunk.value, { stream: true }); }
        catch { return malformed(); }
      }
      try { body += decoder.decode(); }
      catch { return malformed(); }
      let value: unknown;
      try { value = JSON.parse(body); }
      catch { return malformed(); }
      return decodeDirectory(value);
    } finally {
      // Cancel incomplete bodies before releasing the lock. No cancellation is awaited.
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
      read.reader = undefined;
    }
  }

  return {
    load() {
      if (disposed || active) return;
      const read: Read = { controller: new AbortController() };
      active = read;
      emit({ kind: 'loading' });
      read.timer = clock.setTimer(() => finish(read, { kind: 'error', reason: 'timeout' }), DIRECTORY_TIMEOUT_MS);
      void (async () => {
        try {
          const response = await fetcher('/api/communities', {
            method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
            referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' }, signal: read.controller.signal,
          });
          read.body = response.body;
          if (!current(read)) { cancel(read); return; }
          if (!response.ok) throw new DirectoryReadError('http');
          const communities = await readBody(response, read);
          finish(read, communities.length ? { kind: 'ready', communities } : { kind: 'empty' });
        } catch (error) {
          finish(read, { kind: 'error', reason: error instanceof DirectoryReadError ? error.reason : 'network' });
        }
      })();
    },
    dispose() {
      disposed = true;
      const read = active;
      active = null;
      if (read) { clock.clearTimer(read.timer); cancel(read); }
    },
  };
}
