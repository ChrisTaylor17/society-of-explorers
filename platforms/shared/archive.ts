import { discussionSearchParams, parseDiscussionPage, parseDiscussionQuery, type DiscussionPage, type DiscussionQuery } from '../../lib/circles/thread';
import { isUuid } from '../../lib/ids/uuid';

export type ArchiveQuery = Exclude<DiscussionQuery, { kind: 'receipt' }>;
export type ArchiveRequest = (path: string, options: { method: 'GET'; cache: 'no-store'; redirect: 'error' }, mayTransmit: () => boolean) => Promise<{ http: number; body: unknown }>;
export type ArchiveModel = {
  open: boolean; active: boolean; busy: boolean; phase: 'closed' | 'loading' | 'ready' | 'denied' | 'unavailable' | 'paused';
  page: DiscussionPage | null; message: string; revision: number;
};

/** Uses the canonical web DTO/cursor parser; no separate platform data contract.
 * A supplied host authorizes every read and fences credential acquisition. */
export function createDiscussionArchive(request: ArchiveRequest, circleId: string) {
  if (!isUuid(circleId)) throw Error('Valid Circle required');
  const circle = circleId.toLowerCase();
  let generation = 0, selection: ArchiveQuery | null = null, following = false;
  let state: ArchiveModel = { open: false, active: true, busy: false, phase: 'closed', page: null, revision: 0, message: 'Open the complete discussion archive to check current access.' };
  const listeners = new Set<(model: ArchiveModel) => void>();
  const model = (): ArchiveModel => JSON.parse(JSON.stringify(state)) as ArchiveModel;
  const emit = () => { for (const listener of listeners) listener(model()); };
  const current = (g: number) => g === generation && state.open && state.active;
  function retire(message = 'Private archive cleared. Check current Circle access again.') {
    generation++; selection = null; state = { ...state, revision: state.revision + 1, busy: false, page: null, phase: state.open ? 'paused' : 'closed', message }; emit();
  }
  function requestPage(query: ArchiveQuery, mayTransmit: () => boolean) {
    const params = discussionSearchParams(query), suffix = params.size ? `?${params}` : '';
    return request(`/api/circles/${circle}/discussion${suffix}`, { method: 'GET', cache: 'no-store', redirect: 'error' }, mayTransmit);
  }
  async function read(query: ArchiveQuery) {
    if (!state.active || state.busy) return;
    const g = ++generation; selection = null;
    state = { ...state, revision: state.revision + 1, open: true, busy: true, phase: 'loading', page: null, message: 'Checking current membership and loading discussion.' }; emit();
    try {
      const reply = await requestPage(query, () => current(g));
      if (!current(g)) return;
      const page = reply.http === 200 ? parseDiscussionPage(reply.body, { ...query, circleId: circle }) : null;
      if (!page) {
        const denied = [401, 403, 404].includes(reply.http);
        state = { ...state, busy: false, phase: denied ? 'denied' : 'unavailable', page: null,
          message: denied ? 'Current Circle access could not be confirmed. No discussion is shown.' : 'Discussion is unavailable. No messages were posted or retried.' };
      } else { selection = { ...query }; state = { ...state, busy: false, phase: 'ready', page, message: page.kind === 'thread' ? 'Current thread loaded. Hidden or withdrawn messages stay restricted.' : 'Current archive page loaded. Older messages are available through pagination.' }; }
      emit();
    } catch { if (current(g)) { state = { ...state, busy: false, phase: 'unavailable', page: null, message: 'Discussion read is unavailable. Try an explicit refresh when ready.' }; emit(); } }
  }
  async function followLatest(mayFollow: () => boolean) {
    const query = selection;
    if (following || state.busy || !state.active || state.phase !== 'ready'
      || query?.kind !== 'archive' || query.before !== null || !mayFollow()) return;
    const g = generation;
    const allowed = () => current(g) && mayFollow();
    const paused = 'Live discussion paused. Open the archive to check current access again.';
    following = true;
    try {
      const reply = await requestPage(query, allowed);
      if (!allowed()) return;
      const page = reply.http === 200 ? parseDiscussionPage(reply.body, { ...query, circleId: circle }) : null;
      if (!page) { retire(paused); return; }
      if (JSON.stringify(page) === JSON.stringify(state.page)) return;
      state = { ...state, page, revision: state.revision + 1 };
      emit();
    } catch { if (allowed()) retire(paused); }
    finally { following = false; }
  }
  return {
    model,
    currentQuery: (): ArchiveQuery | null => selection ? { ...selection } : null,
    restore(query: ArchiveQuery) {
      const parsed = parseDiscussionQuery(discussionSearchParams(query));
      return parsed && parsed.kind !== 'receipt' ? read(parsed) : Promise.resolve();
    },
    subscribe(listener: (model: ArchiveModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    open: () => read({ kind: 'archive', before: null, limit: 25 }),
    followLatest,
    thread(messageId: string) { if (!isUuid(messageId)) return Promise.resolve(); return read({ kind: 'thread', messageId: messageId.toLowerCase(), after: null, limit: 25 }); },
    next() {
      const p = state.page;
      if (!p?.nextCursor) return Promise.resolve();
      return read(p.kind === 'archive' ? { kind: 'archive', before: p.nextCursor, limit: p.limit }
        : { kind: 'thread', messageId: p.focus.id, after: p.nextCursor, limit: p.limit });
    },
    retire,
    activity(active: boolean) { state.active = active; if (!active) retire('Private archive cleared while inactive. Refresh current access when you return.'); else emit(); },
    close() { state.open = false; retire('Discussion archive closed.'); },
  };
}
export type DiscussionArchive = ReturnType<typeof createDiscussionArchive>;
