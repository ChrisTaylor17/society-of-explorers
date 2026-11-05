'use client';

import { useEffect, useRef, useState } from 'react';
import { bindCircleAccess } from '@/lib/circles/browser-access';
import { createClient } from '@/lib/supabase/client';
import { parseReadingProgressResponse, readingProgressMutationBody, type ReadingProgressState, type ReadingProgressMutation as Mutation } from '@/lib/books/reading-progress';
import { encodeBookmarkLocator } from '@/lib/books/bookmarks';
import { readingOwner } from './reading-owner';

type Pending = { patch: Mutation; body: string; minimumRevision: number; sent: boolean };
type Phase = 'idle' | 'loading' | 'ready' | 'review' | 'sending' | 'unknown';
type View = { active: boolean; phase: Phase; state: ReadingProgressState | null; review: Mutation | null; finished: boolean; message: string };
const initial = (): View => ({ active: true, phase: 'idle', state: null, review: null, finished: false,
  message: 'Saved places are private. Load your saved place before reviewing a save or removal.' });
const REFUSED = new Set([400, 401, 403, 404, 409, 413, 415, 429]);
function matches(state: ReadingProgressState, patch: Mutation) {
  return patch.action === 'remove' ? state.status === 'removed'
    : state.status === 'saved' && state.bookmark?.status === 'current'
      && state.bookmark.editionId === patch.editionId && state.bookmark.blockIndex === patch.blockIndex && state.completed === patch.completed
      && state.paragraphIndex === 0 && state.sectionId === encodeBookmarkLocator(patch.editionId, patch.blockIndex);
}

/** A pending CAS request is retained only in this mounted reader's memory.
 * Lifecycle retirement hides it; only a fresh same-member load can expose an
 * exact retry review. No unchanged GET is treated as proof of a lost write. */
export function useSavedReading(bookId: string, editionId: string, blockCount: number) {
  const [view, setView] = useState<View>(initial);
  const ref = useRef({ mounted: false, observing: false, active: true, busy: false, epoch: 0, generation: 0,
    owner: null as string | null, pending: null as Pending | null, controller: null as AbortController | null, view: initial() });
  const core = ref.current;
  const publish = (next: Partial<View>) => { core.view = { ...core.view, ...next }; core.epoch++; if (core.mounted) setView(core.view); };
  useEffect(() => {
    core.mounted = true; core.active = document.visibilityState === 'visible' && navigator.onLine !== false;
    core.view = { ...initial(), active: core.active }; setView(core.view);
    const retire = (inactive: boolean) => {
      core.generation++; core.epoch++; core.busy = false; core.controller?.abort(); core.controller = null;
      if (inactive) core.active = false;
      core.owner = null;
      core.view = { ...initial(), active: core.active, message: core.pending?.sent
        ? 'Private saved-place details were cleared. A request may have completed. Load your saved place to check before an exact retry.'
        : 'Private saved-place details were cleared. Load your saved place to check your current account.' };
      if (core.mounted) setView(core.view);
    };
    const wrappers = new Map<() => void, () => void>();
    const readingWindow = {
      addEventListener(name: string, listener: () => void) { const fn = name === 'blur' ? () => { if (!document.hasFocus()) listener(); } : listener; if (name === 'blur') wrappers.set(listener, fn); window.addEventListener(name, fn); },
      removeEventListener(name: string, listener: () => void) { window.removeEventListener(name, wrappers.get(listener) || listener); wrappers.delete(listener); },
    };
    const active = () => { if (core.mounted && core.observing && document.visibilityState === 'visible' && navigator.onLine !== false) { core.active = true; core.view = { ...core.view, active: true }; setView(core.view); } };
    const offline = () => retire(true);
    window.addEventListener('offline', offline); window.addEventListener('online', active);
    const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-reading-frame]'), frame => {
      let child: Window | null = null;
      const blur = () => { if (!document.hasFocus()) retire(true); };
      const detach = () => { try { child?.removeEventListener('blur', blur); } catch {} child = null; };
      const attach = () => { detach(); try { child = frame.contentWindow; child?.addEventListener('blur', blur); } catch { retire(true); } };
      frame.addEventListener('load', attach); attach(); return () => { frame.removeEventListener('load', attach); detach(); };
    });
    const dispose = bindCircleAccess({ window: readingWindow, document,
      subscribeAuth(listener) { try { const { data } = createClient().auth.onAuthStateChange(event => listener(event)); core.observing = true; return () => data.subscription.unsubscribe(); } catch { retire(true); return () => {}; } },
      onInactive: () => retire(true), onActive: active, onIdentity: () => retire(false),
    });
    return () => { core.mounted = false; retire(true); core.pending = null; core.observing = false; dispose(); frames.forEach(fn => fn()); window.removeEventListener('offline', offline); window.removeEventListener('online', active); };
  // The identity of the source edition defines the lifetime of this controller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, editionId, blockCount]);

  const epoch = core.epoch;
  const valid = () => core.mounted && core.observing && core.active && !core.busy && core.epoch === epoch;
  async function run(action: 'load' | 'confirm') {
    if (!valid()) return;
    const pending = action === 'confirm' ? core.pending : null;
    const earlierUnknown = pending?.sent === true;
    if (action === 'confirm' && (!pending || core.view.phase !== 'review')) return;
    core.busy = true; const generation = ++core.generation, controller = new AbortController(); core.controller = controller;
    publish({ phase: action === 'load' ? 'loading' : 'sending', state: null, review: null, message: action === 'load' ? 'Loading your saved place…' : 'Sending the reviewed saved-place change…' });
    const current = () => core.mounted && core.active && core.generation === generation && !controller.signal.aborted;
    let status: number | null = null, posted = false, receipt: ReadingProgressState | null = null;
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Reading request retired')), { once: true }));
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      await Promise.race([aborted, (async () => {
        const owner = await readingOwner(controller.signal, current);
        if (!current()) return;
        if (core.pending && core.pending.patch.expectedMemberId !== owner.memberId) {
          core.pending = null; core.owner = owner.memberId;
          if (pending) throw new Error('Account changed; load again');
        }
        if (pending && (core.pending !== pending || pending.patch.expectedMemberId !== owner.memberId)) throw new Error('Account changed');
        core.owner = owner.memberId;
        async function request(method: 'GET' | 'POST') {
          const headers = new Headers(owner.headers); if (method === 'POST') headers.set('content-type', 'application/json');
          if (!current()) throw new Error('Reading request retired');
          if (method === 'POST') { posted = true; pending!.sent = true; }
          const response = await fetch('/api/great-books/progress' + (method === 'GET' ? `?bookId=${encodeURIComponent(bookId)}` : ''), {
            method, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
            ...(method === 'POST' ? { body: pending!.body } : {}),
          });
          status = response.status;
          if (!current() || !response.ok) throw new Error('Saved-place request unavailable');
          const reply = parseReadingProgressResponse(await response.json(), bookId);
          if (!current() || !reply || reply.memberId !== owner.memberId || reply.progress.length !== 1) throw new Error('Saved-place reply invalid');
          const state = reply.progress[0];
          if (state.edition.editionId !== editionId || state.edition.blockCount !== blockCount) throw new Error('Source edition changed');
          return state;
        }
        if (pending) {
          receipt = await request('POST'); if (!current()) return;
          if (!matches(receipt, pending.patch) || receipt.revision < pending.minimumRevision || receipt.revision > pending.patch.expectedRevision + 1) throw new Error('Saved-place receipt invalid');
        }
        const state = await request('GET'); if (!current()) return;
        const held = core.pending;
        if (pending && receipt) {
          if (state.revision < receipt.revision || (state.revision === receipt.revision && JSON.stringify(state) !== JSON.stringify(receipt))) throw new Error('Saved-place readback invalid');
          core.pending = null;
          publish({ state, phase: 'ready', finished: state.completed === true, message: state.revision > receipt.revision
            ? 'Your saved place changed again. The current saved state is shown.' : pending.patch.action === 'remove' ? 'Your saved place was removed.' : state.completed ? 'Place saved and this edition marked finished.' : 'Your place was saved.' });
        } else if (held?.sent && state.revision <= held.patch.expectedRevision) {
          if (state.revision < held.patch.expectedRevision) throw new Error('Saved-place revision moved backwards');
          publish({ state, phase: 'unknown', finished: false, message: 'The earlier request is still uncertain. An unchanged saved place does not prove it failed. You can review an exact retry.' });
        } else {
          if (held) core.pending = null;
          const message = held?.sent ? 'A newer saved state now prevents the earlier request from changing it. Review the current state.'
            : state.status !== 'saved' ? 'There is no saved place for this book.'
            : state.bookmark?.status === 'current' ? 'Your saved place is available. Choose Go to saved place to move there.'
            : state.bookmark?.status === 'legacy' ? 'Your earlier numeric bookmark cannot be mapped safely to this complete edition. Choose a place here and review a save.'
            : 'Your saved place cannot be reopened in this edition. Review a fresh save or remove it.';
          publish({ state, phase: 'ready', finished: state.completed === true, message });
        }
      })()]);
    } catch {
      if (core.mounted && core.active && core.generation === generation) {
        // A refusal of an exact retry does not resolve an earlier unknown send.
        if (pending && posted && !receipt && REFUSED.has(status || 0) && !earlierUnknown) core.pending = null;
        const uncertain = Boolean(core.pending?.sent);
        publish({ phase: uncertain ? 'unknown' : 'idle', state: null, review: null, finished: false, message: uncertain
          ? 'The saved-place change could not be confirmed and may have completed. Load your saved place before reviewing an exact retry.'
          : 'The saved-place request could not be confirmed. Check your sign-in, then load again. No empty history is being assumed.' });
      }
    } finally { clearTimeout(timer); if (core.generation === generation) { core.busy = false; core.controller = null; if (core.mounted) setView({ ...core.view }); } }
  }
  function review(action: 'save' | 'remove', blockIndex: number) {
    if (!valid() || core.view.phase !== 'ready' || !core.view.state || !core.owner || core.pending) return;
    if (action === 'save' && (!Number.isSafeInteger(blockIndex) || blockIndex < 0 || blockIndex >= blockCount)) return;
    const state = core.view.state;
    const patch: Mutation = action === 'remove' ? { expectedMemberId: core.owner, expectedRevision: state.revision, bookId, action }
      : { expectedMemberId: core.owner, expectedRevision: state.revision, bookId, action, editionId, blockIndex, completed: core.view.finished };
    core.pending = { patch, body: readingProgressMutationBody(patch), minimumRevision: state.revision + (matches(state, patch) ? 0 : 1), sent: false };
    publish({ phase: 'review', review: patch, message: 'Review this exact saved-place change. Nothing has been sent.' });
  }
  return { ...view, busy: core.busy,
    load: () => { if (valid() && core.view.phase !== 'review') void run('load'); },
    confirm: () => { if (valid()) void run('confirm'); },
    prepare: review,
    retry: () => { if (valid() && core.view.phase === 'unknown' && core.view.state && core.pending?.sent && core.owner === core.pending.patch.expectedMemberId) publish({ phase: 'review', review: core.pending.patch, message: 'Review an exact retry of the earlier request. Its original revision and contents are unchanged.' }); },
    cancel: () => { if (valid() && core.view.phase === 'review') { const unknown = core.pending?.sent; if (!unknown) core.pending = null; publish({ phase: unknown ? 'unknown' : 'ready', review: null, message: unknown ? 'The earlier request is still uncertain. Nothing was retried.' : 'Review cancelled. Nothing was sent.' }); } },
    finish: (value: boolean) => { if (valid() && core.view.phase === 'ready') publish({ finished: value }); },
    go: (jump: (index: number) => void) => { const state = core.view.state; if (valid() && core.view.phase === 'ready' && state?.status === 'saved' && state.bookmark?.status === 'current' && state.bookmark.editionId === editionId) jump(state.bookmark.blockIndex!); },
  };
}
