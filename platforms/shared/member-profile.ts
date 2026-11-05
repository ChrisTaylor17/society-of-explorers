import { PROFILE_LIMITS, isProfileMemberId, parseOwnerProfile, parseProfileMutation, parsePublicMemberProfileResponse,
  type OwnerProfile, type ProfileFields, type ProfileVisibility, type PublicMemberProfile } from '../../lib/members/profile';
import { approvedOrigin, type CircleTransport } from '../native/src/circles/host';
import type { VerifiedAccountOwner } from '../native/src/circles/verified-member-session';

export type MemberProfileConfig = { origin: string; memberId: string; owner: VerifiedAccountOwner;
  profileTransport?: CircleTransport; publicProfileTransport?: CircleTransport; timeoutMs?: number; initialOnline?: boolean };
type Review = { profile: ProfileFields; visibility: ProfileVisibility; retry: boolean };
export type MemberProfileModel = {
  connected: boolean; active: boolean; online: boolean; busy: boolean;
  phase: 'idle' | 'loading' | 'editing' | 'review' | 'saving' | 'unknown' | 'conflict' | 'unavailable' | 'closed';
  profile: OwnerProfile | null; draft: ProfileFields | null; visibility: ProfileVisibility; review: Review | null;
  publicProfile: PublicMemberProfile | null; publicStatus: 'unchecked' | 'loading' | 'public' | 'not-visible' | 'unavailable';
  message: string; canLoad: boolean; canEdit: boolean; canReview: boolean; canConfirm: boolean; canCancel: boolean;
  canRetry: boolean; canCheckPublic: boolean; canNavigate: boolean;
};
type Pending = { base: number; minimumRevision: number; subject: string; body: string; profile: ProfileFields; visibility: ProfileVisibility };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const equal = (a: ProfileFields, b: ProfileFields) => a.displayName === b.displayName && a.bio === b.bio && a.discipline === b.discipline
  && a.projectDescription === b.projectDescription && a.seeking === b.seeking && a.philosophy === b.philosophy && JSON.stringify(a.skills) === JSON.stringify(b.skills);
const matches = (value: OwnerProfile, target: Pick<Pending, 'profile' | 'visibility'>) => value.visibility === target.visibility && equal(value.profile, target.profile);

/** One instance belongs to one checked member account. Detaching a view clears
 * all presentation but retains an uncertain CAS only in memory. Terminal account
 * close destroys it. Aborting a request never claims an already sent write was
 * cancelled. No provider, storage, public or private request starts on connect. */
export function createMemberProfile(config: MemberProfileConfig) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15000;
  if (!isProfileMemberId(config.memberId) || !config.owner || !['scope', 'credentials', 'subscribe'].every(key => typeof config.owner[key as keyof VerifiedAccountOwner] === 'function')
    || config.profileTransport !== undefined && typeof config.profileTransport !== 'function'
    || config.publicProfileTransport !== undefined && typeof config.publicProfileTransport !== 'function'
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean') throw Error('A checked member account is required');
  const memberId = config.memberId.toLowerCase();
  let attached = false, closed = false, active = true, online = config.initialOnline ?? false, scope: string | null = null;
  let generation = 0, attachment = 0, busy = false, phase: MemberProfileModel['phase'] = 'closed';
  let profile: OwnerProfile | null = null, draft: ProfileFields | null = null, visibility: ProfileVisibility = 'private', review: Review | null = null;
  let publicProfile: PublicMemberProfile | null = null, publicStatus: MemberProfileModel['publicStatus'] = 'unchecked';
  let pending: Pending | null = null, recovered = false, boundSubject: string | null = null, offOwner = () => {};
  let message = 'Load your saved profile when ready.';
  const listeners = new Set<(value: MemberProfileModel) => void>(), requests = new Set<AbortController>();
  const enabled = () => !closed && attached && active && online && scope !== null && config.owner.scope() === scope;
  const model = (): MemberProfileModel => {
    const visible = enabled(), usable = visible && !busy, editable = usable && !pending && phase === 'editing' && profile !== null && draft !== null;
    return { connected: attached && scope !== null && config.owner.scope() === scope, active, online, busy, phase,
      profile: visible ? copy(profile) : null, draft: visible ? copy(draft) : null, visibility: visible ? visibility : 'private', review: visible ? copy(review) : null,
      publicProfile: visible ? copy(publicProfile) : null, publicStatus: visible ? publicStatus : 'unchecked', message, canLoad: usable && Boolean(config.profileTransport) && phase !== 'review',
      canEdit: editable, canReview: editable, canConfirm: usable && phase === 'review' && review !== null && Boolean(config.profileTransport),
      canCancel: usable && phase === 'review', canRetry: usable && pending !== null && recovered && phase === 'unknown',
      canCheckPublic: usable && profile !== null && phase !== 'review' && Boolean(config.publicProfileTransport), canNavigate: !busy };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Independent observers still retire. */ } } };
  function clearView(notice: string) {
    generation++; for (const controller of requests) controller.abort(); busy = false; profile = null; draft = null; visibility = 'private'; review = null;
    publicProfile = null; publicStatus = 'unchecked'; recovered = false; phase = attached ? pending ? 'unknown' : 'idle' : 'closed'; message = notice; emit();
  }
  function install(value: OwnerProfile) { profile = value; draft = copy(value.profile); visibility = value.visibility; review = null; publicProfile = null; publicStatus = 'unchecked'; }
  function unknown() { phase = 'unknown'; review = null; message = 'The save may still complete. Check the saved profile manually. Nothing retries automatically.'; }
  function makeReview(retry: boolean) {
    if (retry ? !model().canRetry : !model().canReview) return;
    if (retry && pending) review = { profile: copy(pending.profile), visibility: pending.visibility, retry: true };
    else {
      const parsed = parseProfileMutation({ expectedMemberId: memberId, expectedRevision: profile!.revision, patch: { ...draft, visibility } });
      if (!parsed) { message = 'Review the field limits and enter a display name before saving.'; emit(); return; }
      review = { profile: { displayName: parsed.patch.displayName!, bio: parsed.patch.bio!, discipline: parsed.patch.discipline!, skills: parsed.patch.skills!,
        projectDescription: parsed.patch.projectDescription!, seeking: parsed.patch.seeking!, philosophy: parsed.patch.philosophy! }, visibility, retry: false };
    }
    phase = 'review'; message = retry ? 'Review the same earlier profile save. Confirming retries its exact values and revision; the earlier save may still complete.'
      : visibility === 'public' ? 'Review every authored field. Confirming saves and publishes this profile.' : 'Review every authored field. Confirming saves this profile privately.'; emit();
  }
  async function run(action: 'load' | 'save' | 'public') {
    const m = model(); if (action === 'load' ? !m.canLoad : action === 'save' ? !m.canConfirm : !m.canCheckPublic) return;
    const g = ++generation, expectedScope = scope!, controller = new AbortController(), priorPending = pending;
    const chosen = action === 'save' ? copy(review!) : null, base = priorPending?.base ?? profile?.revision;
    // An authored change must advance the canonical revision. An apparent no-op
    // may still advance it when the server normalizes legacy NULL/blank fields.
    // Keep this floor from the original review across every uncertain retry.
    const minimumRevision = action === 'save' ? priorPending?.minimumRevision ?? base! + (matches(profile!, chosen!) ? 0 : 1) : 0;
    let operationSubject: string | null = null, sent = false, timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => generation === g && enabled() && scope === expectedScope && !controller.signal.aborted;
    const visible = () => generation === g && enabled() && scope === expectedScope;
    busy = true; review = null; publicProfile = null; publicStatus = action === 'public' ? 'loading' : 'unchecked';
    phase = action === 'save' ? 'saving' : action === 'load' ? 'loading' : phase;
    if (action === 'load') { profile = null; draft = null; visibility = 'private'; recovered = false; }
    message = action === 'save' ? 'Checking the current account before sending this profile…' : action === 'load' ? 'Checking your current saved profile…' : 'Checking the public profile without account credentials…';
    requests.add(controller); emit();
    const request = async (method: 'GET' | 'POST', body?: string) => {
      if (!current()) throw Error('Profile lifetime ended');
      const proof = await config.owner.credentials(expectedScope);
      if (!current() || !proof || !isProfileMemberId(proof.subject) || typeof proof.bearer !== 'string' || proof.bearer.length > 16377 || !/^[A-Za-z0-9._~+/-]+=*$/.test(proof.bearer)
        || boundSubject !== null && proof.subject.toLowerCase() !== boundSubject || operationSubject !== null && proof.subject.toLowerCase() !== operationSubject
        || pending !== null && proof.subject.toLowerCase() !== pending.subject) throw Error('Profile owner unverified');
      operationSubject = proof.subject.toLowerCase();
      if (method === 'POST') {
        // No observer runs between pinning and dispatch. A thrown transport call
        // is conservatively uncertain because it may have allocated a native send.
        if (!pending) pending = { base: base!, minimumRevision, subject: operationSubject, body: body!, profile: chosen!.profile, visibility: chosen!.visibility };
        sent = true;
      }
      const url = origin + '/api/members/profile';
      const response = await config.profileTransport!(url, { method, headers: { Authorization: `Bearer ${proof.bearer}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        ...(body === undefined ? {} : { body }), cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal });
      if (!current() || response.redirected !== false || response.url !== url || !Number.isInteger(response.status)) throw Error('Profile response refused');
      const payload = await response.json(); if (!current()) throw Error('Profile lifetime ended');
      return { status: response.status, value: parseOwnerProfile(payload) };
    };
    try {
      await Promise.race([(async () => {
        if (action === 'public') {
          if (!current()) throw Error('Profile lifetime ended');
          const url = origin + '/api/explorer/' + memberId;
          const response = await config.publicProfileTransport!(url, { method: 'GET', headers: {}, cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal });
          if (!current() || response.redirected !== false || response.url !== url) throw Error('Public profile response refused');
          const payload = await response.json(); if (!current()) throw Error('Profile lifetime ended');
          const parsed = response.status === 200 ? parsePublicMemberProfileResponse(payload) : null;
          if (parsed && parsed.id === memberId) { publicProfile = parsed; publicStatus = 'public'; message = 'These authored fields are currently visible on your public profile.'; }
          else if (response.status === 404 && payload && typeof payload === 'object' && Object.keys(payload).length === 1 && (payload as { error?: unknown }).error === 'Public profile unavailable.') {
            publicStatus = 'not-visible'; message = 'Your public profile is not available on this check. This does not erase Circle contributions.';
          } else throw Error('Public profile unavailable');
          return;
        }
        let receipt: OwnerProfile | null = null;
        if (action === 'save') {
          const body = priorPending?.body ?? JSON.stringify({ expectedMemberId: memberId, expectedRevision: base, patch: { ...chosen!.profile, visibility: chosen!.visibility } });
          const posted = await request('POST', body);
          if (!current()) return;
          if (posted.status !== 200) {
            if (!priorPending && [400, 401, 403, 409].includes(posted.status)) {
              pending = null; recovered = false;
              if (posted.status === 400) { phase = 'editing'; message = 'The profile was refused. Review the fields before trying again.'; }
              else { profile = null; draft = null; visibility = 'private'; phase = posted.status === 409 ? 'conflict' : 'unavailable'; message = 'The save was refused. Load the current account profile before editing again.'; }
            } else unknown();
            return;
          }
          receipt = posted.value;
          if (!receipt || receipt.memberId !== memberId || receipt.revision < pending!.minimumRevision || receipt.revision > base! + 1 || !matches(receipt, pending!)) throw Error('Profile receipt unverified');
        }
        const checked = await request('GET'), value = checked.value;
        if (!current()) return;
        if (checked.status !== 200 || !value || value.memberId !== memberId) throw Error('Saved profile unverified');
        if (pending && value.revision < pending.base) throw Error('Profile revision regressed');
        boundSubject = operationSubject;
        if (action === 'save' && receipt) {
          if (value.revision === receipt.revision && matches(value, pending!)) {
            pending = null; recovered = false; install(value); phase = 'editing'; message = value.visibility === 'public' ? 'Your saved public profile was confirmed by a fresh read.' : 'Your saved private profile was confirmed by a fresh read.';
          } else if (value.revision > pending!.base) {
            pending = null; recovered = false; install(value); phase = 'conflict'; message = 'The profile changed before confirmation. Review the current saved state by loading it again; the earlier save is not being claimed as current.';
          } else { install(value); recovered = true; unknown(); }
        } else if (pending) {
          if (value.revision > pending.base) { pending = null; recovered = false; install(value); phase = 'editing'; message = 'This is the current saved profile. Its newer revision prevents the earlier save from changing it; no receipt for that earlier request is being assumed.'; }
          else { install(value); recovered = true; unknown(); message += ' Its revision is unchanged. You may review and explicitly retry only the same earlier save.'; }
        } else { install(value); phase = 'editing'; message = 'Your saved profile is loaded. Choose edits and visibility, then review before saving.'; }
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('Profile deadline exceeded')); }, timeout); })]);
      if (current()) { busy = false; emit(); }
    } catch {
      if (visible()) {
        busy = false;
        if (action === 'public') { publicProfile = null; publicStatus = 'unavailable'; message = 'The public profile could not be checked. No publication or privacy change is being assumed.'; }
        else if (pending || sent) { recovered = false; unknown(); }
        else { phase = 'unavailable'; profile = null; draft = null; visibility = 'private'; message = action === 'save' ? 'The account could not be verified. No profile save was sent. Load again before editing.' : 'Your saved profile could not be verified. Load it again when available.'; }
        emit();
      }
    } finally { clearTimeout(timer); requests.delete(controller); }
  }
  return {
    model,
    subscribe(listener: (value: MemberProfileModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached || closed) return; attached = true; const at = ++attachment;
      const stop = config.owner.subscribe(() => { if (!attached || closed || at !== attachment) return; scope = config.owner.scope(); clearView('Account verification changed. Load this member profile again before editing or recovering a save.'); });
      if (!attached || closed || at !== attachment) { stop(); return; } offOwner = stop; scope = config.owner.scope();
      clearView(!active ? 'Profile view is inactive.' : !online ? 'Reconnect, then load your profile manually.' : pending ? 'An earlier save may still complete. Load this member profile to check it before any retry.'
        : config.profileTransport ? 'Load your saved profile when ready.' : 'Profile editing is unavailable in this connection.');
    },
    disconnect() { if (closed) return; attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; clearView('Profile view closed. An already sent save may still complete.'); },
    activity(value: boolean) { if (closed) return; active = value; if (!value) clearView('Profile view cleared while inactive. An already sent save may still complete. Load again when ready.'); else emit(); },
    connectivity(value: boolean) { if (closed) return; online = value; if (!value) clearView('Profile view cleared while offline. An already sent save may still complete. Load again when ready.'); else emit(); },
    load: () => run('load'), checkPublic: () => run('public'),
    edit<K extends keyof ProfileFields>(field: K, value: ProfileFields[K]) {
      if (!model().canEdit || !draft || !Object.hasOwn(draft, field) || (field === 'skills'
        ? !Array.isArray(value) || value.length > PROFILE_LIMITS.skills || !value.every(item => typeof item === 'string' && item.length <= PROFILE_LIMITS.skill)
        : typeof value !== 'string' || value.length > PROFILE_LIMITS[field as Exclude<keyof ProfileFields, 'skills'>])) return;
      draft = { ...draft, [field]: copy(value) }; publicProfile = null; publicStatus = 'unchecked'; emit();
    },
    setVisibility(value: ProfileVisibility) { if (model().canEdit && (value === 'private' || value === 'public')) { visibility = value; publicProfile = null; publicStatus = 'unchecked'; emit(); } },
    review: () => makeReview(false), retry: () => makeReview(true), confirm: () => run('save'),
    cancel() { if (!model().canCancel) return; review = null; if (pending) unknown(); else { phase = 'editing'; message = 'Review cancelled. Your draft has not been sent.'; } emit(); },
    close() { if (closed) return; closed = true; attachment++; attached = false; scope = null; offOwner(); offOwner = () => {}; pending = null; boundSubject = null; clearView('Account profile connection closed. Any already sent save may still complete; its local recovery data has been discarded.'); },
  };
}
export type MemberProfile = ReturnType<typeof createMemberProfile>;
