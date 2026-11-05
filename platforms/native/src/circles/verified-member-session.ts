import type { CircleHostConfig, CircleOwner } from './host';
type ExistingSession = { access_token: string; user: { id: string } };
export type ExistingVerifiedAuth = {
  getSession(): Promise<{ data: { session: ExistingSession | null }; error?: unknown }>;
  getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error?: unknown }>;
  onAuthStateChange(listener: (event: string, session: ExistingSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
};
export type MemberSessionModel = {
  phase: 'stopped' | 'checking' | 'signed_out' | 'unavailable' | 'ready' | 'paused';
  active: boolean; busy: boolean; canCheck: boolean; message: string;
};
export type ExistingMemberAccountConfig = Omit<CircleHostConfig, 'owner' | 'circleId'> & { circleId?: string; aiConsent?: boolean; reviewerTransport?: CircleHostConfig['transport']; auth: ExistingVerifiedAuth; verificationTimeoutMs?: number; publicTransport?: CircleHostConfig['transport']; passageTransport?: CircleHostConfig['transport']; profileTransport?: CircleHostConfig['transport']; publicProfileTransport?: CircleHostConfig['transport']; savedReadingTransport?: CircleHostConfig['transport']; attendanceTransport?: CircleHostConfig['transport']; hostingTransport?: CircleHostConfig['transport']; editionTransport?: CircleHostConfig['transport'] };
export type ExistingMemberCircleConfig = ExistingMemberAccountConfig & { circleId: string };
export type VerifiedAccountOwner = CircleOwner & {
  credentials(expectedScope: string): Promise<{ bearer: string; subject: string } | null>;
};
const identity = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(x);
const token = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 16384 && !/[\s\u0000-\u001f\u007f]/.test(x);
const sessionValid = (s: ExistingSession | null): s is ExistingSession => !!s && token(s.access_token) && identity(s.user?.id);
const VERIFY_EVENTS = new Set(['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'MFA_CHALLENGE_VERIFIED']);

/** Read-only adapter for an already-created/authenticated SDK client. Cached
 * session data supplies a credential; getUser(theExactToken) must confirm its
 * subject. Circle membership remains a separate server read. No login, member
 * provisioning, persistence, logout or auto-refresh ownership is introduced. */
export function createVerifiedSupabaseCircleOwner(auth: ExistingVerifiedAuth, { timeoutMs = 5000 }: { timeoutMs?: number } = {}) {
  if (!auth || typeof auth.getSession !== 'function' || typeof auth.getUser !== 'function' || typeof auth.onAuthStateChange !== 'function') throw Error('Existing verifying auth client required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw Error('Invalid verification deadline');
  let started = false, active = true, inAuthCallback = false, lifetime = 0, generation = 0, sequence = 0;
  let subject: string | null = null, scope: string | null = null, operation: number | null = null;
  let unsubscribe: (() => void) | null = null, scheduled: ReturnType<typeof setTimeout> | undefined;
  let phase: MemberSessionModel['phase'] = 'stopped', message = 'Existing member session is not connected.';
  const ownerListeners = new Set<() => void>(), listeners = new Set<(m: MemberSessionModel) => void>();
  const model = (): MemberSessionModel => ({ phase, active, busy: phase === 'checking', canCheck: started && active && phase !== 'checking', message });
  const notify = () => { for (const f of ownerListeners) { try { f(); } catch { /* One observer cannot block retirement for others. */ } } for (const f of listeners) { try { f(model()); } catch { /* No provider details escape. */ } } };
  const cancelScheduled = () => { clearTimeout(scheduled); scheduled = undefined; };
  function clear(next: MemberSessionModel['phase'], text: string, checking = false) {
    const transition = ++generation; scope = null; subject = null; operation = checking ? transition : null; phase = next; message = text; notify(); return transition;
  }
  const current = (g: number) => started && active && generation === g;
  async function deadline<T>(work: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Verification unavailable')), timeoutMs); })]); }
    finally { clearTimeout(timer); }
  }
  function attach() {
    if (unsubscribe) return true;
    const run = lifetime;
    try {
      const result = auth.onAuthStateChange(event => {
        if (!started || lifetime !== run) return;
        const wasInAuthCallback = inAuthCallback;
        inAuthCallback = true;
        try {
          cancelScheduled();
          if (!active) { clear('paused', 'Private session access cleared while inactive. Check the existing session when you return.'); return; }
          if (event === 'SIGNED_OUT') { clear('signed_out', 'No active member session. Use the existing app sign-in, then check again.'); return; }
          if (!VERIFY_EVENTS.has(event)) { clear('unavailable', 'Account state changed. Check the existing app session again before continuing.'); return; }
          const transition = clear('checking', 'Checking the existing member session. Circle membership still requires a fresh read.');
          if (!current(transition) || lifetime !== run) return;
          // Do not call an async SDK method from inside its auth callback/lock.
          scheduled = setTimeout(() => { scheduled = undefined; void check(); }, 0);
        } finally { inAuthCallback = wasInAuthCallback; }
      });
      if (typeof result?.data?.subscription?.unsubscribe !== 'function') throw Error('Subscription unavailable');
      const detach = () => result.data.subscription.unsubscribe();
      // A synchronous callback may have stopped or replaced this lifetime before
      // the provider returned its subscription handle.
      if (!started || lifetime !== run) { try { detach(); } catch {} return false; }
      unsubscribe = detach; return true;
    } catch {
      if (started && lifetime === run) { lifetime++; clear('unavailable', 'Session checks are unavailable. Try checking the existing session again.'); }
      return false;
    }
  }
  async function check() {
    if (!started || !active || inAuthCallback || operation !== null) return;
    cancelScheduled();
    const beforeAttach = generation;
    if (!attach() || !started || !active || generation !== beforeAttach) return;
    const g = clear('checking', 'Checking the existing member session. Circle membership still requires a fresh read.', true);
    if (!current(g)) return;
    try {
      const verified = await deadline(async () => {
        const result = await auth.getSession();
        if (!current(g)) return null;
        if (result.error) throw Error('Session unavailable');
        if (!result.data.session) return { signedOut: true as const };
        const s = result.data.session;
        if (!sessionValid(s)) throw Error('Session unavailable');
        const checkedToken = s.access_token, checkedSubject = s.user.id;
        const reply = await auth.getUser(checkedToken);
        if (!current(g)) return null;
        if (s.access_token !== checkedToken || s.user?.id !== checkedSubject || reply.error || !identity(reply.data.user?.id) || reply.data.user.id !== checkedSubject) throw Error('Identity not confirmed');
        return { subject: checkedSubject };
      });
      if (!current(g) || !verified) return;
      operation = null;
      if ('signedOut' in verified) { clear('signed_out', 'No active member session. Use the existing app sign-in, then check again.'); return; }
      subject = verified.subject; scope = `verified-owner-${++sequence}`; phase = 'ready';
      message = 'Provider session checked. Refresh Circle access to confirm current membership.'; notify();
    } catch {
      if (current(g)) clear('unavailable', 'Could not confirm the existing member session. Check again when available.');
    }
  }
  const owner: VerifiedAccountOwner = {
    scope: () => scope,
    subscribe(listener) { ownerListeners.add(listener); return () => { ownerListeners.delete(listener); }; },
    async bearer(expected) { return (await owner.credentials(expected))?.bearer ?? null; },
    async credentials(expected) {
      const g = generation, expectedSubject = subject;
      if (!current(g) || !scope || expected !== scope || !expectedSubject || phase !== 'ready') return null;
      try {
        return await deadline(async () => {
          const result = await auth.getSession();
          if (!current(g) || scope !== expected) return null;
          const s = result.data.session;
          if (result.error || !sessionValid(s) || s.user.id !== expectedSubject) throw Error('Session changed');
          const checkedToken = s.access_token;
          const reply = await auth.getUser(checkedToken);
          if (!current(g) || scope !== expected) return null;
          if (s.access_token !== checkedToken || s.user?.id !== expectedSubject || reply.error || reply.data.user?.id !== expectedSubject) throw Error('Identity not confirmed');
          return { bearer: checkedToken, subject: expectedSubject };
        });
      } catch {
        if (current(g) && scope === expected) clear('unavailable', 'Session access could not be confirmed. Check the existing session before continuing.');
        return null;
      }
    },
  };
  return { owner, model,
    subscribe(listener: (m: MemberSessionModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    async start() {
      if (started) return;
      started = true; lifetime++;
      if (!active) { clear('paused', 'Private session access cleared while inactive. Check the existing session when you return.'); return; }
      await check();
    },
    check,
    activity(value: boolean) {
      if (value === active) return;
      active = value; cancelScheduled();
      if (started) clear('paused', value ? 'Check the existing member session again before continuing.' : 'Private session access cleared while inactive. Check the existing session when you return.');
    },
    stop() {
      started = false; lifetime++; cancelScheduled(); const off = unsubscribe; unsubscribe = null;
      clear('stopped', 'Existing member session connection closed. The app still owns sign-in and sign-out.');
      try { off?.(); } catch { /* Authority was cleared before a failed detach. */ }
    },
  };
}
export type VerifiedMemberSession = ReturnType<typeof createVerifiedSupabaseCircleOwner>;
