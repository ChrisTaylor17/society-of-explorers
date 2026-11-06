import { AuthClient } from '@supabase/auth-js';
import { isUuid } from '../../../../lib/ids/uuid';
import type { ExistingVerifiedAuth } from '../circles/verified-member-session';
import { hasLocalSessionClaim } from './jwt-claims';

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
type Client = InstanceType<typeof AuthClient>;
export type OwnedAuthPorts = {
  providerOrigin: string; storageKey: string; storage: Storage;
  fetch(input: string, init: RequestInit): Promise<Response>;
  resetAccountStorage(): Promise<void>; retire(): void; onRetired(listener: () => void): () => void;
};
export type OwnedAuthModel = {
  phase: 'idle' | 'signing_in' | 'resuming' | 'checking' | 'ready' | 'unavailable' | 'signing_out' | 'clearing' | 'clear_unknown' | 'closed';
  busy: boolean; active: boolean; online: boolean; ready: boolean;
  canSignIn: boolean; canResume: boolean; canClear: boolean; canSignOut: boolean; message: string;
};
type Saved = { access_token: string; refresh_token: string; expires_at: number; expires_in: number; token_type: 'bearer'; user: { id: string } };
type Verified = { access_token: string; expires_at: number; user: { id: string }; localSignOut: boolean };
type Operation = {
  kind: 'sign_in' | 'resume' | 'verify'; generation: number; controller: AbortController; disposed: boolean;
  used: Set<string>; expectedBody?: string; expectedToken?: string; expectedSubject?: string; writing: boolean;
};
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const token = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 16384 && /^[A-Za-z0-9._~+/-]+=*$/.test(value);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const failure = () => Error('Member sign-in unavailable');
const now = () => Math.floor(Date.now() / 1000);
const fresh = (value: { expires_at: number }) => value.expires_at > now() + 30;
function saved(value: unknown, providerReply = false): Saved | null {
  if (!record(value) || !token(value.access_token) || !token(value.refresh_token) || !record(value.user) || !isUuid(value.user.id)
    || value.token_type !== 'bearer') return null;
  const expires = providerReply && value.expires_at === undefined && Number.isSafeInteger(value.expires_in)
    && (value.expires_in as number) > 0 && (value.expires_in as number) <= 31536000 ? now() + (value.expires_in as number) : value.expires_at;
  if (!Number.isSafeInteger(expires) || (expires as number) <= 0) return null;
  return { access_token: value.access_token, refresh_token: value.refresh_token, expires_at: expires,
    expires_in: Math.max(0, (expires as number) - now()), token_type: 'bearer', user: { id: value.user.id.toLowerCase() } } as Saved;
}
function provider(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || url.search || url.hash) throw failure();
  return value;
}
let clientSequence = 0;

/** App-owned email/password sign-in. The SDK is ephemeral and has no durable
 * storage or automatic initialization. Only an explicit operation can reach the
 * provider; protected persistence follows fresh exact-token subject verification.
 * A verified phone session can request local-scope revocation before clearing
 * protected storage. Email confirmation and recovery use their own controller. */
export function createOwnedNativeAuth(config: { ports: OwnedAuthPorts; publishableKey: string; timeoutMs?: number; initialOnline?: boolean }) {
  const ports = config.ports, origin = provider(ports.providerOrigin), key = ports.storageKey, timeout = config.timeoutMs ?? 15000;
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(key) || typeof config.publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(config.publishableKey)
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000 || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean'
    || !['fetch', 'resetAccountStorage', 'retire', 'onRetired'].every(name => typeof ports[name as keyof OwnedAuthPorts] === 'function')
    || !ports.storage || !['getItem', 'setItem', 'removeItem'].every(name => typeof ports.storage[name as keyof Storage] === 'function')) throw failure();
  let active = false, online = config.initialOnline ?? false, closed = false, nativeRetired = false, clearing = false, preparing = false, generation = 0;
  let phase: OwnedAuthModel['phase'] = 'idle', message = 'Sign in with an existing account, or explicitly resume the saved device session.';
  let verified: Verified | null = null, expiry: ReturnType<typeof setTimeout> | undefined, queue: Promise<unknown> = Promise.resolve();
  let logoutRequest: AbortController | null = null;
  let offRetired = () => {};
  const pending = new Set<Operation>(), listeners = new Set<(model: OwnedAuthModel) => void>();
  const authListeners = new Set<Parameters<ExistingVerifiedAuth['onAuthStateChange']>[0]>();
  const enabled = () => active && online && !closed && !nativeRetired && !clearing;
  const model = (): OwnedAuthModel => {
    const busy = pending.size > 0 || clearing || preparing, ready = enabled() && verified !== null && fresh(verified);
    return { phase, active, online, busy, ready, canSignIn: enabled() && !busy, canResume: enabled() && !busy,
      canClear: !closed && !nativeRetired && !clearing, canSignOut: ready && !busy && verified?.localSignOut === true, message };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Independent observer. */ } } };
  const authEvent = (event: string) => { for (const listener of authListeners) { try { listener(event, null); } catch { /* Independent observer. */ } } };
  function clearMemory(text: string, next: OwnedAuthModel['phase'] = 'idle') {
    generation++; clearTimeout(expiry); verified = null;
    logoutRequest?.abort();
    for (const operation of pending) operation.controller.abort();
    message = text; phase = next; authEvent('SIGNED_OUT'); emit();
  }
  const current = (operation: Operation) => enabled() && !operation.disposed && !operation.controller.signal.aborted && generation === operation.generation;
  const requireCurrent = (operation: Operation) => { if (!current(operation)) throw failure(); };
  function accept(session: Saved) {
    clearTimeout(expiry);
    verified = { access_token: session.access_token, expires_at: session.expires_at, user: { id: session.user.id },
      localSignOut: hasLocalSessionClaim(session.access_token, session.user.id) };
    phase = 'ready'; message = 'Your existing account is verified. Continue to check your Society of Explorers member account.';
    const expected = verified;
    const expire = () => {
      if (verified !== expected || closed) return;
      if (fresh(expected)) { expiry = setTimeout(expire, Math.min(2147483647, Math.max(1, (expected.expires_at - now() - 30) * 1000))); return; }
      clearMemory('The verified session expired. Resume it explicitly or sign in again.');
    };
    expiry = setTimeout(expire, Math.min(2147483647, Math.max(1, (session.expires_at - now() - 30) * 1000)));
    authEvent('SIGNED_IN'); emit();
  }
  const denied = () => new Response('{"message":"Member sign-in unavailable"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
  function sdk(operation: Operation) {
    // A separate closure prevents a late SDK refresh retry from borrowing the
    // authority of a subsequent operation. Non-retryable normalized failures
    // also prevent the SDK's refresh retry loop and raw provider error logging.
    const fetcher: typeof fetch = async (input, init) => {
      try {
        requireCurrent(operation);
        if (typeof input !== 'string' || !init) return denied();
        const url = new URL(input), headers = new Headers(init.headers);
        const family = url.href === origin + '/auth/v1/token?grant_type=password' && init.method === 'POST' ? 'password'
          : url.href === origin + '/auth/v1/token?grant_type=refresh_token' && init.method === 'POST' ? 'refresh'
            : url.href === origin + '/auth/v1/user' && init.method === 'GET' ? 'user' : null;
        if (!family || operation.used.has(family) || headers.get('apikey') !== config.publishableKey
          || family === 'password' && (operation.kind !== 'sign_in' || init.body !== operation.expectedBody)
          || family === 'refresh' && (operation.kind !== 'resume' || init.body !== operation.expectedBody)
          || family === 'user' && (!operation.expectedToken || headers.get('Authorization') !== 'Bearer ' + operation.expectedToken || init.body !== undefined)) return denied();
        operation.used.add(family);
        if (family !== 'user') operation.expectedBody = undefined;
        const response = await ports.fetch(input, { ...init, signal: operation.controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
        requireCurrent(operation);
        if (response.url !== input || response.redirected || response.status !== 200) return denied();
        const body: unknown = await response.json(); requireCurrent(operation);
        let clean: unknown;
        if (family === 'user') {
          const user = record(body) && record(body.user) ? body.user : body;
          if (!record(user) || !isUuid(user.id) || !operation.expectedSubject || !same(user.id, operation.expectedSubject)) return denied();
          clean = { user: { id: user.id.toLowerCase() } };
        } else {
          const session = saved(body, true);
          if (!session || !fresh(session) || operation.expectedSubject && !same(session.user.id, operation.expectedSubject)) return denied();
          clean = session;
        }
        return new Response(JSON.stringify(clean), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch { return denied(); }
    };
    return new AuthClient({ url: origin + '/auth/v1', storageKey: 'soe-owned-operation-' + (++clientSequence),
      headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + config.publishableKey },
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, skipAutoInitialize: true, flowType: 'pkce', debug: false, fetch: fetcher });
  }
  async function schedule<T>(operation: Operation, work: (client: Client) => Promise<T>): Promise<T> {
    pending.add(operation); emit();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(failure()); });
    operation.controller.signal.addEventListener('abort', rejectAbort, { once: true });
    if (operation.controller.signal.aborted) rejectAbort();
    const run = queue.then(async () => {
      requireCurrent(operation); const client = sdk(operation);
      try { const result = await work(client); requireCurrent(operation); return result; }
      finally { await client.stopAutoRefresh(); }
    });
    // A deadline retires this operation even if native delivery/storage ignores
    // cancellation. Later work never waits for an abandoned SDK result.
    const bounded = Promise.race([run, aborted, new Promise<never>((_, reject) => { timer = setTimeout(() => { operation.controller.abort(); reject(failure()); }, timeout); })]);
    queue = bounded.then(() => {}, () => {});
    try { return await bounded; }
    finally { clearTimeout(timer); operation.controller.signal.removeEventListener('abort', rejectAbort); operation.disposed = true; operation.expectedBody = undefined; operation.expectedToken = undefined; pending.delete(operation); emit(); }
  }
  const operation = (kind: Operation['kind']): Operation => ({ kind, generation, controller: new AbortController(), disposed: false, used: new Set(), writing: false });
  async function verify(client: Client, op: Operation, session: Saved) {
    op.expectedToken = session.access_token; op.expectedSubject = session.user.id;
    const result = await client.getUser(session.access_token); requireCurrent(op);
    if (result.error || !isUuid(result.data.user?.id) || !same(result.data.user.id, session.user.id)) throw failure();
  }
  async function enter(kind: 'sign_in' | 'resume', email?: string, password?: string) {
    if (!(kind === 'sign_in' ? model().canSignIn : model().canResume)) return;
    preparing = true;
    // A deliberate sign-in attempt retires the previous account even when the
    // replacement input is invalid. Continuing must never reuse that account.
    clearMemory(kind === 'sign_in' ? 'Checking your existing account. Nothing joins a Circle automatically.' : 'Checking the saved device session.', kind === 'sign_in' ? 'signing_in' : 'resuming');
    if (kind === 'sign_in' && (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
      || typeof password !== 'string' || password.length < 1 || password.length > 1024 || /[\u0000-\u001f\u007f]/u.test(password))) {
      preparing = false;
      if (!closed) { phase = 'unavailable'; message = 'Enter the email address and password for an existing account.'; emit(); } return;
    }
    const op = operation(kind);
    preparing = false;
    try {
      const session = await schedule(op, async client => {
        let candidate: Saved | null;
        if (kind === 'sign_in') {
          op.expectedBody = JSON.stringify({ email, password, gotrue_meta_security: {} });
          const result = await client.signInWithPassword({ email: email!, password: password! }); requireCurrent(op);
          if (result.error) throw failure(); candidate = saved(result.data.session);
        } else {
          const value = await ports.storage.getItem(key); requireCurrent(op);
          if (typeof value !== 'string' || value.length > 65536) throw failure();
          candidate = saved(JSON.parse(value)); if (!candidate) throw failure();
          op.expectedSubject = candidate.user.id;
          if (!fresh(candidate)) {
            op.expectedBody = JSON.stringify({ refresh_token: candidate.refresh_token });
            const result = await client.refreshSession(candidate); requireCurrent(op);
            if (result.error) throw failure(); candidate = saved(result.data.session);
          }
        }
        if (!candidate || !fresh(candidate)) throw failure();
        await verify(client, op, candidate); requireCurrent(op);
        // Native generation fencing protects reset races. A write already sent
        // before background/timeout may still finish; it grants no UI authority
        // and the next explicit resume must verify the exact token again.
        op.writing = true; await ports.storage.setItem(key, JSON.stringify(candidate)); requireCurrent(op);
        return candidate;
      });
      if (enabled() && generation === op.generation && !op.controller.signal.aborted) accept(session);
    } catch {
      if (enabled() && generation === op.generation) {
        phase = 'unavailable'; message = op.writing ? 'The saved session could not be confirmed. It may have been stored. Resume explicitly to check; nothing retries automatically.'
          : 'The existing account could not be verified. Sign in or resume again when ready. Nothing retries automatically.'; emit();
      }
    }
  }
  const auth: ExistingVerifiedAuth = {
    async getSession() {
      if (verified && !fresh(verified)) clearMemory('The verified session expired. Resume it explicitly or sign in again.');
      const currentSession = enabled() ? verified : null;
      return { data: { session: currentSession ? { access_token: currentSession.access_token, user: { ...currentSession.user } } : null } };
    },
    async getUser(jwt) {
      const expected = verified;
      if (!enabled() || !expected || !fresh(expected) || jwt !== expected.access_token) {
        if (expected) clearMemory('Current account verification changed. Resume explicitly before continuing.', 'unavailable');
        return { data: { user: null }, error: failure() };
      }
      const op = operation('verify'); op.expectedToken = jwt; op.expectedSubject = expected.user.id;
      try {
        const id = await schedule(op, async client => {
          const result = await client.getUser(jwt); requireCurrent(op);
          if (verified !== expected || !fresh(expected) || result.error || !isUuid(result.data.user?.id) || !same(result.data.user.id, expected.user.id)) throw failure();
          return result.data.user.id.toLowerCase();
        });
        if (!enabled() || generation !== op.generation || verified !== expected || !fresh(expected)) throw failure();
        return { data: { user: { id } } };
      } catch {
        if (generation === op.generation && verified === expected) clearMemory('Current account verification is unavailable. Resume explicitly before continuing.', 'unavailable');
        return { data: { user: null }, error: failure() };
      }
    },
    onAuthStateChange(listener) { authListeners.add(listener); return { data: { subscription: { unsubscribe() { authListeners.delete(listener); } } } }; },
  };
  async function revokeCurrentSession(session: Verified, expectedGeneration: number): Promise<boolean> {
    if (closed || nativeRetired || !active || !online || generation !== expectedGeneration || !fresh(session)) return false;
    const endpoint = origin + '/auth/v1/logout?scope=local';
    const controller = new AbortController();
    logoutRequest = controller;
    let onAbort = () => {};
    const interrupted = new Promise<null>(resolve => {
      onAbort = () => resolve(null);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const deadline = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await Promise.race([interrupted, ports.fetch(endpoint, {
        method: 'POST', signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      })]);
      return response !== null && !controller.signal.aborted && response.url === endpoint && response.redirected === false && response.status === 204;
    } catch {
      return false;
    } finally {
      clearTimeout(deadline);
      controller.signal.removeEventListener('abort', onAbort);
      logoutRequest = null;
    }
  }
  async function clearSession(signOut: boolean) {
    const state = model();
    if (signOut ? !state.canSignOut : !state.canClear) return;
    const session = signOut ? verified : null;
    const expectedGeneration = generation + 1;
    clearing = true;
    clearMemory(signOut ? 'Signing out of this phone…' : 'Clearing the saved session from this device. This does not revoke provider sessions.',
      signOut ? 'signing_out' : 'clearing');
    const revoked = session ? await revokeCurrentSession(session, expectedGeneration) : false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([ports.resetAccountStorage(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(failure()), timeout);
      })]);
      if (!closed) {
        phase = 'closed';
        message = revoked ? 'Signed out of this phone. Its saved sign-in is cleared.'
          : signOut ? 'Saved sign-in cleared. Online sign-out is unconfirmed.'
            : 'Saved session cleared from this device. Provider sessions were not revoked. Reopen the account connection to sign in again.';
      }
    } catch {
      if (!closed) {
        phase = 'clear_unknown';
        message = revoked ? 'Online sign-out accepted. Device clearing is unconfirmed. Reopen the account connection to clear this device.'
          : signOut ? 'Device clearing and online sign-out are unconfirmed. Reopen the account connection to clear this device.'
            : 'Device clearing could not be confirmed. Reopen the account connection and check again. Provider sessions were not revoked.';
      }
    } finally {
      clearTimeout(timer);
      clearing = false;
      nativeRetired = true;
      offRetired();
      offRetired = () => {};
      try { ports.retire(); } catch { /* Already retired. */ }
      emit();
    }
  }
  offRetired = ports.onRetired(() => {
    nativeRetired = true;
    if (clearing) logoutRequest?.abort();
    else clearMemory('The device account connection changed. Reopen it before signing in again.', 'closed');
  });
  return {
    auth, model,
    subscribe(listener: (value: OwnedAuthModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; },
    signIn: (email: string, password: string) => enter('sign_in', email, password), resume: () => enter('resume'),
    activity(value: boolean) {
      if (closed || value === active) return;
      active = value;
      if (clearing || nativeRetired) {
        if (clearing && !value) { generation++; logoutRequest?.abort(); }
        emit();
      }
      else if (!value) clearMemory('Private sign-in access cleared while inactive. Saved device data may remain; resume explicitly.');
      else emit();
    },
    connectivity(value: boolean) {
      if (closed || value === online) return;
      online = value;
      if (clearing || nativeRetired) {
        if (clearing && !value) { generation++; logoutRequest?.abort(); }
        emit();
      }
      else if (!value) clearMemory('Private sign-in access cleared while offline. Saved device data may remain; resume explicitly.');
      else emit();
    },
    signOutDevice: () => clearSession(true),
    clearDeviceSession: () => clearSession(false),
    close() {
      if (closed) return; closed = true; offRetired(); offRetired = () => {};
      clearMemory('Sign-in view closed. A saved device session may remain; provider sessions were not revoked.', 'closed');
      try { ports.retire(); } catch { /* Closed before native cleanup. */ }
      authListeners.clear();
    },
  };
}
export type OwnedNativeAuth = ReturnType<typeof createOwnedNativeAuth>;
