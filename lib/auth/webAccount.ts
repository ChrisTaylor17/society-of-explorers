import { AuthClient } from '@supabase/auth-js';
import { createStorageFromOptions } from '@supabase/ssr/dist/module/cookies';
import { parseCookieHeader, serializeCookieHeader, type CookieOptions } from '@supabase/ssr';
import { isUuid } from '../ids/uuid';
import { getSafeAuthRedirectPath } from './redirectPath';
import { memberSessionDto } from './memberDto';
import { beginBrowserAuthIntent, isCurrentBrowserAuthIntent, retireBrowserAuthIntent, AUTH_PKCE_INTENT_COOKIE } from './browserIntent';
import { notifyAuthProviderChanged, subscribeAuthProviderChanges } from './providerSelection';

export type WebAccountModel = {
  phase: 'idle' | 'working' | 'wallet-paused' | 'accepted' | 'leaving' | 'unavailable' | 'closed';
  busy: boolean; active: boolean; online: boolean; canSignIn: boolean; canContinueWallet: boolean; message: string;
};
type EthereumProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};
export type WebAccountConfig = {
  origin: string; providerOrigin: string; publishableKey: string; nextPath: string; fetch: typeof fetch; crypto: Crypto;
  cookies: { getAll(): { name: string; value: string }[]; set(name: string, value: string, options: CookieOptions): void };
  intent: { begin(): string; current(id: string): boolean; retire(id: string): unknown };
  notify(): void; subscribe(retire: () => void): () => void;
  navigate(path: string): void; externalNavigate(url: string): void; ethereum?: EthereumProvider;
  timeoutMs?: number; now?: () => number;
};
type Candidate = { access_token: string; refresh_token: string; token_type: 'bearer'; expires_at: number; expires_in: number; user: { id: string } };
type Wallet = { provider: EthereumProvider; prompt: boolean; paused: boolean; stage: 'accounts' | 'nonce' | 'sign' | 'submit'; address?: string; chainId?: number; message?: string; signature?: string; detach(): void };
type Operation = { kind: 'password' | 'google' | 'wallet'; intent: string; abort: AbortController; memory: Map<string, string>; used: Set<string>; candidate?: Candidate; wallet?: Wallet; timer?: ReturnType<typeof setTimeout> };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => new Error('Sign-in unavailable');
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._~+/-]{1,16384}=*$/.test(value);

// Parsing limits routing and storage; fresh exact-token provider verification
// below is still required. A recovery/confirmation token cannot enter this path.
function passwordSession(value: unknown, now: number): Candidate | null {
  try {
    if (!record(value) || !token(value.access_token) || !token(value.refresh_token) || value.token_type !== 'bearer' || !record(value.user) || !isUuid(value.user.id)) return null;
    const parts = value.access_token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)), c => c.charCodeAt(0))));
    const seconds = Math.floor(now / 1000);
    if (!record(claims) || claims.sub !== value.user.id || !Number.isSafeInteger(claims.exp) || (claims.exp as number) <= seconds + 120 || (claims.exp as number) > seconds + 31536000
      || value.expires_at !== undefined && value.expires_at !== claims.exp || !Array.isArray(claims.amr) || !claims.amr.length || claims.amr.length > 8
      || !claims.amr.every(entry => record(entry) && entry.method === 'password' && Number.isSafeInteger(entry.timestamp) && (entry.timestamp as number) > 0 && (entry.timestamp as number) <= seconds + 30)) return null;
    return { access_token: value.access_token, refresh_token: value.refresh_token, token_type: 'bearer', expires_at: claims.exp as number,
      expires_in: (claims.exp as number) - seconds, user: { id: value.user.id.toLowerCase() } };
  } catch { return null; }
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw unavailable();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 262144) throw unavailable(); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
class IsolatedSignInClient extends AuthClient {
  constructor(options: ConstructorParameters<typeof AuthClient>[0]) {
    super(options); this.broadcastChannel?.close(); this.broadcastChannel = null;
  }
}

/** An attempt owns only its own candidate credentials. The shared SSR cookie
 * storage is used after verification, with an intent check at the actual write.
 * Server selection receipts independently fence delayed Set-Cookie responses. */
export function createWebAccount(config: WebAccountConfig) {
  const site = new URL(config.origin), provider = new URL(config.providerOrigin), now = config.now ?? Date.now, timeout = config.timeoutMs ?? 8000;
  if (site.origin !== config.origin || !['https:', 'http:'].includes(site.protocol) || provider.origin !== config.providerOrigin || provider.protocol !== 'https:'
    || !/^[A-Za-z0-9._-]{1,2048}$/.test(config.publishableKey) || !config.crypto?.getRandomValues || !config.crypto.subtle?.digest
    || !globalThis.crypto?.getRandomValues || !globalThis.crypto.subtle?.digest || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw unavailable();
  const nextPath = getSafeAuthRedirectPath(config.nextPath), sdkKey = 'soe-isolated-sign-in-v1', cookieKey = `sb-${provider.hostname.split('.')[0]}-auth-token`;
  let active = false, online = false, closed = false, notifying = false, op: Operation | null = null;
  let phase: WebAccountModel['phase'] = 'idle', message = 'Choose how to sign in.';
  const listeners = new Set<(model: WebAccountModel) => void>();
  const enabled = () => !closed && active && online;
  const owned = (operation: Operation) => !closed && op === operation && !operation.abort.signal.aborted && config.intent.current(operation.intent);
  const current = (operation: Operation) => enabled() && owned(operation) && !operation.wallet?.paused;
  const requireCurrent = (operation: Operation) => { if (!current(operation)) throw unavailable(); };
  const model = (): WebAccountModel => ({ phase, active, online, busy: !!op && (!op.wallet?.paused || op.wallet.prompt), canSignIn: enabled() && !op && phase !== 'accepted' && phase !== 'leaving',
    canContinueWallet: enabled() && !!op?.wallet?.paused && !op.wallet.prompt && owned(op), message });
  const emit = () => { for (const listener of listeners) { try { listener(model()); } catch { /* Independent observer. */ } } };
  const notify = () => { notifying = true; try { config.notify(); } finally { notifying = false; } };
  function dispose(operation: Operation) {
    clearTimeout(operation.timer); operation.abort.abort(); operation.memory.clear(); operation.candidate = undefined;
    try { operation.wallet?.detach(); } catch { /* A wallet extension cannot stop local retirement. */ }
    if (operation.wallet) { operation.wallet.message = undefined; operation.wallet.signature = undefined; operation.wallet.address = undefined; }
  }
  function retire(text: string) {
    const prior = op; op = null;
    if (prior) { dispose(prior); try { config.intent.retire(prior.intent); } catch { /* Denial remains enforced by local ownership. */ } }
    phase = closed ? 'closed' : 'idle'; message = text; emit();
  }
  const unsubscribe = config.subscribe(() => {
    // BroadcastChannel delivers our own notification through a separate local
    // channel asynchronously. The browser-owned intent, not the notification,
    // determines whether a newer choice has replaced this attempt.
    if (!notifying && (!op || !config.intent.current(op.intent))) retire('The account choice changed. Sign in again to continue.');
  });
  function start(kind: Operation['kind']): Operation | null {
    if (!model().canSignIn) return null;
    try {
      const intent = config.intent.begin();
      if (!isUuid(intent) || !config.intent.current(intent)) throw unavailable();
      const operation: Operation = { kind, intent, abort: new AbortController(), memory: new Map(), used: new Set() };
      op = operation; phase = 'working'; message = kind === 'google' ? 'Opening Google…' : kind === 'wallet' ? 'Continue in your wallet.' : 'Checking your sign-in…';
      operation.timer = setTimeout(() => { if (op === operation) retire('Sign-in timed out. Start again when you are ready.'); }, kind === 'wallet' ? 120000 : timeout);
      notify(); requireCurrent(operation); emit(); requireCurrent(operation); return operation;
    } catch { retire('Sign-in is unavailable in this browser. Allow site cookies and try again.'); return null; }
  }
  function failed(operation: Operation) {
    if (op !== operation) return;
    retire(operation.kind === 'password' ? 'Sign-in could not be confirmed. Check your email and password, or use password recovery.' : 'Sign-in could not be confirmed. Please try again.');
    if (!closed) { phase = 'unavailable'; emit(); }
  }
  function cookieStorage(operation: Operation) {
    return createStorageFromOptions({ cookieEncoding: 'base64url', cookieOptions: { path: '/', sameSite: 'lax', secure: site.protocol === 'https:' }, cookies: {
      getAll() { requireCurrent(operation); return config.cookies.getAll(); },
      setAll(cookies) {
        // SSR awaits getAll before reaching here. Check again synchronously,
        // including before each chunk, so a retired operation writes nothing.
        requireCurrent(operation);
        for (const cookie of cookies) { requireCurrent(operation); config.cookies.set(cookie.name, cookie.value, cookie.options); }
      },
    } }, false).storage;
  }
  const denied = () => new Response('{"message":"Sign-in unavailable","code":"signin_unavailable"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
  function client(operation: Operation, email?: string, password?: string) {
    const fetcher: typeof fetch = async (input, init) => {
      try {
        requireCurrent(operation);
        if (operation.kind !== 'password' || typeof input !== 'string' || !init) return denied();
        const headers = new Headers(init.headers), family = input === provider.origin + '/auth/v1/token?grant_type=password' && init.method === 'POST' ? 'password'
          : input === provider.origin + '/auth/v1/user' && init.method === 'GET' ? 'user' : null;
        if (!family || operation.used.has(family) || headers.get('apikey') !== config.publishableKey) return denied();
        if (family === 'password') {
          const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
          if (!record(body) || Object.keys(body).sort().join(',') !== 'email,gotrue_meta_security,password' || body.email !== email || body.password !== password
            || !record(body.gotrue_meta_security) || Object.keys(body.gotrue_meta_security).length || headers.get('Authorization') !== 'Bearer ' + config.publishableKey) return denied();
        } else if (!operation.candidate || headers.get('Authorization') !== 'Bearer ' + operation.candidate.access_token || init.body !== undefined) return denied();
        operation.used.add(family);
        const response = await config.fetch(input, { ...init, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: operation.abort.signal });
        requireCurrent(operation);
        if (response.status !== 200 || response.redirected || response.url !== input) return denied();
        const body = await boundedJson(response); requireCurrent(operation);
        if (family === 'password') {
          const candidate = passwordSession(body, now()); if (!candidate) return denied(); operation.candidate = candidate;
          return new Response(JSON.stringify(candidate), { headers: { 'Content-Type': 'application/json' } });
        }
        const user = record(body) && record(body.user) ? body.user : body;
        if (!record(user) || user.id !== operation.candidate?.user.id) return denied();
        return new Response(JSON.stringify({ id: user.id }), { headers: { 'Content-Type': 'application/json' } });
      } catch { return denied(); }
    };
    return new IsolatedSignInClient({ url: provider.origin + '/auth/v1', storageKey: sdkKey,
      headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + config.publishableKey }, flowType: 'pkce', persistSession: true,
      autoRefreshToken: false, detectSessionInUrl: false, skipAutoInitialize: true, debug: false, fetch: fetcher,
      storage: { getItem(key) { requireCurrent(operation); return operation.memory.get(key) ?? null; },
        setItem(key, value) { requireCurrent(operation); operation.memory.set(key, value); }, removeItem(key) { operation.memory.delete(key); } } });
  }
  async function request(operation: Operation, path: string, init: RequestInit = {}) {
    requireCurrent(operation); const url = site.origin + path;
    const response = await config.fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: operation.abort.signal });
    requireCurrent(operation);
    if (response.redirected || response.url !== url) throw unavailable();
    const body = await boundedJson(response); requireCurrent(operation); return { response, body };
  }
  async function finishMember(operation: Operation, providerName: 'supabase' | 'wallet', subject: string) {
    let proof = await request(operation, '/api/auth/member');
    if (proof.response.status === 401 && providerName === 'supabase') {
      // Provisioning is only part of this deliberate, verified sign-in.
      const setup = await request(operation, '/api/auth/ensure-member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supabaseAuthId: subject, displayName: 'Explorer' }) });
      if (!setup.response.ok) throw unavailable();
      proof = await request(operation, '/api/auth/member');
    }
    const member = record(proof.body) ? memberSessionDto(proof.body.member) : null;
    if (!proof.response.ok || !record(proof.body) || !record(proof.body.auth) || proof.body.auth.provider !== providerName || proof.body.auth.subject !== subject || !member
      || (providerName === 'wallet' ? member.id !== subject : member.supabase_auth_id !== subject)) throw unavailable();
    requireCurrent(operation); phase = 'accepted'; message = 'Signed in. Opening your account…'; op = null; dispose(operation); notify(); emit();
    // No await after the final ownership check; unmount keeps this accepted intent.
    if (enabled() && phase === 'accepted' && config.intent.current(operation.intent)) config.navigate(nextPath);
  }
  async function signIn(email: string, password: string) {
    if (!model().canSignIn) return;
    if (typeof email !== 'string' || email.trim().length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || !password || password.length > 1024) {
      message = 'Enter your email and password.'; emit(); return;
    }
    const operation = start('password'); if (!operation) return;
    try {
      const sdk = client(operation, email.trim(), password), result = await sdk.signInWithPassword({ email: email.trim(), password }); requireCurrent(operation);
      const candidate = operation.candidate;
      if (result.error || !candidate || result.data.session?.access_token !== candidate.access_token || result.data.user?.id !== candidate.user.id) throw unavailable();
      const fresh = await sdk.getUser(candidate.access_token); requireCurrent(operation);
      if (fresh.error || fresh.data.user?.id !== candidate.user.id) throw unavailable();
      const storage = cookieStorage(operation); await storage.setItem(cookieKey, JSON.stringify(candidate)); requireCurrent(operation);
      if (await storage.getItem(cookieKey) !== JSON.stringify(candidate)) throw unavailable(); requireCurrent(operation);
      const selected = await request(operation, '/api/auth/provider', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'supabase', expectedSubject: candidate.user.id, intent: operation.intent }) });
      if (!selected.response.ok || !record(selected.body) || selected.body.selected !== 'supabase' || selected.body.subject !== candidate.user.id || selected.body.intent !== operation.intent) throw unavailable();
      await finishMember(operation, 'supabase', candidate.user.id);
    } catch { failed(operation); }
    finally { operation.memory.clear(); operation.candidate = undefined; }
  }
  async function google() {
    const operation = start('google'); if (!operation) return;
    try {
      const callback = new URL('/auth/callback', site); callback.searchParams.set('next', nextPath); callback.searchParams.set('intent', operation.intent);
      const result = await client(operation).signInWithOAuth({ provider: 'google', options: { redirectTo: callback.href, skipBrowserRedirect: true } }); requireCurrent(operation);
      const raw = operation.memory.get(sdkKey + '-code-verifier'), verifier: unknown = raw && JSON.parse(raw);
      if (result.error || typeof result.data.url !== 'string' || typeof verifier !== 'string' || !/^[0-9a-f]{112}$/.test(verifier)) throw unavailable();
      const url = new URL(result.data.url), challenge = base64url(new Uint8Array(await config.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))); requireCurrent(operation);
      if (url.origin !== provider.origin || url.pathname !== '/auth/v1/authorize' || url.hash || [...url.searchParams.keys()].sort().join(',') !== 'code_challenge,code_challenge_method,provider,redirect_to'
        || url.searchParams.get('provider') !== 'google' || url.searchParams.get('redirect_to') !== callback.href || url.searchParams.get('code_challenge_method') !== 's256' || url.searchParams.get('code_challenge') !== challenge) throw unavailable();
      const storage = cookieStorage(operation); await storage.setItem(cookieKey + '-code-verifier', raw!); requireCurrent(operation);
      config.cookies.set(AUTH_PKCE_INTENT_COOKIE, operation.intent, { path: '/', sameSite: 'lax', secure: site.protocol === 'https:', maxAge: 600 });
      requireCurrent(operation);
      if (config.cookies.getAll().filter(cookie => cookie.name === AUTH_PKCE_INTENT_COOKIE).length !== 1 || config.cookies.getAll().find(cookie => cookie.name === AUTH_PKCE_INTENT_COOKIE)?.value !== operation.intent
        || await storage.getItem(cookieKey + '-code-verifier') !== raw) throw unavailable();
      requireCurrent(operation); phase = 'leaving'; message = 'Continue with Google.'; emit(); requireCurrent(operation);
      config.externalNavigate(url.href); op = null; dispose(operation); emit();
    } catch { failed(operation); }
  }
  async function walletStep(operation: Operation) {
    const wallet = operation.wallet; if (!wallet) return;
    try {
      requireCurrent(operation);
      const { ethers } = await import('ethers'); requireCurrent(operation);
      if (wallet.stage === 'accounts') {
        wallet.prompt = true;
        const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
        if (!owned(operation)) return;
        wallet.prompt = false;
        if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') throw unavailable();
        wallet.address = ethers.getAddress(accounts[0]); wallet.stage = 'nonce';
        if (wallet.paused || !enabled()) { emit(); return; }
      }
      requireCurrent(operation);
      if (wallet.stage === 'nonce') {
        const chain = await wallet.provider.request({ method: 'eth_chainId' }); requireCurrent(operation);
        if (typeof chain !== 'string' || !/^0x[0-9a-f]{1,13}$/i.test(chain)) throw unavailable();
        wallet.chainId = Number.parseInt(chain.slice(2), 16); if (!Number.isSafeInteger(wallet.chainId) || wallet.chainId < 1) throw unavailable();
        const nonce = await request(operation, '/api/auth/nonce', { headers: { 'X-SoE-Auth-Intent': operation.intent } });
        if (!nonce.response.ok || !record(nonce.body) || nonce.body.intent !== operation.intent || typeof nonce.body.nonce !== 'string' || !/^[A-Za-z0-9]{8,256}$/.test(nonce.body.nonce)) throw unavailable();
        const { SiweMessage } = await import('siwe'); requireCurrent(operation);
        wallet.message = new SiweMessage({ domain: site.host, address: wallet.address, statement: 'Sign in to Society of Explorers.', uri: site.origin, version: '1', chainId: wallet.chainId, nonce: nonce.body.nonce }).prepareMessage();
        wallet.stage = 'sign';
      }
      const accounts = await wallet.provider.request({ method: 'eth_accounts' }); requireCurrent(operation);
      if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || ethers.getAddress(accounts[0]) !== wallet.address) throw unavailable();
      const signingChain = await wallet.provider.request({ method: 'eth_chainId' }); requireCurrent(operation);
      if (typeof signingChain !== 'string' || !/^0x[0-9a-f]{1,13}$/i.test(signingChain) || Number.parseInt(signingChain.slice(2), 16) !== wallet.chainId) throw unavailable();
      if (wallet.stage === 'sign') {
        wallet.prompt = true;
        const signature = await wallet.provider.request({ method: 'personal_sign', params: [wallet.message, wallet.address] });
        if (!owned(operation)) return;
        wallet.prompt = false;
        if (typeof signature !== 'string' || !/^0x[0-9a-f]{130}$/i.test(signature)) throw unavailable();
        wallet.signature = signature; wallet.stage = 'submit';
        if (wallet.paused || !enabled()) { emit(); return; }
      }
      requireCurrent(operation);
      const confirmedAccounts = await wallet.provider.request({ method: 'eth_accounts' }); requireCurrent(operation);
      if (!Array.isArray(confirmedAccounts) || typeof confirmedAccounts[0] !== 'string' || ethers.getAddress(confirmedAccounts[0]) !== wallet.address) throw unavailable();
      const confirmedChain = await wallet.provider.request({ method: 'eth_chainId' }); requireCurrent(operation);
      if (typeof confirmedChain !== 'string' || !/^0x[0-9a-f]{1,13}$/i.test(confirmedChain) || Number.parseInt(confirmedChain.slice(2), 16) !== wallet.chainId) throw unavailable();
      const result = await request(operation, '/api/auth/siwe', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: wallet.message, signature: wallet.signature, address: wallet.address, intent: operation.intent }) });
      wallet.signature = undefined; wallet.message = undefined;
      if (!result.response.ok || !record(result.body) || result.body.intent !== operation.intent || result.body.verified !== true || !record(result.body.member) || !isUuid(result.body.member.id)) throw unavailable();
      await finishMember(operation, 'wallet', result.body.member.id);
    } catch { failed(operation); }
  }
  async function wallet() {
    if (!model().canSignIn) return;
    if (!config.ethereum) { message = 'Open this page in a browser with an Ethereum wallet, or sign in with email.'; emit(); return; }
    const operation = start('wallet'); if (!operation) return;
    const provider = config.ethereum;
    const changed = () => { if (op === operation && operation.wallet?.address) retire('Your wallet account or network changed. Connect again.'); };
    operation.wallet = { provider, prompt: false, paused: false, stage: 'accounts', detach() {
      try { provider.removeListener?.('accountsChanged', changed); } catch { /* Independent extension listener. */ }
      try { provider.removeListener?.('chainChanged', changed); } catch { /* Independent extension listener. */ }
    } };
    try {
      provider.on?.('accountsChanged', changed); provider.on?.('chainChanged', changed);
      await walletStep(operation);
    } catch { failed(operation); }
  }
  return {
    model, subscribe(listener: (value: WebAccountModel) => void) { listeners.add(listener); listener(model()); return () => { listeners.delete(listener); }; }, signIn, google, wallet,
    async continueWallet() { const operation = op; if (!operation || !model().canContinueWallet || !operation.wallet) return; operation.wallet.paused = false; phase = 'working'; message = 'Checking your wallet sign-in…'; emit(); await walletStep(operation); },
    activity(value: boolean) {
      active = value;
      if (!active && op?.wallet?.prompt) { op.wallet.paused = true; phase = 'wallet-paused'; message = 'Return here after using your wallet, then choose Continue.'; emit(); }
      else if (!active && op?.wallet?.paused) emit();
      else if (!active && op) retire('Sign-in stopped when you left this page. Start again when ready.');
      else emit();
    },
    connectivity(value: boolean) { online = value; if (!online && op) retire('You are offline. Reconnect and start sign-in again.'); else emit(); },
    close() { if (closed) return; closed = true; retire('Sign-in closed.'); unsubscribe(); listeners.clear(); },
  };
}
export type WebAccount = ReturnType<typeof createWebAccount>;
export function createBrowserWebAccount(options: { nextPath: string; navigate(path: string): void }) {
  if (!window.isSecureContext) throw unavailable();
  return createWebAccount({ origin: window.location.origin, providerOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', publishableKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    nextPath: options.nextPath, fetch: window.fetch.bind(window), crypto: window.crypto, navigate: options.navigate, externalNavigate: url => window.location.assign(url),
    cookies: { getAll: () => parseCookieHeader(document.cookie).map(cookie => ({ name: cookie.name, value: cookie.value ?? '' })), set: (name, value, settings) => { document.cookie = serializeCookieHeader(name, value, settings); } },
    intent: { begin: beginBrowserAuthIntent, current: isCurrentBrowserAuthIntent, retire: retireBrowserAuthIntent }, notify: notifyAuthProviderChanged, subscribe: subscribeAuthProviderChanges,
    ethereum: (window as Window & { ethereum?: EthereumProvider }).ethereum });
}
