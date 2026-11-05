import { approvedOrigin, type CircleTransport } from '../circles/host';
import { createNativeMemberPorts, type NativeMemberBridge } from '../circles/native-ports';
import { isUuid } from '../../../../lib/ids/uuid';

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
    ...(bridge.sendPublic ? { sendPublic: (id: string, request: Parameters<NonNullable<NativeMemberBridge['sendPublic']>>[1]) => bridge.sendPublic!(id, request) } : {}),
    read: (slot, generation) => bridge.read(slot, generation), write: (slot, value, generation) => bridge.write(slot, value, generation), remove: (slot, generation) => bridge.remove(slot, generation),
    resetAccountStorage: generation => bridge.resetAccountStorage(generation), ...(bridge.newRequestId ? { newRequestId: (generation: string) => bridge.newRequestId!(generation) } : {}),
  }, { origin, storageKey: storageKey, timeoutMs: timeout });
  let retired = false, resetStarted = false, offRetirement = () => {};
  const requests = new Set<AbortController>(), listeners = new Set<() => void>();
  const assertOpen = () => { if (retired) throw unavailable(); };
  function retire() {
    if (retired) return; retired = true; offRetirement();
    for (const controller of requests) controller.abort();
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
  const fetch = async (input: string, init: RequestInit): Promise<Response> => {
    assertOpen(); const request = parse(input, init), controller = new AbortController(), signal = controller.signal;
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
        const result = await bridge.sendAuth!(id, request);
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
  const wrapTransport = (send: CircleTransport): CircleTransport => async (url, init) => {
    assertOpen(); const controller = new AbortController(), abort = () => controller.abort();
    if (init.signal.aborted) throw unavailable(); init.signal.addEventListener('abort', abort, { once: true }); requests.add(controller);
    try {
      const response = await send(url, { ...init, signal: controller.signal }); assertOpen();
      return { ...response, json: async () => { assertOpen(); const value = await response.json(); assertOpen(); return value; } };
    } finally { requests.delete(controller); init.signal.removeEventListener('abort', abort); }
  };
  const transport = wrapTransport(ports.transport);
  const publicTransport = ports.publicTransport ? wrapTransport(ports.publicTransport) : undefined;
  const passageTransport = ports.passageTransport ? wrapTransport(ports.passageTransport) : undefined;
  const profileTransport = ports.profileTransport ? wrapTransport(ports.profileTransport) : undefined;
  const publicProfileTransport = ports.publicProfileTransport ? wrapTransport(ports.publicProfileTransport) : undefined;
  return { providerOrigin, storageKey: storageKey, storage, fetch, retire,
    onRetired(listener: () => void) { if (retired) { listener(); return () => {}; } listeners.add(listener); return () => { listeners.delete(listener); }; },
    async resetAccountStorage() {
      if (resetStarted) throw unavailable(); resetStarted = true; retire();
      try { await ports.resetAccountStorage(); } finally { offRetirement(); ports.retireStorage(); }
    },
    member: { origin, transport, ...(profileTransport ? { profileTransport } : {}), ...(publicProfileTransport ? { publicProfileTransport } : {}), ...(publicTransport ? { publicTransport } : {}), ...(passageTransport ? { passageTransport } : {}), ...(ports.newRequestId ? { newRequestId: async () => { assertOpen(); const id = await ports.newRequestId!(); assertOpen(); return id; } } : {}) },
  };
}
export type NativeAuthPorts = Awaited<ReturnType<typeof createNativeAuthPorts>>;
