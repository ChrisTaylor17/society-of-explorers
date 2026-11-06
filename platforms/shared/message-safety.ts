import { messageBlockInput, parseMessageActionReceipt, parseMessageBlockReceipt, parseMessageSafetyState, validateMessageActionInput,
  type MessageActionInput, type MessageActionReceipt, type MessageBlockInput, type MessageSafetyState } from '../../lib/circles/message-moderation';
import { REPORT_LABELS, REPORT_REASONS, type ReportReason } from '../../lib/circles/report';
import { isUuid } from '../../lib/ids/uuid';
import type { CircleSessionRequest } from '../native/src/circles/participation-session';

export const MESSAGE_REPORT_OPTIONS = REPORT_REASONS.map(value => ({ value, label: value === 'misleading' ? 'Misleading content' : REPORT_LABELS[value] }));
export const MESSAGE_WITHDRAWAL_PRIVACY = 'Withdrawal removes the message from member views. It is not physical erasure: restricted evidence may remain for safety review. The retention policy is not yet finalized.';
type SafetyAction = 'report' | 'withdraw' | 'block';
export type MessageSafetyModel = {
  active: boolean; available: boolean; open: boolean; busy: boolean;
  phase: 'closed' | 'loading' | 'ready' | 'sending' | 'unknown' | 'confirmed' | 'unavailable';
  messageId: string | null; state: MessageSafetyState | null; reason: ReportReason | ''; note: string; confirmed: boolean;
  pendingRequestId: string | null; pendingAction: SafetyAction | null; receipt: MessageActionReceipt | null; message: string;
  canEditReport: boolean; canConfirm: boolean; canReport: boolean; canWithdraw: boolean; canBlock: boolean;
  canCheck: boolean; canRetry: boolean; canClose: boolean; canNavigate: boolean;
};
type Pending = { input: MessageActionInput | MessageBlockInput; body: string; content: string | null; isMine: boolean };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Canonical message safety, with one private exact request after uncertainty.
 * A GET returns current state only; it can never confirm a report receipt. */
export function createMessageSafety(request: CircleSessionRequest, circleId: string, newRequestId?: () => Promise<string>) {
  if (!isUuid(circleId)) throw Error('Valid Circle required');
  const circle = circleId.toLowerCase(), available = typeof newRequestId === 'function';
  let active = true, open = false, busy = false, generation = 0, messageId: string | null = null;
  let phase: MessageSafetyModel['phase'] = 'closed', state: MessageSafetyState | null = null;
  let reason: ReportReason | '' = '', note = '', confirmed = false, pending: Pending | null = null, receipt: MessageActionReceipt | null = null;
  let message = 'Choose a contribution and explicitly check its current message actions.';
  const listeners = new Set<(value: MessageSafetyModel) => void>();
  const current = (g: number) => active && open && generation === g;
  const endpoint = () => `/api/circles/${circle}/messages/${messageId}`;
  const model = (): MessageSafetyModel => {
    const ready = active && available && open && !busy && !pending && state !== null && ['ready', 'confirmed'].includes(phase);
    return copy({ active, available, open, busy, phase, messageId, state, reason, note, confirmed,
      pendingRequestId: pending?.input.requestId ?? null, pendingAction: pending?.input.action ?? null, receipt, message,
      canEditReport: ready && Boolean(state?.canReport), canConfirm: ready && Boolean(state?.canReport || state?.canWithdraw || state?.blockReview),
      canReport: ready && Boolean(state?.canReport && state.contentHash) && reason !== '' && confirmed,
      canWithdraw: ready && Boolean(state?.canWithdraw && state.contentHash) && confirmed,
      canBlock: ready && Boolean(state?.blockReview && state.contentHash) && confirmed,
      // A committed block makes state return 404. Preserve the pending exact
      // retry without asking the host to reopen the old private post.
      canCheck: active && open && !busy && messageId !== null && pending?.input.action !== 'block'
        && (phase !== 'confirmed' || state !== null),
      canRetry: active && open && !busy && pending !== null,
      canClose: open && !busy && pending === null, canNavigate: !busy && pending === null });
  };
  const emit = () => { for (const listener of listeners) listener(model()); };
  function clear(notice: string) {
    generation++; open = false; busy = false; phase = 'closed'; messageId = null; state = null;
    reason = ''; note = ''; confirmed = false; pending = null; receipt = null; message = notice; emit();
  }
  async function check() {
    if (!model().canCheck || !messageId) return;
    const id = messageId, g = ++generation;
    busy = true; state = null; reason = ''; note = ''; confirmed = false; receipt = null; phase = 'loading';
    message = 'Checking this message and your current action permissions. This read does not confirm an earlier report…'; emit();
    try {
      const result = await request(endpoint(), { method: 'GET', cache: 'no-store', redirect: 'error' }, () => current(g));
      if (!current(g)) return;
      const parsed = result.http === 200 ? parseMessageSafetyState(result.body) : null;
      if (parsed && same(parsed.circleId, circle) && same(parsed.message.id, id)) {
        state = parsed; busy = false; phase = pending ? 'unknown' : 'ready';
        message = pending ? 'Current message state loaded. This does not confirm the earlier action. Its exact request is retained for a manual retry.'
          : available ? 'Current message loaded. Review this checked version and explicitly confirm any action.'
            : 'Current message loaded. Safety actions are not connected on this device; use the member web discussion.';
        emit(); return;
      }
    } catch { if (!current(g)) return; }
    busy = false; phase = pending ? 'unknown' : 'unavailable';
    message = pending ? 'Current state could not be checked. The earlier action remains unconfirmed; its exact request is retained.'
      : 'Current message information could not be verified. No action has been assumed.'; emit();
  }
  function accept(value: unknown, exact: Pending) {
    const id = messageId;
    if (!id) return false;
    if (exact.input.action === 'block') {
      if (!parseMessageBlockReceipt(value, exact.input, circle, id)) return false;
      state = null; receipt = null; pending = null; busy = false; phase = 'confirmed';
      message = 'Member blocked. Open the current discussion to continue. Manage your blocks under Members → Chat → Blocked members on the web.';
      return true;
    }
    const parsed = parseMessageActionReceipt(value);
    if (!parsed || !same(parsed.requestId, exact.input.requestId) || !same(parsed.circleId, circle) || !same(parsed.messageId, id)
      || !same(parsed.state.circleId, circle) || !same(parsed.state.message.id, id) || parsed.state.revision < exact.input.expectedRevision
      || parsed.state.contentHash !== null && parsed.state.contentHash !== exact.input.contentHash
      || parsed.state.message.is_mine !== exact.isMine
      || parsed.state.message.visibility === 'visible' && exact.content !== null && parsed.state.message.content !== exact.content
      || (exact.input.action === 'withdraw' ? parsed.withdrawn !== true || parsed.state.message.visibility !== 'withdrawn' : parsed.received !== true)) return false;
    state = parsed.state; receipt = parsed; pending = null; busy = false; phase = 'confirmed';
    message = exact.input.action === 'withdraw' ? 'Withdrawal confirmed. The message is removed from member views; restricted safety evidence may remain.'
      : 'Report received for private human review. A report is an allegation, not a finding.';
    return true;
  }
  async function send(exact: Pending) {
    if (!active || !open || busy || !messageId) return;
    const g = ++generation; pending = exact; state = null; receipt = null; reason = ''; note = ''; confirmed = false; busy = true; phase = 'sending';
    message = exact.input.action === 'block' ? 'Sending the reviewed block…'
      : exact.input.action === 'withdraw' ? 'Sending the exact reviewed withdrawal…' : 'Sending the exact private report for human review…'; emit();
    try {
      const result = await request(endpoint(), { method: 'POST', cache: 'no-store', redirect: 'error', body: exact.body }, () => current(g));
      if (!current(g)) return;
      if (result.http === 200 && accept(result.body, exact)) { emit(); return; }
      if (exact.input.action === 'block' && [400, 401, 403, 404, 409].includes(result.http)) {
        pending = null; busy = false; phase = 'unavailable';
        message = 'Block unconfirmed. Check the current discussion and your blocked members before deciding again.';
        emit(); return;
      }
    } catch { if (!current(g)) return; }
    busy = false; phase = 'unknown';
    message = 'The action is unconfirmed and may have been saved. Only a manual retry of this exact request can confirm its receipt. Checking current state does not prove its outcome.'; emit();
  }
  return {
    model,
    subscribe(listener: (value: MessageSafetyModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    async open(id: string) {
      if (!active || busy || pending || !isUuid(id)) return;
      clear('Checking the selected contribution.'); open = true; messageId = id.toLowerCase(); await check();
    },
    refresh: check,
    reason(value: string) {
      if (!model().canEditReport || value !== '' && !(REPORT_REASONS as readonly string[]).includes(value)) return false;
      reason = value as ReportReason | ''; confirmed = false; emit(); return true;
    },
    note(value: string) {
      if (!model().canEditReport || typeof value !== 'string' || value.length > 1000
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
        || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return false;
      note = value; confirmed = false; emit(); return true;
    },
    confirm(value: boolean) { if (model().canConfirm) { confirmed = value === true; emit(); } },
    async submit(action: SafetyAction) {
      const { canReport, canWithdraw, canBlock } = model();
      if (!state || !newRequestId || !({ report: canReport, withdraw: canWithdraw, block: canBlock })[action]) return;
      const checked = state, chosenReason = reason, chosenNote = note, g = ++generation;
      busy = true; phase = 'sending'; state = null; receipt = null; reason = ''; note = ''; confirmed = false;
      message = 'Preparing this exact confirmed action. No request has been sent yet…'; emit();
      try {
        const key = await newRequestId();
        if (!current(g)) return;
        if (!isUuid(key)) throw Error('Request key unavailable');
        if (action === 'block') {
          const input = messageBlockInput(checked, key);
          if (!input) throw Error('Block unavailable');
          busy = false;
          await send({ input, body: JSON.stringify(input), content: null, isMine: false });
          return;
        }
        const parsed = validateMessageActionInput({ action, expectedRevision: checked.revision, contentHash: checked.contentHash, requestId: key.toLowerCase(),
          ...(action === 'report' ? { reason: chosenReason, note: chosenNote.trim() || null } : {}) });
        if (!parsed.ok) throw Error('Action unavailable');
        const input = parsed.value; busy = false;
        await send({ input, body: JSON.stringify(input), content: checked.message.content, isMine: checked.message.is_mine });
      } catch {
        if (current(g)) { busy = false; phase = 'unavailable'; message = 'The action could not be prepared. Nothing was sent. Check the current message and decide again.'; emit(); }
      }
    },
    retry() { return model().canRetry && pending ? send(pending) : Promise.resolve(); },
    close() { if (model().canClose) clear('Message actions closed and private details cleared.'); },
    retire() { clear('Private message details, notes and request key cleared. An action already sent may still have been saved. Nothing will retry automatically.'); },
    activity(value: boolean) { active = value; if (!value) clear('Private message details, notes and request key cleared while inactive. An action already sent may still have been saved.'); else emit(); },
  };
}
export type MessageSafety = ReturnType<typeof createMessageSafety>;
