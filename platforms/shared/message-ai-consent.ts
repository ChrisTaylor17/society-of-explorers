import { isUuid } from '../../lib/ids/uuid';
import { MESSAGE_AI_POLICY, MESSAGE_AI_POLICY_HREF, parseMessageAiConsent, sameMessageAiConsent,
  type MessageAiConsent } from '../../lib/circles/message-ai-consent';
import type { CircleSessionRequest } from '../native/src/circles/participation-session';

export { MESSAGE_AI_POLICY, MESSAGE_AI_POLICY_HREF };
export const MESSAGE_AI_DISCLOSURE = {
  intro: 'Optional for this message only. Human review does not require this permission, and choosing not to allow it carries no review penalty.',
  provider: 'An assigned reviewer may send this message’s text to Anthropic’s Claude for advisory safety review. We do not add your profile or author name, but names or other personal details may be present in your text. Anthropic may retain data under its terms, including safety and legal exceptions. This is not anonymous or zero-retention processing.',
  revocation: 'Revoking blocks new requests. A request already in progress may still transmit or complete; text already sent cannot be recalled. AI advice does not decide whether a message is hidden or restored.',
  confirmation: 'I read this policy and allow this message’s text to be sent to Anthropic for advisory review.',
  retirement: 'Closing or leaving clears these local settings. A decision already sent may still finish. After returning, check settings and explicitly choose your preference. Nothing is retried automatically.',
} as const;
export type MessageAiConsentAction = { circleId: string; messageId: string; contextRevision: number; interactionRevision: number };
export type MessageAiConsentModel = {
  active: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'sending' | 'checking' | 'confirmed' | 'unknown' | 'unavailable' | 'closed';
  state: MessageAiConsent | null; confirmed: boolean; uncertain: boolean; message: string;
  canCheck: boolean; canConfirm: boolean; canKeepOff: boolean; canAllow: boolean; canNavigate: boolean;
  action: MessageAiConsentAction;
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** An author-choice controller, not an AI invocation. Uncertain consent writes
 * are not idempotent: a read never settles old delivery, and a new explicit CAS
 * decision must consume the next revision before a preference is confirmed. */
export function createMessageAiConsent(request: CircleSessionRequest, circleId: string, messageId: string, contextRevision: number, initialUncertain = false) {
  if (typeof request !== 'function' || !isUuid(circleId) || !isUuid(messageId) || !Number.isSafeInteger(contextRevision) || contextRevision < 0 || typeof initialUncertain !== 'boolean') throw Error('Verified message context required');
  const circle = circleId.toLowerCase(), id = messageId.toLowerCase(), endpoint = `/api/circles/${circle}/messages/${id}/ai-consent`;
  let active = false, closed = false, busy = false, generation = 0, interaction = 0, confirmed = false, uncertain = initialUncertain;
  let state: MessageAiConsent | null = null, phase: MessageAiConsentModel['phase'] = 'idle';
  let message = 'Check this message’s current AI review settings before choosing. A change sent earlier may still finish.';
  const listeners = new Set<(value: MessageAiConsentModel) => void>();
  const model = (): MessageAiConsentModel => {
    const ready = active && !closed && !busy && state !== null && (phase === 'ready' || phase === 'confirmed') && state.consentRevision < Number.MAX_SAFE_INTEGER;
    return copy({ active: active && !closed, busy, phase, state, confirmed, uncertain, message,
      canCheck: active && !closed && !busy, canConfirm: ready && state!.canEnable,
      canKeepOff: ready, canAllow: ready && state!.canEnable && confirmed, canNavigate: !busy,
      action: { circleId: circle, messageId: id, contextRevision, interactionRevision: interaction } });
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Independent observer. */ } } };
  const current = (g: number) => active && !closed && generation === g;
  const sameAction = (action: unknown) => record(action) && Object.keys(action).sort().join(',') === 'circleId,contextRevision,interactionRevision,messageId' && action.circleId === circle && action.messageId === id
    && action.contextRevision === contextRevision && action.interactionRevision === interaction;
  const matches = (value: MessageAiConsent) => value.circleId === circle && value.messageId === id;
  const advance = () => { generation++; interaction++; };
  function clear(notice: string) {
    advance(); busy = false; state = null; confirmed = false; phase = closed ? 'closed' : 'idle'; message = notice; emit();
  }
  function unavailable(unknown: boolean, status?: number) {
    interaction++; busy = false; state = null; confirmed = false;
    phase = unknown || uncertain ? 'unknown' : 'unavailable';
    message = status === 401 ? 'Sign in again before checking your message’s AI review settings.'
      : status === 403 || status === 404 ? 'These settings are not available to this account. Private settings are cleared.'
        : unknown || uncertain ? 'The change could not be confirmed and may still finish. Check current settings, then explicitly keep future AI review off or allow it. Nothing is retried automatically.'
          : 'AI review settings could not be verified. Permission is not being assumed. Check again when available.';
    emit();
  }
  async function check(action: MessageAiConsentAction) {
    if (!sameAction(action) || !model().canCheck) return;
    advance(); const g = generation;
    busy = true; state = null; confirmed = false; phase = 'loading'; message = 'Checking AI review settings…'; emit();
    try {
      if (!current(g)) return;
      const result = await request(endpoint, { method: 'GET', cache: 'no-store', redirect: 'error' }, () => current(g));
      if (!current(g)) return;
      const value = result.http === 200 ? parseMessageAiConsent(result.body) : null;
      if (!value || !matches(value)) return unavailable(false, result.http);
      state = value; busy = false; phase = 'ready'; interaction++;
      message = uncertain ? 'The earlier change is still uncertain. This read does not cancel it. Choose a new decision below to settle your preference.'
        : 'Current saved settings are shown. A change sent earlier may still finish. Choose a decision below to settle your preference.';
      emit();
    } catch { if (current(g)) unavailable(false); }
  }
  async function change(allowed: boolean, action: MessageAiConsentAction) {
    if (typeof allowed !== 'boolean' || !sameAction(action) || !state || !(allowed ? model().canAllow : model().canKeepOff)) return;
    const checked = state; advance(); const g = generation;
    busy = true; state = null; confirmed = false; uncertain = true; phase = 'sending';
    message = allowed ? 'Saving permission for this message…' : 'Saving your choice to keep future AI review off…'; emit();
    try {
      if (!current(g)) return;
      const result = await request(endpoint, { method: 'POST', cache: 'no-store', redirect: 'error', body: JSON.stringify({
        expectedConsentRevision: checked.consentRevision, contentHash: checked.contentHash, policy: MESSAGE_AI_POLICY, allowed,
      }) }, () => current(g));
      if (!current(g)) return;
      const receipt = result.http === 200 ? parseMessageAiConsent(result.body) : null;
      if (!receipt || !matches(receipt) || receipt.allowed !== allowed || receipt.contentHash !== checked.contentHash
        || receipt.consentRevision !== checked.consentRevision + 1 || receipt.messageRevision < checked.messageRevision) return unavailable(true, result.http);
      phase = 'checking'; interaction++; message = 'Permission receipt received. Reading current settings to verify…'; emit();
      if (!current(g)) return;
      const fresh = await request(endpoint, { method: 'GET', cache: 'no-store', redirect: 'error' }, () => current(g));
      if (!current(g)) return;
      const value = fresh.http === 200 ? parseMessageAiConsent(fresh.body) : null;
      if (!value || !matches(value) || !sameMessageAiConsent(value, receipt)) return unavailable(true, fresh.http);
      state = value; busy = false; uncertain = false; phase = 'confirmed'; interaction++;
      message = allowed ? 'Permission confirmed for this message. This setting does not itself send the message.'
        : 'Future AI review is confirmed off. A review request already in progress may still transmit or complete; text already sent to Anthropic cannot be recalled.';
      emit();
    } catch { if (current(g)) unavailable(true); }
  }
  return {
    model,
    subscribe(listener: (value: MessageAiConsentModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    check, change,
    confirm(value: boolean, action: MessageAiConsentAction) {
      if (typeof value !== 'boolean' || !sameAction(action) || !model().canConfirm || value === confirmed) return false;
      interaction++; confirmed = value; emit(); return true;
    },
    activity(value: boolean) {
      if (closed || typeof value !== 'boolean' || active === value) return;
      active = value;
      if (!value) clear('AI review settings cleared while inactive. A decision already sent may still finish. Check settings and choose again after returning.');
      else { interaction++; emit(); }
    },
    retire() {
      if (closed) return; closed = true; active = false;
      clear('AI review settings closed. A decision already sent may still finish. Nothing is retried automatically.'); listeners.clear();
    },
  };
}
export type MessageAiConsentController = ReturnType<typeof createMessageAiConsent>;
