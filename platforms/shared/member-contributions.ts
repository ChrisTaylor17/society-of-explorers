import { parseMessageContributions, parseMessageSafetyState, parseMessageActionReceipt, type MessageSafetyState } from '../../lib/circles/message-moderation';
import { isUuid } from '../../lib/ids/uuid';
import { approvedOrigin, circleAuthorizationHeaders, hasCircleAuthority, type CircleOwner, type CircleTransport } from '../native/src/circles/host';
import type { CircleSessionRequest } from '../native/src/circles/participation-session';
import { createMessageSafety, type MessageSafety, type MessageSafetyModel } from './message-safety';
import { parseMessageAiConsent, parseMessageAiConsentInput } from '../../lib/circles/message-ai-consent';
import { createMessageAiConsent, type MessageAiConsentController, type MessageAiConsentAction, type MessageAiConsentModel } from './message-ai-consent';

type Selection = { circleId: string; messageId: string };
type Config = { owner: CircleOwner; origin: string; transport: CircleTransport; timeoutMs?: number; initialOnline?: boolean; newRequestId?: () => Promise<string>; aiConsent?: boolean };
export type MemberContributionsModel = {
  connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'unavailable' | 'closed';
  items: MessageSafetyState[]; nextCursor: string | null; selected: Selection | null;
  safety: MessageSafetyModel | null; aiConsent: MessageAiConsentModel | null; message: string;
  canRefresh: boolean; canNext: boolean; canSelect: boolean; canBack: boolean; canNavigate: boolean;
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const listPath = '/api/circles/contributions';

/** Account-level author history. A listed contribution is only a selection;
 * current author authority always comes from a separate canonical message GET. */
export function createMemberContributions(config: Config) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15000;
  if (!hasCircleAuthority(config.owner)
    || typeof config.transport !== 'function' || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean'
    || config.aiConsent !== undefined && typeof config.aiConsent !== 'boolean'
    || config.newRequestId !== undefined && typeof config.newRequestId !== 'function') throw Error('Verified member connection required');
  let attached = false, active = true, online = config.initialOnline ?? false, scope: string | null = null, generation = 0;
  let phase: MemberContributionsModel['phase'] = 'closed', loading = false, items: MessageSafetyState[] = [], nextCursor: string | null = null;
  let selected: Selection | null = null, safety: MessageSafety | null = null, offSafety = () => {}, offOwner = () => {};
  let aiConsent: MessageAiConsentController | null = null, offConsent = () => {}, consentContext = 0, consentUncertain = false, actionTransition = false;
  let message = 'Load your own posted messages when ready. Current Circle membership is not required.';
  const listeners = new Set<(value: MemberContributionsModel) => void>(), requests = new Set<AbortController>();
  const enabled = () => attached && active && online && scope !== null && config.owner.scope() === scope;
  const model = (): MemberContributionsModel => {
    const action = safety?.model() ?? null, consent = aiConsent?.model() ?? null;
    const canNavigate = !loading && (action?.canNavigate ?? true) && !consent?.busy, usable = enabled() && canNavigate;
    const projectedSafety = action && consent?.busy ? { ...action, canCheck: false, canConfirm: false, canWithdraw: false, canRetry: false, canClose: false, canNavigate: false } : action;
    return { connected: attached && scope !== null, active, online, busy: loading || Boolean(action?.busy || consent?.busy), phase,
      items: copy(items), nextCursor, selected: selected ? { ...selected } : null, safety: projectedSafety, aiConsent: consent, message,
      canRefresh: usable, canNext: usable && selected === null && phase === 'ready' && nextCursor !== null,
      canSelect: usable && selected === null && phase === 'ready' && items.length > 0,
      canBack: usable && selected !== null, canNavigate };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Retire every independent observer. */ } } };
  function clearConsent() {
    offConsent(); offConsent = () => {};
    const previous = aiConsent; aiConsent = null;
    if (previous) { consentUncertain = previous.model().uncertain; previous.retire(); }
  }
  function authorReady() {
    const action = safety?.model();
    return enabled() && selected !== null && !!action?.state?.message.is_mine && !action.busy && action.pendingRequestId === null
      && same(action.state.circleId, selected.circleId) && same(action.state.message.id, selected.messageId) && ['ready', 'confirmed'].includes(action.phase);
  }
  function syncConsent() {
    if (!config.aiConsent || !authorReady() || !selected) { clearConsent(); return; }
    if (aiConsent) return;
    const context = ++consentContext, g = generation;
    const child = createMessageAiConsent(request, selected.circleId, selected.messageId, context, consentUncertain);
    aiConsent = child; child.activity(true);
    const stop = child.subscribe(value => { consentUncertain = value.uncertain; emit(); });
    if (aiConsent !== child || generation !== g || !authorReady()) { stop(); if (aiConsent === child) clearConsent(); return; }
    offConsent = stop;
  }
  function clearSelection() {
    clearConsent(); consentUncertain = false;
    offSafety(); offSafety = () => {};
    const previous = safety; safety = null; selected = null; previous?.retire();
  }
  function retire(notice: string) {
    generation++; for (const controller of requests) controller.abort();
    loading = false; items = []; nextCursor = null; clearSelection();
    phase = attached ? 'idle' : 'closed'; message = notice; emit();
  }
  const request: CircleSessionRequest = async (path, options, mayTransmit) => {
    const after = path.startsWith(listPath + '?after=') ? path.slice((listPath + '?after=').length) : null;
    const listing = options.method === 'GET' && (path === listPath || after !== null && isUuid(after) && after === after.toLowerCase());
    const selection = selected ? { ...selected } : null;
    const messagePath = selection ? `/api/circles/${selection.circleId}/messages/${selection.messageId}` : null;
    const consentOperation = config.aiConsent === true && selection && aiConsent && authorReady() && path === messagePath + '/ai-consent' && ['GET', 'POST'].includes(options.method);
    if (!listing && !consentOperation && !(selection && path === messagePath && ['GET', 'POST'].includes(options.method))) throw Error('Unexpected contribution operation');
    if (consentOperation) {
      if (options.method === 'GET' && options.body !== undefined) throw Error('Unexpected consent body');
      if (options.method === 'POST') {
        if (typeof options.body !== 'string' || options.body.length > 4096 || !parseMessageAiConsentInput(JSON.parse(options.body))) throw Error('Unexpected consent body');
      }
    }
    const expected = scope, g = generation, abort = new AbortController();
    const current = () => enabled() && scope === expected && generation === g && !abort.signal.aborted && mayTransmit();
    if (!expected || !current()) throw Error('Contribution session unavailable');
    requests.add(abort); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([(async () => {
        const headers = await circleAuthorizationHeaders(config.owner, expected);
        if (!current() || !headers) throw Error('Contribution session changed');
        const response = await config.transport(origin + path, { ...options, credentials: 'omit', signal: abort.signal,
          headers: { ...headers, ...(options.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) } });
        if (!current() || response.redirected || response.url !== origin + path) throw Error('Contribution response refused');
        if ([401, 403, 404].includes(response.status)) {
          retire('Contribution access changed. Private history and action details cleared. A previously sent action may still have completed.');
          throw Error('Contribution access retired');
        }
        const body = await response.json();
        if (!current()) throw Error('Contribution session retired');
        if (consentOperation && response.status === 200) {
          const consent = parseMessageAiConsent(body);
          if (!consent || !same(consent.circleId, selection!.circleId) || !same(consent.messageId, selection!.messageId)) throw Error('Author consent not verified');
        } else if (!listing && response.status === 200) {
          const state = options.method === 'GET' ? parseMessageSafetyState(body) : parseMessageActionReceipt(body)?.state;
          if (!state || !state.message.is_mine || !same(state.circleId, selection!.circleId) || !same(state.message.id, selection!.messageId)) {
            throw Error('Author contribution not verified');
          }
        }
        return { http: response.status, body };
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(Error('Contribution deadline')); }, timeout); })]);
    } finally { clearTimeout(timer); requests.delete(abort); }
  };
  const newRequestId = config.newRequestId ? async () => {
    const expected = scope, g = generation;
    const current = () => enabled() && scope === expected && generation === g;
    if (!expected || !current()) throw Error('Contribution session unavailable');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const id = await Promise.race([Promise.resolve().then(() => {
        if (!current()) throw Error('Contribution session retired');
        return config.newRequestId!();
      }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Request key deadline')), timeout); })]);
      if (!current() || !isUuid(id)) throw Error('Request key unavailable');
      return id.toLowerCase();
    } finally { clearTimeout(timer); }
  } : undefined;
  async function load(after: string | null) {
    if (!model().canRefresh) return;
    const g = ++generation; clearSelection(); items = []; nextCursor = null; loading = true; phase = 'loading';
    message = 'Loading your own posted messages…'; emit();
    const current = () => enabled() && generation === g;
    try {
      const result = await request(listPath + (after ? '?after=' + after : ''), { method: 'GET', cache: 'no-store', redirect: 'error' }, current);
      if (!current()) return;
      const parsed = result.http === 200 ? parseMessageContributions(result.body) : null;
      let previous = after;
      if (!parsed || parsed.items.some(item => {
        const id = item.message.id.toLowerCase(), invalid = previous !== null && id <= previous;
        previous = id; return invalid;
      })) throw Error('Contribution page not verified');
      items = parsed.items; nextCursor = parsed.nextCursor?.toLowerCase() ?? null; loading = false; phase = 'ready';
      message = items.length ? 'Your posted messages are shown below. Select one to check its current author controls.'
        : 'No posted messages were returned on this page. Refresh to check your history again.'; emit();
    } catch {
      if (!current()) return;
      loading = false; phase = 'unavailable'; message = 'Your posted messages could not be verified. Refresh manually when ready.'; emit();
    }
  }
  function consentAction(action: MessageAiConsentAction) {
    if (!config.aiConsent || !authorReady() || !aiConsent || !action || typeof action !== 'object') return null;
    const expected = aiConsent.model().action;
    return Object.keys(action).sort().join(',') === 'circleId,contextRevision,interactionRevision,messageId'
      && action.circleId === expected.circleId && action.messageId === expected.messageId && action.contextRevision === expected.contextRevision
      && action.interactionRevision === expected.interactionRevision ? aiConsent : null;
  }
  async function withSafety(work: (value: MessageSafety) => void | Promise<void>) {
    if (actionTransition || !enabled() || loading || !safety || aiConsent?.model().busy) return;
    const action = safety, child = aiConsent, g = generation;
    // Synchronous observers cannot start the opposite operation while either
    // controller clears its old confirmation and emits its new state.
    actionTransition = true;
    try {
      if (child) { child.activity(false); if (enabled() && generation === g && aiConsent === child) child.activity(true); }
      return enabled() && generation === g && safety === action ? work(action) : undefined;
    } finally { actionTransition = false; }
  }
  function withConsent<T>(action: MessageAiConsentAction, work: (child: MessageAiConsentController) => T): T | undefined {
    if (actionTransition) return;
    const child = consentAction(action); if (!child) return;
    actionTransition = true;
    try {
      safety?.confirm(false);
      return consentAction(action) === child ? work(child) : undefined;
    } finally { actionTransition = false; }
  }
  return {
    model,
    subscribe(listener: (value: MemberContributionsModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached) return; attached = true;
      offOwner = config.owner.subscribe(() => { scope = config.owner.scope(); retire('Account changed. Load your posted messages again when ready.'); });
      scope = config.owner.scope(); retire('Load your own posted messages when ready. Current Circle membership is not required.');
    },
    disconnect() { attached = false; scope = null; offOwner(); offOwner = () => {}; retire('Private contribution view closed. A previously sent action may still have completed.'); },
    activity(value: boolean) { active = value; if (!value) retire('Private posted messages cleared while inactive. A previously sent action may still have completed.'); else emit(); },
    connectivity(value: boolean) { online = value; if (!value) retire('Private posted messages cleared while offline. Reconnect, then load them manually.'); else emit(); },
    refresh: () => load(null),
    next() { const cursor = model().canNext ? nextCursor : null; return cursor ? load(cursor) : Promise.resolve(); },
    async select(circleId: string, messageId: string) {
      if (!model().canSelect || !isUuid(circleId) || !isUuid(messageId)
        || !items.some(item => same(item.circleId, circleId) && same(item.message.id, messageId))) return;
      const g = ++generation; items = []; nextCursor = null; clearSelection();
      selected = { circleId: circleId.toLowerCase(), messageId: messageId.toLowerCase() };
      const action = createMessageSafety(request, selected.circleId, newRequestId); safety = action; action.activity(enabled());
      const stop = action.subscribe(() => { syncConsent(); emit(); });
      if (!enabled() || generation !== g || safety !== action) { stop(); return; }
      offSafety = stop; phase = 'idle'; message = 'Checking current author controls for the selected contribution.'; emit();
      if (enabled() && generation === g && safety === action) await action.open(messageId.toLowerCase());
    },
    back() { if (model().canBack) { generation++; clearSelection(); phase = 'idle'; message = 'Message details cleared. A decision already sent may still finish. Load your posted messages again when ready.'; emit(); } },
    check() { return withSafety(action => action.refresh()); },
    confirm(value: boolean) { void withSafety(action => action.confirm(value)); },
    withdraw() { return withSafety(action => action.submit('withdraw')); },
    retry() { return withSafety(action => action.retry()); },
    checkAiConsent(action: MessageAiConsentAction) {
      if (!consentAction(action)?.model().canCheck) return Promise.resolve();
      return withConsent(action, child => child.check(action)) ?? Promise.resolve();
    },
    confirmAiConsent(value: boolean, action: MessageAiConsentAction) {
      if (typeof value !== 'boolean' || !consentAction(action)?.model().canConfirm) return false;
      return withConsent(action, child => child.confirm(value, action)) ?? false;
    },
    setAiConsent(allowed: boolean, action: MessageAiConsentAction) {
      const child = consentAction(action);
      if (typeof allowed !== 'boolean' || !child || !(allowed ? child.model().canAllow : child.model().canKeepOff)) return Promise.resolve();
      return withConsent(action, value => value.change(allowed, action)) ?? Promise.resolve();
    },
    close() { retire('Private contribution view closed. A previously sent action may still have completed. Nothing retries automatically.'); },
  };
}
export type MemberContributions = ReturnType<typeof createMemberContributions>;
