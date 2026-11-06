import { createCircleParticipationSession, type CircleParticipationModel, type CircleSessionRequest } from './participation-session';
import { createDiscussionArchive, type ArchiveModel, type ArchiveQuery } from '../../../shared/archive';
import { createThreadWriter, type ThreadWriteModel } from '../../../shared/thread-writer';
import { createMessageSafety, type MessageSafetyModel } from '../../../shared/message-safety';
import { parseDiscussionQuery } from '../../../../lib/circles/thread';
import { isUuid } from '../../../../lib/ids/uuid';

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
export type CircleHostConfig = { circleId: string; origin: string; owner: CircleOwner; transport: CircleTransport; publicProfileTransport?: CircleTransport; timeoutMs?: number; initialOnline?: boolean; newRequestId?: () => Promise<string> };
export type CircleHostModel = { configured: boolean; connected: boolean; active: boolean; online: boolean; status: string; participation: CircleParticipationModel; archive: ArchiveModel; threadWrite: ThreadWriteModel; messageSafety: MessageSafetyModel };
export function approvedOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Explicit HTTPS application origin required');
  return url.origin;
}
export function createCircleHost(config: CircleHostConfig) {
  if (!isUuid(config?.circleId) || typeof config?.owner?.scope !== 'function' || typeof config.owner.bearer !== 'function' || typeof config.owner.subscribe !== 'function' || typeof config.transport !== 'function') throw Error('Existing session owner and approved transport required');
  const circleId = config.circleId.toLowerCase();
  const origin = approvedOrigin(config.origin);
  const timeout = config.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw Error('Invalid deadline');
  if (config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean') throw Error('Invalid connectivity state');
  if (config.newRequestId !== undefined && typeof config.newRequestId !== 'function') throw Error('Invalid request key factory');
  // Existing/Quest callers retain their previous default. Native screens always
  // opt into false until a trusted connectivity observer confirms online.
  let attached = false, active = true, online = config.initialOnline ?? true, scope: string | null = null, unsubscribe = () => {};
  const listeners = new Set<(model: CircleHostModel) => void>();
  const pendingRequests = new Set<AbortController>();
  const abortPending = () => { for (const pending of pendingRequests) pending.abort(); };
  const current = (expected: string) => attached && active && online && scope === expected && config.owner.scope() === expected;
  const request: CircleSessionRequest = async (path, options, mayTransmit) => {
    const url = new URL(path, origin), query = parseDiscussionQuery(url.searchParams);
    const discussionPath = `/api/circles/${circleId}/discussion`;
    const discussion = url.pathname === discussionPath && (options.method === 'GET' ? query !== null : options.method === 'POST' && !url.search);
    const preview = url.pathname === `${discussionPath}/preview` && options.method === 'POST' && !url.search;
    const messagePath = /^\/api\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(url.pathname);
    const safety = messagePath && messagePath[1] === circleId && isUuid(messagePath[2]) && !url.search;
    if (path !== url.pathname + url.search || url.hash || url.origin !== origin
      || !(discussion || preview || safety || path === `/api/book-salons/${circleId}`) || !['GET','POST'].includes(options.method)) throw Error('Unexpected Circle operation');
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
        if ([401, 403, 404].includes(response.status)) { participation.retire(); archive.retire(); threadWrite.retire(); messageSafety.retire(); }
        const body = await response.json();
        if (abort.signal.aborted || !current(expected) || !mayTransmit()) throw Error('Circle lifetime ended');
        return { http: response.status, body };
      })()]);
    } finally { clearTimeout(timer); pendingRequests.delete(abort); }
  };
  const participation = createCircleParticipationSession(request, circleId);
  const archive = createDiscussionArchive(request, circleId);
  const newRequestId = config.newRequestId ? async () => {
    const expected = scope;
    if (!expected || !current(expected)) throw Error('Circle session unavailable');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([Promise.resolve().then(() => {
        if (!current(expected)) throw Error('Circle session changed');
        return config.newRequestId!();
      }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Request key deadline exceeded')), timeout); })]);
      if (!current(expected) || !isUuid(value)) throw Error('Request key unavailable');
      return value.toLowerCase();
    } finally { clearTimeout(timer); }
  } : undefined;
  const threadWrite = createThreadWriter(request, circleId, newRequestId);
  const messageSafety = createMessageSafety(request, circleId, newRequestId);
  const model = (): CircleHostModel => ({ configured: true, connected: attached && scope !== null, active, online,
    status: !attached || !scope ? 'Connect the existing member session to read this circle.' : !active ? 'Private circle views cleared while inactive.' : !online ? 'Offline. Private views and draft cleared. Requests already sent may still complete.' : 'Refresh to check current circle membership.',
    participation: participation.model(), archive: archive.model(), threadWrite: threadWrite.model(), messageSafety: messageSafety.model() });
  const emit = () => { for (const listener of listeners) listener(model()); };
  participation.subscribe(emit);
  archive.subscribe(value => { threadWrite.access(value.page, value.revision); emit(); });
  threadWrite.subscribe(emit);
  messageSafety.subscribe(emit);
  const setActivity = () => { const enabled = attached && active && online && scope !== null; participation.activity(enabled); archive.activity(enabled); threadWrite.activity(enabled); messageSafety.activity(enabled); };
  const sync = () => { abortPending(); scope = config.owner.scope(); participation.retire(); archive.retire(); threadWrite.retire(); messageSafety.retire(); setActivity(); emit(); };
  const canNavigate = () => threadWrite.model().canNavigate && messageSafety.model().canNavigate && !participation.model().write.busy;
  const afterWrite = async (operation: () => Promise<void>) => { await operation(); if (threadWrite.model().phase === 'confirmed') archive.retire('Posting confirmed. Open the saved message for a fresh thread read.'); };
  return {
    model,
    subscribe(listener: (m: CircleHostModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() { if (attached) return; attached = true; unsubscribe = config.owner.subscribe(sync); sync(); },
    disconnect() { abortPending(); attached = false; scope = null; unsubscribe(); unsubscribe = () => {}; participation.close(); archive.close(); threadWrite.close(); messageSafety.retire(); setActivity(); emit(); },
    activity(value: boolean) { if (!value) abortPending(); active = value; setActivity(); emit(); },
    connectivity(value: boolean) { if (!value) abortPending(); online = value; setActivity(); emit(); },
    async refresh() { if (scope && current(scope) && canNavigate()) { messageSafety.retire(); archive.close(); await participation.open(); } },
    async openArchive() { if (scope && current(scope) && canNavigate()) { messageSafety.retire(); participation.retire(); await archive.open(); } },
    async followLatestArchive(mayFollow: () => boolean) {
      const expected = scope;
      if (!expected) return;
      await archive.followLatest(() => current(expected) && mayFollow() && canNavigate()
        && !messageSafety.model().open && threadWrite.model().phase === 'locked');
    },
    archiveSelection: () => archive.currentQuery(),
    async restoreArchive(query: ArchiveQuery) { if (scope && current(scope) && canNavigate()) { messageSafety.retire(); participation.retire(); await archive.restore(query); } },
    archiveNext() { if (!canNavigate()) return Promise.resolve(); messageSafety.retire(); return archive.next(); },
    archiveThread(id: string) { if (!canNavigate()) return Promise.resolve(); messageSafety.retire(); return archive.thread(id); },
    edit(value: string) { return canNavigate() && participation.edit(value); },
    clearDraft() { if (canNavigate()) participation.clearDraft(); },
    post() { return canNavigate() ? participation.post() : Promise.resolve(); },
    startNewAfterReview() { if (canNavigate()) participation.startNewAfterReview(); },
    threadStart(parentId: string | null) { if (!canNavigate()) return false; const started = threadWrite.start(parentId); if (started) { messageSafety.retire(); participation.retire(); } return started; },
    threadEdit: threadWrite.edit, threadReview: threadWrite.review, threadConfirm: threadWrite.confirm,
    threadPost: () => messageSafety.model().canNavigate ? afterWrite(threadWrite.post) : Promise.resolve(),
    threadLookup: () => messageSafety.model().canNavigate ? afterWrite(threadWrite.lookup) : Promise.resolve(),
    threadRetry: () => messageSafety.model().canNavigate ? afterWrite(threadWrite.retry) : Promise.resolve(),
    threadCancel: threadWrite.cancel, threadEditReview: threadWrite.editReview,
    async messageOpen(id: string) {
      if (!scope || !current(scope) || !canNavigate() || !isUuid(id)) return;
      const page = archive.model().page;
      const items = page?.kind === 'thread' ? [page.root, page.focus, ...page.items] : page?.items ?? [];
      if (!items.some(item => item.id.toLowerCase() === id.toLowerCase())) return;
      // Only a fresh safety DTO may decide authority. Authors can still withdraw
      // their own contribution after leaving; do not impose a membership gate.
      participation.retire(); archive.retire(); threadWrite.retire();
      await messageSafety.open(id);
    },
    messageRefresh: messageSafety.refresh, messageReason: messageSafety.reason, messageNote: messageSafety.note,
    messageConfirm: messageSafety.confirm, messageSubmit: messageSafety.submit, messageRetry: messageSafety.retry, messageClose: messageSafety.close,
    close() { abortPending(); participation.close(); archive.close(); threadWrite.close(); messageSafety.retire(); },
  };
}
export type CircleHost = ReturnType<typeof createCircleHost>;
