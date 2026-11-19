import { AuthClient } from '@supabase/auth-js';
import { isUuid } from '../ids/uuid';
import { getSafeAuthRedirectPath } from './redirectPath';

export const EMAIL_CONFIRMATION_STORAGE_KEY = 'soe.email-confirmation.v1';
const SDK_KEY = 'soe-isolated-email-confirmation-v1', TTL = 60 * 60 * 1000;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const token = (value: unknown): value is string => typeof value === 'string' && value.length <= 16384 && /^[A-Za-z0-9._~+/-]{1,16384}=*$/.test(value);
const unavailable = () => new Error('Email confirmation unavailable');
type Pending = { version: 1; flow: string; createdAt: number; expiresAt: number; verifier: string; nextPath: string };
type Session = { access_token: string; refresh_token: string; token_type: 'bearer'; expires_at: number; expires_in: number; user: { id: string } };
export type ConfirmationLink = { kind: 'none' | 'invalid' } | { kind: 'code'; flow: string; code: string };
export type EmailSignupModel = {
  phase: 'idle' | 'sending' | 'sent' | 'link' | 'verifying' | 'confirmed' | 'unknown' | 'unavailable' | 'closed';
  busy: boolean; active: boolean; online: boolean; canSignUp: boolean; canResend: boolean; canContinue: boolean; message: string; nextPath: string | null;
};
export type EmailSignupConfig = {
  origin: string; providerOrigin: string; publishableKey: string; link: ConfirmationLink;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  withLock<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T>;
  fetch: typeof fetch; crypto: Crypto; timeoutMs?: number; now?: () => number; nextPath?: string;
};
type Operation = { kind: 'signup' | 'resend' | 'verify'; generation: number; abort: AbortController; used: Set<string>; memory: Map<string, string>; pending?: Pending; code?: string; session?: Session; dispatched: boolean };

/** Capture once before any auth client is constructed. Callback credentials,
 * including malformed implicit tokens, are never retained in browser history. */
export function captureConfirmationLink(href: string, origin: string, replace: (path: string) => void): ConfirmationLink {
  let result: ConfirmationLink = { kind: 'invalid' };
  try {
    const url = new URL(href);
    if (url.origin === origin && url.pathname === '/auth/confirm' && !url.hash) {
      const keys = [...url.searchParams.keys()];
      if (!keys.length) result = { kind: 'none' };
      else if (keys.length === 2 && keys.filter(key => key === 'flow').length === 1 && keys.filter(key => key === 'code').length === 1) {
        const flow = url.searchParams.get('flow')!, code = url.searchParams.get('code')!;
        if (/^[0-9a-f]{64}$/.test(flow) && /^[A-Za-z0-9._~-]{1,2048}$/.test(code)) result = { kind: 'code', flow, code };
      }
    }
  } catch { /* Invalid callbacks have no authority. */ }
  try { replace('/auth/confirm'); } catch { return { kind: 'invalid' }; }
  return result;
}

class IsolatedConfirmationClient extends AuthClient {
  constructor(options: ConstructorParameters<typeof AuthClient>[0]) {
    super(options);
    // The cached SDK creates a channel even when auto-initialization is skipped.
    // An email confirmation must not publish a session to an ordinary client.
    this.broadcastChannel?.close(); this.broadcastChannel = null;
  }
}
function pending(value: string | null, now: number): Pending | null {
  if (!value || value.length > 4096) return null;
  try {
    const candidate: unknown = JSON.parse(value);
    if (!record(candidate) || Object.keys(candidate).sort().join(',') !== 'createdAt,expiresAt,flow,nextPath,verifier,version' || candidate.version !== 1
      || typeof candidate.flow !== 'string' || !/^[0-9a-f]{64}$/.test(candidate.flow) || typeof candidate.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(candidate.verifier)
      || typeof candidate.nextPath !== 'string' || candidate.nextPath.length > 2048 || getSafeAuthRedirectPath(candidate.nextPath) !== candidate.nextPath
      || !Number.isSafeInteger(candidate.createdAt) || !Number.isSafeInteger(candidate.expiresAt) || (candidate.createdAt as number) > now
      || (candidate.expiresAt as number) !== (candidate.createdAt as number) + TTL || (candidate.expiresAt as number) <= now) return null;
    return candidate as Pending;
  } catch { return null; }
}
function session(value: unknown, now: number): Session | null {
  if (!record(value) || !token(value.access_token) || !token(value.refresh_token) || value.token_type !== 'bearer' || !record(value.user) || !isUuid(value.user.id)) return null;
  const seconds = Math.floor(now / 1000), expires = value.expires_at ?? (Number.isSafeInteger(value.expires_in) ? seconds + (value.expires_in as number) : 0);
  if (!Number.isSafeInteger(expires) || (expires as number) <= seconds + 120 || (expires as number) > seconds + 31536000) return null;
  return { access_token: value.access_token, refresh_token: value.refresh_token, token_type: 'bearer', expires_at: expires as number,
    expires_in: (expires as number) - seconds, user: { id: value.user.id.toLowerCase() } };
}
function confirmationExpiry(accessToken: string, subject: string, now: number): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)) || parts[1].length > 16384) return null;
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/'), raw = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
    const claims: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0)))), seconds = Math.floor(now / 1000);
    return record(claims) && typeof claims.sub === 'string' && claims.sub.toLowerCase() === subject
      && Number.isSafeInteger(claims.exp) && (claims.exp as number) > seconds + 120 && (claims.exp as number) <= seconds + 31536000
      && Array.isArray(claims.amr) && claims.amr.length > 0 && claims.amr.length <= 8
      && claims.amr.every(entry => record(entry) && entry.method === 'email/signup' && Number.isSafeInteger(entry.timestamp) && (entry.timestamp as number) > 0 && (entry.timestamp as number) <= seconds + 30) ? claims.exp as number : null;
  } catch { return null; }
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw unavailable();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 262144) throw unavailable(); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Standard confirmation emails with isolated, one-use local PKCE state. Only
 * a verifier and non-identifying flow/expiry metadata persist. Returned sessions
 * are verified in memory and discarded; normal sign-in remains a separate act. */
export function createEmailSignup(config: EmailSignupConfig) {
  const provider = new URL(config.providerOrigin), site = new URL(config.origin), timeout = config.timeoutMs ?? 8000, now = config.now ?? Date.now;
  if (provider.protocol !== 'https:' || provider.origin !== config.providerOrigin || site.origin !== config.origin
    || !['https:', 'http:'].includes(site.protocol) || !/^[A-Za-z0-9._-]{1,2048}$/.test(config.publishableKey)
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000 || typeof config.crypto?.getRandomValues !== 'function' || typeof config.crypto.subtle?.digest !== 'function'
    || typeof globalThis.TextEncoder !== 'function' || typeof config.withLock !== 'function') throw unavailable();
  let active = false, online = false, closed = false, generation = 0, op: Operation | null = null, link = config.link;
  let phase: EmailSignupModel['phase'] = link.kind === 'code' ? 'link' : link.kind === 'invalid' ? 'unavailable' : 'idle';
  let confirmedNext: string | null = null;
  let message = link.kind === 'code' ? 'Continue to verify this confirmation link.' : link.kind === 'invalid' ? 'This confirmation link is invalid. Request another email.' : 'Create an account or request another confirmation email. Open the latest email in this browser within one hour.';
  const listeners = new Set<(value: EmailSignupModel) => void>(), enabled = () => !closed && active && online;
  const model = (): EmailSignupModel => ({ phase, active, online, busy: !!op, canSignUp: enabled() && !op, canResend: enabled() && !op,
    canContinue: enabled() && !op && link.kind === 'code', message, nextPath: confirmedNext });
  const emit = () => { for (const fn of listeners) { try { fn(model()); } catch { /* Independent observer. */ } } };
  const current = (operation: Operation) => enabled() && op === operation && generation === operation.generation && !operation.abort.signal.aborted;
  const requireCurrent = (operation: Operation) => { if (!current(operation)) throw unavailable(); };
  function retire(text: string) {
    // A verified outcome and safe return path are presentation only. Keep the
    // deliberate sign-in link when a password manager or another window takes
    // focus; no code, verifier, token or ordinary session survives retirement.
    const confirmed = !closed && phase === 'confirmed' && confirmedNext !== null;
    generation++; if (!confirmed) confirmedNext = null;
    if (op) { op.abort.abort(); op.memory.clear(); op.pending = undefined; op.code = undefined; op.session = undefined; }
    op = null; phase = closed ? 'closed' : confirmed ? 'confirmed' : 'idle'; if (!confirmed) message = text; emit();
  }
  async function response(operation: Operation, url: string, init: RequestInit): Promise<unknown> {
    requireCurrent(operation); operation.dispatched = true;
    const reply = await config.fetch(url, { ...init, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: operation.abort.signal }); requireCurrent(operation);
    if (reply.redirected || reply.url !== url || reply.status !== 200) throw unavailable();
    const result = await boundedJson(reply); requireCurrent(operation); if (!record(result)) throw unavailable(); return result;
  }
  const denied = () => new Response('{"message":"Email confirmation unavailable","code":"confirmation_unavailable"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
  function client(operation: Operation) {
    const storage = {
      getItem(key: string) { requireCurrent(operation); return operation.memory.get(key) ?? null; },
      setItem(key: string, value: string) { requireCurrent(operation); if (key !== SDK_KEY) throw unavailable(); operation.memory.set(key, value); },
      removeItem(key: string) { operation.memory.delete(key); },
    };
    const fetcher: typeof fetch = async (input, init) => {
      try {
        requireCurrent(operation);
        if (typeof input !== 'string' || !init || operation.kind !== 'verify') return denied();
        const headers = new Headers(init.headers), family = input === provider.origin + '/auth/v1/token?grant_type=pkce' && init.method === 'POST' ? 'exchange'
          : input === provider.origin + '/auth/v1/user' && init.method === 'GET' ? 'verify' : null;
        if (!family || operation.used.has(family) || headers.get('apikey') !== config.publishableKey) return denied();
        if (family === 'exchange') {
          const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
          if (!record(body) || Object.keys(body).sort().join(',') !== 'auth_code,code_verifier' || body.auth_code !== operation.code || body.code_verifier !== operation.pending?.verifier
            || headers.get('Authorization') !== 'Bearer ' + config.publishableKey) return denied();
        } else if (init.body !== undefined || !operation.session || operation.session.expires_at * 1000 <= now() + 120000 || headers.get('Authorization') !== 'Bearer ' + operation.session.access_token) return denied();
        operation.used.add(family);
        const result = await response(operation, input, init); requireCurrent(operation);
        let clean: unknown;
        if (family === 'exchange') {
          const candidate = session(result, now()), expiry = candidate && confirmationExpiry(candidate.access_token, candidate.user.id, now());
          if (!candidate || !expiry || record(result) && result.expires_at !== undefined && result.expires_at !== expiry) return denied();
          candidate.expires_at = expiry; candidate.expires_in = expiry - Math.floor(now() / 1000); operation.session = candidate; clean = candidate;
        } else {
          const user = record(result) && record(result.user) ? result.user : result;
          if (!record(user) || !isUuid(user.id) || user.id.toLowerCase() !== operation.session?.user.id) return denied();
          clean = { user: { id: user.id.toLowerCase() } };
        }
        return new Response(JSON.stringify(clean), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch { return denied(); }
    };
    return new IsolatedConfirmationClient({ url: provider.origin + '/auth/v1', storageKey: SDK_KEY, headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + config.publishableKey },
      persistSession: true, storage, autoRefreshToken: false, detectSessionInUrl: false, skipAutoInitialize: true, flowType: 'pkce', debug: false, fetch: fetcher });
  }
  async function run(kind: Operation['kind'], work: (operation: Operation) => Promise<void>) {
    if (!enabled() || op) return;
    const operation: Operation = { kind, generation, abort: new AbortController(), used: new Set(), memory: new Map(), dispatched: false }; op = operation;
    phase = kind === 'verify' ? 'verifying' : 'sending'; message = kind === 'verify' ? 'Verifying the confirmation link…' : 'Requesting confirmation…'; emit();
    let timer: ReturnType<typeof setTimeout> | undefined, stop = () => {};
    try {
      requireCurrent(operation);
      const aborted = new Promise<never>((_, reject) => { stop = () => reject(unavailable()); operation.abort.signal.addEventListener('abort', stop, { once: true }); });
      timer = setTimeout(() => operation.abort.abort(), timeout);
      await Promise.race([work(operation), aborted]); requireCurrent(operation);
    } catch {
      if (enabled() && generation === operation.generation && op === operation) {
        phase = operation.dispatched ? 'unknown' : 'unavailable';
        message = kind === 'verify' ? 'This confirmation could not be verified. It may already have been accepted. Sign in, or request another confirmation email. Nothing retries automatically.'
          : 'The request could not be confirmed. An email may still arrive. You can sign in or explicitly request another confirmation email.';
      }
    } finally {
      clearTimeout(timer); operation.abort.signal.removeEventListener('abort', stop); operation.memory.clear(); operation.pending = undefined; operation.code = undefined; operation.session = undefined;
      if (op === operation) { op = null; emit(); }
    }
  }
  async function send(kind: 'signup' | 'resend', email: string, password?: string, confirmation?: string) {
    if (!enabled() || op) return;
    link = { kind: 'none' }; confirmedNext = null;
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { phase = 'unavailable'; message = 'Enter a valid email address.'; emit(); return; }
    if (kind === 'signup' && (typeof password !== 'string' || password.length < 8 || password.length > 1024 || /[\u0000-\u001f\u007f]/.test(password) || password !== confirmation)) { phase = 'unavailable'; message = 'Use at least 8 characters and enter the same password twice.'; emit(); return; }
    await run(kind, async operation => {
      const flow = [...config.crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join(''), verifier = base64url(config.crypto.getRandomValues(new Uint8Array(32))), createdAt = now();
      operation.pending = { version: 1, flow, createdAt, expiresAt: createdAt + TTL, verifier, nextPath: getSafeAuthRedirectPath(typeof config.nextPath === 'string' && config.nextPath.length <= 2048 ? config.nextPath : null) };
      await config.withLock(operation.abort.signal, async () => { requireCurrent(operation); config.storage.setItem(EMAIL_CONFIRMATION_STORAGE_KEY, JSON.stringify(operation.pending)); }); requireCurrent(operation);
      const challenge = base64url(new Uint8Array(await config.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))); requireCurrent(operation);
      const body = kind === 'signup' ? { email: email.trim(), password, data: {}, code_challenge: challenge, code_challenge_method: 's256', gotrue_meta_security: {} }
        : { email: email.trim(), type: 'signup', code_challenge: challenge, code_challenge_method: 's256', gotrue_meta_security: {} };
      const url = new URL(provider.origin + '/auth/v1/' + kind); url.searchParams.set('redirect_to', config.origin + '/auth/confirm?flow=' + flow);
      let delivery: Promise<unknown> | undefined;
      await config.withLock(operation.abort.signal, async () => {
        requireCurrent(operation); const stored = pending(config.storage.getItem(EMAIL_CONFIRMATION_STORAGE_KEY), now());
        if (!stored || stored.flow !== flow || stored.verifier !== verifier) throw unavailable();
        // Dispatch under the supersession lock. Already-sent provider requests
        // can still complete out of order; this is only local link selection.
        delivery = response(operation, url.href, { method: 'POST', headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + config.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      });
      await delivery!; requireCurrent(operation);
      // Signup may return an auto-confirmed session. Never store or promote it.
      phase = 'sent'; message = 'Request accepted. If confirmation is needed, open the latest email in this browser within one hour. If your email is already confirmed, sign in.';
    });
  }
  return {
    model, subscribe(fn: (value: EmailSignupModel) => void) { listeners.add(fn); fn(model()); return () => { listeners.delete(fn); }; },
    signUp(email: string, password: string, confirmation: string) { return send('signup', email, password, confirmation); },
    resend(email: string) { return send('resend', email); },
    async continueConfirmation() {
      if (!model().canContinue || link.kind !== 'code') return;
      const captured = link; link = { kind: 'none' };
      await run('verify', async operation => {
        const claimed = await config.withLock(operation.abort.signal, async () => {
          requireCurrent(operation); const value = pending(config.storage.getItem(EMAIL_CONFIRMATION_STORAGE_KEY), now());
          if (!value || value.flow !== captured.flow) throw unavailable(); config.storage.removeItem(EMAIL_CONFIRMATION_STORAGE_KEY); return value;
        }); requireCurrent(operation);
        operation.pending = claimed; operation.code = captured.code; operation.memory.set(SDK_KEY + '-code-verifier', JSON.stringify(claimed.verifier));
        const sdk = client(operation), result = await sdk.exchangeCodeForSession(captured.code); requireCurrent(operation);
        const data: unknown = result.data;
        if (result.error || !record(data) || data.redirectType !== null || !record(data.user) || !isUuid(data.user.id)) throw unavailable();
        const candidate = session(data.session, now());
        if (!candidate || data.user.id.toLowerCase() !== candidate.user.id || candidate.access_token !== operation.session?.access_token) throw unavailable();
        const proof = await sdk.getUser(candidate.access_token); requireCurrent(operation);
        if (proof.error || proof.data.user?.id?.toLowerCase() !== candidate.user.id || candidate.expires_at * 1000 <= now() + 120000) throw unavailable();
        confirmedNext = claimed.nextPath; phase = 'confirmed'; message = 'Email confirmation verified. Sign in with your email and password.';
      });
    },
    activity(value: boolean) { if (closed || active === value) return; active = value; if (!value) retire('Confirmation paused while inactive. An email already requested may still arrive.'); else emit(); },
    connectivity(value: boolean) { if (closed || online === value) return; online = value; if (!value) retire('Confirmation paused while offline. Reconnect to continue; an email already requested may still arrive.'); else emit(); },
    close() { if (closed) return; closed = true; link = { kind: 'none' }; retire('Confirmation closed. Requests already sent may still finish.'); listeners.clear(); },
  };
}
export type EmailSignup = ReturnType<typeof createEmailSignup>;

export function createBrowserEmailSignup(timeoutMs?: number, capturedLink?: ConfirmationLink, nextPath?: string) {
  const link = capturedLink ?? captureConfirmationLink(window.location.href, window.location.origin, path => window.history.replaceState(null, '', path));
  if (!window.isSecureContext || !navigator.locks) throw unavailable();
  return createEmailSignup({ origin: window.location.origin, providerOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', publishableKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    link, storage: window.localStorage, crypto: window.crypto, fetch: window.fetch.bind(window), timeoutMs, nextPath,
    async withLock<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> { return await navigator.locks.request('soe-email-confirmation-v1', { mode: 'exclusive', signal }, work); } });
}
