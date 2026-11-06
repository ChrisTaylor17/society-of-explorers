import { defaultDiscoveryPageRequest, discoveryPageSearchParams, isDiscoveryRestart, parseDiscoveryPage, parseDiscoveryPageRequest,
  type DiscoveryPageReply, type DiscoveryPageRequest } from '../../lib/circles/discovery-page';
import { parseCircleDetail, parseCircleListing, parseCircleManagement, parseCircleMembershipReceipt, parseMyCircles, membershipDay,
  parseCircleAttendanceMutation, circleAttendanceMutationBody, parseCircleAttendanceReceipt,
  type CircleDetail, type CircleListing, type CircleManagement, type MyCircles } from '../../lib/circles/membership';
import { isUuid } from '../../lib/ids/uuid';
import { parseCircleCompleteMutation, circleCompleteMutationBody, parseOwnedCircleCompleteReceipt } from '../../lib/circles/hosting';
import { approvedOrigin, type BearerCircleOwner, type CircleTransport } from '../native/src/circles/host';

export type CircleDirectoryConfig = { origin: string; owner: BearerCircleOwner; transport: CircleTransport; publicTransport?: CircleTransport; passageTransport?: CircleTransport; publicProfileTransport?: CircleTransport;
  memberId?: string; attendanceTransport?: CircleTransport; hostingTransport?: CircleTransport;
  timeoutMs?: number; initialOnline?: boolean; newRequestId?: () => Promise<string>; previewCircleId?: string };
export type PublicCircleChoice = { id: string; title: string };
export type CircleAttendanceReview = { date: string; status: 'going' | 'not_going'; previousStatus: 'going' | 'not_going' | null;
  circleTitle: string; time: string; timezone: string };
export type CircleDirectoryModel = {
  connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'review' | 'sending' | 'unknown' | 'unavailable' | 'closed';
  list: 'discover' | 'mine' | null; page: DiscoveryPageReply | null; mine: MyCircles | null; invite: CircleListing | null;
  selected: string | null; detail: CircleDetail | null; management: CircleManagement | null;
  intent: 'join' | 'leave' | 'rsvp' | 'complete' | null; attendanceReview: CircleAttendanceReview | null; message: string;
  canSearch: boolean; canNextPage: boolean; canFirstPage: boolean; canMine: boolean; canSelect: boolean; canRefresh: boolean;
  canPrepareJoin: boolean; canPrepareLeave: boolean; canPrepareAttendance: boolean; canPrepareComplete: boolean; canConfirm: boolean; canRetry: boolean; canCancel: boolean;
  canBack: boolean; canOpenDiscussion: boolean; canNavigate: boolean;
};
type Action = 'join' | 'leave' | 'rsvp' | 'complete';
type AttendanceIntent = Pick<CircleAttendanceReview, 'date' | 'status'>;
type Pending = { action: Action; circleId: string; requestId: string; expectedRevision: number; body: string; management: boolean; attendance?: AttendanceIntent };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Public listings only select a Circle. Fresh account-scoped reads, confirmed
 * revision-bound writes and a new readback establish participation authority. */
export function createCircleDirectory(config: CircleDirectoryConfig) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15000;
  if (!config.owner || !['scope', 'bearer', 'subscribe'].every(key => typeof config.owner[key as keyof BearerCircleOwner] === 'function')
    || typeof config.transport !== 'function' || config.publicTransport !== undefined && typeof config.publicTransport !== 'function'
    || config.attendanceTransport !== undefined && typeof config.attendanceTransport !== 'function'
    || config.hostingTransport !== undefined && typeof config.hostingTransport !== 'function'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean'
    || config.newRequestId !== undefined && typeof config.newRequestId !== 'function'
    || config.previewCircleId !== undefined && !isUuid(config.previewCircleId)) throw Error('Approved Circle connections required');
  const previewCircleId = config.previewCircleId?.toLowerCase();
  let attached = false, closed = false, active = true, online = config.initialOnline ?? false, scope: string | null = null, generation = 0, attachment = 0;
  let phase: CircleDirectoryModel['phase'] = 'closed', busy = false, list: CircleDirectoryModel['list'] = null;
  let page: DiscoveryPageReply | null = null, own: MyCircles | null = null, selected: string | null = null;
  let detail: CircleDetail | null = null, management: CircleManagement | null = null, intent: Action | null = null;
  let invite: CircleListing | null = null;
  let attendanceReview: CircleAttendanceReview | null = null;
  const attendanceAvailable = Boolean(config.attendanceTransport && isUuid(config.memberId) && config.memberId === config.memberId?.toLowerCase());
  const hostingAvailable = Boolean(config.hostingTransport && isUuid(config.memberId) && config.memberId === config.memberId?.toLowerCase());
  let pending: Pending | null = null, minimumRevision = 0, request = defaultDiscoveryPageRequest(), offOwner = () => {};
  let message = config.publicTransport ? 'Search for a Circle or load your Circles when ready.' : 'Public Circle search is unavailable in this connection. You can check your Circles.';
  const listeners = new Set<(model: CircleDirectoryModel) => void>(), requests = new Set<AbortController>();
  const publicEnabled = () => !closed && attached && active && online;
  const enabled = () => publicEnabled() && scope !== null && config.owner.scope() === scope;
  const allowed = (action: Action, attendance: AttendanceIntent | null = attendanceReview) => action === 'join' ? Boolean(detail?.capabilities.canJoin)
    : action === 'leave' ? Boolean(detail?.capabilities.canLeave || management?.capabilities.canLeave)
      : action === 'complete' ? Boolean(hostingAvailable && (detail?.capabilities.canComplete || management?.capabilities.canComplete))
      : Boolean(attendanceAvailable && detail?.capabilities.canRsvp && attendance && detail.meetings.some(meeting => meeting.date === attendance.date));
  const model = (): CircleDirectoryModel => {
    const canNavigate = !busy && !pending && phase !== 'review', publicReady = publicEnabled() && canNavigate, ready = enabled() && canNavigate;
    return { connected: attached && scope !== null, active, online, busy, phase, list, page: copy(page), mine: copy(own), invite: copy(invite),
      selected, detail: copy(detail), management: copy(management), intent, attendanceReview: copy(attendanceReview), message,
      canSearch: publicReady && Boolean(config.publicTransport), canNextPage: publicReady && Boolean(config.publicTransport && page?.page.nextCursor),
      canFirstPage: publicReady && Boolean(config.publicTransport && list === 'discover'), canMine: ready,
      canSelect: ready && Boolean(previewCircleId || page?.circles.length || own?.items.length), canRefresh: ready && selected !== null,
      canPrepareJoin: ready && Boolean(config.newRequestId) && allowed('join'),
      canPrepareLeave: ready && Boolean(config.newRequestId) && allowed('leave'),
      canPrepareComplete: ready && Boolean(config.newRequestId) && allowed('complete'),
      canPrepareAttendance: ready && Boolean(config.newRequestId && attendanceAvailable && detail?.capabilities.canRsvp && detail.meetings.length),
      canConfirm: enabled() && !busy && (phase === 'unknown' && pending !== null || phase === 'review' && intent !== null && allowed(intent)),
      canRetry: enabled() && !busy && phase === 'unknown' && pending !== null,
      canCancel: enabled() && !busy && !pending && phase === 'review', canBack: ready && selected !== null, canNavigate,
      canOpenDiscussion: ready && phase === 'ready' && Boolean(detail?.viewer.signed_in && detail.viewer.is_member && detail.capabilities.canReadConversation) };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Independent observers cannot retain authority. */ } } };
  function clear() { page = null; own = null; invite = null; selected = null; detail = null; management = null; intent = null; attendanceReview = null; pending = null; minimumRevision = 0; list = null; }
  function retire(notice: string) {
    generation++; for (const controller of requests) controller.abort(); clear(); busy = false; phase = attached ? 'idle' : 'closed'; message = notice; emit();
  }
  const current = (g: number, privateCall = true) => generation === g && (privateCall ? enabled() : publicEnabled());
  async function send(path: string, method: 'GET' | 'POST', g: number, body?: string, publicCall = false, attendanceCall = false, hostingCall = false) {
    const expected = scope, abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const live = () => current(g, !publicCall) && !abort.signal.aborted && (publicCall || scope === expected);
    if (!live() || publicCall && !config.publicTransport || attendanceCall && !attendanceAvailable || hostingCall && !hostingAvailable) throw Error('Circle connection unavailable');
    requests.add(abort);
    try {
      return await Promise.race([(async () => {
        let headers: Record<string, string> = {};
        if (!publicCall) {
          const bearer = await config.owner.bearer(expected!);
          if (!live() || typeof bearer !== 'string' || !bearer || bearer.length > 16384 || /[\s\u0000-\u001f\u007f]/.test(bearer)) throw Error('Circle account changed');
          headers = { Authorization: `Bearer ${bearer}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) };
        }
        if (!live()) throw Error('Circle lifetime ended');
        const response = await (publicCall ? config.publicTransport! : attendanceCall ? config.attendanceTransport! : hostingCall ? config.hostingTransport! : config.transport)(origin + path,
          { method, headers, ...(body === undefined ? {} : { body }), cache: 'no-store', redirect: 'error', credentials: 'omit', signal: abort.signal });
        if (!live() || response.redirected || response.url !== origin + path) throw Error('Circle response refused');
        const value = await response.json();
        if (!live()) throw Error('Circle lifetime ended');
        return { status: response.status, body: value };
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(Error('Circle request deadline')); }, timeout); })]);
    } finally { clearTimeout(timer); requests.delete(abort); }
  }
  function unavailable(notice: string) { detail = null; management = null; intent = null; attendanceReview = null; busy = false; phase = 'unavailable'; message = notice; emit(); }
  async function search(input: DiscoveryPageRequest) {
    if (!model().canSearch) return;
    const g = ++generation; clear(); busy = true; phase = 'loading'; list = 'discover'; message = 'Checking public Circle listings…'; emit();
    try {
      const parsed = parseDiscoveryPageRequest(discoveryPageSearchParams(input));
      if (!parsed.ok) throw Error('Invalid search');
      request = copy(parsed.value);
      const params = discoveryPageSearchParams(request).toString();
      const result = await send('/api/circles' + (params ? '?' + params : ''), 'GET', g, undefined, true);
      if (!current(g, false)) return;
      if (result.status === 409 && isDiscoveryRestart(result.body)) { busy = false; phase = 'unavailable'; message = 'The search calendar changed. Choose Restart Circle search to check the first page.'; emit(); return; }
      const parsedPage = result.status === 200 ? parseDiscoveryPage(result.body, request) : null;
      if (!parsedPage) throw Error('Unverified public page');
      page = parsedPage; busy = false; phase = 'ready'; message = page.circles.length ? 'Select a Circle to check its current access.' : 'No Circles were returned on this page at this check.'; emit();
    } catch { if (current(g, false)) { busy = false; phase = 'unavailable'; message = 'Public Circle listings could not be verified. Search again when ready.'; emit(); } }
  }
  async function loadInvite() {
    if (!previewCircleId || !model().canSearch) return;
    const g = ++generation;
    clear(); busy = true; phase = 'loading'; message = 'Checking the public salon invitation…'; emit();
    try {
      const result = await send(`/api/circles/${previewCircleId}?view=listing`, 'GET', g, undefined, true);
      if (!current(g, false)) return;
      const listing = result.status === 200 ? parseCircleListing(result.body, previewCircleId) : null;
      if (!listing) throw Error('Salon invitation unavailable');
      invite = listing; busy = false; phase = 'ready'; message = 'Public salon invitation checked. Sign in to check current access.'; emit();
    } catch { if (current(g, false)) unavailable('This public salon invitation is unavailable. Try again when ready.'); }
  }
  async function mine(cursor: string | null = null) {
    if (!model().canMine || cursor !== null && (!isUuid(cursor) || cursor.toLowerCase() !== own?.nextCursor)) return;
    const g = ++generation; clear(); busy = true; phase = 'loading'; list = 'mine'; message = 'Checking your current Circles…'; emit();
    try {
      const result = await send('/api/circles/mine' + (cursor ? '?after=' + cursor.toLowerCase() : ''), 'GET', g);
      if (!current(g)) return;
      const parsed = result.status === 200 ? parseMyCircles(result.body, { after: cursor, limit: 25 }) : null;
      if (!parsed) throw Error('Own Circles unavailable');
      own = parsed; busy = false; phase = 'ready'; message = own.items.length ? 'Select one of your Circles to check current access.' : 'No Circles were returned for your account on this page.'; emit();
    } catch { if (current(g)) unavailable('Your Circles could not be verified. Load them again when ready.'); }
  }
  async function read(g: number, action: Action | null, saved: Action | false = false, attendance: AttendanceIntent | null = null) {
    const id = selected;
    if (!id || !current(g)) return;
    detail = null; management = null; intent = null; attendanceReview = null; busy = true; phase = 'loading'; message = saved ? 'Request confirmed. Checking current Circle access…' : 'Checking current Circle access…'; emit();
    try {
      const result = await send('/api/circles/' + id, 'GET', g);
      if (!current(g)) return;
      const parsed = result.status === 200 ? parseCircleDetail(result.body, id) : null;
      if (parsed && !parsed.viewer.signed_in || [401, 403].includes(result.status)) throw Error('Current account not verified');
      if (parsed && parsed.revision >= minimumRevision) detail = parsed;
      else {
        // This self-only endpoint deliberately needs neither a usable calendar
        // nor a private meeting URL. It can never grant join or discussion access.
        const fallback = await send('/api/circles/' + id + '/membership', 'GET', g);
        if (!current(g)) return;
        const controls = fallback.status === 200 ? parseCircleManagement(fallback.body, id) : null;
        if (!controls || controls.revision < minimumRevision) throw Error('Membership controls unavailable');
        management = controls;
      }
      busy = false; phase = 'ready';
      if (action && allowed(action, attendance)) {
        intent = action;
        if (action === 'rsvp' && attendance) attendanceReview = { ...attendance, previousStatus: detail!.meetings.find(meeting => meeting.date === attendance.date)!.my_status,
          circleTitle: detail!.circle.title, time: detail!.circle.time, timezone: detail!.circle.timezone };
        phase = 'review'; message = 'Current access checked. Review this change, then confirm it. Nothing has changed yet.';
      }
      else message = saved === 'rsvp' ? 'Attendance request accepted. Current meeting responses are shown; an earlier receipt does not override a later response.'
        : saved ? 'Request confirmed. Current access is shown; an earlier receipt does not override later changes.'
        : action ? 'That action is no longer available. Current access is shown.' : management ? 'Membership controls verified. Full meeting details and conversation are unavailable in this view.' : 'Current Circle access checked.';
      emit();
    } catch { if (current(g)) unavailable(saved ? 'The request was confirmed, but current access could not be verified. Refresh before continuing.' : 'Current Circle access could not be verified. Refresh when ready.'); }
  }
  async function allocate(g: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const key = await Promise.race([Promise.resolve().then(() => { if (!current(g)) throw Error('Circle lifetime ended'); return config.newRequestId!(); }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Circle request key deadline')), timeout); })]);
      if (!current(g) || !isUuid(key)) throw Error('Circle request key unavailable');
      return key.toLowerCase();
    } finally { clearTimeout(timer); }
  }
  async function confirm() {
    if (!model().canConfirm) return;
    const g = ++generation, retry = pending;
    const action = intent, id = selected, revision = detail?.revision ?? management?.revision, minimal = management !== null;
    const attendance = copy(attendanceReview);
    busy = true; phase = 'sending'; detail = null; management = null; message = retry ? 'Retrying the exact participation request…' : 'Saving your confirmed participation change…'; emit();
    try {
      if (!retry) {
        if (!action || !id || revision === undefined || !config.newRequestId) throw Error('No confirmed change');
        const requestId = await allocate(g);
        if (!current(g)) return;
        if (action === 'rsvp') {
          const mutation = attendance && parseCircleAttendanceMutation({ expectedMemberId: config.memberId, requestId, expectedRevision: revision, date: attendance.date, status: attendance.status });
          if (!mutation || !attendanceAvailable) throw Error('Attendance review unavailable');
          pending = { action, circleId: id, requestId, expectedRevision: revision, management: false,
            attendance: { date: mutation.date, status: mutation.status }, body: circleAttendanceMutationBody(mutation) };
        } else if (action === 'complete') {
          const mutation = parseCircleCompleteMutation({ expectedMemberId: config.memberId, requestId, expectedRevision: revision });
          if (!mutation || !hostingAvailable) throw Error('Completion review unavailable');
          pending = { action, circleId: id, requestId, expectedRevision: revision, management: minimal, body: circleCompleteMutationBody(mutation) };
        } else pending = { action, circleId: id, requestId, expectedRevision: revision, management: minimal, body: JSON.stringify({ requestId, expectedRevision: revision }) };
      }
      if (!current(g) || !pending) return;
      const exact = pending;
      const result = await send(`/api/circles/${exact.circleId}/${exact.action}`, 'POST', g, exact.body, false, exact.action === 'rsvp', exact.action === 'complete');
      if (!current(g)) return;
      const receipt = result.status === 200 ? exact.action === 'rsvp'
        ? parseCircleAttendanceReceipt(result.body, exact.circleId, exact.requestId, config.memberId)
        : exact.action === 'complete' ? parseOwnedCircleCompleteReceipt(result.body, exact.circleId, exact.requestId, config.memberId)
        : parseCircleMembershipReceipt(result.body, exact.action, exact.circleId, exact.requestId) : null;
      if (receipt && receipt.state.revision >= exact.expectedRevision + (exact.action === 'complete' ? 0 : 1)
        && (exact.action !== 'rsvp' || receipt.receipt.date === exact.attendance?.date && receipt.receipt.status === exact.attendance?.status)) {
        minimumRevision = receipt.state.revision; pending = null; intent = null;
        await read(g, null, exact.action); return;
      }
      if (!retry && [400, 401, 403, 404, 409, 413, 429].includes(result.status)) {
        pending = null; intent = null; unavailable('The change was refused. Refresh current Circle access before confirming a new action.'); return;
      }
      throw Error('Participation result unknown');
    } catch {
      if (!current(g)) return;
      busy = false;
      if (pending) { phase = 'unknown'; message = 'The reply could not be confirmed. This change may have completed. Retry the exact request manually before another action.'; emit(); }
      else unavailable('The request could not be prepared. No change was sent. Refresh before trying again.');
    }
  }
  return {
    model,
    subscribe(listener: (value: CircleDirectoryModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached || closed) return; attached = true;
      const connectedAt = ++attachment;
      const stop = config.owner.subscribe(() => { if (!attached || closed || connectedAt !== attachment) return; scope = config.owner.scope(); retire('Account changed. Private Circle details cleared. A previously sent change may still have completed.'); });
      if (!attached || closed || connectedAt !== attachment) { stop(); return; }
      offOwner = stop; scope = config.owner.scope();
      retire(!active ? 'Circle view is inactive. Return to the app before checking access.' : !online ? 'Network access is unavailable. Reconnect, then check Circles manually.'
        : config.publicTransport ? 'Search for a Circle or load your Circles when ready.' : 'Public Circle search is unavailable in this connection. You can check your Circles.');
    },
    disconnect() { attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; retire('Circle view closed. A previously sent change may still have completed.'); },
    activity(value: boolean) { active = value; if (!value) retire('Circle details cleared while inactive. A previously sent change may still have completed.'); else emit(); },
    connectivity(value: boolean) { online = value; if (!value) retire('Circle details cleared while offline. Reconnect, then check manually. A previously sent change may still have completed.'); else emit(); },
    loadInvite, search, nextPage() { return model().canNextPage ? search({ ...request, cursor: page!.page.nextCursor }) : Promise.resolve(); },
    firstPage() { return model().canFirstPage ? search({ ...request, cursor: null }) : Promise.resolve(); }, mine,
    async select(circleId: string) {
      if (!model().canSelect || !isUuid(circleId)) return;
      const id = circleId.toLowerCase();
      if (id !== previewCircleId && !page?.circles.some(row => row.id === id) && !own?.items.some(row => row.circle.id === id)) return;
      const g = ++generation; clear(); selected = id; await read(g, null);
    },
    refresh() { return model().canRefresh ? read(++generation, null) : Promise.resolve(); },
    prepare(action: 'join' | 'leave' | 'complete') { return (action === 'join' ? model().canPrepareJoin : action === 'leave' ? model().canPrepareLeave : action === 'complete' && model().canPrepareComplete) ? read(++generation, action) : Promise.resolve(); },
    prepareAttendance(date: string, status: 'going' | 'not_going') {
      return model().canPrepareAttendance && membershipDay(date) && ['going', 'not_going'].includes(status) && detail?.meetings.some(meeting => meeting.date === date)
        ? read(++generation, 'rsvp', false, { date, status }) : Promise.resolve();
    },
    confirm,
    cancel() { if (!model().canCancel) return; intent = null; attendanceReview = null; phase = 'ready'; message = 'Participation change canceled. Nothing was sent.'; emit(); },
    back() { if (!model().canBack) return; generation++; clear(); phase = 'idle'; message = 'Search or load your Circles again when ready.'; emit(); },
    close() { if (closed) return; closed = true; attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; retire('Circle view closed. A previously sent change may still have completed. Nothing retries automatically.'); },
  };
}
export type CircleDirectory = ReturnType<typeof createCircleDirectory>;

export function createPublicCircleDirectory(origin: string, publicTransport: CircleTransport, previewCircleId?: string): Pick<CircleDirectory,
  'model' | 'subscribe' | 'connect' | 'close' | 'activity' | 'connectivity' | 'loadInvite' | 'search' | 'nextPage'> {
  return createCircleDirectory({ origin, publicTransport, previewCircleId, initialOnline: false,
    owner: { scope: () => null, bearer: async () => null, subscribe: () => () => {} },
    transport: async () => { throw Error('Member access requires a verified account'); },
  });
}
