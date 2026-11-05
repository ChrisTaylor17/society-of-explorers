import { approvedOrigin, type CircleTransport } from '../circles/host';
import { createNativeMemberPorts, type NativeMemberBridge } from '../circles/native-ports';
import { isUuid } from '../../../../lib/ids/uuid';
import type { NativeEmailAuthPorts, NativeEmailPending, NativeEmailClaim, NativeEmailPurpose } from './email-auth-types';

export const NATIVE_AUTH_POLICY = 'supabase-password-v1';
const unavailable = () => Error('Native account connection unavailable');
const publicKey = (value: unknown): value is string => typeof value === 'string' && /^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(value);
const token = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 16384 && /^[A-Za-z0-9._~+/-]+=*$/.test(value);
const bytes = (value: string) => { let length = 0; for (let i = 0; i < value.length; i++) { const c = value.charCodeAt(i); if (c < 128) length++; else if (c < 2048) length += 2; else if (c >= 0xd800 && c <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { length += 4; i++; } else length += 3; } return length; };
const handle = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const exactKeys = (value: Record<string, unknown>, required: string[], optional: string[] = []) => required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const validText = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length > 0 && bytes(value) <= limit && !/[\u0000-\u001f\u007f]/.test(value)
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);

export type NativeAuthConfig = { origin: string; storageKey: string; providerOrigin: string; publishableKey: string; timeoutMs?: number };

/** Dedicated SDK fetch adapter. The account controller grants an AbortSignal for
 * each operation and owns its request budget; this layer never uses ambient fetch.
 * Local retirement denies reads/writes while retaining the explicit durable-reset
 * capability, so clearing this device still works after a closed account view. */
export async function createNativeAuthPorts(bridge: NativeMemberBridge | null, config: NativeAuthConfig) {
  const origin = approvedOrigin(config.origin), providerOrigin = approvedOrigin(config.providerOrigin), timeout = config.timeoutMs ?? 15000;
  const publishableKey = config.publishableKey, storageKey = config.storageKey;
  if (!bridge || typeof bridge.sendAuth !== 'function' || !publicKey(publishableKey)
    || !/^[A-Za-z0-9._-]{1,160}$/.test(storageKey) || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw unavailable();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const caps = await Promise.race([bridge.capabilities(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(unavailable()), timeout); })]).finally(() => clearTimeout(timer));
  if (caps.authPolicy !== NATIVE_AUTH_POLICY || caps.providerOrigin !== providerOrigin || caps.publishableKey !== publishableKey
    || caps.origin !== origin || caps.storageKey !== storageKey || !isUuid(caps.storageGeneration)) throw unavailable();
  // Capture one capability receipt. Native checks its durable generation again at
  // allocation, send, storage and delivery; no stale receipt can restore an epoch.
  const ports = await createNativeMemberPorts({
    capabilities: async () => ({ ...caps }), begin: generation => bridge.begin(generation), send: (id, request) => bridge.send(id, request), cancel: id => bridge.cancel(id),
    ...(typeof bridge.sendReview === 'function' ? { sendReview: (id: string, request: Parameters<NonNullable<NativeMemberBridge['sendReview']>>[1]) => bridge.sendReview!(id, request) } : {}),
    ...(typeof bridge.sendCircleReview === 'function' ? { sendCircleReview: (id: string, request: Parameters<NonNullable<NativeMemberBridge['sendCircleReview']>>[1]) => bridge.sendCircleReview!(id, request) } : {}),
    ...(bridge.sendPublic ? { sendPublic: (id: string, request: Parameters<NonNullable<NativeMemberBridge['sendPublic']>>[1]) => bridge.sendPublic!(id, request) } : {}),
    read: (slot, generation) => bridge.read(slot, generation), write: (slot, value, generation) => bridge.write(slot, value, generation), remove: (slot, generation) => bridge.remove(slot, generation),
    resetAccountStorage: generation => bridge.resetAccountStorage(generation), ...(bridge.newRequestId ? { newRequestId: (generation: string) => bridge.newRequestId!(generation) } : {}),
  }, { origin, storageKey: storageKey, timeoutMs: timeout });
  let retired = false, resetStarted = false, offRetirement = () => {};
  const requests = new Set<AbortController>(), listeners = new Set<() => void>(), emailClaims = new Set<string>();
  const assertOpen = () => { if (retired) throw unavailable(); };
  function retire() {
    if (retired) return; retired = true; offRetirement();
    for (const controller of requests) controller.abort();
    // Direct local retirement remains available after the JS wrapper is closed.
    // Native binds the generation and exact flow, so this cannot delete a newer link.
    for (const id of emailClaims) void bridge!.discardEmailLink?.(caps.storageGeneration, id).catch(() => {});
    emailClaims.clear();
    for (const listener of Array.from(listeners)) { try { listener(); } catch { /* Retire all owners independently. */ } }
    listeners.clear();
  }
  offRetirement = ports.onAccountRetired(retire);
  const storage = {
    async getItem(key: string) { assertOpen(); const result = await ports.storage.getItem(key); assertOpen(); return result; },
    async setItem(key: string, value: string) { assertOpen(); await ports.storage.setItem(key, value); assertOpen(); },
    async removeItem(key: string) { assertOpen(); await ports.storage.removeItem(key); assertOpen(); },
  };
  function parse(input: string, init: RequestInit) {
    if (typeof input !== 'string' || !init || typeof init !== 'object' || !init.signal || init.signal.aborted
      || init.credentials !== undefined && init.credentials !== 'omit' || init.redirect !== undefined && init.redirect !== 'error'
      || init.cache !== undefined && init.cache !== 'no-store' || init.mode !== undefined && init.mode !== 'cors'
      || init.referrer !== undefined && init.referrer !== '' || init.referrerPolicy !== undefined && init.referrerPolicy !== 'no-referrer'
      || init.integrity || init.keepalive) throw unavailable();
    const url = new URL(input);
    if (url.href !== input || url.origin !== providerOrigin || url.username || url.password || input.includes('#')) throw unavailable();
    const method = init.method, endpoint = input.slice(providerOrigin.length);
    const operation = method === 'POST' && endpoint === '/auth/v1/token?grant_type=password' ? 'password'
      : method === 'POST' && endpoint === '/auth/v1/token?grant_type=refresh_token' ? 'refresh'
        : method === 'GET' && endpoint === '/auth/v1/user' ? 'user'
          : method === 'POST' && endpoint === '/auth/v1/logout?scope=local' ? 'logout' : null;
    if (!operation) throw unavailable();
    const headers = new Headers(init.headers), allowed = new Set(['apikey', 'authorization', 'content-type', 'x-client-info', 'x-supabase-api-version']);
    if (Array.from(headers.keys()).some(key => !allowed.has(key)) || headers.get('apikey') !== publishableKey) throw unavailable();
    const auth = headers.get('authorization'), bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (operation === 'user' || operation === 'logout') { if (!token(bearer) || bearer === publishableKey) throw unavailable(); }
    else if (auth !== null && auth !== 'Bearer ' + publishableKey) throw unavailable();
    const info = headers.get('x-client-info'), version = headers.get('x-supabase-api-version'), contentType = headers.get('content-type');
    if (info !== null && !/^[A-Za-z0-9._/+ -]{1,160}$/.test(info) || version !== null && version !== '2024-01-01') throw unavailable();
    if (method === 'GET' ? contentType !== null || init.body !== undefined && init.body !== null
      : contentType === null || !/^application\/json(?:;\s*charset=UTF-8)?$/i.test(contentType)) throw unavailable();
    if (operation === 'logout') { if (init.body !== undefined && init.body !== null) throw unavailable(); }
    else if (operation !== 'user') {
      if (typeof init.body !== 'string' || bytes(init.body) > 16384) throw unavailable();
      const body: unknown = JSON.parse(init.body);
      if (!plain(body)) throw unavailable();
      if (operation === 'password') {
        if (!exactKeys(body, ['email', 'password'], ['gotrue_meta_security']) || !validText(body.email, 320) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
          || !validText(body.password, 4096) || body.gotrue_meta_security !== undefined && (!plain(body.gotrue_meta_security) || Object.keys(body.gotrue_meta_security).length !== 0)) throw unavailable();
      } else if (!exactKeys(body, ['refresh_token']) || !token(body.refresh_token)) throw unavailable();
    }
    return { url: input, method: method as 'GET' | 'POST', ...(['user', 'logout'].includes(operation) ? { bearer } : {}),
      ...(typeof init.body === 'string' ? { body: init.body } : {}) };
  }
  const dispatch = async (input: string, init: RequestInit, send: (id: string) => ReturnType<NonNullable<NativeMemberBridge['sendAuth']>>): Promise<Response> => {
    assertOpen(); const controller = new AbortController(), signal = controller.signal;
    const abort = () => controller.abort(); init.signal!.addEventListener('abort', abort, { once: true }); requests.add(controller);
    let id: string | undefined, finished = false, cancelled = false, timeoutId: ReturnType<typeof setTimeout> | undefined, rejectAbort = () => {};
    const current = () => !retired && !signal.aborted && !init.signal!.aborted;
    const cancel = () => { if (!id || cancelled) return; cancelled = true; const allocated = id; void Promise.resolve().then(() => bridge.cancel(allocated)).catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const reply = await Promise.race([(async () => {
        if (!current()) throw unavailable();
        const allocation = Promise.resolve().then(() => { if (!current()) throw unavailable(); return bridge.begin(caps.storageGeneration); });
        void allocation.then(value => { if (handle(value)) { id = value; if (finished || !current()) cancel(); } }, () => {});
        const allocated = await allocation;
        if (!handle(allocated)) throw unavailable(); id = allocated;
        if (!current()) throw unavailable();
        const result = await send(id);
        if (!current() || !result || !Number.isInteger(result.status) || result.status < 200 || result.status > 599 || result.status >= 300 && result.status < 400
          || result.redirected !== false || result.url !== input || typeof result.body !== 'string' || bytes(result.body) > 1048576) throw unavailable();
        const response = new Response(result.status === 204 || result.status === 205 || result.status === 304 ? null : result.body,
          { status: result.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        Object.defineProperty(response, 'url', { value: input });
        const json = response.json.bind(response), text = response.text.bind(response);
        response.json = async () => { if (!current()) throw unavailable(); const value = await json(); if (!current()) throw unavailable(); return value; };
        response.text = async () => { if (!current()) throw unavailable(); const value = await text(); if (!current()) throw unavailable(); return value; };
        return response;
      })(), new Promise<never>((_, reject) => { timeoutId = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeout); }),
      new Promise<never>((_, reject) => { rejectAbort = () => reject(unavailable()); signal.addEventListener('abort', rejectAbort, { once: true }); })]);
      return reply;
    } catch { cancel(); throw unavailable(); }
    finally { finished = true; clearTimeout(timeoutId); signal.removeEventListener('abort', cancel); signal.removeEventListener('abort', rejectAbort); init.signal!.removeEventListener('abort', abort); requests.delete(controller); }
  };
  const fetch = async (input: string, init: RequestInit): Promise<Response> => {
    assertOpen(); const request = parse(input, init); return dispatch(input, init, id => bridge.sendAuth!(id, request));
  };
  // Optional email lane has its own native allowlist and flow capability. The
  // existing password-v1 fetch parser above continues to reject every new path.
  let email: NativeEmailAuthPorts | undefined;
  if (caps.emailAuthPolicy === 'supabase-email-pkce-v1') {
    const callbackUrl = caps.emailCallbackUrl;
    if (typeof callbackUrl !== 'string' || !/^[a-z][a-z0-9+.-]{1,120}:\/\/auth\/callback$/.test(callbackUrl)
      || !bridge.prepareEmailLink || !bridge.pendingEmailLink || !bridge.claimEmailLink || !bridge.discardEmailLink || !bridge.sendEmailAuth) throw unavailable();
    const flow = (value: unknown): value is string => isUuid(value) && value === value.toLowerCase();
    const address = (value: unknown): value is string => validText(value, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    const purpose = (value: unknown): value is NativeEmailPurpose => value === 'signup' || value === 'recovery';
    function parsePending(value: unknown): NativeEmailPending {
      if (!plain(value) || !exactKeys(value, ['flowId', 'purpose', 'email', 'challenge', 'redirectTo', 'createdAt', 'expiresAt', 'phase'])
        || !flow(value.flowId) || !purpose(value.purpose) || !address(value.email) || typeof value.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.challenge)
        || value.redirectTo !== callbackUrl + '?flow=' + value.flowId || !Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.expiresAt)
        || (value.createdAt as number) > Date.now() + 30000 || (value.expiresAt as number) !== (value.createdAt as number) + 3600000 || (value.expiresAt as number) <= Date.now()
        || !['waiting', 'callback_ready', 'callback_error'].some(phase => phase === value.phase)) throw unavailable();
      return { ...value } as NativeEmailPending;
    }
    function parseClaim(value: unknown, id: string): NativeEmailClaim {
      if (!plain(value) || !exactKeys(value, ['flowId', 'purpose', 'email', 'code', 'verifier', 'expiresAt']) || value.flowId !== id || !purpose(value.purpose) || !address(value.email)
        || typeof value.code !== 'string' || !/^[A-Za-z0-9._~-]{1,2048}$/.test(value.code) || typeof value.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.verifier)
        || !Number.isSafeInteger(value.expiresAt) || (value.expiresAt as number) <= Date.now() || (value.expiresAt as number) > Date.now() + 3630000) throw unavailable();
      return { ...value } as NativeEmailClaim;
    }
    async function local<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
      assertOpen(); if (!signal || signal.aborted) throw unavailable(); const controller = new AbortController(), abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true }); requests.add(controller); let timer: ReturnType<typeof setTimeout> | undefined, rejectAbort = () => {};
      try {
        const value = await Promise.race([Promise.resolve().then(() => { assertOpen(); if (signal.aborted || controller.signal.aborted) throw unavailable(); return work(); }),
          new Promise<never>((_, reject) => { rejectAbort = () => reject(unavailable()); controller.signal.addEventListener('abort', rejectAbort, { once: true }); timer = setTimeout(() => { controller.abort(); }, timeout); })]);
        assertOpen(); if (signal.aborted || controller.signal.aborted) throw unavailable(); return value;
      } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', rejectAbort); signal.removeEventListener('abort', abort); requests.delete(controller); }
    }
    function emailRequest(id: string, input: string, init: RequestInit) {
      if (!flow(id) || typeof input !== 'string' || !init?.signal || init.signal.aborted || init.credentials !== 'omit' || init.redirect !== 'error' || init.cache !== 'no-store'
        || init.referrerPolicy !== undefined && init.referrerPolicy !== 'no-referrer' || init.referrer || init.integrity || init.keepalive || init.mode !== undefined && init.mode !== 'cors') throw unavailable();
      const url = new URL(input), headers = new Headers(init.headers), allowed = new Set(['apikey', 'authorization', 'content-type', 'x-client-info', 'x-supabase-api-version']);
      if (url.href !== input || url.origin !== providerOrigin || url.username || url.password || input.includes('#') || [...headers.keys()].some(key => !allowed.has(key)) || headers.get('apikey') !== publishableKey) throw unavailable();
      const path = url.pathname, method = init.method;
      const action = method === 'POST' && ['/auth/v1/signup', '/auth/v1/resend', '/auth/v1/recover'].includes(path) ? path.slice(9)
        : method === 'POST' && input === providerOrigin + '/auth/v1/token?grant_type=pkce' ? 'exchange'
          : input === providerOrigin + '/auth/v1/user' && method === 'GET' ? 'user' : input === providerOrigin + '/auth/v1/user' && method === 'PUT' ? 'update' : null;
      if (!action) throw unavailable();
      const auth = headers.get('authorization'), bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined, info = headers.get('x-client-info'), version = headers.get('x-supabase-api-version');
      if (info !== null && !/^[A-Za-z0-9._/+ -]{1,160}$/.test(info) || version !== null && version !== '2024-01-01') throw unavailable();
      if (action === 'user' || action === 'update') { if (!token(bearer) || bearer === publishableKey) throw unavailable(); }
      else if (auth !== null && auth !== 'Bearer ' + publishableKey) throw unavailable();
      if (action === 'user') { if (init.body !== undefined || headers.has('content-type')) throw unavailable(); }
      else {
        if (typeof init.body !== 'string' || bytes(init.body) > 16384 || !/^application\/json(?:;\s*charset=UTF-8)?$/i.test(headers.get('content-type') ?? '')) throw unavailable();
        const body: unknown = JSON.parse(init.body); if (!plain(body) || JSON.stringify(body) !== init.body) throw unavailable();
        if (action === 'exchange') { if (!exactKeys(body, ['auth_code', 'code_verifier']) || JSON.stringify({ auth_code: body.auth_code, code_verifier: body.code_verifier }) !== init.body || typeof body.auth_code !== 'string' || !/^[A-Za-z0-9._~-]{1,2048}$/.test(body.auth_code) || typeof body.code_verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.code_verifier)) throw unavailable(); }
        else if (action === 'update') { if (!exactKeys(body, ['password', 'code_challenge', 'code_challenge_method']) || JSON.stringify({ password: body.password, code_challenge: body.code_challenge, code_challenge_method: body.code_challenge_method }) !== init.body || !validText(body.password, 4096) || body.code_challenge !== null || body.code_challenge_method !== null) throw unavailable(); }
        else {
          const required = ['email', ...(action === 'signup' ? ['password', 'data'] : action === 'resend' ? ['type'] : []), 'code_challenge', 'code_challenge_method', 'gotrue_meta_security'];
          if (!exactKeys(body, required) || JSON.stringify(Object.fromEntries(required.map(key => [key, body[key]]))) !== init.body || !address(body.email) || typeof body.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.code_challenge) || body.code_challenge_method !== 's256'
            || !plain(body.gotrue_meta_security) || Object.keys(body.gotrue_meta_security).length || [...url.searchParams.keys()].join(',') !== 'redirect_to'
            || url.searchParams.get('redirect_to') !== callbackUrl + '?flow=' + id || input !== providerOrigin + path + '?redirect_to=' + encodeURIComponent(callbackUrl + '?flow=' + id)) throw unavailable();
          if (action === 'signup' && (!validText(body.password, 4096) || !plain(body.data) || Object.keys(body.data).length) || action === 'resend' && body.type !== 'signup') throw unavailable();
        }
      }
      return { flowId: id, url: input, method: method as 'GET' | 'POST' | 'PUT', ...(['user', 'update'].includes(action) ? { bearer } : {}), ...(typeof init.body === 'string' ? { body: init.body } : {}) };
    }
    email = { providerOrigin, callbackUrl,
      prepare: (kind, value, signal) => { if (!purpose(kind) || !address(value)) return Promise.reject(unavailable()); return local(signal, async () => { const p = parsePending(await bridge.prepareEmailLink!(caps.storageGeneration, kind, value)); if (p.purpose !== kind || p.email !== value || p.phase !== 'waiting') throw unavailable(); return p; }); },
      pending: signal => local(signal, async () => { const value = await bridge.pendingEmailLink!(caps.storageGeneration); return value === null ? null : parsePending(value); }),
      claim: (id, signal) => { if (!flow(id)) return Promise.reject(unavailable()); return local(signal, async () => { emailClaims.add(id); return parseClaim(await bridge.claimEmailLink!(caps.storageGeneration, id), id); }); },
      discard: (id, signal) => { if (!flow(id)) return Promise.reject(unavailable()); return local(signal, async () => { await bridge.discardEmailLink!(caps.storageGeneration, id); emailClaims.delete(id); }); },
      fetch: async (id, input, init) => { assertOpen(); const request = emailRequest(id, input, init); return dispatch(input, init, allocated => bridge.sendEmailAuth!(allocated, request)); },
      onRetired(listener) { if (retired) { listener(); return () => {}; } listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
  }
  const wrapTransport = (send: CircleTransport): CircleTransport => async (url, init) => {
    assertOpen(); const controller = new AbortController(), abort = () => controller.abort();
    if (init.signal.aborted) throw unavailable(); init.signal.addEventListener('abort', abort, { once: true }); requests.add(controller);
    try {
      const response = await send(url, { ...init, signal: controller.signal }); assertOpen();
      return { ...response, json: async () => { assertOpen(); const value = await response.json(); assertOpen(); return value; } };
    } finally { requests.delete(controller); init.signal.removeEventListener('abort', abort); }
  };
  const transport = wrapTransport(ports.transport);
  const reviewerTransport = ports.reviewerTransport ? wrapTransport(ports.reviewerTransport) : undefined;
  const circleReviewerTransport = ports.circleReviewerTransport ? wrapTransport(ports.circleReviewerTransport) : undefined;
  const publicTransport = ports.publicTransport ? wrapTransport(ports.publicTransport) : undefined;
  const passageTransport = ports.passageTransport ? wrapTransport(ports.passageTransport) : undefined;
  const profileTransport = ports.profileTransport ? wrapTransport(ports.profileTransport) : undefined;
  const publicProfileTransport = ports.publicProfileTransport ? wrapTransport(ports.publicProfileTransport) : undefined;
  const attendanceTransport = ports.attendanceTransport ? wrapTransport(ports.attendanceTransport) : undefined;
  const hostingTransport = ports.hostingTransport ? wrapTransport(ports.hostingTransport) : undefined;
  const editionTransport = ports.editionTransport ? wrapTransport(ports.editionTransport) : undefined;
  const savedReadingTransport = ports.savedReadingTransport ? wrapTransport(ports.savedReadingTransport) : undefined;
  return { providerOrigin, storageKey: storageKey, storage, fetch, retire, ...(email ? { email } : {}),
    onRetired(listener: () => void) { if (retired) { listener(); return () => {}; } listeners.add(listener); return () => { listeners.delete(listener); }; },
    async resetAccountStorage() {
      if (resetStarted) throw unavailable(); resetStarted = true; retire();
      try { await ports.resetAccountStorage(); } finally { offRetirement(); ports.retireStorage(); }
    },
    member: { origin, transport, aiConsent: ports.aiConsent, ...(reviewerTransport ? { reviewerTransport } : {}), ...(circleReviewerTransport ? { circleReviewerTransport } : {}), ...(hostingTransport ? { hostingTransport } : {}), ...(editionTransport ? { editionTransport } : {}), ...(attendanceTransport ? { attendanceTransport } : {}), ...(savedReadingTransport ? { savedReadingTransport } : {}), ...(profileTransport ? { profileTransport } : {}), ...(publicProfileTransport ? { publicProfileTransport } : {}), ...(publicTransport ? { publicTransport } : {}), ...(passageTransport ? { passageTransport } : {}), ...(ports.newRequestId ? { newRequestId: async () => { assertOpen(); const id = await ports.newRequestId!(); assertOpen(); return id; } } : {}) },
  };
}
export type NativeAuthPorts = Awaited<ReturnType<typeof createNativeAuthPorts>>;
