import { discussionMessageFrom, type ReadReply } from './discussion-reader';

export const CIRCLE_MESSAGE_LIMIT = 2000;
export type CircleMessageGateway = {
  send(circleId: string, content: string, mayTransmit: () => boolean): Promise<ReadReply>;
};
export type CircleComposerModel = {
  circleId: string;
  active: boolean;
  ready: boolean;
  busy: boolean;
  phase: 'locked' | 'editing' | 'sending' | 'confirmed' | 'denied' | 'unknown';
  draft: string;
  remaining: number;
  canEdit: boolean;
  canSend: boolean;
  canStartNew: boolean;
  message: string;
};
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const valid = (value: string) => value.trim().length > 0 && value.length <= CIRCLE_MESSAGE_LIMIT &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

/** Memory-only participation state. It never owns a login, member ID or retry
 * ledger. A host must bind real lifecycle/account events and fresh reader access.
 * An unconfirmed write is never automatically resent or restored as a draft. */
export function createCircleDiscussionComposer(gateway: CircleMessageGateway, circleId: string) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(circleId)) throw Error('Explicit circle UUID required');
  let generation = 0, disposed = false, pending = false, reviewRequired = false;
  let readRevision = 0, reviewAfterRevision = 0;
  let state = { active: true, ready: false, phase: 'locked' as CircleComposerModel['phase'], draft: '',
    message: 'Read the current conversation to check membership before writing.' };
  const listeners = new Set<(model: CircleComposerModel) => void>();
  const model = (): CircleComposerModel => {
    const canEdit = !disposed && state.active && state.ready && !pending && !reviewRequired;
    return { ...state, circleId, busy: pending, remaining: CIRCLE_MESSAGE_LIMIT - state.draft.length, canEdit,
      canSend: canEdit && valid(state.draft),
      canStartNew: !disposed && state.active && state.ready && !pending && reviewRequired && readRevision > reviewAfterRevision };
  };
  const emit = () => { if (!disposed) for (const listener of listeners) listener(model()); };
  const current = (value: number) => !disposed && generation === value && state.active && state.ready;
  function retire(message = 'Private draft cleared. Read the conversation again before writing.') {
    if (disposed) return;
    generation++;
    if (pending) { reviewRequired = true; reviewAfterRevision = readRevision; }
    state = { ...state, ready: false, draft: '', phase: reviewRequired ? 'unknown' : 'locked',
      message: reviewRequired ? 'A message request may have completed. Refresh the conversation before starting a new message.' : message };
    emit();
  }
  return {
    model,
    subscribe(listener: (value: CircleComposerModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    access(ready: boolean, revision: number) {
      if (disposed) return;
      if (!Number.isSafeInteger(revision) || revision < readRevision || (ready && revision === 0)) ready = false;
      else readRevision = revision;
      if (!ready && state.ready) {
        if (!pending && state.phase === 'confirmed') {
          generation++; state.ready = false; state.draft = '';
          state.message = 'Message posted. Check the conversation for the latest view.'; emit();
        } else retire();
        return;
      }
      state.ready = ready;
      if (ready && !reviewRequired && (state.phase === 'locked' || state.phase === 'denied')) {
        state.phase = 'editing'; state.message = 'Write a message for this circle. Nothing is posted until you choose Post to circle.';
      }
      emit();
    },
    activity(active: boolean) { if (disposed) return; state.active = active; if (!active) retire('Private draft cleared while inactive. Refresh access when you return.'); else emit(); },
    retire,
    edit(value: string) {
      if (!model().canEdit) return false;
      if (typeof value !== 'string' || value.length > CIRCLE_MESSAGE_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
        state.message = 'Use plain text up to 2,000 characters.'; emit(); return false;
      }
      state.draft = value; state.phase = 'editing'; state.message = 'Draft is kept only in this view. Leaving, pausing or changing accounts clears it.'; emit(); return true;
    },
    clear() { if (!model().canEdit) return; state.draft = ''; state.message = 'Draft cleared. Posted messages are unchanged.'; emit(); },
    async send(): Promise<'confirmed' | 'denied' | 'unknown' | 'ignored'> {
      if (!model().canSend) return 'ignored';
      const content = state.draft.trim(), operation = ++generation;
      pending = true; state.phase = 'sending'; state.message = 'Posting to this circle…'; emit();
      try {
        const reply = await gateway.send(circleId, content, () => current(operation));
        pending = false;
        if (!current(operation)) { if (reviewRequired) reviewAfterRevision = readRevision; emit(); return 'ignored'; }
        const body = record(reply.body) ? reply.body : null;
        const message = body?.outcome === 'confirmed' && body.circleId === circleId ? discussionMessageFrom(body.message) : null;
        if (reply.http === 200 && message?.is_mine && message.content === content) {
          state.draft = ''; state.phase = 'confirmed'; state.message = 'Message posted to this circle.'; emit(); return 'confirmed';
        }
        if ([400, 401, 403, 404, 429, 503].includes(reply.http) && body?.outcome === 'not_attempted') {
          const denied = [401, 403, 404].includes(reply.http);
          if (denied) { state.ready = false; state.draft = ''; }
          state.phase = denied ? 'denied' : 'editing';
          state.message = denied ? 'Current circle access was not confirmed. Draft cleared; nothing was posted.' :
            reply.http === 429 ? 'Posting is temporarily limited. Nothing was posted; try later.' : 'The server did not attempt this post. Check your message and current access before trying again.';
          emit(); return 'denied';
        }
      } catch {
        pending = false;
        if (!current(operation)) { if (reviewRequired) reviewAfterRevision = readRevision; emit(); return 'ignored'; }
      }
      reviewRequired = true; reviewAfterRevision = readRevision;
      state.draft = ''; state.phase = 'unknown'; state.message = 'Could not confirm whether your message was posted. Refresh and review the conversation before starting a new message.';
      emit(); return 'unknown';
    },
    startNewAfterReview() {
      if (!model().canStartNew) return false;
      reviewRequired = false; state.draft = ''; state.phase = 'editing';
      state.message = 'Start a new message. The earlier request was not retried.'; emit(); return true;
    },
    dispose() { generation++; disposed = true; state.draft = ''; state.ready = false; listeners.clear(); },
  };
}
export type CircleDiscussionComposer = ReturnType<typeof createCircleDiscussionComposer>;
export function createCircleMessageGateway(request: (path: string, options: {
  method: 'POST'; cache: 'no-store'; redirect: 'error'; body: string;
}, mayTransmit: () => boolean) => Promise<ReadReply>): CircleMessageGateway {
  return { send: (circleId, content, mayTransmit) => request(`/api/book-salons/${encodeURIComponent(circleId)}`,
    { method: 'POST', cache: 'no-store', redirect: 'error', body: JSON.stringify({ content }) }, mayTransmit) };
}
