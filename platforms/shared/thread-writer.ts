import { discussionCommentLimit, formatDiscussionContent, parseDiscussionLookup, parseDiscussionPreview,
  parseDiscussionReceipt, type DiscussionPage, type DiscussionPostInput, type DiscussionPreview,
  type DiscussionReceipt, type ThreadMessage } from '../../lib/circles/thread';
import { isUuid } from '../../lib/ids/uuid';
import type { CircleSessionRequest } from '../native/src/circles/participation-session';

export type ThreadWriteModel = {
  active: boolean; available: boolean; phase: 'locked' | 'editing' | 'previewing' | 'review' | 'sending' | 'unknown' | 'confirmed';
  busy: boolean; draft: string; target: ThreadMessage | null; commentLimit: number;
  preview: DiscussionPreview | null; confirmed: boolean; pendingRequestId: string | null; receipt: DiscussionReceipt | null;
  message: string; canStart: boolean; canEdit: boolean; canReview: boolean; canPost: boolean;
  canCheck: boolean; canRetry: boolean; canCancel: boolean; canNavigate: boolean;
};
type Pending = { input: DiscussionPostInput; body: string; content: string; root: string | null };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The canonical server preview/receipt protocol shared by native and Quest.
 * One in-memory exact request survives uncertainty; no automatic retry/read. */
export function createThreadWriter(request: CircleSessionRequest, circleId: string, newRequestId?: () => Promise<string>) {
  if (!isUuid(circleId)) throw Error('Valid Circle required');
  const circle = circleId.toLowerCase(), endpoint = `/api/circles/${circle}/discussion`;
  const available = typeof newRequestId === 'function';
  let generation = 0, active = true, revision = -1, page: DiscussionPage | null = null;
  let phase: ThreadWriteModel['phase'] = 'locked', busy = false, draft = '', target: ThreadMessage | null = null;
  let preview: DiscussionPreview | null = null, confirmed = false, pending: Pending | null = null, receipt: DiscussionReceipt | null = null;
  let message = available ? 'Load the current archive or thread before writing.' : 'Discussion writing is not connected on this device. Use the member web discussion.';
  const listeners = new Set<(value: ThreadWriteModel) => void>();
  const current = (g: number) => active && generation === g;
  const model = (): ThreadWriteModel => {
    const canStart = active && available && page !== null && !busy && !pending;
    const canEdit = canStart && phase === 'editing';
    return copy({ active, available, phase, busy, draft, target, commentLimit: discussionCommentLimit(circle, target?.id ?? null),
      preview, confirmed, pendingRequestId: pending?.input.requestId ?? null, receipt,
      message: available ? message : 'Discussion writing is not connected on this device. Use the member web discussion.', canStart, canEdit,
      canReview: canEdit && formatDiscussionContent(circle, draft, target?.id ?? null) !== null,
      canPost: canStart && phase === 'review' && preview !== null && confirmed,
      canCheck: active && !busy && pending !== null, canRetry: active && !busy && pending !== null,
      canCancel: active && pending === null && ['editing', 'previewing', 'review'].includes(phase), canNavigate: !busy && pending === null });
  };
  const emit = () => { for (const listener of listeners) listener(model()); };
  function clear(notice: string, keepPage = false) {
    generation++; busy = false; draft = ''; target = null; preview = null; confirmed = false; pending = null; receipt = null; phase = 'locked';
    if (!keepPage) { page = null; revision = -1; }
    message = notice; emit();
  }
  function accept(value: unknown, expected: Pending): boolean {
    const parsed = parseDiscussionReceipt(value);
    if (!parsed || parsed.circleId !== circle || parsed.requestId !== expected.input.requestId
      || parsed.message.parentMessageId !== expected.input.parentMessageId
      || expected.root !== null && parsed.message.rootMessageId !== expected.root
      || parsed.message.visibility === 'visible' && parsed.message.content !== expected.content) return false;
    receipt = parsed; pending = null; preview = null; confirmed = false; draft = ''; target = null; busy = false; phase = 'confirmed';
    message = parsed.message.visibility === 'visible' ? 'Posting confirmed. Open the saved message to check its current thread.'
      : `Posting confirmed. The saved message is currently ${parsed.message.visibility}; its earlier body is not displayed.`;
    return true;
  }
  async function send(exact: Pending) {
    if (!active || busy) return;
    const g = ++generation; pending = exact; preview = null; confirmed = false; draft = ''; target = null; receipt = null;
    busy = true; phase = 'sending'; message = 'Sending the exact reviewed discussion message…'; emit();
    try {
      const result = await request(endpoint, { method: 'POST', cache: 'no-store', redirect: 'error', body: exact.body }, () => current(g));
      if (!current(g)) return;
      if (result.http === 200 && accept(result.body, exact)) { emit(); return; }
    } catch { if (!current(g)) return; }
    busy = false; phase = 'unknown';
    message = 'Posting is unconfirmed. It may have been saved. Check its receipt or retry this exact reviewed request manually; do not create a duplicate.'; emit();
  }
  return {
    model,
    subscribe(listener: (value: ThreadWriteModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    access(next: DiscussionPage | null, nextRevision: number) {
      if (!Number.isSafeInteger(nextRevision) || nextRevision < 0 || next && next.circleId !== circle) {
        clear('Current discussion access could not be verified.'); return;
      }
      if (revision === nextRevision && Boolean(page) === Boolean(next)) return;
      if (nextRevision < revision) return;
      page = next ? copy(next) : null; revision = nextRevision;
      // Read navigation is blocked during an exact pending request. A host
      // retirement separately clears it; an ordinary read reset cannot invent
      // evidence that an earlier POST did not commit.
      if (pending || phase === 'confirmed' && !next) { emit(); return; }
      clear(next ? 'Current discussion loaded. Choose a new message or a visible reply target.' : 'Load current discussion access before writing.', true);
    },
    activity(value: boolean) {
      active = value;
      if (!value) clear('Private discussion draft, preview and request key cleared while inactive. A sent request may still have been saved.');
      else emit();
    },
    retire() { clear('Private discussion draft, preview and request key cleared. A sent request may still have been saved. Nothing will reload or retry automatically.'); },
    close() { clear('Discussion writing closed. A request already sent may still have been saved.'); },
    start(parentId: string | null) {
      if (!model().canStart || !page || parentId !== null && !isUuid(parentId)) return false;
      const candidates = page.kind === 'thread' ? [page.root, page.focus, ...page.items] : page.items;
      const selected = parentId === null ? null : candidates.find(item => item.id === parentId.toLowerCase() && item.visibility === 'visible');
      if (parentId !== null && !selected) return false;
      clear('Write your own comment, then prepare its exact server preview. Nothing posts until you review and confirm.', true);
      target = selected ? copy(selected) : null; phase = 'editing'; emit(); return true;
    },
    edit(value: string) {
      if (!model().canEdit || typeof value !== 'string' || value.length > discussionCommentLimit(circle, target?.id ?? null)
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
        || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return false;
      draft = value; preview = null; confirmed = false; emit(); return true;
    },
    async review() {
      if (!model().canReview || !newRequestId) return;
      const g = ++generation, comment = draft.trim(), parentId = target?.id ?? null, root = target?.rootMessageId ?? null;
      preview = null; confirmed = false; receipt = null; busy = true; phase = 'previewing'; message = 'Preparing the exact message and checking its current target. This does not post…'; emit();
      try {
        const rawId = await newRequestId();
        if (!current(g)) return;
        if (!isUuid(rawId)) throw Error('Request key unavailable');
        const requestId = rawId.toLowerCase();
        const result = await request(`${endpoint}/preview`, { method: 'POST', cache: 'no-store', redirect: 'error',
          body: JSON.stringify({ requestId, comment, parentMessageId: parentId }) }, () => current(g));
        if (!current(g)) return;
        const parsed = result.http === 200 ? parseDiscussionPreview(result.body) : null;
        if (!parsed || parsed.circleId !== circle || parsed.requestId !== requestId || parsed.comment !== comment || parsed.parentMessageId !== parentId
          || root !== null && parsed.parent?.message.rootMessageId !== root) {
          clear('The exact preview or current parent could not be verified. Load the discussion and choose a target again. Nothing was posted.'); return;
        }
        preview = parsed; target = parsed.parent?.message ?? null; busy = false; phase = 'review'; message = 'Review the complete message and its target. It has not been posted.'; emit();
      } catch {
        if (current(g)) { busy = false; phase = 'editing'; message = 'Preview unavailable. Nothing was posted. Prepare a new preview manually when ready.'; emit(); }
      }
    },
    confirm(value: boolean) { if (active && !busy && !pending && phase === 'review' && preview) { confirmed = value === true; emit(); } },
    post() {
      if (!model().canPost || !preview) return Promise.resolve();
      const input: DiscussionPostInput = { requestId: preview.requestId, comment: preview.comment, parentMessageId: preview.parentMessageId,
        expectedParentRevision: preview.parent?.revision ?? null, expectedParentHash: preview.parent?.contentHash ?? null,
        contentHash: preview.contentHash, reviewKey: preview.reviewKey };
      return send({ input, body: JSON.stringify(input), content: preview.content, root: preview.parent?.message.rootMessageId ?? null });
    },
    retry() { return model().canRetry && pending ? send(pending) : Promise.resolve(); },
    async lookup() {
      if (!model().canCheck || !pending) return;
      const exact = pending, g = ++generation; busy = true; message = 'Checking this request’s receipt without posting…'; emit();
      try {
        const result = await request(`${endpoint}?requestId=${exact.input.requestId}`, { method: 'GET', cache: 'no-store', redirect: 'error' }, () => current(g));
        if (!current(g)) return;
        const parsed = result.http === 200 ? parseDiscussionLookup(result.body) : null;
        if (parsed?.circleId === circle && parsed.requestId === exact.input.requestId) {
          if (parsed.receipt && accept(parsed.receipt, exact)) { emit(); return; }
          if (parsed.receipt === null) { busy = false; phase = 'unknown'; message = 'No receipt was found at this check. An earlier attempt could still complete. Keep the same key and use only the exact manual retry.'; emit(); return; }
        }
      } catch { if (!current(g)) return; }
      busy = false; phase = 'unknown'; message = 'The receipt could not be confirmed. No post was sent by this read; the exact pending request is retained.'; emit();
    },
    cancel() { if (model().canCancel) clear('Draft and preview cleared. Nothing was posted by this action.', true); },
    editReview() {
      if (active && !busy && !pending && phase === 'review') { generation++; preview = null; confirmed = false; phase = 'editing'; message = 'Edit this draft, then prepare a new exact preview.'; emit(); }
    },
  };
}
export type ThreadWriter = ReturnType<typeof createThreadWriter>;
