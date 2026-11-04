import { parseMessageContributions, parseMessageSafetyState, parseMessageActionReceipt, type MessageSafetyState } from '../../lib/circles/message-moderation';
import { isUuid } from '../../lib/ids/uuid';
import { approvedOrigin, type CircleOwner, type CircleTransport } from '../native/src/circles/host';
import type { CircleSessionRequest } from '../native/src/circles/participation-session';
import { createMessageSafety, type MessageSafety, type MessageSafetyModel } from './message-safety';

type Selection = { circleId: string; messageId: string };
type Config = { owner: CircleOwner; origin: string; transport: CircleTransport; timeoutMs?: number; initialOnline?: boolean; newRequestId?: () => Promise<string> };
export type MemberContributionsModel = {
  connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'unavailable' | 'closed';
  items: MessageSafetyState[]; nextCursor: string | null; selected: Selection | null;
  safety: MessageSafetyModel | null; message: string;
  canRefresh: boolean; canNext: boolean; canSelect: boolean; canBack: boolean; canNavigate: boolean;
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const listPath = '/api/circles/contributions';

/** Account-level author history. A listed contribution is only a selection;
 * current author authority always comes from a separate canonical message GET. */
export function createMemberContributions(config: Config) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15000;
  if (!config.owner || !['scope', 'bearer', 'subscribe'].every(key => typeof config.owner[key as keyof CircleOwner] === 'function')
    || typeof config.transport !== 'function' || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean'
    || config.newRequestId !== undefined && typeof config.newRequestId !== 'function') throw Error('Verified member connection required');
  let attached = false, active = true, online = config.initialOnline ?? false, scope: string | null = null, generation = 0;
  let phase: MemberContributionsModel['phase'] = 'closed', loading = false, items: MessageSafetyState[] = [], nextCursor: string | null = null;
  let selected: Selection | null = null, safety: MessageSafety | null = null, offSafety = () => {}, offOwner = () => {};
  let message = 'Load your own posted messages when ready. Current Circle membership is not required.';
  const listeners = new Set<(value: MemberContributionsModel) => void>(), requests = new Set<AbortController>();
  const enabled = () => attached && active && online && scope !== null && config.owner.scope() === scope;
  const model = (): MemberContributionsModel => {
    const action = safety?.model() ?? null, canNavigate = !loading && (action?.canNavigate ?? true), usable = enabled() && canNavigate;
    return { connected: attached && scope !== null, active, online, busy: loading || Boolean(action?.busy), phase,
      items: copy(items), nextCursor, selected: selected ? { ...selected } : null, safety: action, message,
      canRefresh: usable, canNext: usable && selected === null && phase === 'ready' && nextCursor !== null,
      canSelect: usable && selected === null && phase === 'ready' && items.length > 0,
      canBack: usable && selected !== null, canNavigate };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Retire every independent observer. */ } } };
  function clearSelection() {
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
    if (!listing && !(selection && path === messagePath && ['GET', 'POST'].includes(options.method))) throw Error('Unexpected contribution operation');
    const expected = scope, g = generation, abort = new AbortController();
    const current = () => enabled() && scope === expected && generation === g && !abort.signal.aborted && mayTransmit();
    if (!expected || !current()) throw Error('Contribution session unavailable');
    requests.add(abort); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([(async () => {
        const bearer = await config.owner.bearer(expected);
        if (!current() || !bearer || bearer.length > 16384 || /[\s\u0000-\u001f\u007f]/.test(bearer)) throw Error('Contribution session changed');
        const response = await config.transport(origin + path, { ...options, credentials: 'omit', signal: abort.signal,
          headers: { Authorization: `Bearer ${bearer}`, ...(options.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) } });
        if (!current() || response.redirected || response.url !== origin + path) throw Error('Contribution response refused');
        if ([401, 403, 404].includes(response.status)) {
          retire('Contribution access changed. Private history and action details cleared. A previously sent action may still have completed.');
          throw Error('Contribution access retired');
        }
        const body = await response.json();
        if (!current()) throw Error('Contribution session retired');
        if (!listing && response.status === 200) {
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
      const stop = action.subscribe(emit);
      if (!enabled() || generation !== g || safety !== action) { stop(); return; }
      offSafety = stop; phase = 'idle'; message = 'Checking current author controls for the selected contribution.'; emit();
      if (enabled() && generation === g && safety === action) await action.open(messageId.toLowerCase());
    },
    back() { if (model().canBack) { generation++; clearSelection(); phase = 'idle'; message = 'Message details cleared. Load your posted messages again when ready.'; emit(); } },
    check() { return safety?.refresh() ?? Promise.resolve(); },
    confirm(value: boolean) { safety?.confirm(value); },
    withdraw() { return safety?.submit('withdraw') ?? Promise.resolve(); },
    retry() { return safety?.retry() ?? Promise.resolve(); },
    close() { retire('Private contribution view closed. A previously sent action may still have completed. Nothing retries automatically.'); },
  };
}
export type MemberContributions = ReturnType<typeof createMemberContributions>;
