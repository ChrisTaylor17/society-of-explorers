import { isProfileMemberId, parsePublicMemberProfileResponse, type PublicMemberProfile } from '../../lib/members/profile';
import { approvedOrigin, type CircleOwner, type CircleTransport } from '../native/src/circles/host';

export type PublicProfileConfig = { origin: string; memberId: string; owner: CircleOwner; publicProfileTransport?: CircleTransport;
  timeoutMs?: number; initialOnline?: boolean };
export type PublicProfileModel = { connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'missing' | 'unavailable' | 'closed'; profile: PublicMemberProfile | null;
  message: string; canLoad: boolean; canNavigate: boolean };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A public profile is read anonymously, but its selected reference belongs to
 * the current view/account lifetime. No inferred author identity is accepted. */
export function createPublicProfile(config: PublicProfileConfig) {
  const origin = approvedOrigin(config.origin), memberId = config.memberId, timeout = config.timeoutMs ?? 15000;
  if (!isProfileMemberId(memberId) || memberId !== memberId.toLowerCase() || typeof config.owner?.scope !== 'function'
    || typeof config.owner.subscribe !== 'function' || config.publicProfileTransport !== undefined && typeof config.publicProfileTransport !== 'function'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean') throw Error('An explicit public profile reference is required');
  let attached = false, closed = false, active = true, online = config.initialOnline ?? false, scope: string | null = null;
  let generation = 0, attachment = 0, busy = false, phase: PublicProfileModel['phase'] = 'closed';
  let profile: PublicMemberProfile | null = null, message = 'Load this member’s published profile when ready.', offOwner = () => {};
  const listeners = new Set<(model: PublicProfileModel) => void>(), requests = new Set<AbortController>();
  const enabled = () => !closed && attached && active && online && scope !== null && config.owner.scope() === scope;
  const model = (): PublicProfileModel => ({ connected: attached && scope !== null && config.owner.scope() === scope, active, online, busy, phase,
    profile: enabled() ? copy(profile) : null, message, canLoad: enabled() && !busy && Boolean(config.publicProfileTransport), canNavigate: !busy });
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* A view cannot grant authority. */ } } };
  function retire(notice: string) { generation++; for (const request of requests) request.abort(); profile = null; busy = false;
    phase = attached ? 'idle' : 'closed'; message = notice; emit(); }
  function close(notice = 'Public profile closed. Nothing loads automatically.') {
    if (closed) return; closed = true; attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; retire(notice);
  }
  async function load() {
    if (!model().canLoad) return;
    const g = ++generation, expected = scope, abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => enabled() && generation === g && scope === expected && !abort.signal.aborted;
    const url = origin + '/api/explorer/' + memberId;
    let onAbort = () => {};
    const aborted = new Promise<never>((_, reject) => { onAbort = () => reject(Error('Public profile retired')); abort.signal.addEventListener('abort', onAbort, { once: true }); });
    profile = null; busy = true; phase = 'loading'; message = 'Checking this member’s currently published profile…'; requests.add(abort); emit();
    try {
      const result = await Promise.race([aborted, (async () => {
        if (!current()) throw Error('Public profile lifetime ended');
        const response = await config.publicProfileTransport!(url, { method: 'GET', headers: {}, cache: 'no-store', redirect: 'error', credentials: 'omit', signal: abort.signal });
        if (!current() || response.redirected !== false || response.url !== url || ![200, 404].includes(response.status)) throw Error('Public profile unavailable');
        const body: unknown = await response.json();
        if (!current()) throw Error('Public profile lifetime ended');
        if (response.status === 404) {
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
            || (body as { error?: unknown }).error !== 'Public profile unavailable.') throw Error('Unverified public profile absence');
          return null;
        }
        const parsed = parsePublicMemberProfileResponse(body);
        if (!current() || !parsed || parsed.id !== memberId) throw Error('Public profile response unverified');
        return parsed;
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(Error('Public profile deadline')); }, timeout); })]);
      if (!current()) return;
      profile = result; busy = false; phase = result ? 'ready' : 'missing';
      message = result ? 'Currently published profile. These details were written by this member.'
        : 'This profile is not publicly available on this check. It may have been unpublished or removed.'; emit();
    } catch {
      if (!closed && attached && active && online && generation === g && scope === expected && config.owner.scope() === expected) {
        profile = null; busy = false; phase = 'unavailable'; message = 'This public profile could not be verified. Retry manually; earlier details are not being reused.'; emit();
      }
    } finally { clearTimeout(timer); abort.signal.removeEventListener('abort', onAbort); requests.delete(abort); }
  }
  return { model, subscribe(listener: (value: PublicProfileModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached || closed) return; attached = true; const at = ++attachment;
      const stop = config.owner.subscribe(() => { if (attached && !closed && at === attachment) close('Account changed. Choose a currently available profile again.'); });
      if (!attached || closed || at !== attachment) { stop(); return; }
      offOwner = stop; scope = config.owner.scope();
      retire(config.publicProfileTransport ? 'Load this member’s published profile when ready.' : 'Public profiles are unavailable in this connection.');
    },
    disconnect() { attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; retire('Public profile view hidden. Load again when ready.'); },
    activity(value: boolean) { active = value; if (!value) retire('Public profile cleared while inactive. Load again when ready.'); else emit(); },
    connectivity(value: boolean) { online = value; if (!value) retire('Public profile cleared while offline. Reconnect, then load it manually.'); else emit(); },
    load, close: () => close() };
}
export type PublicProfile = ReturnType<typeof createPublicProfile>;
