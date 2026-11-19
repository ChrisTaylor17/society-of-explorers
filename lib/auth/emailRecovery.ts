import { AuthClient } from '@supabase/auth-js';
import { isUuid } from '../ids/uuid';

export const EMAIL_RECOVERY_STORAGE_KEY = 'soe.email-recovery.v1';
const SDK_KEY = 'soe-isolated-email-recovery-v1', TTL = 60 * 60 * 1000;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const token = (v: unknown): v is string => typeof v === 'string' && v.length <= 16384 && /^[A-Za-z0-9._~+/-]{1,16384}=*$/.test(v);
const unavailable = () => new Error('Recovery unavailable');
type Pending = { version: 1; flow: string; createdAt: number; expiresAt: number; verifier: string };
type Session = { access_token: string; refresh_token: string; token_type: 'bearer'; expires_at: number; expires_in: number; user: { id: string } };
export type RecoveryLink = { kind: 'none' | 'invalid' } | { kind: 'code'; flow: string; code: string };
export type EmailRecoveryModel = {
  phase: 'idle' | 'sending' | 'sent' | 'link' | 'verifying' | 'ready' | 'updating' | 'accepted' | 'unknown' | 'unavailable' | 'closed';
  busy: boolean; active: boolean; online: boolean; canRequest: boolean; canContinue: boolean; canUpdate: boolean; message: string; warning: string | null;
};
export type EmailRecoveryConfig = {
  origin: string; providerOrigin: string; publishableKey: string; link: RecoveryLink;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  withLock<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T>;
  fetch: typeof fetch; crypto: Crypto; timeoutMs?: number; now?: () => number;
};
type Operation = { kind: 'send' | 'verify' | 'update'; generation: number; abort: AbortController; used: Set<string>; memory: Map<string, string>; email?: string; password?: string; pending?: Pending; code?: string; session?: Session; dispatched: boolean };

/** Capture once before creating any client. Nothing from the callback is rendered
 * or retained in history, including malformed/error/implicit-token callbacks. */
export function captureRecoveryLink(href: string, origin: string, replace: (path: string) => void): RecoveryLink {
  let result: RecoveryLink = { kind: 'invalid' };
  try {
    const url = new URL(href);
    if (url.origin === origin && url.pathname === '/auth/recovery' && !url.hash) {
      const keys = [...url.searchParams.keys()];
      if (!keys.length) result = { kind: 'none' };
      else if (keys.length === 2 && keys.filter(k => k === 'flow').length === 1 && keys.filter(k => k === 'code').length === 1) {
        const flow = url.searchParams.get('flow')!, code = url.searchParams.get('code')!;
        if (/^[0-9a-f]{64}$/.test(flow) && /^[A-Za-z0-9._~-]{1,2048}$/.test(code)) result = { kind: 'code', flow, code };
      }
    }
  } catch { /* Invalid callbacks have no authority. */ }
  try { replace('/auth/recovery'); } catch { return { kind: 'invalid' }; }
  return result;
}

class IsolatedRecoveryClient extends AuthClient {
  constructor(options: ConstructorParameters<typeof AuthClient>[0]) {
    super(options);
    // AuthClient 2.99.3 creates a channel even with skipAutoInitialize. Recovery
    // sessions must never be broadcast to another tab or a normal auth client.
    this.broadcastChannel?.close(); this.broadcastChannel = null;
  }
}
function pending(value: string | null, now: number): Pending | null {
  if (!value || value.length > 1024) return null;
  try {
    const v: unknown = JSON.parse(value);
    if (!record(v) || Object.keys(v).sort().join(',') !== 'createdAt,expiresAt,flow,verifier,version' || v.version !== 1
      || typeof v.flow !== 'string' || !/^[0-9a-f]{64}$/.test(v.flow) || typeof v.verifier !== 'string' || !/^[0-9a-f]{112}$/.test(v.verifier)
      || !Number.isSafeInteger(v.createdAt) || !Number.isSafeInteger(v.expiresAt) || (v.createdAt as number) > now
      || (v.expiresAt as number) !== (v.createdAt as number) + TTL || (v.expiresAt as number) <= now) return null;
    return v as Pending;
  } catch { return null; }
}
function session(value: unknown, now: number): Session | null {
  if (!record(value) || !token(value.access_token) || !token(value.refresh_token) || value.token_type !== 'bearer' || !record(value.user) || !isUuid(value.user.id)) return null;
  const seconds = Math.floor(now / 1000), expires = value.expires_at ?? (Number.isSafeInteger(value.expires_in) ? seconds + (value.expires_in as number) : 0);
  if (!Number.isSafeInteger(expires) || (expires as number) <= seconds + 120 || (expires as number) > seconds + 31536000) return null;
  return { access_token: value.access_token, refresh_token: value.refresh_token, token_type: 'bearer', expires_at: expires as number,
    expires_in: (expires as number) - seconds, user: { id: value.user.id.toLowerCase() } };
}
function recoveryExpiry(accessToken: string, subject: string, now: number): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)) || parts[1].length > 16384) return null;
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/'), raw = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
    const claims: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
    const seconds = Math.floor(now / 1000);
    return record(claims) && typeof claims.sub === 'string' && claims.sub.toLowerCase() === subject
      && Number.isSafeInteger(claims.exp) && (claims.exp as number) > seconds + 120 && (claims.exp as number) <= seconds + 31536000 && Array.isArray(claims.amr) && claims.amr.length > 0 && claims.amr.length <= 8
      && claims.amr.every(entry => record(entry) && entry.method === 'recovery' && Number.isSafeInteger(entry.timestamp) && (entry.timestamp as number) > 0 && (entry.timestamp as number) <= seconds + 30) ? claims.exp as number : null;
  } catch { return null; }
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw unavailable();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 262144) throw unavailable(); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** One isolated, explicit recovery flow. Ordinary auth storage/cookies, member
 * provisioning and provider selection are deliberately absent. Local pending
 * verifiers survive page closure; claimed verifiers and sessions do not. */
export function createEmailRecovery(config: EmailRecoveryConfig) {
  const provider = new URL(config.providerOrigin), site = new URL(config.origin), timeout = config.timeoutMs ?? 8000, now = config.now ?? Date.now;
  if (provider.protocol !== 'https:' || provider.origin !== config.providerOrigin || site.origin !== config.origin
    || !['https:', 'http:'].includes(site.protocol) || !/^[A-Za-z0-9._-]{1,2048}$/.test(config.publishableKey)
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000 || !config.crypto?.getRandomValues || !config.crypto.subtle?.digest
    || typeof globalThis.crypto?.getRandomValues !== 'function' || typeof globalThis.crypto?.subtle?.digest !== 'function'
    || typeof globalThis.TextEncoder !== 'function' || typeof config.withLock !== 'function') throw unavailable();
  let active = false, online = false, closed = false, generation = 0, op: Operation | null = null;
  let passwordUpdate: 'none' | 'unknown' | 'accepted' = 'none', priorUnknown = false;
  let link = config.link, verified: Session | null = null, expiry: ReturnType<typeof setTimeout> | undefined;
  let phase: EmailRecoveryModel['phase'] = link.kind === 'code' ? 'link' : link.kind === 'invalid' ? 'unavailable' : 'idle';
  let message = link.kind === 'code' ? 'Continue to verify this recovery link.' : link.kind === 'invalid' ? 'This recovery link is invalid. Request a new email.' : 'Request a password recovery email. Open it in this browser within one hour.';
  const listeners = new Set<(value: EmailRecoveryModel) => void>();
  const enabled = () => !closed && active && online;
  const model = (): EmailRecoveryModel => ({ phase, active, online, busy: !!op, canRequest: enabled() && !op && phase !== 'accepted',
    canContinue: enabled() && !op && link.kind === 'code', canUpdate: enabled() && !op && phase === 'ready' && !!verified && verified.expires_at * 1000 > now() + 120000, message, warning: priorUnknown ? 'An earlier password update may still finish, even after another accepted update. Sign in with your chosen password to check.' : null });
  const emit = () => { for (const fn of listeners) { try { fn(model()); } catch { /* Independent observer. */ } } };
  const current = (operation: Operation) => enabled() && op === operation && generation === operation.generation && !operation.abort.signal.aborted;
  const requireCurrent = (operation: Operation) => { if (!current(operation)) throw unavailable(); };
  function retire(text: string) {
    generation++; clearTimeout(expiry); verified = null;
    if (op) { if (op.kind === 'update' && op.used.has('update')) priorUnknown = true; op.abort.abort(); op.memory.clear(); op.password = undefined; op.email = undefined; op.pending = undefined; op.code = undefined; op.session = undefined; }
    op = null; phase = closed ? 'closed' : passwordUpdate === 'accepted' ? 'accepted' : passwordUpdate === 'unknown' ? 'unknown' : 'idle';
    message = passwordUpdate === 'accepted' ? 'Password update accepted. Sign in with your new password.' : passwordUpdate === 'unknown' ? 'The password update could not be confirmed and may still finish. Sign in with your new password to check. Nothing retries automatically.' : text; emit();
  }
  const denied = () => new Response('{"message":"Recovery unavailable","code":"recovery_unavailable"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
  function client(operation: Operation) {
    const storage = {
      getItem(key: string) { requireCurrent(operation); return operation.memory.get(key) ?? null; },
      async setItem(key: string, value: string) {
        requireCurrent(operation);
        if (key === SDK_KEY + '-code-verifier' && operation.kind === 'send') {
          const raw: unknown = JSON.parse(value);
          if (typeof raw !== 'string' || !/^[0-9a-f]{112}\/PASSWORD_RECOVERY$/.test(raw) || !operation.pending) throw unavailable();
          operation.pending.verifier = raw.split('/')[0];
          await config.withLock(operation.abort.signal, async () => { requireCurrent(operation); config.storage.setItem(EMAIL_RECOVERY_STORAGE_KEY, JSON.stringify(operation.pending)); });
          requireCurrent(operation);
        }
        operation.memory.set(key, value);
      },
      removeItem(key: string) { operation.memory.delete(key); },
    };
    const fetcher: typeof fetch = async (input, init) => {
      try {
        requireCurrent(operation);
        if (typeof input !== 'string' || !init) return denied();
        const url = new URL(input), headers = new Headers(init.headers);
        const family = url.origin === provider.origin && url.pathname === '/auth/v1/recover' && init.method === 'POST' ? 'recover'
          : input === provider.origin + '/auth/v1/token?grant_type=pkce' && init.method === 'POST' ? 'exchange'
            : input === provider.origin + '/auth/v1/user' && init.method === 'GET' ? 'verify'
              : input === provider.origin + '/auth/v1/user' && init.method === 'PUT' ? 'update' : null;
        if (!family || operation.used.has(family) || headers.get('apikey') !== config.publishableKey) return denied();
        const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
        if (family === 'recover') {
          if (operation.kind !== 'send' || !operation.pending || !record(body) || Object.keys(body).sort().join(',') !== 'code_challenge,code_challenge_method,email,gotrue_meta_security'
            || body.email !== operation.email || body.code_challenge_method !== 's256' || !record(body.gotrue_meta_security) || Object.keys(body.gotrue_meta_security).length
            || [...url.searchParams.keys()].join(',') !== 'redirect_to' || url.searchParams.get('redirect_to') !== config.origin + '/auth/recovery?flow=' + operation.pending.flow) return denied();
          const digest = await config.crypto.subtle.digest('SHA-256', new TextEncoder().encode(operation.pending.verifier)); requireCurrent(operation);
          const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          if (body.code_challenge !== challenge) return denied();
        } else if (family === 'exchange') {
          if (operation.kind !== 'verify' || !record(body) || Object.keys(body).sort().join(',') !== 'auth_code,code_verifier'
            || body.auth_code !== operation.code || body.code_verifier !== operation.pending?.verifier) return denied();
        } else {
          if (!operation.session || headers.get('Authorization') !== 'Bearer ' + operation.session.access_token) return denied();
          if (family === 'verify' && (operation.kind !== 'verify' || init.body !== undefined)) return denied();
          if (family === 'update' && (operation.kind !== 'update' || !record(body) || Object.keys(body).sort().join(',') !== 'code_challenge,code_challenge_method,password'
            || body.password !== operation.password || body.code_challenge !== null || body.code_challenge_method !== null)) return denied();
        }
        requireCurrent(operation); operation.used.add(family);
        const send = () => { requireCurrent(operation); operation.dispatched = true; if (family === 'update') passwordUpdate = 'unknown';
          return config.fetch(input, { ...init, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: operation.abort.signal }); };
        let delivery: Promise<Response> | undefined;
        if (family === 'recover') {
          await config.withLock(operation.abort.signal, async () => {
            requireCurrent(operation); const stored = pending(config.storage.getItem(EMAIL_RECOVERY_STORAGE_KEY), now());
            if (!stored || stored.flow !== operation.pending?.flow || stored.verifier !== operation.pending.verifier) throw unavailable();
            // Allocate once under the claim/supersession lock. Provider completion
            // ordering after dispatch remains outside this browser's control.
            delivery = send();
          });
        } else delivery = send();
        const response = await delivery!;
        requireCurrent(operation);
        if (response.redirected || response.url !== input || response.status !== 200) return denied();
        const result = await boundedJson(response); requireCurrent(operation);
        let clean: unknown = {};
        if (family === 'exchange') {
          const candidate = session(result, now()), expiry = candidate && recoveryExpiry(candidate.access_token, candidate.user.id, now());
          if (!candidate || !expiry || record(result) && result.expires_at !== undefined && result.expires_at !== expiry) return denied();
          candidate.expires_at = expiry; candidate.expires_in = expiry - Math.floor(now() / 1000); operation.session = candidate; clean = candidate;
        } else if (family === 'verify' || family === 'update') {
          const user = record(result) && record(result.user) ? result.user : result;
          if (!record(user) || !isUuid(user.id) || user.id.toLowerCase() !== operation.session?.user.id) return denied();
          clean = { user: { id: user.id.toLowerCase() } };
        }
        return new Response(JSON.stringify(clean), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch { return denied(); }
    };
    return new IsolatedRecoveryClient({ url: provider.origin + '/auth/v1', storageKey: SDK_KEY, headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + config.publishableKey },
      persistSession: true, storage, autoRefreshToken: false, detectSessionInUrl: false, skipAutoInitialize: true, flowType: 'pkce', debug: false, fetch: fetcher });
  }
  async function run(kind: Operation['kind'], work: (sdk: IsolatedRecoveryClient, operation: Operation) => Promise<void>) {
    if (!enabled() || op) return;
    const operation: Operation = { kind, generation, abort: new AbortController(), used: new Set(), memory: new Map(), dispatched: false }; op = operation;
    clearTimeout(expiry); phase = kind === 'send' ? 'sending' : kind === 'verify' ? 'verifying' : 'updating'; message = kind === 'send' ? 'Requesting a recovery email…' : kind === 'verify' ? 'Verifying the recovery link…' : 'Sending the password update…'; emit();
    let timer: ReturnType<typeof setTimeout> | undefined, stop = () => {};
    try {
      requireCurrent(operation);
      const aborted = new Promise<never>((_, reject) => { stop = () => reject(unavailable()); operation.abort.signal.addEventListener('abort', stop, { once: true }); });
      timer = setTimeout(() => operation.abort.abort(), timeout);
      await Promise.race([work(client(operation), operation), aborted]); requireCurrent(operation);
    } catch {
      if (enabled() && generation === operation.generation && op === operation) {
        verified = null;
        if (kind === 'update' && operation.used.has('update')) priorUnknown = true;
        phase = operation.dispatched ? 'unknown' : 'unavailable';
        message = kind === 'send' ? 'The email request could not be confirmed. If an email arrives, open it here. You can explicitly request another.'
          : kind === 'verify' ? 'This recovery link could not be verified. Request a new email; nothing retries automatically.'
            : operation.dispatched ? 'The password update could not be confirmed. Sign in with your new password to check, or request another recovery email. Nothing retries automatically.'
              : 'The password update was not sent. Request a new recovery email.';
      }
    } finally {
      clearTimeout(timer); operation.abort.signal.removeEventListener('abort', stop);
      operation.memory.clear(); operation.password = undefined; operation.email = undefined; operation.pending = undefined; operation.code = undefined; operation.session = undefined;
      if (op === operation) { op = null; emit(); }
    }
  }
  return {
    model, subscribe(fn: (value: EmailRecoveryModel) => void) { listeners.add(fn); fn(model()); return () => { listeners.delete(fn); }; },
    async requestEmail(email: string) {
      if (!model().canRequest) return;
      verified = null; link = { kind: 'none' };
      if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { phase = 'unavailable'; message = 'Enter a valid email address.'; emit(); return; }
      await run('send', async (sdk, operation) => {
        operation.email = email.trim(); const bytes = config.crypto.getRandomValues(new Uint8Array(32)), flow = [...bytes].map(v => v.toString(16).padStart(2, '0')).join(''), createdAt = now();
        operation.pending = { version: 1, flow, createdAt, expiresAt: createdAt + TTL, verifier: '' };
        const result = await sdk.resetPasswordForEmail(operation.email, { redirectTo: config.origin + '/auth/recovery?flow=' + flow }); requireCurrent(operation);
        if (result.error || !operation.used.has('recover')) throw unavailable();
        phase = 'sent'; message = 'If this address has an account, a recovery email has been requested. Open the latest email in this browser within one hour.';
      });
    },
    async verifyLink() {
      if (!model().canContinue || link.kind !== 'code') return;
      const captured = link; link = { kind: 'none' };
      await run('verify', async (sdk, operation) => {
        const claimed = await config.withLock(operation.abort.signal, async () => {
          requireCurrent(operation); const value = pending(config.storage.getItem(EMAIL_RECOVERY_STORAGE_KEY), now());
          if (!value || value.flow !== captured.flow) throw unavailable();
          config.storage.removeItem(EMAIL_RECOVERY_STORAGE_KEY); return value;
        }); requireCurrent(operation);
        operation.pending = claimed; operation.code = captured.code; operation.memory.set(SDK_KEY + '-code-verifier', JSON.stringify(claimed.verifier + '/PASSWORD_RECOVERY'));
        const result = await sdk.exchangeCodeForSession(captured.code); requireCurrent(operation);
        const data: unknown = result.data;
        if (result.error || !record(data) || data.redirectType !== 'PASSWORD_RECOVERY' || !record(data.user) || !isUuid(data.user.id)) throw unavailable();
        const candidate = session(data.session, now());
        if (!candidate || data.user.id.toLowerCase() !== candidate.user.id || candidate.access_token !== operation.session?.access_token) throw unavailable();
        const proof = await sdk.getUser(candidate.access_token); requireCurrent(operation);
        if (proof.error || proof.data.user?.id?.toLowerCase() !== candidate.user.id) throw unavailable();
        verified = candidate; phase = 'ready'; message = 'Recovery link verified. Choose a new password.';
        expiry = setTimeout(() => { if (verified === candidate) retire('Recovery access expired. Request a new email.'); }, Math.min(2147483647, candidate.expires_at * 1000 - now() - 120000));
      });
    },
    async updatePassword(password: string, confirmation: string) {
      if (!model().canUpdate || !verified) return;
      if (typeof password !== 'string' || password.length < 8 || password.length > 1024 || /[\u0000-\u001f\u007f]/.test(password) || password !== confirmation) { message = 'Use at least 8 characters and enter the same new password twice.'; emit(); return; }
      const candidate = verified; verified = null;
      await run('update', async (sdk, operation) => {
        if (candidate.expires_at * 1000 <= now() + 120000) throw unavailable();
        operation.session = candidate; operation.password = password; operation.memory.set(SDK_KEY, JSON.stringify(candidate));
        const result = await sdk.updateUser({ password }); requireCurrent(operation);
        if (result.error || result.data.user?.id?.toLowerCase() !== candidate.user.id || !operation.used.has('update')) throw unavailable();
        passwordUpdate = 'accepted'; phase = 'accepted'; message = 'Password update accepted. Sign in with your new password.';
      });
    },
    activity(value: boolean) { if (closed || active === value) return; active = value; if (!value) retire('Recovery access cleared while inactive. Open the latest email or request a new one.'); else emit(); },
    connectivity(value: boolean) { if (closed || online === value) return; online = value; if (!value) retire('Recovery access cleared while offline. Reconnect, then open the latest email or request a new one.'); else emit(); },
    close() { if (closed) return; closed = true; link = { kind: 'none' }; retire('Recovery page closed. An email request already sent may still arrive.'); listeners.clear(); },
  };
}
export type EmailRecovery = ReturnType<typeof createEmailRecovery>;

export function createBrowserEmailRecovery(timeoutMs?: number, capturedLink?: RecoveryLink) {
  const link = capturedLink ?? captureRecoveryLink(window.location.href, window.location.origin, path => window.history.replaceState(null, '', path));
  if (!window.isSecureContext || !navigator.locks) throw unavailable();
  return createEmailRecovery({ origin: window.location.origin, providerOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', publishableKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    link, storage: window.localStorage, crypto: window.crypto, fetch: window.fetch.bind(window), timeoutMs,
    async withLock<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> { return await navigator.locks.request('soe-email-recovery-v1', { mode: 'exclusive', signal }, work); } });
}
