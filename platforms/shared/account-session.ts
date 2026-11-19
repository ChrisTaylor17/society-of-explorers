import { isUuid } from '../../lib/ids/uuid';
import { approvedOrigin, type CircleTransport } from '../native/src/circles/host';
import type { VerifiedAccountOwner } from '../native/src/circles/verified-member-session';

export type MemberAccountModel = {
  active: boolean; online: boolean; connected: boolean; busy: boolean;
  phase: 'idle' | 'checking' | 'preparing' | 'unknown' | 'ready' | 'unavailable' | 'closed';
  confirmed: boolean; member: { id: string; displayName: string } | null; message: string;
  canCheck: boolean; canConfirm: boolean; canPrepare: boolean; canOpenCircle: boolean;
};
type AccountConfig = { owner: VerifiedAccountOwner; origin: string; transport: CircleTransport; timeoutMs?: number; initialOnline?: boolean };
const record = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function member(value: unknown, subject: string, session: boolean) {
  if (!record(value) || !record(value.member)) return null;
  const m = value.member;
  if (!isUuid(m.id) || !isUuid(m.supabase_auth_id) || !same(m.supabase_auth_id, subject)
    || typeof m.display_name !== 'string' || m.display_name.length > 400 || [...m.display_name].length > 200) return null;
  if (session ? !record(value.auth) || value.auth.provider !== 'supabase' || !isUuid(value.auth.subject) || !same(value.auth.subject, subject)
    : typeof value.created !== 'boolean') return null;
  return { id: m.id.toLowerCase(), displayName: m.display_name.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim() || 'Explorer' };
}

/** Explicit setup for an already verified provider account. This does not own
 * provider login, token persistence, sign-out or the native auth SDK. */
export function createMemberAccountSession(config: AccountConfig) {
  const origin = approvedOrigin(config.origin), timeout = config.timeoutMs ?? 15000;
  if (!config.owner || !['scope', 'subscribe', 'credentials'].every(key => typeof config.owner[key as keyof VerifiedAccountOwner] === 'function')
    || typeof config.transport !== 'function' || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000
    || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean') throw Error('Verified account connection required');
  let attached = false, active = true, online = config.initialOnline ?? false, scope: string | null = null, generation = 0;
  let phase: MemberAccountModel['phase'] = 'closed', busy = false, confirmed = false, setupAllowed = false, pending = false;
  let expectedMember: string | null = null, pendingSubject: string | null = null, currentMember: MemberAccountModel['member'] = null;
  let message = 'Check your existing provider session, then check your member account.';
  let abort: AbortController | null = null, offOwner = () => {};
  const listeners = new Set<(model: MemberAccountModel) => void>();
  const enabled = () => attached && active && online && scope !== null && config.owner.scope() === scope;
  const model = (): MemberAccountModel => {
    const usable = enabled() && !busy;
    return { active, online, connected: attached && scope !== null, busy, phase, confirmed, member: currentMember ? { ...currentMember } : null, message,
      canCheck: usable, canConfirm: usable && setupAllowed,
      canPrepare: usable && setupAllowed && confirmed,
      canOpenCircle: usable && phase === 'ready' && currentMember !== null };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Other observers must still retire. */ } } };
  function retire(text: string) {
    generation++; abort?.abort(); abort = null; busy = false; confirmed = false; setupAllowed = false;
    pending = false; expectedMember = null; pendingSubject = null; currentMember = null; phase = attached ? 'idle' : 'closed'; message = text; emit();
  }
  async function run(setup: boolean) {
    if (setup ? !model().canPrepare : !model().canCheck) return;
    const expectedScope = scope!, g = ++generation, controller = new AbortController(); abort = controller;
    const current = () => generation === g && enabled() && scope === expectedScope && !controller.signal.aborted;
    let sent = false, expectedSubject: string | null = null, timer: ReturnType<typeof setTimeout> | undefined;
    busy = true; confirmed = false; setupAllowed = false; currentMember = null; phase = setup ? 'preparing' : 'checking';
    message = setup ? 'Preparing member setup for the verified account. Nothing has been sent yet…' : 'Checking your current member account…'; emit();
    const request = async (path: '/api/auth/member' | '/api/auth/ensure-member') => {
      if (!current()) throw Error('Account retired');
      const proof = await config.owner.credentials(expectedScope);
      if (!current() || !proof || !isUuid(proof.subject) || typeof proof.bearer !== 'string' || proof.bearer.length > 16377
        || !/^[A-Za-z0-9._~+/-]+=*$/.test(proof.bearer) || expectedSubject !== null && !same(expectedSubject, proof.subject)
        || pendingSubject !== null && !same(pendingSubject, proof.subject)) throw Error('Account unavailable');
      expectedSubject = proof.subject.toLowerCase();
      const post = path === '/api/auth/ensure-member';
      if (post) { sent = true; pending = true; pendingSubject = expectedSubject; message = 'Sending member setup. If its reply is lost, check your current account manually.'; emit(); }
      if (!current()) throw Error('Account retired');
      const response = await config.transport(origin + path, { method: post ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${proof.bearer}`, ...(post ? { 'Content-Type': 'application/json' } : {}) },
        ...(post ? { body: '{}' } : {}), cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
      if (!current() || response.redirected || response.url !== origin + path) throw Error('Account response refused');
      const body = await response.json();
      if (!current()) throw Error('Account retired');
      return { http: response.status, body, subject: expectedSubject };
    };
    try {
      await Promise.race([(async () => {
        if (setup) {
          const posted = await request('/api/auth/ensure-member');
          const result = posted.http === 200 ? member(posted.body, posted.subject, false) : null;
          if (!result || expectedMember !== null && !same(result.id, expectedMember)) throw Error('Setup unconfirmed');
          expectedMember = result.id;
          message = 'Setup replied. Checking the current account before opening Circles…'; emit();
        }
        const checked = await request('/api/auth/member');
        if (!current()) return;
        const result = checked.http === 200 ? member(checked.body, checked.subject, true) : null;
        if (result && (expectedMember === null || same(result.id, expectedMember))) {
          currentMember = result; busy = false; phase = 'ready'; pending = false; expectedMember = null; pendingSubject = null;
          message = 'Your current member account is confirmed. Continue to the Circle when ready.'; emit(); return;
        }
        busy = false; phase = pending ? 'unknown' : 'unavailable';
        setupAllowed = checked.http === 401 && record(checked.body) && checked.body.session === 'signed_out' && checked.body.browserSignedOut === false;
        message = pending ? setupAllowed ? 'Earlier setup may still complete. The current account is not confirmed. You may check again or explicitly confirm a retry of the same setup for this account.'
          : 'Setup may have completed, but the current member account is not confirmed. Check again manually; nothing will retry automatically.'
          : setupAllowed ? 'Your member account is not confirmed. You may explicitly set up a member account for this verified sign-in; an existing account will be reused.'
            : 'Your current member account could not be verified. No setup has been assumed. Check again when available.'; emit();
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('Account deadline')); }, timeout); })]);
    } catch {
      if (generation !== g || !enabled() || scope !== expectedScope) return;
      busy = false; phase = pending || sent ? 'unknown' : 'unavailable'; currentMember = null; setupAllowed = false;
      message = pending || sent ? 'Member setup may have completed. Check the current member account manually. No automatic setup retry will occur.'
        : 'The member account could not be checked. No setup request was sent.'; emit();
    } finally { clearTimeout(timer); if (abort === controller) abort = null; }
  }
  return {
    model,
    subscribe(listener: (value: MemberAccountModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached) return;
      attached = true;
      offOwner = config.owner.subscribe(() => { scope = config.owner.scope(); retire('Account changed. Check your current member account before continuing.'); });
      scope = config.owner.scope(); retire('Check your existing provider session, then check your member account.');
    },
    disconnect() { attached = false; scope = null; offOwner(); offOwner = () => {}; retire('Member account view closed. An earlier setup request may still have completed.'); },
    activity(value: boolean) { active = value; if (!value) retire('Private account information cleared while inactive. An earlier setup request may still have completed.'); else emit(); },
    connectivity(value: boolean) { online = value; if (!value) retire('Private account information cleared while offline. Check again manually after reconnecting.'); else emit(); },
    check: () => run(false),
    confirm(value: boolean) { if (model().canConfirm) { confirmed = value === true; emit(); } },
    prepare: () => run(true),
    close() { this.disconnect(); },
  };
}
export type MemberAccountSession = ReturnType<typeof createMemberAccountSession>;
