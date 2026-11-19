import { encodeBookmarkLocator } from '../../lib/books/bookmarks';
import { passageIndexPin } from '../../lib/books/passages';
import { parseReadingProgressMutation, parseReadingProgressResponse, type ReadingProgressState } from '../../lib/books/reading-progress';
import { isUuid } from '../../lib/ids/uuid';
import { approvedOrigin, type CircleTransport } from '../native/src/circles/host';
import type { VerifiedAccountOwner } from '../native/src/circles/verified-member-session';

type Mutation = NonNullable<ReturnType<typeof parseReadingProgressMutation>>;
export type SavedReadingPosition = { bookId: string; editionId: string; blockIndex: number };
export type SavedReadingReview = { mutation: Mutation; previous: ReadingProgressState; retry: boolean };
export type SavedReadingModel = {
  connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'review' | 'saving' | 'unknown' | 'conflict' | 'unavailable' | 'closed';
  entries: ReadingProgressState[]; review: SavedReadingReview | null; retryBooks: string[]; message: string;
  canLoad: boolean; canPrepare: boolean; canConfirm: boolean; canCancel: boolean; canNavigate: boolean;
};
type Pending = { mutation: Mutation; body: string; subject: string; minimumRevision: number };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const pinned = (state: ReadingProgressState) => {
  const pin = passageIndexPin(state.bookId);
  return Boolean(pin && pin.editionId === state.edition.editionId && pin.blockCount === state.edition.blockCount);
};
function matches(state: ReadingProgressState, mutation: Mutation): boolean {
  return state.bookId === mutation.bookId && (mutation.action === 'remove' ? state.status === 'removed'
    : state.status === 'saved' && state.sectionId === encodeBookmarkLocator(mutation.editionId, mutation.blockIndex)
      && state.paragraphIndex === 0 && state.completed === mutation.completed && state.bookmark?.status === 'current'
      && state.bookmark.editionId === mutation.editionId && state.bookmark.blockIndex === mutation.blockIndex);
}

/** One owned account's private saved places. Presentation retires on every
 * lifecycle change; exact unresolved CAS attempts remain private until close. */
export function createSavedReading(config: { origin: string; memberId: string; owner: VerifiedAccountOwner;
  savedReadingTransport?: CircleTransport; timeoutMs?: number; initialOnline?: boolean }) {
  const origin = approvedOrigin(config.origin), memberId = config.memberId.toLowerCase(), timeout = config.timeoutMs ?? 15000;
  if (!isUuid(memberId) || config.memberId !== memberId || typeof config.owner?.scope !== 'function'
    || typeof config.owner.credentials !== 'function' || typeof config.owner.subscribe !== 'function'
    || config.savedReadingTransport !== undefined && typeof config.savedReadingTransport !== 'function'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean') throw Error('Verified member and bounded saved-reading connection required');
  let attached = false, closed = false, active = true, online = config.initialOnline ?? false, scope: string | null = null;
  let generation = 0, attachment = 0, busy = false, boundSubject: string | null = null, offOwner = () => {};
  let phase: SavedReadingModel['phase'] = 'closed', entries: ReadingProgressState[] = [], review: SavedReadingReview | null = null;
  let message = 'Load your private saved places when ready.';
  const pending = new Map<string, Pending>(), recovered = new Set<string>();
  const listeners = new Set<(model: SavedReadingModel) => void>(), requests = new Set<AbortController>();
  const enabled = () => !closed && attached && active && online && scope !== null && config.owner.scope() === scope;
  const model = (): SavedReadingModel => {
    const visible = enabled(), usable = visible && !busy && Boolean(config.savedReadingTransport);
    return { connected: attached && scope !== null && config.owner.scope() === scope, active, online, busy, phase,
      entries: visible ? copy(entries) : [], review: visible ? copy(review) : null,
      retryBooks: visible ? [...recovered].filter(book => pending.has(book)) : [], message,
      canLoad: usable && review === null, canPrepare: usable && review === null,
      canConfirm: usable && review !== null && phase === 'review', canCancel: usable && review !== null,
      canNavigate: !busy && review === null };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Independent observers still retire. */ } } };
  function clearView(notice: string) {
    generation++; for (const request of requests) request.abort(); busy = false; entries = []; review = null; recovered.clear();
    phase = attached ? pending.size ? 'unknown' : 'idle' : 'closed'; message = notice; emit();
  }
  function unknown() { phase = 'unknown'; review = null; message = 'An earlier change may still complete. Load the saved place before reviewing an exact retry. Nothing retries automatically.'; }
  function install(states: ReadingProgressState[], all: boolean) {
    entries = all ? copy(states) : [...entries.filter(old => !states.some(state => state.bookId === old.bookId)), ...copy(states)];
  }
  function reconcile(states: ReadingProgressState[]) {
    let fenced = false;
    for (const state of states) {
      const old = pending.get(state.bookId);
      if (!old) continue;
      if (state.revision < old.mutation.expectedRevision) throw Error('Saved-place revision regressed');
      if (state.revision > old.mutation.expectedRevision) { pending.delete(state.bookId); recovered.delete(state.bookId); fenced = true; }
      else recovered.add(state.bookId);
    }
    return fenced;
  }
  async function run(action: 'load' | 'prepare' | 'save' | 'open', bookId?: string,
    intention?: { action: 'save'; position: SavedReadingPosition; completed: boolean } | { action: 'remove' }) {
    const m = model();
    if (action === 'save' ? !m.canConfirm : !m.canLoad) return null;
    if (bookId !== undefined && !passageIndexPin(bookId)) return null;
    const chosen = action === 'save' ? copy(review!) : null, targetBook = chosen?.mutation.bookId ?? bookId;
    const prior = targetBook ? pending.get(targetBook) : undefined;
    const g = ++generation, expectedScope = scope!, abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, operationSubject: string | null = null, sent = false;
    let opened: ReadingProgressState | null = null;
    const current = () => enabled() && generation === g && scope === expectedScope && !abort.signal.aborted;
    const visible = () => enabled() && generation === g && scope === expectedScope;
    busy = true; review = null; phase = action === 'save' ? 'saving' : 'loading';
    message = action === 'save' ? 'Checking the current account before sending this saved-place change…' : 'Checking your current saved reading…';
    if (action === 'load') { entries = []; recovered.clear(); }
    requests.add(abort); emit();
    const request = async (method: 'GET' | 'POST', selectedBook?: string, mutation?: Mutation) => {
      if (!current()) throw Error('Saved-reading lifetime ended');
      const proof = await config.owner.credentials(expectedScope);
      if (!current() || !proof || !isUuid(proof.subject) || typeof proof.bearer !== 'string' || proof.bearer.length > 16377
        || !/^[A-Za-z0-9._~+/-]+=*$/.test(proof.bearer) || boundSubject !== null && proof.subject.toLowerCase() !== boundSubject
        || operationSubject !== null && proof.subject.toLowerCase() !== operationSubject
        || [...pending.values()].some(old => old.subject !== proof.subject.toLowerCase())) throw Error('Saved-reading owner unverified');
      operationSubject = proof.subject.toLowerCase();
      let body: string | undefined;
      if (method === 'POST' && mutation) {
        const old = pending.get(mutation.bookId);
        body = old?.body ?? JSON.stringify(mutation);
        if (!old) pending.set(mutation.bookId, { mutation: copy(mutation), body, subject: operationSubject,
          minimumRevision: mutation.expectedRevision + (matches(chosen!.previous, mutation) ? 0 : 1) });
        recovered.delete(mutation.bookId); sent = true;
      }
      const url = origin + '/api/great-books/progress' + (method === 'GET' && selectedBook ? '?bookId=' + selectedBook : '');
      const response = await config.savedReadingTransport!(url, { method,
        headers: { Authorization: `Bearer ${proof.bearer}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        ...(body === undefined ? {} : { body }), cache: 'no-store', redirect: 'error', credentials: 'omit', signal: abort.signal });
      if (!current() || response.redirected !== false || response.url !== url || !Number.isInteger(response.status)) throw Error('Saved-reading response refused');
      const payload = await response.json(); if (!current()) throw Error('Saved-reading lifetime ended');
      const value = parseReadingProgressResponse(payload, selectedBook);
      if (value && (value.memberId !== memberId || !value.progress.every(pinned))) throw Error('Saved-reading owner or edition changed');
      return { status: response.status, value };
    };
    try {
      await Promise.race([(async () => {
        let receipt: ReadingProgressState | null = null;
        if (action === 'save' && chosen) {
          const posted = await request('POST', chosen.mutation.bookId, chosen.mutation);
          if (!current()) return;
          if (posted.status !== 200) {
            if (!prior && [400, 401, 403, 409].includes(posted.status)) {
              pending.delete(chosen.mutation.bookId); recovered.delete(chosen.mutation.bookId); entries = [];
              phase = posted.status === 409 ? 'conflict' : 'unavailable'; message = 'The change was refused. Load the current saved place before reviewing another change.';
            } else unknown();
            return;
          }
          const savedPending = pending.get(chosen.mutation.bookId)!;
          receipt = posted.value?.progress[0] ?? null;
          if (!receipt || receipt.revision < savedPending.minimumRevision || receipt.revision > chosen.mutation.expectedRevision + 1
            || !matches(receipt, savedPending.mutation)) throw Error('Saved-reading receipt unverified');
        }
        const checked = await request('GET', targetBook);
        if (!current()) return;
        if (checked.status !== 200 || !checked.value) throw Error('Saved-reading readback unverified');
        const states = checked.value.progress, state = states[0];
        for (const value of states) {
          const old = pending.get(value.bookId);
          if (old && value.revision < old.mutation.expectedRevision) throw Error('Saved-reading revision regressed');
        }
        boundSubject = operationSubject;
        install(states, targetBook === undefined);
        if (action === 'save' && chosen && receipt) {
          const old = pending.get(chosen.mutation.bookId)!;
          if (JSON.stringify(receipt) === JSON.stringify(state) && matches(state, old.mutation)) {
            pending.delete(state.bookId); recovered.delete(state.bookId); phase = 'ready';
            message = chosen.mutation.action === 'remove' ? 'Removal was confirmed by a fresh read. No saved place remains for this book.' : 'Your private saved place was confirmed by a fresh read.';
          } else if (state.revision > old.mutation.expectedRevision) {
            pending.delete(state.bookId); recovered.delete(state.bookId); phase = 'conflict';
            message = 'The saved place changed before confirmation. This is the current state; the earlier change is not being claimed as current.';
          } else { recovered.add(state.bookId); unknown(); }
          return;
        }
        const fenced = reconcile(states);
        if (action === 'prepare' && targetBook && intention) {
          if (pending.has(targetBook)) { unknown(); message += ' Its revision is unchanged; only the same earlier action can be reviewed for retry.'; return; }
          const mutation = parseReadingProgressMutation({ expectedMemberId: memberId, expectedRevision: state.revision, bookId: targetBook,
            action: intention.action, ...(intention.action === 'save' ? { editionId: intention.position.editionId, blockIndex: intention.position.blockIndex, completed: intention.completed } : {}) });
          if (!mutation) throw Error('Saved-reading review invalid');
          review = { mutation, previous: copy(state), retry: false }; phase = 'review';
          message = mutation.action === 'remove' ? 'Review removal of this book’s saved place. Confirming keeps the book and its source text available.' : 'Review this exact edition and reading position before saving it privately.';
        } else {
          phase = pending.size ? 'unknown' : 'ready';
          message = pending.size ? 'Current saved places are loaded. An unchanged revision does not settle an earlier change; review an exact retry if needed.'
            : fenced ? 'Current saved reading is loaded. A newer revision prevents the earlier change from overwriting it; no earlier receipt is assumed.' : 'Your saved reading is loaded. Opening a place does not change it.';
          if (action === 'open') {
            if (state.status === 'saved' && state.bookmark?.status === 'current') opened = copy(state);
            else message = 'This saved place cannot be opened in the current edition. Legacy or changed-edition locations are never remapped automatically.';
          }
        }
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(Error('Saved-reading deadline exceeded')); }, timeout); })]);
      if (!current()) return null;
      busy = false; emit(); return current() ? opened : null;
    } catch {
      if (visible()) {
        busy = false; entries = []; recovered.clear();
        if (pending.size || sent) unknown();
        else { phase = 'unavailable'; message = 'Saved reading could not be verified. Load it again when available; no saved state is being assumed.'; }
        emit();
      }
      return null;
    } finally { clearTimeout(timer); requests.delete(abort); }
  }
  return {
    model,
    subscribe(listener: (value: SavedReadingModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached || closed) return; attached = true; const at = ++attachment;
      const stop = config.owner.subscribe(() => { if (!attached || closed || attachment !== at) return; scope = config.owner.scope(); clearView('Account verification changed. Load saved reading again before continuing.'); });
      if (!attached || closed || attachment !== at) { stop(); return; } offOwner = stop; scope = config.owner.scope();
      clearView(pending.size ? 'An earlier saved-place change may still complete. Load the current state before retrying.' : 'Load your private saved places when ready.');
    },
    disconnect() { if (closed) return; attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; clearView('Saved-reading view closed. An already sent change may still complete.'); },
    activity(value: boolean) { if (closed) return; active = value; if (!value) clearView('Saved-reading view cleared while inactive. Load again when ready.'); else emit(); },
    connectivity(value: boolean) { if (closed) return; online = value; if (!value) clearView('Saved-reading view cleared while offline. Load again when connected.'); else emit(); },
    load: (bookId?: string) => run('load', bookId), open: (bookId: string) => run('open', bookId),
    prepareSave(position: SavedReadingPosition, completed: boolean) {
      const pin = passageIndexPin(position.bookId);
      if (!pin || position.editionId !== pin.editionId || !Number.isSafeInteger(position.blockIndex) || position.blockIndex < 0 || position.blockIndex >= pin.blockCount || typeof completed !== 'boolean') return Promise.resolve(null);
      return run('prepare', position.bookId, { action: 'save', position: copy(position), completed });
    },
    prepareRemove: (bookId: string) => run('prepare', bookId, { action: 'remove' }),
    reviewRetry(bookId: string) {
      if (!model().canPrepare || !recovered.has(bookId)) return;
      const old = pending.get(bookId), previous = entries.find(entry => entry.bookId === bookId);
      if (!old || !previous || previous.revision !== old.mutation.expectedRevision) return;
      review = { mutation: copy(old.mutation), previous: copy(previous), retry: true }; phase = 'review';
      message = 'Review the exact earlier change. Confirming retries the same values and revision; the original may still complete.'; emit();
    },
    confirm: () => run('save'),
    cancel() { if (!model().canCancel) return; review = null; phase = pending.size ? 'unknown' : 'ready'; message = 'Review cancelled. Nothing new was sent.'; emit(); },
    close() { if (closed) return; closed = true; attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; pending.clear(); boundSubject = null; clearView('Saved-reading account connection closed. Any already sent change may still complete; local recovery data was discarded.'); },
  };
}
export type SavedReading = ReturnType<typeof createSavedReading>;
