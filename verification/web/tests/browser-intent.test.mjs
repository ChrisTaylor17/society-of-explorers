// Canonical routes/resolver with actual Next request/cookies, SIWE and crypto.
// Supabase identity/SQL and browser transport are explicit offline doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Module, { createRequire } from 'node:module';
import { webcrypto, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url)), require = createRequire(root + 'package.json');
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')));
const inputs = new Map(), runtime = new Set();
function read(file) { const s = fs.lstatSync(file); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks), 'Refuse nonresident or linked leaf: ' + file); const bytes = fs.readFileSync(file); const hash = createHash('sha256').update(bytes).digest('hex'); if (inputs.has(file)) assert.equal(inputs.get(file), hash, 'Input changed: ' + file); else inputs.set(file, hash); return bytes; }
for (const extension of ['.js', '.json']) { const previous = Module._extensions[extension]; Module._extensions[extension] = (module, file) => { read(file); runtime.add(file); return previous(module, file); }; }
const ts = require('typescript'), { NextRequest } = require('next/server'), { Wallet } = require('ethers'), { SiweMessage } = require('siwe');
const ORIGIN = 'https://account.invalid', A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const MA = '33333333-3333-4333-8333-333333333333', MB = '44444444-4444-4444-8444-444444444444';
const IA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', IB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const receipt = (intent, provider, subject) => `v1.${intent}.${provider}.${subject}`;
const selected = (intent = IA, subject = A, provider = 'supabase') => ({ soe_auth_intent: intent, soe_auth_provider: provider, soe_auth_selection_v1: receipt(intent, provider, subject) });
const jwt = subject => [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: subject, exp: Math.floor(Date.now() / 1000) + 3600, amr: [{ method: 'oauth', timestamp: Math.floor(Date.now() / 1000) }] })).toString('base64url'), 'SYNTHETIC_UNISSUED'].join('.');
let fixtureCount = 0, closedCount = 0;
function fixture(t) {
  fixtureCount++;
  const state = { user: A, exactUser: A, tokenUser: A, authCalls: 0, sqlCalls: 0, exchanges: 0, exactCalls: [], inserted: [], authWait: null,
    rows: [{ id: MA, supabase_auth_id: A, display_name: 'Synthetic A' }, { id: MB, supabase_auth_id: B, display_name: 'Synthetic B' }] };
  const database = { from(table) { assert.equal(table, 'members'); state.sqlCalls++; let key, value, insert, asArray = false;
    const result = () => { if (insert) { const row = { id: MA, ...insert }; state.rows.push(row); state.inserted.push(row); return { data: row, error: null }; }
      const rows = state.rows.filter(row => !key || String(row[key]).toLowerCase() === String(value).toLowerCase()); return { data: asArray ? rows : rows[0] ?? null, error: null }; };
    const query = { select() { return query; }, eq(k, v) { key = k; value = v; return query; }, ilike(k, v) { key = k; value = v; return query; }, order() { return query; }, limit() { asArray = true; return Promise.resolve(result()); },
      insert(row) { insert = row; return query; }, single: async () => result(), maybeSingle: async () => result() }; return query; } };
  const cookieClient = () => ({ auth: { async getUser() { state.authCalls++; const subject = state.user; if (state.authWait) await state.authWait; return { data: { user: subject ? { id: subject } : null }, error: null }; } } });
  const mock = new Map([
    ['@/lib/supabase/server', { createClient: async () => cookieClient(), createServiceClient: () => database }],
    ['@/lib/supabase/admin', { getSupabaseAdmin: () => database }],
    ['@supabase/supabase-js', { createClient: () => ({ auth: { async getUser(token) { assert.equal(token, 'SYNTHETIC_BEARER'); state.authCalls++; return { data: { user: state.tokenUser ? { id: state.tokenUser } : null }, error: null }; } } }) }],
    ['@supabase/ssr', { createServerClient: (_url, _key, options) => ({ auth: {
      async exchangeCodeForSession() { state.exchanges++; const subject = state.user; options.cookies.setAll([{ name: 'sb-synthetic-auth-token', value: 'SYNTHETIC_SESSION', options: { path: '/' } }]); return { data: { redirectType: null, user: { id: subject }, session: { user: { id: subject }, access_token: jwt(subject), expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer' } }, error: null }; },
      async getUser(token) { state.exactCalls.push(token); return { data: { user: { id: state.exactUser } }, error: null }; },
    } }) }],
  ]);
  const context = vm.createContext({ console: { ...console, error() {}, warn() {} }, URL, URLSearchParams, Headers, Request, Response, TextEncoder, TextDecoder, AbortController, Buffer, crypto: webcrypto,
    process: { env: { NODE_ENV: 'test', WALLET_SESSION_SECRET: 'SYNTHETIC_TEST_ONLY_'.repeat(4), NEXT_PUBLIC_SUPABASE_URL: 'https://provider.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'NONISSUED_TEST_KEY' } },
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, fetch: () => { throw Error('No live fetch'); } });
  const cache = new Map();
  function load(name) {
    const full = path.resolve(root, name); assert(full.startsWith(root)); if (cache.has(full)) return cache.get(full).exports;
    const loadedModule = { exports: {} }; cache.set(full, loadedModule);
    const compiled = ts.transpileModule(read(full).toString(), { fileName: full, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const importer = spec => { if (spec === 'server-only') return {}; if (mock.has(spec)) return mock.get(spec);
      if (spec.startsWith('@/') || spec.startsWith('.')) { const target = spec.startsWith('@/') ? spec.slice(2) : path.relative(root, path.resolve(path.dirname(full), spec)); return load(target + (path.extname(target) ? '' : '.ts')); }
      return require(spec); };
    new vm.Script('(function(require,module,exports){' + compiled + '\n})', { filename: full }).runInContext(context)(importer, loadedModule, loadedModule.exports); return loadedModule.exports;
  }
  const request = (name, { cookies = {}, method = 'GET', body, headers = {} } = {}) => new NextRequest(ORIGIN + name, { method, headers: { origin: ORIGIN, cookie: Object.entries(cookies).map(([key, value]) => key + '=' + value).join('; '), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const auth = cookies => load('lib/getAuthenticatedMember.ts').getAuthenticatedMember(request('/api/auth/member', { cookies }));
  t.after(() => { cache.clear(); closedCount++; });
  return { state, load, request, auth, context };
}

test('receipt parsing binds exact intent, provider and subject', t => {
  const f = fixture(t), api = f.load('lib/auth/browserIntent.ts');
  assert(api.browserSelectionMatches(IA, receipt(IA, 'supabase', A), 'supabase', A));
  for (const args of [[IB, receipt(IA, 'supabase', A), 'supabase', A], [IA, receipt(IA, 'wallet', A), 'supabase', A], [IA, receipt(IA, 'supabase', A), 'supabase', B], [null, receipt(IA, 'supabase', A), 'supabase', A]]) assert(!api.browserSelectionMatches(...args));
  for (const value of [undefined, '', IA.toUpperCase(), IA + '.', 'x'.repeat(1000)]) assert.equal(api.parseBrowserIntent(value), null);
});
test('browser begin is synchronous and stale retirement cannot rotate a newer choice', t => {
  const f = fixture(t), api = f.load('lib/auth/browserIntent.ts'), jar = new Map();
  f.context.window = { isSecureContext: true, crypto: webcrypto, location: { protocol: 'https:' } };
  f.context.document = { get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join('; '); }, set cookie(value) { const [k, v] = value.split(';')[0].split('='); jar.set(k, v); } };
  const a = api.beginBrowserAuthIntent(), b = api.beginBrowserAuthIntent(); assert.notEqual(a, b); assert.equal(api.retireBrowserAuthIntent(a), null); assert.equal(api.currentBrowserAuthIntent(), b);
  const c = api.retireBrowserAuthIntent(b); assert.notEqual(c, b); assert.equal(api.currentBrowserAuthIntent(), c);
});
test('blocked or insecure browser cookies cannot allocate a false current intent', t => {
  const f = fixture(t), api = f.load('lib/auth/browserIntent.ts'); f.context.window = { isSecureContext: false }; assert.throws(() => api.beginBrowserAuthIntent());
  f.context.window = { isSecureContext: true, crypto: webcrypto, location: { protocol: 'https:' } }; f.context.document = { get cookie() { return ''; }, set cookie(_value) {} }; assert.throws(() => api.beginBrowserAuthIntent());
});
test('selected Supabase cookie identity requires a matching receipt and fresh subject', async t => {
  const f = fixture(t); assert.equal((await f.auth(selected())).memberId, MA); f.state.user = B; assert.equal(await f.auth(selected()), null);
});
test('legacy, malformed, wrong-provider and older-attempt cookie sessions fail before identity or SQL', async t => {
  const f = fixture(t);
  for (const cookies of [{}, { soe_auth_provider: 'supabase' }, { ...selected(), soe_auth_intent: IB }, { ...selected(), soe_auth_provider: 'wallet' }, { ...selected(), soe_auth_selection_v1: 'broken' }]) assert.equal(await f.auth(cookies), null);
  assert.equal(f.state.authCalls, 0); assert.equal(f.state.sqlCalls, 0);
});
test('wallet selection proves both the signed session and receipt member subject', async t => {
  const f = fixture(t), signed = await f.load('lib/auth/walletSession.ts').createWalletSessionValue(MA);
  assert.equal((await f.auth({ ...selected(IA, MA, 'wallet'), soe_wallet_id: signed })).memberId, MA);
  assert.equal(await f.auth({ ...selected(IA, MB, 'wallet'), soe_wallet_id: signed }), null);
  assert.equal(await f.auth({ ...selected(IA, MA, 'wallet'), soe_wallet_id: signed + 'x' }), null); assert.equal(f.state.authCalls, 0);
});
test('missing selected Supabase credential never falls through to a saved wallet', async t => {
  const f = fixture(t); f.state.user = null; const signed = await f.load('lib/auth/walletSession.ts').createWalletSessionValue(MA);
  assert.equal(await f.auth({ ...selected(), soe_wallet_id: signed }), null);
});
test('cookie-free explicit native bearer keeps its independent subject proof', async t => {
  const f = fixture(t), api = f.load('lib/getAuthenticatedMember.ts'); const result = await api.getAuthenticatedMember(f.request('/api/auth/member', { headers: { authorization: 'Bearer SYNTHETIC_BEARER' } })); assert.equal(result.memberId, MA);
});
test('browser bearer cannot bypass a changed selection receipt or signed-out marker', async t => {
  const f = fixture(t), api = f.load('lib/getAuthenticatedMember.ts');
  for (const cookies of [{ ...selected(), soe_auth_intent: IB }, selected(IA, B), { ...selected(), soe_auth_provider: 'wallet' }, { ...selected(), soe_auth_provider: 'signed_out' }, { soe_auth_intent: 'invalid' }]) assert.equal(await api.getAuthenticatedMember(f.request('/api/auth/member', { cookies, headers: { authorization: 'Bearer SYNTHETIC_BEARER' } })), null);
  assert.equal((await api.getAuthenticatedMember(f.request('/api/auth/member', { cookies: selected(), headers: { authorization: 'Bearer SYNTHETIC_BEARER' } }))).memberId, MA);
});
test('provider route issues a subject-and-attempt receipt and never writes browser intent', async t => {
  const f = fixture(t), response = await f.load('app/api/auth/provider/route.ts').POST(f.request('/api/auth/provider', { method: 'POST', cookies: { soe_auth_intent: IA }, body: { provider: 'supabase', expectedSubject: A, intent: IA } }));
  assert.equal(response.status, 200); assert.equal((await response.json()).intent, IA); assert.equal(response.cookies.get('soe_auth_selection_v1').value, receipt(IA, 'supabase', A)); assert.equal(response.cookies.get('soe_auth_intent'), undefined); assert.equal(response.cookies.get('soe_auth_selection_v1').httpOnly, true);
});
test('provider route refuses missing intent, wrong intent, changed identity and cross-site writes', async t => {
  const f = fixture(t), route = f.load('app/api/auth/provider/route.ts');
  const base = { provider: 'supabase', expectedSubject: A, intent: IA };
  for (const [body, cookies, headers, status] of [[{ provider: 'supabase', expectedSubject: A }, { soe_auth_intent: IA }, {}, 400], [base, { soe_auth_intent: IB }, {}, 409], [{ ...base, expectedSubject: B }, { soe_auth_intent: IA }, {}, 409], [base, { soe_auth_intent: IA }, { origin: 'https://other.invalid' }, 403]]) { const r = await route.POST(f.request('/api/auth/provider', { method: 'POST', body, cookies, headers })); assert.equal(r.status, status); assert.equal(r.cookies.getAll().length, 0); }
});
test('delayed A selector cannot authorize A after B begins or completes', async t => {
  const f = fixture(t), route = f.load('app/api/auth/provider/route.ts'), held = deferred(); f.state.authWait = held.promise;
  const old = route.POST(f.request('/api/auth/provider', { method: 'POST', cookies: { soe_auth_intent: IA }, body: { provider: 'supabase', expectedSubject: A, intent: IA } }));
  await new Promise(done => setImmediate(done)); f.state.authWait = null; f.state.user = B;
  const current = await route.POST(f.request('/api/auth/provider', { method: 'POST', cookies: { soe_auth_intent: IB }, body: { provider: 'supabase', expectedSubject: B, intent: IB } })); assert.equal(current.status, 200);
  held.resolve(); const delayed = await old; assert.equal(delayed.status, 200);
  const cookies = Object.fromEntries(delayed.cookies.getAll().map(c => [c.name, c.value])); cookies.soe_auth_intent = IB;
  f.state.user = A; assert.equal(await f.auth(cookies), null); f.state.user = B; assert.equal(await f.auth(cookies), null);
  assert.equal((await f.auth(selected(IB, B))).memberId, MB);
});
test('signed SIWE nonce authenticates its issuing intent and deadline', async t => {
  const f = fixture(t), api = f.load('lib/auth/siweNonce.ts'), now = Date.now(), value = await api.signNonce('SYNTHETIC123', IA, now);
  assert.equal(await api.verifyNonceCookie(value, IA, now), 'SYNTHETIC123'); assert.equal(await api.verifyNonceCookie(value, IB, now), null); assert.equal(await api.verifyNonceCookie(value.replace(IA, IB), IB, now), null); assert.equal(await api.verifyNonceCookie(value, IA, now + 600000), null); assert.equal(await api.signNonce('short', IA), null); assert.equal(await api.signNonce('SYNTHETIC123', 'bad'), null);
});
test('nonce route checks browser intent before issuing an intent-bound signed nonce', async t => {
  const f = fixture(t), route = f.load('app/api/auth/nonce/route.ts');
  assert.equal((await route.GET(f.request('/api/auth/nonce'))).status, 409);
  assert.equal((await route.GET(f.request('/api/auth/nonce', { cookies: { soe_auth_intent: IA }, headers: { 'x-soe-auth-intent': IB } }))).status, 409);
  const r = await route.GET(f.request('/api/auth/nonce', { cookies: { soe_auth_intent: IA }, headers: { 'x-soe-auth-intent': IA } })); const body = await r.json(); assert.equal(body.intent, IA); assert.equal(await f.load('lib/auth/siweNonce.ts').verifyNonceCookie(r.cookies.get('soe_siwe_nonce').value, IA), body.nonce); assert.equal(r.cookies.get('soe_auth_intent'), undefined);
});
async function walletRequest(f, overrides = {}) {
  // This publicly deterministic, synthetic test key never owns a real wallet.
  const wallet = new Wallet('0x' + '11'.repeat(32)), nonce = 'SYNTHETIC123';
  f.state.rows.push({ id: MA, wallet_address: wallet.address.toLowerCase() });
  const message = new SiweMessage({ domain: new URL(ORIGIN).host, address: wallet.address, statement: 'Sign in to Society of Explorers.', uri: ORIGIN, version: '1', chainId: 1, nonce }).prepareMessage();
  const signature = await wallet.signMessage(message), signed = await f.load('lib/auth/siweNonce.ts').signNonce(nonce, IA);
  return f.request('/api/auth/siwe', { method: 'POST', cookies: { soe_auth_intent: IA, soe_siwe_nonce: signed, ...overrides.cookies }, body: { message, signature, address: wallet.address, intent: IA, ...overrides.body } });
}
test('actual SIWE signature verification selects only the nonce-bound wallet member', async t => {
  const f = fixture(t), route = f.load('app/api/auth/siwe/route.ts'), r = await route.POST(await walletRequest(f)); assert.equal(r.status, 200); const body = await r.json(); assert.equal(body.intent, IA); assert.equal(body.member.id, MA); assert.equal(r.cookies.get('soe_auth_selection_v1').value, receipt(IA, 'wallet', MA)); assert.equal(r.cookies.get('soe_auth_intent'), undefined);
  assert.equal(await f.load('lib/auth/walletSession.ts').verifyWalletSessionValue(r.cookies.get('soe_wallet_id').value), MA);
});
test('SIWE cannot borrow a nonce from another intent or select an unbound address', async t => {
  const f = fixture(t), route = f.load('app/api/auth/siwe/route.ts');
  for (const overrides of [{ cookies: { soe_auth_intent: IB }, body: { intent: IB } }, { body: { address: '0x' + '22'.repeat(20) } }, { body: { extra: true } }]) { const r = await route.POST(await walletRequest(f, overrides)); assert.equal(r.status, 400); assert.equal(r.cookies.get('soe_auth_selection_v1'), undefined); }
  assert.equal(f.state.sqlCalls, 0);
});
test('OAuth callback refuses unbound, duplicate and superseded intent before exchange', async t => {
  const f = fixture(t), route = f.load('app/auth/callback/route.ts');
  for (const [query, cookies] of [['?code=SYNTHETIC_CODE', {}], ['?code=SYNTHETIC_CODE&intent=' + IA, { soe_auth_intent: IA }], ['?code=SYNTHETIC_CODE&intent=' + IA, { soe_auth_intent: IB, soe_auth_pkce_intent: IA }], ['?code=SYNTHETIC_CODE&intent=' + IA + '&intent=' + IA, { soe_auth_intent: IA, soe_auth_pkce_intent: IA }]]) {
    const r = await route.GET(f.request('/auth/callback' + query, { cookies })); assert.match(r.headers.get('location'), /auth_error=1/); assert.equal(r.cookies.getAll().length, 0);
  }
  assert.equal(f.state.exchanges, 0);
});
test('OAuth callback publishes buffered session only after exact-token proof and binds originating intent', async t => {
  const f = fixture(t), route = f.load('app/auth/callback/route.ts'), r = await route.GET(f.request('/auth/callback?code=SYNTHETIC_CODE&intent=' + IA + '&next=/account', { cookies: { soe_auth_intent: IA, soe_auth_pkce_intent: IA } }));
  assert.equal(f.state.exchanges, 1); assert.equal(f.state.exactCalls.length, 1); assert.equal(r.cookies.get('soe_auth_selection_v1').value, receipt(IA, 'supabase', A)); assert.equal(r.cookies.get('soe_auth_intent'), undefined); assert.equal(r.cookies.get('sb-synthetic-auth-token').value, 'SYNTHETIC_SESSION'); assert.match(r.headers.get('location'), /intent=aaaaaaaa/); assert.equal(r.cookies.get('soe_auth_pkce_intent').maxAge, 0);
});
test('OAuth fresh-subject failure publishes no buffered credentials or selection', async t => {
  const f = fixture(t); f.state.exactUser = B; const r = await f.load('app/auth/callback/route.ts').GET(f.request('/auth/callback?code=SYNTHETIC_CODE&intent=' + IA, { cookies: { soe_auth_intent: IA, soe_auth_pkce_intent: IA } })); assert.match(r.headers.get('location'), /auth_error=1/); assert.equal(r.cookies.getAll().length, 0);
});
test('member setup refuses legacy or mismatched browser selection before any SQL', async t => {
  const f = fixture(t), route = f.load('app/api/auth/ensure-member/route.ts');
  for (const cookies of [{}, { soe_auth_provider: 'supabase' }, { ...selected(), soe_auth_intent: IB }, selected(IA, B)]) { const r = await route.POST(f.request('/api/auth/ensure-member', { method: 'POST', cookies, body: { supabaseAuthId: A } })); assert.equal(r.status, 409); }
  assert.equal(f.state.sqlCalls, 0);
});
test('member setup retains cookie-free native bearer and matching browser selection', async t => {
  const f = fixture(t), route = f.load('app/api/auth/ensure-member/route.ts');
  for (const [cookies, headers] of [[{}, { authorization: 'Bearer SYNTHETIC_BEARER' }], [selected(), {}], [selected(), { authorization: 'Bearer SYNTHETIC_BEARER' }]]) { const r = await route.POST(f.request('/api/auth/ensure-member', { method: 'POST', cookies, headers, body: { supabaseAuthId: A } })); assert.equal(r.status, 200); assert.equal((await r.json()).member.id, MA); }
  const denied = await route.POST(f.request('/api/auth/ensure-member', { method: 'POST', cookies: selected(IB, B), headers: { authorization: 'Bearer SYNTHETIC_BEARER' }, body: { supabaseAuthId: A } })); assert.equal(denied.status, 409);
  const inconsistent = await route.POST(f.request('/api/auth/ensure-member', { method: 'POST', cookies: { ...selected(), soe_auth_provider: 'wallet' }, headers: { authorization: 'Bearer SYNTHETIC_BEARER' }, body: { supabaseAuthId: A } })); assert.equal(inconsistent.status, 409);
});
test('logout clears selection and PKCE cookies without overwriting the current browser intent', async t => {
  const f = fixture(t), r = await f.load('app/api/auth/logout/route.ts').POST(f.request('/api/auth/logout', { method: 'POST', cookies: selected(), body: { scope: 'browser', requestId: IA } })); assert.equal(r.status, 200); assert.equal(r.cookies.get('soe_auth_selection_v1').maxAge, 0); assert.equal(r.cookies.get('soe_auth_pkce_intent').maxAge, 0); assert.equal(r.cookies.get('soe_auth_intent'), undefined); assert.equal(r.cookies.get('soe_auth_provider').value, 'signed_out');
});
test('logout rotates browser intent before its first network dispatch', async t => {
  const f = fixture(t), jar = new Map([['soe_auth_intent', IA]]), events = [], storage = { length: 0, setItem() {}, key() { return null; }, removeItem() {} };
  f.context.Event = Event; f.context.window = { isSecureContext: true, crypto: webcrypto, location: { protocol: 'https:' }, localStorage: storage, sessionStorage: storage, dispatchEvent() { events.push('notify'); } };
  f.context.document = { get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join('; '); }, set cookie(value) { const [k, v] = value.split(';')[0].split('='); jar.set(k, v); events.push('rotate'); } };
  f.context.fetch = async () => { assert.notEqual(jar.get('soe_auth_intent'), IA); events.push('fetch'); return new Response('{}', { status: 503 }); };
  const r = await f.load('lib/auth/browserSignOut.ts').signOutBrowser(() => ({ auth: {} }), IA); assert.equal(r.confirmed, false); assert.deepEqual(events.slice(0, 3), ['rotate', 'notify', 'fetch']);
});
test.after(() => {
  assert.equal(fixtureCount, closedCount); for (const file of inputs.keys()) read(file);
  console.log('BROWSER_INTENT_PROOF ' + JSON.stringify({ fixtures: fixtureCount, closed: closedCount, providerCalls: 0,
    sourceHashes: Object.fromEntries([...inputs].filter(([file]) => file.startsWith(root)).map(([file, hash]) => [path.relative(root, file), hash])),
    runtimeHashes: Object.fromEntries([...runtime].map(file => [file, inputs.get(file)])), boundaries: ['Actual cached Next request/response/cookie implementation, SIWE/ethers and Web Crypto', 'Supabase identity, SQL, browser cookies and HTTP are synthetic doubles; no provider or database contact'] }));
});
