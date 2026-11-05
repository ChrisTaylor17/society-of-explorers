// Actual cached AuthClient2.99.3; only browser persistence/locks/HTTP are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Module, { createRequire } from 'node:module';
import { webcrypto, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
assert(process.execArgv.some(v => v.endsWith('/deny-build-network.cjs')));
const root = fileURLToPath(new URL('../../../', import.meta.url)), require = createRequire(root + 'package.json');
for (const ext of ['.js', '.json']) { const original = Module._extensions[ext]; Module._extensions[ext] = (module, file) => { const s = fs.lstatSync(file); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks)); return original(module, file); }; }
const ts = require('typescript'), actualSdk = require('@supabase/auth-js');
const runtimeHashes = {};
for (const file of Object.keys(require.cache).filter(p => p.includes('/@supabase/auth-js/') || p.includes('/tslib/') || p.endsWith('/typescript.js'))) runtimeHashes[file] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function load({ crypto = webcrypto } = {}) {
  const context = vm.createContext({ console, URL, URLSearchParams, Headers, Request, Response, TextEncoder, TextDecoder, Uint8Array, AbortController,
    setTimeout, clearTimeout, queueMicrotask, crypto, atob, btoa, process: { env: {} } }), cache = new Map();
  function source(file) { const full = path.join(root, file); if (cache.has(full)) return cache.get(full).exports; const s = fs.lstatSync(full); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks));
    const m = { exports: {} }; cache.set(full, m); const text = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new vm.Script('(function(require,module,exports){' + text + '\n})', { filename: full }).runInContext(context)(name => name === '@supabase/auth-js' ? actualSdk : source(path.relative(root, path.resolve(path.dirname(full), name + '.ts'))), m, m.exports); return m.exports;
  }
  return source('lib/auth/emailSignup.ts');
}
const ORIGIN = 'https://confirmation.invalid', PROVIDER = 'https://provider.invalid', KEY = 'sb_publishable_NONISSUED_CONFIRMATION', EMAIL = 'synthetic@example.invalid', PASSWORD = 'SYNTHETIC_NEW_PASSWORD';
const SUBJECT = '73111111-1111-4111-8111-111111111111', OTHER = '73222222-2222-4222-8222-222222222222';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(done => setImmediate(done));
const jwt = (claims = {}) => [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: SUBJECT, exp: Math.floor(Date.now() / 1000) + 3600, amr: [{ method: 'email/signup', timestamp: Math.floor(Date.now() / 1000) }], ...claims })).toString('base64url'), 'NONISSUED_SIGNATURE'].join('.');
const reply = (url, body, status = 200) => { const response = new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); Object.defineProperty(response, 'url', { value: url }); return response; };
let fixtures = 0, closed = 0;
function fixture(t, { timeoutMs = 1000, crypto = webcrypto, nextPath } = {}) {
  const api = load(), values = new Map(), calls = [], hooks = {}, controllers = []; let clock = Date.now(), lock = Promise.resolve(); fixtures++;
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
  const config = { origin: ORIGIN, providerOrigin: PROVIDER, publishableKey: KEY, crypto, storage, timeoutMs, nextPath, now: () => clock,
    withLock(signal, work) { const result = lock.then(() => { if (signal.aborted) throw Error('Synthetic abort'); return work(); }); lock = result.catch(() => {}); return result; },
    async fetch(url, init) {
      assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.equal(init.referrerPolicy, 'no-referrer'); assert(init.signal);
      const headers = new Headers(init.headers); assert.equal(headers.get('apikey'), KEY); assert.equal(headers.get('cookie'), null);
      const call = { url, init, body: init.body && JSON.parse(init.body) }; calls.push(call);
      let body = {};
      if (url.includes('/token?')) body = { access_token: jwt(), refresh_token: 'NONISSUED_REFRESH', expires_in: 3600, token_type: 'bearer', user: { id: SUBJECT } };
      else if (url.endsWith('/user')) { assert(headers.get('Authorization').startsWith('Bearer ey')); body = { user: { id: SUBJECT, email: EMAIL, privateMetadata: 'NOT_RETURNED' } }; }
      else assert(['/auth/v1/signup', '/auth/v1/resend'].includes(new URL(url).pathname));
      return hooks.reply ? hooks.reply(call, reply(url, body)) : reply(url, body);
    } };
  const create = link => { const c = api.createEmailSignup({ ...config, link: link ?? { kind: 'none' } }); controllers.push(c); return c; }, controller = create();
  const enable = c => { c.activity(true); c.connectivity(true); };
  t.after(() => { for (const c of controllers) c.close(); closed++; });
  return { api, values, calls, hooks, config, create, controller, enable, setNow: value => { clock = value; }, clock: () => clock,
    record: () => JSON.parse(values.get(api.EMAIL_CONFIRMATION_STORAGE_KEY)), link: () => ({ kind: 'code', flow: JSON.parse(values.get(api.EMAIL_CONFIRMATION_STORAGE_KEY)).flow, code: 'SYNTHETIC_CODE' }) };
}
async function sent(f) { f.enable(f.controller); await f.controller.signUp(EMAIL, PASSWORD, PASSWORD); assert.equal(f.controller.model().phase, 'sent'); return f.link(); }
async function confirmed(f) { const link = await sent(f), c = f.create(link); f.enable(c); await c.continueConfirmation(); assert.equal(c.model().phase, 'confirmed'); return c; }

test('construction, listeners, lifecycle and close never send or hydrate automatically', async t => {
  const f = fixture(t); f.controller.subscribe(() => {}); f.enable(f.controller); f.controller.activity(false); f.controller.activity(true); f.controller.connectivity(false); f.controller.connectivity(true);
  await tick(); assert.equal(f.calls.length, 0); assert.equal(f.values.size, 0); f.controller.close(); await f.controller.signUp(EMAIL, PASSWORD, PASSWORD); await f.controller.resend(EMAIL); assert.equal(f.calls.length, 0);
});
test('capture scrubs valid and invalid callbacks while refusing duplicates, extra authority and implicit credentials', () => {
  const { captureConfirmationLink } = load(), flow = 'a'.repeat(64);
  for (const suffix of ['?code=x', '?flow=' + flow + '&code=x&code=y', '?flow=' + flow + '&code=x&next=/account', '#access_token=secret', '?error=secret', '?flow=' + flow + '&code=x#token']) {
    const scrub = []; assert.equal(captureConfirmationLink(ORIGIN + '/auth/confirm' + suffix, ORIGIN, p => scrub.push(p)).kind, 'invalid'); assert.deepEqual(scrub, ['/auth/confirm']);
  }
  assert.equal(captureConfirmationLink(ORIGIN + '/auth/confirm?flow=' + flow + '&code=x', ORIGIN, () => {}).kind, 'code');
  assert.equal(captureConfirmationLink(ORIGIN + '/auth/confirm', ORIGIN, () => {}).kind, 'none');
  assert.equal(captureConfirmationLink(PROVIDER + '/auth/confirm?flow=' + flow + '&code=x', ORIGIN, () => {}).kind, 'invalid');
  assert.equal(captureConfirmationLink(ORIGIN + '/auth/confirm?flow=' + flow + '&code=x', ORIGIN, () => { throw Error('history'); }).kind, 'invalid');
});
test('signup emits exact S256 request and only bounded verifier/navigation metadata persists', async t => {
  const f = fixture(t, { nextPath: '/great-books/hamlet?mode=read#chapter' }); await sent(f); const p = f.record(), call = f.calls[0];
  assert.equal(p.verifier.length, 43); assert.equal(p.expiresAt - p.createdAt, 3600000); assert.equal(call.body.code_challenge_method, 's256');
  assert.equal(call.body.code_challenge, createHash('sha256').update(p.verifier).digest('base64url')); assert.equal(new URL(call.url).searchParams.get('redirect_to'), ORIGIN + '/auth/confirm?flow=' + p.flow);
  assert.deepEqual(Object.keys(call.body).sort(), ['code_challenge', 'code_challenge_method', 'data', 'email', 'gotrue_meta_security', 'password']);
  assert.deepEqual(call.body.data, {}); assert.deepEqual(call.body.gotrue_meta_security, {}); assert.equal(p.nextPath, '/great-books/hamlet?mode=read#chapter');
  for (const secret of [EMAIL, PASSWORD, 'access_token', 'refresh_token']) assert(!JSON.stringify([...f.values]).includes(secret)); assert.equal(f.controller.model().nextPath, null);
});
test('resend replaces local flow and sends challenge with signup type without password or signup invocation', async t => {
  const f = fixture(t); const old = await sent(f); await f.controller.resend(EMAIL); const call = f.calls[1], p = f.record();
  assert.notEqual(old.flow, p.flow); assert.equal(new URL(call.url).pathname, '/auth/v1/resend'); assert.equal(call.body.type, 'signup');
  assert.deepEqual(Object.keys(call.body).sort(), ['code_challenge', 'code_challenge_method', 'email', 'gotrue_meta_security', 'type']);
  assert.equal(call.body.code_challenge, createHash('sha256').update(p.verifier).digest('base64url')); assert.equal(call.body.code_challenge_method, 's256');
});
test('actual SDK confirms exact email/signup token then fresh user, exposing no session or identity', async t => {
  const f = fixture(t, { nextPath: '/account/profile' }), snapshots = []; const link = await sent(f), c = f.create(link); c.subscribe(m => snapshots.push(m)); f.enable(c); await c.continueConfirmation();
  assert.equal(c.model().phase, 'confirmed'); assert.equal(c.model().nextPath, '/account/profile'); assert.match(c.model().message, /verified.*Sign in/); assert.equal(f.values.size, 0);
  assert.deepEqual(f.calls.map(c => c.init.method), ['POST', 'POST', 'GET']); assert.equal(f.calls[1].body.code_verifier.length, 43); assert.equal(f.calls[1].body.auth_code, 'SYNTHETIC_CODE');
  await c.continueConfirmation();
  for (const change of [() => c.activity(false), () => c.activity(true), () => c.connectivity(false), () => c.connectivity(true)]) {
    change(); await tick(); assert.equal(c.model().phase, 'confirmed'); assert.equal(c.model().nextPath, '/account/profile');
    assert.match(c.model().message, /verified.*Sign in/); assert.equal(c.model().canContinue, false); assert.equal(f.calls.length, 3); assert.equal(f.values.size, 0);
  }
  for (const secret of [EMAIL, PASSWORD, SUBJECT, 'NONISSUED_REFRESH', 'access_token', 'SYNTHETIC_CODE', f.calls[1].body.code_verifier]) assert(!JSON.stringify(snapshots).includes(secret));
  c.close(); assert.equal(c.model().phase, 'closed'); assert.equal(c.model().nextPath, null); await c.continueConfirmation(); assert.equal(f.calls.length, 3); assert.equal(f.values.size, 0);
});
test('unsafe return paths normalize and a tampered pending return path refuses before exchange', async t => {
  for (const nextPath of ['https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/%2fevil.invalid', '/bad\npath', 'x'.repeat(2049)]) {
    const f = fixture(t, { nextPath }), c = await confirmed(f); assert.equal(c.model().nextPath, '/dashboard');
  }
  const f = fixture(t), link = await sent(f), p = f.record(); p.nextPath = '//evil.invalid'; f.values.set(f.api.EMAIL_CONFIRMATION_STORAGE_KEY, JSON.stringify(p)); const c = f.create(link); f.enable(c); await c.continueConfirmation(); assert.equal(f.calls.length, 1);
});
test('auto-confirmed signup sessions and existing-account shaped responses are ignored without member or provider selection', async t => {
  for (const result of [{ access_token: jwt(), refresh_token: 'SECRET', user: { id: SUBJECT } }, { user: { id: SUBJECT, identities: [] } }, {}]) {
    const f = fixture(t); f.hooks.reply = call => reply(call.url, result); await sent(f); assert.equal(f.calls.length, 1); assert.match(f.controller.model().message, /If confirmation is needed/); assert(!JSON.stringify([...f.values]).includes('SECRET'));
  }
});
test('invalid email/password/confirmation cannot dispatch or replace existing pending storage', async t => {
  const f = fixture(t); await sent(f); const stored = JSON.stringify([...f.values]);
  for (const args of [['bad', PASSWORD, PASSWORD], [EMAIL, 'short', 'short'], [EMAIL, PASSWORD, 'different'], [EMAIL, 'x\n'.repeat(10), 'x\n'.repeat(10)], [EMAIL, 'x'.repeat(1025), 'x'.repeat(1025)]]) await f.controller.signUp(...args);
  await f.controller.resend('bad'); assert.equal(f.calls.length, 1); assert.equal(JSON.stringify([...f.values]), stored);
});
test('superseded or duplicate claimed links cannot exchange and two controllers claim once', async t => {
  const f = fixture(t), old = await sent(f); await f.controller.resend(EMAIL); const current = f.link(), stale = f.create(old); f.enable(stale); await stale.continueConfirmation(); assert.equal(f.calls.length, 2);
  const a = f.create(current), b = f.create(current); f.enable(a); f.enable(b); await Promise.all([a.continueConfirmation(), b.continueConfirmation()]);
  assert.equal(f.calls.filter(c => c.url.includes('/token?')).length, 1); assert.equal([a, b].filter(c => c.model().phase === 'confirmed').length, 1);
});
test('expired, future, extra-purpose, oversized and malformed pending state fail before exchange', async t => {
  for (const mode of ['expired', 'future', 'purpose', 'size', 'verifier', 'duration']) {
    const f = fixture(t), link = await sent(f), p = f.record();
    if (mode === 'expired') f.setNow(p.expiresAt); if (mode === 'future') p.createdAt += 1000; if (mode === 'purpose') p.purpose = 'recovery'; if (mode === 'verifier') p.verifier = 'a'.repeat(42); if (mode === 'duration') p.expiresAt++;
    f.values.set(f.api.EMAIL_CONFIRMATION_STORAGE_KEY, mode === 'size' ? 'x'.repeat(4097) : JSON.stringify(p)); const c = f.create(link); f.enable(c); await c.continueConfirmation(); assert.equal(f.calls.length, 1); assert.notEqual(c.model().phase, 'confirmed');
  }
});
test('wrong-purpose, malformed, mixed, wrong-subject and expired token claims refuse before fresh user', async t => {
  for (const claims of [{ amr: [{ method: 'recovery', timestamp: 1 }] }, { amr: [{ method: 'email', timestamp: 1 }] }, { amr: [{ method: 'signup', timestamp: 1 }] }, { amr: [{ method: 'oauth', timestamp: 1 }] }, { amr: [] }, { amr: [{ method: ['email/signup'], timestamp: 1 }] }, { amr: [{ method: 'email/signup', timestamp: 1 }, { method: 'recovery', timestamp: 1 }] }, { sub: OTHER }, { exp: 1 }, { amr: [{ method: 'email/signup', timestamp: Number.MAX_SAFE_INTEGER }] }]) {
    const f = fixture(t), link = await sent(f); f.hooks.reply = async (call, r) => { const body = await r.json(); if (call.url.includes('/token?')) body.access_token = jwt(claims); return reply(call.url, body); };
    const c = f.create(link); f.enable(c); await c.continueConfirmation(); assert.notEqual(c.model().phase, 'confirmed'); assert.equal(f.calls.length, 2);
  }
});
test('fresh user mismatch, malformed sessions and explicit JWT expiry disagreement cannot confirm', async t => {
  for (const mode of ['user', 'refresh', 'expiry', 'tokenbound']) {
    const f = fixture(t), link = await sent(f); f.hooks.reply = async (call, r) => { const body = await r.json(); if (mode === 'user' && call.url.endsWith('/user')) body.user.id = OTHER;
      if (call.url.includes('/token?')) { if (mode === 'refresh') delete body.refresh_token; if (mode === 'expiry') body.expires_at = Math.floor(Date.now() / 1000) + 3000; if (mode === 'tokenbound') body.access_token += '='.repeat(16385); } return reply(call.url, body); };
    const c = f.create(link); f.enable(c); await c.continueConfirmation(); assert.notEqual(c.model().phase, 'confirmed');
  }
});
test('unknown requests and rate limits never replay automatically or expose raw provider errors', async t => {
  for (const mode of ['throw', '429', 'redirect', 'url', 'size']) {
    const f = fixture(t); f.hooks.reply = call => { if (mode === 'throw') throw Error('PRIVATE_PROVIDER_SECRET'); const r = reply(mode === 'url' ? PROVIDER + '/wrong' : call.url, mode === 'size' ? { padding: 'x'.repeat(262145) } : { error_description: 'PRIVATE_PROVIDER_SECRET' }, mode === '429' ? 429 : 200); if (mode === 'redirect') Object.defineProperty(r, 'redirected', { value: true }); return r; };
    f.enable(f.controller); await f.controller.signUp(EMAIL, PASSWORD, PASSWORD); assert.equal(f.calls.length, 1); assert.equal(f.controller.model().phase, 'unknown'); assert(!JSON.stringify(f.controller.model()).includes('PRIVATE_PROVIDER_SECRET')); await tick(); assert.equal(f.calls.length, 1);
  }
});
test('a full-operation deadline includes crypto and refuses late send after supersession', async t => {
  const hold = deferred(); let digests = 0; const crypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: { async digest(...args) { if (++digests === 1) await hold.promise; return webcrypto.subtle.digest(...args); } } };
  const f = fixture(t, { crypto }); f.enable(f.controller); const old = f.controller.signUp(EMAIL, PASSWORD, PASSWORD); await tick(); const newer = f.create(); f.enable(newer); await newer.resend(EMAIL); hold.resolve(); await old;
  assert.equal(f.calls.length, 1); assert.equal(new URL(f.calls[0].url).pathname, '/auth/v1/resend'); assert.equal(newer.model().phase, 'sent');
});
test('late exchange body past the deadline cannot verify or regain authority after reconnect', async t => {
  const f = fixture(t, { timeoutMs: 30 }), link = await sent(f), hold = deferred();
  f.hooks.reply = async (call, r) => { if (!call.url.includes('/token?')) return r; const body = await r.text(); const response = new Response(new ReadableStream({ async start(c) { await hold.promise; c.enqueue(new TextEncoder().encode(body)); c.close(); } })); Object.defineProperty(response, 'url', { value: call.url }); return response; };
  const c = f.create(link); f.enable(c); await c.continueConfirmation(); assert.equal(c.model().phase, 'unknown'); c.connectivity(false); c.connectivity(true); hold.resolve(); await tick(); assert.notEqual(c.model().phase, 'confirmed'); assert.equal(f.calls.length, 2); assert.equal(f.values.size, 0);
});
test('offline retirement during exact-user proof discards late completion and consumed links stay consumed', async t => {
  const f = fixture(t), link = await sent(f), hold = deferred(); f.hooks.reply = (call, r) => call.url.endsWith('/user') ? hold.promise.then(() => r) : r;
  const c = f.create(link); f.enable(c); const action = c.continueConfirmation(); await tick(); c.connectivity(false); c.connectivity(true); await action; hold.resolve(); await tick(); assert.notEqual(c.model().phase, 'confirmed'); assert.equal(c.model().canContinue, false); assert.equal(f.values.size, 0);
});
test('reentrant observers and stale closed controllers cannot allocate work', async t => {
  const f = fixture(t); f.enable(f.controller); f.controller.subscribe(m => { if (m.busy) f.controller.close(); }); await f.controller.signUp(EMAIL, PASSWORD, PASSWORD); assert.equal(f.calls.length, 0); assert.equal(f.values.size, 0);
});
test('missing secure crypto, unsafe origin and bad bounds refuse before pending storage', t => {
  const f = fixture(t); for (const replacement of [{ crypto: {} }, { providerOrigin: 'http://provider.invalid' }, { providerOrigin: PROVIDER + '/path' }, { origin: ORIGIN + '/path' }, { timeoutMs: 0 }, { publishableKey: 'bad key' }]) assert.throws(() => f.api.createEmailSignup({ ...f.config, link: { kind: 'none' }, ...replacement })); assert.equal(f.values.size, 0);
});
test.after(() => { assert.equal(fixtures, closed); console.log('EMAIL_SIGNUP_PROOF ' + JSON.stringify({ fixtures, closed, providerCalls: 0, syntheticOnly: true, runtimeHashes })); });
