import { AuthClient } from '@supabase/auth-js';
import { isUuid } from '../../../../lib/ids/uuid';
import type { NativeEmailAuthPorts, NativeEmailPending, NativeEmailClaim, NativeEmailPurpose } from './email-auth-types';
export type NativeEmailAuthModel = {
  phase: 'idle' | 'sending' | 'sent' | 'loading' | 'pending' | 'verifying' | 'confirmed' | 'ready' | 'updating' | 'accepted' | 'unknown' | 'unavailable' | 'closed';
  busy: boolean; active: boolean; online: boolean;
  pending: { purpose: NativeEmailPurpose; hasCode: boolean; expiresAt: number } | null;
  canSignUp: boolean; canResend: boolean; canRecover: boolean; canLoad: boolean; canContinue: boolean; canUpdate: boolean; canDiscard: boolean;
  message: string; warning: string | null;
};
type Session = { access_token: string; refresh_token: string; token_type: 'bearer'; expires_at: number; expires_in: number; user: { id: string } };
type Operation = { kind: 'signup' | 'resend' | 'recover' | 'load' | 'continue' | 'update' | 'discard'; generation: number; abort: AbortController; memory: Map<string, string>; used: Set<string>; dispatched: boolean; password?: string; claimFlowId?: string; claim?: NativeEmailClaim; session?: Session };
const SDK_KEY = 'soe-native-email-quarantine-v1';
const fail = () => Error('Email account action unavailable');
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const token = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 16384 && /^[A-Za-z0-9._~+/-]+=*$/.test(v);
const validPassword = (value: unknown): value is string => typeof value === 'string' && value.length >= 8 && value.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(value);
const validEmail = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const seconds = () => Math.floor(Date.now() / 1000);
// Bounded base64url/UTF-8 decoding without Buffer, atob or a crypto shim. This
// only inspects purpose/expiry; fresh exact-token /user establishes authority.
function claims(access: string): Record<string, unknown> | null {
  try {
    const parts = access.split('.'); if (parts.length !== 3 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; let bits = 0, accumulator = 0, encoded = '';
    for (const character of parts[1]) { const n = alphabet.indexOf(character); if (n < 0) return null; accumulator = ((accumulator << 6) | n) & 0xffffff; bits += 6;
      if (bits >= 8) { bits -= 8; encoded += '%' + ((accumulator >> bits) & 255).toString(16).padStart(2, '0'); } }
    const value: unknown = JSON.parse(decodeURIComponent(encoded)); return plain(value) ? value : null;
  } catch { return null; }
}
function session(value: unknown, purpose: NativeEmailPurpose): Session | null {
  if (!plain(value) || !token(value.access_token) || !token(value.refresh_token) || value.token_type !== 'bearer' || !plain(value.user) || !isUuid(value.user.id)) return null;
  const parsed = claims(value.access_token), now = seconds(), id = value.user.id.toLowerCase();
  if (!parsed || typeof parsed.sub !== 'string' || parsed.sub.toLowerCase() !== id || !Number.isSafeInteger(parsed.exp) || (parsed.exp as number) <= now + 120 || (parsed.exp as number) > now + 31536000
    || value.expires_at !== undefined && value.expires_at !== parsed.exp || !Array.isArray(parsed.amr) || parsed.amr.length < 1 || parsed.amr.length > 8
    || !parsed.amr.every(entry => plain(entry) && (purpose === 'recovery' ? entry.method === 'recovery' : entry.method === 'email/signup')
      && Number.isSafeInteger(entry.timestamp) && (entry.timestamp as number) > 0 && (entry.timestamp as number) <= now + 30)) return null;
  return { access_token: value.access_token, refresh_token: value.refresh_token, token_type: 'bearer', expires_at: parsed.exp as number, expires_in: (parsed.exp as number) - now, user: { id } };
}
class EmailClient extends AuthClient {
  constructor(options: ConstructorParameters<typeof AuthClient>[0]) { super(options); this.broadcastChannel?.close(); this.broadcastChannel = null; }
}

/** Optional native-owned email onboarding. The protected native bridge prepares
 * S256 and captures links; JS never generates PKCE or stores session credentials.
 * Confirmation/recovery never promotes an ordinary member or provider session. */
export function createNativeEmailAuth(config: { ports: NativeEmailAuthPorts; publishableKey: string; timeoutMs?: number; initialOnline?: boolean }) {
  const { ports } = config, timeout = config.timeoutMs ?? 15000, url = new URL(ports.providerOrigin);
  if (url.protocol !== 'https:' || url.origin !== ports.providerOrigin || !/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(config.publishableKey)
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000 || config.initialOnline !== undefined && typeof config.initialOnline !== 'boolean') throw fail();
  let active = false, online = config.initialOnline ?? false, closed = false, generation = 0, operation: Operation | null = null;
  let selected: NativeEmailPending | null = null, verified: { session: Session; claim: NativeEmailClaim } | null = null, expiry: ReturnType<typeof setTimeout> | undefined;
  let phase: NativeEmailAuthModel['phase'] = 'idle', message = 'Create an account, resend a confirmation, or recover a password. Nothing is sent automatically.', priorUnknown = false;
  let offRetired = () => {};
  const listeners = new Set<(value: NativeEmailAuthModel) => void>(), enabled = () => active && online && !closed;
  const model = (): NativeEmailAuthModel => {
    const available = enabled() && !operation;
    return { phase, active, online, busy: !!operation, pending: enabled() && selected ? { purpose: selected.purpose, hasCode: selected.phase === 'callback_ready', expiresAt: selected.expiresAt } : null,
      canSignUp: available, canResend: available, canRecover: available, canLoad: available, canContinue: available && selected?.phase === 'callback_ready' && selected.expiresAt > Date.now(),
      canUpdate: available && phase === 'ready' && !!verified && Math.min(verified.session.expires_at * 1000, verified.claim.expiresAt) > Date.now() + 120000,
      canDiscard: available && !!selected, message, warning: priorUnknown ? 'An earlier password update may still finish, even after another accepted update. Sign in with your chosen password to check.' : null };
  };
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Independent observer. */ } } };
  const current = (op: Operation) => enabled() && operation === op && generation === op.generation && !op.abort.signal.aborted;
  const requireCurrent = (op: Operation) => { if (!current(op)) throw fail(); };
  const release = (id?: string) => { if (id) void ports.discard(id, new AbortController().signal).catch(() => {}); };
  function retire(text: string) {
    generation++; clearTimeout(expiry); selected = null;
    const claimed = verified?.claim.flowId ?? operation?.claimFlowId ?? operation?.claim?.flowId;
    if (operation) { if (operation.used.has('update')) priorUnknown = true; operation.abort.abort(); operation.memory.clear(); operation.password = undefined; operation.claimFlowId = undefined; operation.session = undefined; operation.claim = undefined; }
    operation = null; verified = null; release(claimed);
    phase = closed ? 'closed' : priorUnknown ? 'unknown' : 'idle'; message = text; emit();
  }
  const denied = () => new Response('{"message":"Email account action unavailable","code":"email_action_unavailable"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
  async function readReply(response: Response, input: string, op: Operation) {
    requireCurrent(op); if (response.redirected || response.url !== input || response.status !== 200) throw fail();
    const body = await response.text(); requireCurrent(op); if (body.length > 262144) throw fail(); const value: unknown = JSON.parse(body); if (!plain(value)) throw fail(); return value;
  }
  function sdk(op: Operation) {
    const fetcher: typeof fetch = async (input, init) => {
      try {
        requireCurrent(op); if (typeof input !== 'string' || !init || !op.claim || op.claim.expiresAt <= Date.now()) return denied();
        const headers = new Headers(init.headers), family = input === ports.providerOrigin + '/auth/v1/token?grant_type=pkce' && init.method === 'POST' ? 'exchange'
          : input === ports.providerOrigin + '/auth/v1/user' && init.method === 'GET' ? 'user' : input === ports.providerOrigin + '/auth/v1/user' && init.method === 'PUT' ? 'update' : null;
        if (!family || op.used.has(family) || headers.get('apikey') !== config.publishableKey) return denied();
        if (family === 'exchange') { if (op.kind !== 'continue' || init.body !== JSON.stringify({ auth_code: op.claim.code, code_verifier: op.claim.verifier })) return denied(); }
        else {
          if (!op.session || headers.get('Authorization') !== 'Bearer ' + op.session.access_token) return denied();
          if (family === 'user' && (op.kind !== 'continue' || init.body !== undefined)) return denied();
          if (family === 'update' && (op.kind !== 'update' || op.claim.purpose !== 'recovery' || init.body !== JSON.stringify({ password: op.password, code_challenge: null, code_challenge_method: null }))) return denied();
        }
        op.used.add(family); op.dispatched = true;
        const result = await readReply(await ports.fetch(op.claim.flowId, input, { ...init, signal: op.abort.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' }), input, op); requireCurrent(op);
        let clean: unknown;
        if (family === 'exchange') { const candidate = session(result, op.claim.purpose); if (!candidate) return denied(); op.session = candidate; clean = candidate; }
        else { const user = plain(result) && plain(result.user) ? result.user : result;
          if (!plain(user) || !isUuid(user.id) || user.id.toLowerCase() !== op.session?.user.id) return denied(); clean = { user: { id: user.id.toLowerCase() } }; }
        return new Response(JSON.stringify(clean), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch { return denied(); }
    };
    return new EmailClient({ url: ports.providerOrigin + '/auth/v1', storageKey: SDK_KEY, headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + config.publishableKey },
      flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, skipAutoInitialize: true, debug: false, fetch: fetcher,
      storage: { getItem(key) { requireCurrent(op); return op.memory.get(key) ?? null; }, setItem(key, value) { requireCurrent(op); op.memory.set(key, value); }, removeItem(key) { op.memory.delete(key); } } });
  }
  async function run(kind: Operation['kind'], work: (op: Operation) => Promise<void>) {
    if (!enabled() || operation) return;
    const op: Operation = { kind, generation, abort: new AbortController(), memory: new Map(), used: new Set(), dispatched: false }; operation = op;
    clearTimeout(expiry); phase = kind === 'load' ? 'loading' : kind === 'continue' ? 'verifying' : kind === 'update' ? 'updating' : kind === 'discard' ? 'loading' : 'sending';
    message = kind === 'load' ? 'Checking the saved email link…' : kind === 'continue' ? 'Verifying the email link…' : kind === 'update' ? 'Sending the password update…' : kind === 'discard' ? 'Discarding the saved email link…' : 'Requesting an account email…'; emit();
    let timer: ReturnType<typeof setTimeout> | undefined, abort = () => {};
    try {
      requireCurrent(op); const aborted = new Promise<never>((_, reject) => { abort = () => reject(fail()); op.abort.signal.addEventListener('abort', abort, { once: true }); });
      timer = setTimeout(() => op.abort.abort(), timeout); await Promise.race([work(op), aborted]); requireCurrent(op);
    } catch {
      if (enabled() && operation === op && generation === op.generation) {
        if (op.used.has('update')) priorUnknown = true;
        verified = null; selected = null; phase = op.dispatched ? 'unknown' : 'unavailable';
        message = kind === 'update' ? op.used.has('update') ? 'The password update could not be confirmed. Sign in with your new password to check. Nothing retries automatically.' : 'The password update was not sent. Open a new recovery link.'
          : kind === 'continue' ? 'This email link could not be verified. Request a new email.' : kind === 'load' ? 'The saved email link could not be checked. Try loading it again explicitly.'
            : kind === 'discard' ? 'Discarding the saved link could not be confirmed. Load the pending link to check.' : 'The email request could not be confirmed. It may still arrive; nothing retries automatically.';
      }
      release(op.claimFlowId ?? op.claim?.flowId);
    } finally {
      clearTimeout(timer); op.abort.signal.removeEventListener('abort', abort); op.memory.clear(); op.password = undefined; op.claimFlowId = undefined; op.claim = undefined; op.session = undefined;
      if (operation === op) { operation = null; emit(); }
    }
  }
  function clearVerified() { clearTimeout(expiry); release(verified?.claim.flowId); verified = null; selected = null; }
  async function send(kind: 'signup' | 'resend' | 'recover', address: string, password?: string, confirmation?: string) {
    if (!(kind === 'signup' ? model().canSignUp : kind === 'resend' ? model().canResend : model().canRecover)) return;
    clearVerified(); const email = typeof address === 'string' ? address.trim() : '';
    if (!validEmail(email) || kind === 'signup' && (!validPassword(password) || password !== confirmation)) { phase = 'unavailable'; message = kind === 'signup' ? 'Enter a valid email and matching passwords of at least 8 characters.' : 'Enter a valid email address.'; emit(); return; }
    await run(kind, async op => {
      op.password = password; password = undefined; confirmation = undefined;
      const prepared = await ports.prepare(kind === 'recover' ? 'recovery' : 'signup', email, op.abort.signal); requireCurrent(op);
      if (prepared.purpose !== (kind === 'recover' ? 'recovery' : 'signup') || prepared.email !== email || prepared.phase !== 'waiting') throw fail();
      selected = prepared;
      const body = { email, ...(kind === 'signup' ? { password: op.password, data: {} } : kind === 'resend' ? { type: 'signup' } : {}), code_challenge: prepared.challenge, code_challenge_method: 's256', gotrue_meta_security: {} };
      const target = ports.providerOrigin + '/auth/v1/' + kind + '?redirect_to=' + encodeURIComponent(prepared.redirectTo);
      op.dispatched = true;
      await readReply(await ports.fetch(prepared.flowId, target, { method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        signal: op.abort.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' }), target, op); requireCurrent(op);
      phase = 'sent'; message = kind === 'recover' ? 'If this address has an account, a recovery email has been requested. Open it on this device, then load the pending link.'
        : 'The confirmation request was accepted. Open the email on this device, then load the pending link. If your email is already confirmed, sign in normally.';
    });
  }
  offRetired = ports.onRetired(() => { if (closed) return; closed = true; retire('The account connection changed. Reopen it before continuing.'); });
  return {
    model, subscribe(fn: (value: NativeEmailAuthModel) => void) { listeners.add(fn); fn(model()); return () => { listeners.delete(fn); }; },
    signUp: (email: string, password: string, confirmation: string) => send('signup', email, password, confirmation), resend: (email: string) => send('resend', email), recover: (email: string) => send('recover', email),
    async loadPending() {
      if (!model().canLoad) return; clearVerified();
      await run('load', async op => { const pending = await ports.pending(op.abort.signal); requireCurrent(op); selected = pending; phase = pending ? 'pending' : 'idle';
        message = !pending ? 'No current email link is saved. Request an email when ready.' : pending.phase === 'callback_ready' ? 'An email link is ready. Continue to verify it.' : pending.phase === 'callback_error' ? 'The email link was refused or expired. Request a new email.' : 'Open the email on this device, then load the pending link again.'; });
    },
    async continuePending() {
      if (!model().canContinue || !selected) return; const expected = selected; selected = null;
      await run('continue', async op => {
        op.claimFlowId = expected.flowId; const claimed = await ports.claim(expected.flowId, op.abort.signal); requireCurrent(op);
        if (claimed.flowId !== expected.flowId || claimed.purpose !== expected.purpose || claimed.email !== expected.email || claimed.expiresAt > expected.expiresAt || claimed.expiresAt <= Date.now()) { release(expected.flowId); throw fail(); }
        op.claim = claimed; op.memory.set(SDK_KEY + '-code-verifier', JSON.stringify(claimed.verifier + (claimed.purpose === 'recovery' ? '/PASSWORD_RECOVERY' : '')));
        const client = sdk(op), result = await client.exchangeCodeForSession(claimed.code); requireCurrent(op);
        const data: unknown = result.data;
        if (result.error || !plain(data) || (claimed.purpose === 'recovery' ? data.redirectType !== 'PASSWORD_RECOVERY' : data.redirectType !== null && data.redirectType !== undefined)
          || !plain(data.user) || !isUuid(data.user.id)) throw fail();
        const candidate = session(data.session, claimed.purpose);
        if (!candidate || candidate.user.id !== data.user.id.toLowerCase() || candidate.access_token !== op.session?.access_token) throw fail();
        const user = await client.getUser(candidate.access_token); requireCurrent(op); if (user.error || user.data.user?.id?.toLowerCase() !== candidate.user.id) throw fail();
        if (claimed.purpose === 'signup') { release(claimed.flowId); phase = 'confirmed'; message = 'Email confirmation verified. Sign in with your email and password to access your account.'; }
        else {
          if (Math.min(candidate.expires_at * 1000, claimed.expiresAt) <= Date.now() + 120000) throw fail();
          verified = { session: candidate, claim: { ...claimed, email: '', code: '', verifier: '' } }; phase = 'ready'; message = 'Recovery link verified. Choose a new password.'; const accepted = verified;
          expiry = setTimeout(() => { if (verified === accepted) retire('Recovery access expired. Request a new email.'); }, Math.min(2147483647, Math.min(candidate.expires_at * 1000, claimed.expiresAt) - Date.now() - 120000));
        }
      });
    },
    async updatePassword(password: string, confirmation: string) {
      if (!model().canUpdate || !verified) return;
      if (!validPassword(password) || password !== confirmation) { message = 'Use at least 8 characters and enter the same new password twice.'; emit(); return; }
      const value = verified; verified = null;
      await run('update', async op => { op.claim = value.claim; op.claimFlowId = value.claim.flowId; op.session = value.session; op.password = password; password = ''; confirmation = '';
        if (Math.min(value.session.expires_at * 1000, value.claim.expiresAt) <= Date.now() + 120000) throw fail();
        op.memory.set(SDK_KEY, JSON.stringify(value.session)); const result = await sdk(op).updateUser({ password: op.password }); requireCurrent(op);
        if (result.error || result.data.user?.id?.toLowerCase() !== value.session.user.id || !op.used.has('update')) throw fail();
        release(value.claim.flowId); phase = 'accepted'; message = 'Password update accepted. Sign in with your new password.';
      });
    },
    async discardPending() { if (!model().canDiscard || !selected) return; const id = selected.flowId; selected = null;
      await run('discard', async op => { await ports.discard(id, op.abort.signal); requireCurrent(op); phase = 'idle'; message = 'Saved email link discarded from this device. An email already sent may still arrive.'; }); },
    activity(value: boolean) { if (closed || value === active) return; active = value; if (!value) retire('Email account access cleared while inactive. A protected pending link may remain; load it explicitly.'); else emit(); },
    connectivity(value: boolean) { if (closed || value === online) return; online = value; if (!value) retire('Email account access cleared while offline. Reconnect, then load the pending link explicitly.'); else emit(); },
    close() { if (closed) return; closed = true; offRetired(); offRetired = () => {}; retire('Email account view closed. Pending email links may remain; an already sent password change may still finish.'); listeners.clear(); },
  };
}
export type NativeEmailAuth = ReturnType<typeof createNativeEmailAuth>;
