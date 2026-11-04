import { createCircleParticipationSession, type CircleParticipationModel, type CircleSessionRequest } from './participation-session';

/** Opaque scope changes on account/session replacement. No token enters a view. */
export type CircleOwner = {
  scope(): string | null;
  bearer(expectedScope: string): Promise<string | null>;
  subscribe(listener: () => void): () => void;
};
export type CircleTransport = (url: string, init: {
  method: 'GET' | 'POST'; headers: Record<string, string>; body?: string;
  cache: 'no-store'; redirect: 'error'; credentials: 'omit'; signal: AbortSignal;
}) => Promise<{ status: number; url: string; redirected: boolean; json(): Promise<unknown> }>;
/** A native transport must reject redirects BEFORE forwarding credentials.
 * React Native's default fetch is deliberately not selected here. */
export type CircleHostConfig = { circleId: string; origin: string; owner: CircleOwner; transport: CircleTransport; timeoutMs?: number };
export type CircleHostModel = { configured: boolean; connected: boolean; active: boolean; online: boolean; status: string; participation: CircleParticipationModel };
export function approvedOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Explicit HTTPS application origin required');
  return url.origin;
}
export function createCircleHost(config: CircleHostConfig) {
  if (typeof config?.owner?.scope !== 'function' || typeof config.owner.bearer !== 'function' || typeof config.owner.subscribe !== 'function' || typeof config.transport !== 'function') throw Error('Existing session owner and approved transport required');
  const origin = approvedOrigin(config.origin);
  const timeout = config.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw Error('Invalid deadline');
  let attached = false, active = true, online = true, scope: string | null = null, unsubscribe = () => {};
  const listeners = new Set<(model: CircleHostModel) => void>();
  const pendingRequests = new Set<AbortController>();
  const abortPending = () => { for (const pending of pendingRequests) pending.abort(); };
  const current = (expected: string) => attached && active && online && scope === expected && config.owner.scope() === expected;
  const request: CircleSessionRequest = async (path, options, mayTransmit) => {
    if (path !== `/api/book-salons/${encodeURIComponent(config.circleId)}` || !['GET','POST'].includes(options.method)) throw Error('Unexpected Circle operation');
    const expected = scope;
    if (!expected || !current(expected) || !mayTransmit()) throw Error('Circle session unavailable');
    const abort = new AbortController(); pendingRequests.add(abort);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(Error('Circle deadline exceeded')); }, timeout); });
    try {
      return await Promise.race([deadline, (async () => {
        const bearer = await config.owner.bearer(expected);
        if (!bearer || bearer.length > 16384 || /[\s\u0000-\u001f\u007f]/.test(bearer) || abort.signal.aborted || !current(expected) || !mayTransmit()) throw Error('Circle session changed');
        const response = await config.transport(origin + path, { ...options, credentials: 'omit', signal: abort.signal,
          headers: { Authorization: `Bearer ${bearer}`, ...(options.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) } });
        // Rejecting the reply is additional validation, not a substitute for a
        // native transport's pre-forwarding redirect policy.
        if (response.redirected || response.url !== origin + path) throw Error('Unexpected Circle response origin');
        if (abort.signal.aborted || !current(expected) || !mayTransmit()) throw Error('Circle lifetime ended');
        if (options.method === 'POST' && [401, 403, 404].includes(response.status)) participation.retire();
        const body = await response.json();
        if (abort.signal.aborted || !current(expected) || !mayTransmit()) throw Error('Circle lifetime ended');
        return { http: response.status, body };
      })()]);
    } finally { clearTimeout(timer); pendingRequests.delete(abort); }
  };
  const participation = createCircleParticipationSession(request, config.circleId);
  const model = (): CircleHostModel => ({ configured: true, connected: attached && scope !== null, active, online,
    status: !attached || !scope ? 'Connect the existing member session to read this circle.' : !active ? 'Private circle views cleared while inactive.' : !online ? 'Offline. Private views and draft cleared. Requests already sent may still complete.' : 'Refresh to check current circle membership.',
    participation: participation.model() });
  const emit = () => { for (const listener of listeners) listener(model()); };
  participation.subscribe(emit);
  const sync = () => { abortPending(); scope = config.owner.scope(); participation.retire(); participation.activity(attached && active && online && scope !== null); emit(); };
  return {
    model,
    subscribe(listener: (m: CircleHostModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() { if (attached) return; attached = true; unsubscribe = config.owner.subscribe(sync); sync(); },
    disconnect() { abortPending(); attached = false; scope = null; unsubscribe(); unsubscribe = () => {}; participation.close(); participation.activity(false); emit(); },
    activity(value: boolean) { if (!value) abortPending(); active = value; participation.activity(attached && active && online && scope !== null); emit(); },
    connectivity(value: boolean) { if (!value) abortPending(); online = value; participation.activity(attached && active && online && scope !== null); emit(); },
    async refresh() { if (scope && current(scope)) await participation.open(); },
    edit: participation.edit, clearDraft: participation.clearDraft, post: participation.post, startNewAfterReview: participation.startNewAfterReview,
    close() { abortPending(); participation.close(); },
  };
}
export type CircleHost = ReturnType<typeof createCircleHost>;
