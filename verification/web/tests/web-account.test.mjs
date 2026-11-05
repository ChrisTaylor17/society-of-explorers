import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { actualCookies, loadWebAccount, runtimeBindings, sourceBindings } from './web-account-loader.mjs';

const ORIGIN = 'https://account.invalid', PROVIDER = 'https://provider.invalid', KEY = 'sb_publishable_NONISSUED_WEB_ACCOUNT';
const EMAIL = 'synthetic@example.invalid', PASSWORD = 'SYNTHETIC_PASSWORD_ONLY', SUBJECT = '73111111-1111-4111-8111-111111111111';
const OTHER = '73222222-2222-4222-8222-222222222222', MEMBER = '73333333-3333-4333-8333-333333333333';
const COOKIE = 'sb-provider-auth-token', INTENT_COOKIE = 'soe_auth_intent', PKCE_COOKIE = 'soe_auth_pkce_intent';
const EPOCH = Math.floor(Date.now() / 1000);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(done => setImmediate(done));
function jwt(claims = {}) {
  return [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: SUBJECT,
    exp: EPOCH + 3600, amr: [{ method: 'password', timestamp: EPOCH }], ...claims })).toString('base64url'), 'NONISSUED_SIGNATURE'].join('.');
}
function reply(url, body, status = 200) {
  const result = new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  Object.defineProperty(result, 'url', { value: url }); return result;
}
let fixtures = 0, closed = 0, cleanupObservers = 0, cleanupTimers = 0;
function fixture(t, { timeoutMs = 1000, nextPath = '/account/profile', crypto = webcrypto, ethereum } = {}) {
  const { api, timers } = loadWebAccount(), calls = [], writes = [], navigations = [], external = [], observers = new Set(), hooks = {}, jar = new Map();
  let current = null, reads = 0, clock = Date.now(), controller;
  const config = { origin: ORIGIN, providerOrigin: PROVIDER, publishableKey: KEY, nextPath, crypto, timeoutMs, now: () => clock, ethereum,
    cookies: {
      getAll() { reads++; hooks.read?.(reads); return [...jar].map(([name, value]) => ({ name, value })); },
      set(name, value, options) { hooks.write?.({ name, value, options }); writes.push({ name, value, options }); if (options.maxAge === 0) jar.delete(name); else jar.set(name, value); },
    },
    intent: { begin() { current = randomUUID(); jar.set(INTENT_COOKIE, current); return current; }, current(id) { return current === id; },
      retire(id) { if (current === id) { current = randomUUID(); jar.set(INTENT_COOKIE, current); } return current; } },
    subscribe(listener) { observers.add(listener); return () => observers.delete(listener); },
    notify() { for (const fn of observers) fn(); hooks.notify?.(); },
    navigate(value) { navigations.push(value); }, externalNavigate(value) { external.push(value); },
    async fetch(url, init) {
      const headers = new Headers(init.headers), provider = url.startsWith(PROVIDER);
      assert.equal(init.credentials, provider ? 'omit' : 'same-origin'); assert.equal(init.redirect, 'error');
      assert.equal(init.referrerPolicy, 'no-referrer'); assert.equal(init.cache, 'no-store'); assert(init.signal);
      if (provider) { assert.equal(headers.get('apikey'), KEY); assert.equal(headers.get('Cookie'), null); }
      const call = { url, init, headers, body: init.body && JSON.parse(init.body) }; calls.push(call);
      let body;
      if (url === PROVIDER + '/auth/v1/token?grant_type=password') body = { access_token: jwt(), refresh_token: 'NONISSUED_REFRESH', token_type: 'bearer', expires_in: 3600, user: { id: SUBJECT, privateMetadata: 'DROP_ME' } };
      else if (url === PROVIDER + '/auth/v1/user') body = { id: SUBJECT, email: EMAIL, user_metadata: { secret: 'DROP_ME_TOO' } };
      else if (url === ORIGIN + '/api/auth/provider') body = { selected: 'supabase', subject: SUBJECT, intent: call.body.intent };
      else if (url === ORIGIN + '/api/auth/member') body = { member: { id: MEMBER, supabase_auth_id: SUBJECT }, auth: { provider: 'supabase', subject: SUBJECT } };
      else if (url === ORIGIN + '/api/auth/ensure-member') body = { member: { id: MEMBER, supabase_auth_id: SUBJECT } };
      else throw Error('Unexpected synthetic request');
      return hooks.reply ? hooks.reply(call, reply(url, body)) : reply(url, body);
    },
  };
  controller = api.createWebAccount(config); fixtures++;
  t.after(() => { controller.close(); assert.equal(observers.size, 0); assert.equal(timers.size, 0); cleanupObservers += observers.size; cleanupTimers += timers.size; closed++; });
  const enable = () => { controller.activity(true); controller.connectivity(true); };
  return { api, config, controller, calls, writes, jar, hooks, navigations, external, timers, observers, enable,
    current: () => current, setNow(value) { clock = value; }, replaceIntent() { current = randomUUID(); jar.set(INTENT_COOKIE, current); return current; },
    change() { for (const fn of observers) fn(); },
    async stored(key = COOKIE) { return actualCookies.createStorageFromOptions({ cookieEncoding: 'base64url', cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll() { throw Error('Read only'); } } }, false).storage.getItem(key); },
  };
}
const login = async f => { f.enable(); await f.controller.signIn(EMAIL, PASSWORD); };

test('mount, enable, notifications and closure do not hydrate or provision an account', async t => {
  const f = fixture(t); f.controller.subscribe(() => {}); f.enable(); f.change(); f.controller.activity(false); f.controller.activity(true);
  f.controller.connectivity(false); f.controller.connectivity(true); await tick(); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
  f.controller.close(); await f.controller.signIn(EMAIL, PASSWORD); await f.controller.google(); await f.controller.wallet(); assert.equal(f.calls.length, 0); assert.equal(f.current(), null);
});
test('actual password SDK verifies the exact returned token before SSR cookie commit and canonical selection', async t => {
  const f = fixture(t), states = []; f.controller.subscribe(value => states.push(value));
  f.hooks.reply = (call, response) => { if (call.url === PROVIDER + '/auth/v1/user') { assert.equal(f.writes.length, 0); assert.equal(call.headers.get('Authorization'), 'Bearer ' + jwt()); } return response; };
  await login(f); assert.equal(f.controller.model().phase, 'accepted'); assert.deepEqual(f.navigations, ['/account/profile']);
  assert.deepEqual(f.calls.map(call => new URL(call.url).pathname), ['/auth/v1/token', '/auth/v1/user', '/api/auth/provider', '/api/auth/member']);
  assert.deepEqual(f.calls[0].body, { email: EMAIL, password: PASSWORD, gotrue_meta_security: {} });
  assert.deepEqual(f.calls[2].body, { provider: 'supabase', expectedSubject: SUBJECT, intent: f.current() });
  const stored = JSON.parse(await f.stored()); assert.equal(stored.user.id, SUBJECT); assert.equal(stored.access_token, jwt());
  assert.deepEqual(Object.keys(stored.user), ['id']); assert(f.writes.every(write => write.options.secure === true && write.options.sameSite === 'lax' && write.options.path === '/'));
  for (const secret of [EMAIL, PASSWORD, SUBJECT, 'NONISSUED_REFRESH', 'DROP_ME']) assert(!JSON.stringify(states).includes(secret));
  const acceptedIntent = f.current(); f.controller.close(); assert.equal(f.current(), acceptedIntent);
});
test('member provisioning is deliberate, follows selection and is freshly checked afterward', async t => {
  const f = fixture(t); let seen = 0;
  f.hooks.reply = (call, response) => call.url.endsWith('/member') && seen++ === 0 ? reply(call.url, { session: 'signed_out' }, 401) : response;
  await login(f); assert.equal(f.controller.model().phase, 'accepted'); assert.deepEqual(f.calls.map(call => new URL(call.url).pathname), ['/auth/v1/token', '/auth/v1/user', '/api/auth/provider', '/api/auth/member', '/api/auth/ensure-member', '/api/auth/member']);
  assert.deepEqual(f.calls[4].body, { supabaseAuthId: SUBJECT, displayName: 'Explorer' });
});
test('input bounds refuse without allocating an intent or network operation', async t => {
  const f = fixture(t); f.enable();
  for (const args of [['bad', PASSWORD], [EMAIL, ''], [EMAIL, 'x'.repeat(1025)], ['x'.repeat(321) + '@x.invalid', PASSWORD]]) await f.controller.signIn(...args);
  assert.equal(f.current(), null); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
});
test('closed, blurred, offline and provider-changed password replies cannot publish or select', async t => {
  for (const boundary of ['password', 'user']) for (const retirement of ['close', 'blur', 'offline', 'provider']) {
    const f = fixture(t), hold = deferred(); f.enable();
    f.hooks.reply = (call, response) => call.url.includes(boundary === 'password' ? '/token?' : '/user') ? hold.promise.then(() => response) : response;
    const work = f.controller.signIn(EMAIL, PASSWORD); await tick();
    if (retirement === 'close') f.controller.close(); if (retirement === 'blur') f.controller.activity(false); if (retirement === 'offline') f.controller.connectivity(false); if (retirement === 'provider') { f.replaceIntent(); f.change(); }
    hold.resolve(); await work; assert.equal(f.writes.length, 0); assert.equal(f.navigations.length, 0); assert.equal(f.calls.filter(call => call.url.startsWith(ORIGIN)).length, 0);
  }
});
test('delayed own notification does not retire the still-current sign-in intent', async t => {
  const f = fixture(t), hold = deferred(); f.enable();
  f.hooks.reply = (call, response) => call.url.includes('/token?') ? hold.promise.then(() => response) : response;
  const work = f.controller.signIn(EMAIL, PASSWORD), intent = f.current(); await tick(); f.change();
  assert.equal(f.current(), intent); assert.equal(f.controller.model().busy, true); hold.resolve(); await work;
  assert.equal(f.controller.model().phase, 'accepted'); assert.deepEqual(f.navigations, ['/account/profile']);
});
test('SSR await between cookie enumeration and setAll cannot publish retired credentials', async t => {
  for (const retirement of ['close', 'blur', 'offline', 'intent']) {
    const f = fixture(t); let retired = false;
    f.hooks.read = () => { if (!retired) { retired = true; queueMicrotask(() => { if (retirement === 'close') f.controller.close(); if (retirement === 'blur') f.controller.activity(false); if (retirement === 'offline') f.controller.connectivity(false); if (retirement === 'intent') f.replaceIntent(); }); } };
    await login(f); assert.equal(f.writes.length, 0); assert.equal(f.navigations.length, 0); assert.equal(f.calls.length, 2);
  }
});
test('fresh-user mismatch and wrong-purpose or malformed candidate never reach shared cookies', async t => {
  for (const mutation of ['user', 'subject', 'recovery', 'signup', 'mixed', 'missing', 'expired', 'futureAmr', 'tokenType', 'refresh', 'expiry']) {
    const f = fixture(t);
    f.hooks.reply = async (call, response) => {
      const body = await response.json();
      if (call.url.endsWith('/user') && mutation === 'user') body.id = OTHER;
      if (call.url.includes('/token?')) {
        if (mutation === 'subject') body.access_token = jwt({ sub: OTHER });
        if (mutation === 'recovery') body.access_token = jwt({ amr: [{ method: 'recovery', timestamp: 1 }] });
        if (mutation === 'signup') body.access_token = jwt({ amr: [{ method: 'email/signup', timestamp: 1 }] });
        if (mutation === 'mixed') body.access_token = jwt({ amr: [{ method: 'password', timestamp: 1 }, { method: 'recovery', timestamp: 1 }] });
        if (mutation === 'missing') body.access_token = jwt({ amr: [] });
        if (mutation === 'expired') body.access_token = jwt({ exp: 1 });
        if (mutation === 'futureAmr') body.access_token = jwt({ amr: [{ method: 'password', timestamp: Number.MAX_SAFE_INTEGER }] });
        if (mutation === 'tokenType') body.token_type = 'other';
        if (mutation === 'refresh') body.refresh_token = '';
        if (mutation === 'expiry') body.expires_at = 1;
      }
      return reply(call.url, body);
    };
    await login(f); assert.equal(f.writes.length, 0); assert.equal(f.navigations.length, 0); assert.equal(f.calls.length, mutation === 'user' ? 2 : 1);
  }
});
test('redirected, non-success, wrong-url, malformed and oversized provider responses are rejected', async t => {
  for (const mutation of ['redirected', 'status', 'url', 'malformed', 'size']) {
    const f = fixture(t);
    f.hooks.reply = call => {
      if (mutation === 'malformed') { const response = new Response('{'); Object.defineProperty(response, 'url', { value: call.url }); return response; }
      const response = reply(mutation === 'url' ? PROVIDER + '/other' : call.url, mutation === 'size' ? { value: 'x'.repeat(262145) } : {}, mutation === 'status' ? 429 : 200);
      if (mutation === 'redirected') Object.defineProperty(response, 'redirected', { value: true }); return response;
    };
    await login(f); assert.equal(f.writes.length, 0); assert.equal(f.navigations.length, 0); assert.equal(f.calls.length, 1);
  }
});
test('cookie readback disagreement prevents provider selection', async t => {
  const f = fixture(t); f.hooks.read = count => { if (count === 2) f.jar.set(COOKIE, 'base64-' + Buffer.from('{}').toString('base64url')); };
  await login(f); assert(f.writes.length > 0); assert.equal(f.calls.length, 2); assert.equal(f.navigations.length, 0);
});
test('held selector or member replies cannot navigate after retirement or supersede a newer intent', async t => {
  for (const boundary of ['/api/auth/provider', '/api/auth/member']) {
    const f = fixture(t), hold = deferred(); f.enable();
    f.hooks.reply = (call, response) => call.url.endsWith(boundary) ? hold.promise.then(() => response) : response;
    const work = f.controller.signIn(EMAIL, PASSWORD); await tick(); assert(f.calls.some(call => call.url.endsWith(boundary)));
    const newer = f.replaceIntent(); f.change(); hold.resolve(); await work; assert.equal(f.current(), newer); assert.equal(f.navigations.length, 0);
  }
});
test('malformed selector or member identity proofs cannot be accepted', async t => {
  for (const mutation of ['selectorSubject', 'selectorProvider', 'selectorIntent', 'memberSubject', 'memberProvider', 'memberId', 'memberOwner']) {
    const f = fixture(t);
    f.hooks.reply = async (call, response) => { const body = await response.json();
      if (call.url.endsWith('/provider')) { if (mutation === 'selectorSubject') body.subject = OTHER; if (mutation === 'selectorProvider') body.selected = 'wallet'; if (mutation === 'selectorIntent') body.intent = OTHER; }
      if (call.url.endsWith('/member')) { if (mutation === 'memberSubject') body.auth.subject = OTHER; if (mutation === 'memberProvider') body.auth.provider = 'wallet'; if (mutation === 'memberId') body.member.id = 'invalid'; if (mutation === 'memberOwner') body.member.supabase_auth_id = OTHER; }
      return reply(call.url, body);
    };
    await login(f); assert.equal(f.navigations.length, 0); assert.notEqual(f.controller.model().phase, 'accepted');
  }
});
test('timeout retires only this intent and a late unabortable provider reply stays denied', async t => {
  const f = fixture(t, { timeoutMs: 10 }), hold = deferred(); f.hooks.reply = (_call, response) => hold.promise.then(() => response); f.enable();
  const work = f.controller.signIn(EMAIL, PASSWORD), started = f.current(); await new Promise(done => setTimeout(done, 30));
  assert.notEqual(f.current(), started); assert.equal(f.controller.model().busy, false); hold.resolve(); await work; assert.equal(f.writes.length, 0); assert.equal(f.navigations.length, 0);
});
test('actual Google SDK publishes only S256 verifier and initiating intent before explicit redirect', async t => {
  const f = fixture(t); f.enable(); await f.controller.google(); assert.equal(f.controller.model().phase, 'leaving');
  assert.equal(f.calls.length, 0); assert.equal(f.navigations.length, 0); assert.equal(f.external.length, 1); assert.equal(await f.stored(), null);
  const url = new URL(f.external[0]), verifier = JSON.parse(await f.stored(COOKIE + '-code-verifier'));
  assert.match(verifier, /^[0-9a-f]{112}$/); assert.equal(url.origin, PROVIDER); assert.equal(url.pathname, '/auth/v1/authorize');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url')); assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  const callback = new URL(url.searchParams.get('redirect_to')); assert.equal(callback.origin, ORIGIN); assert.equal(callback.pathname, '/auth/callback'); assert.equal(callback.searchParams.get('intent'), f.current());
  assert.equal(callback.searchParams.get('next'), '/account/profile'); assert.equal(f.jar.get(PKCE_COOKIE), f.current());
  const intent = f.current(); f.controller.close(); assert.equal(f.current(), intent);
});
test('Google retirement during SSR await cannot publish a verifier or redirect', async t => {
  const f = fixture(t); let retired = false; f.hooks.read = () => { if (!retired) { retired = true; queueMicrotask(() => f.controller.activity(false)); } };
  f.enable(); await f.controller.google(); assert.equal(f.writes.length, 0); assert.equal(f.external.length, 0);
});
test('Google PKCE binding write failure cannot redirect', async t => {
  const f = fixture(t); f.hooks.write = write => { if (write.name === PKCE_COOKIE) throw Error('Synthetic cookie rejection'); };
  f.enable(); await f.controller.google(); assert.equal(f.external.length, 0); assert.equal(f.controller.model().phase, 'unavailable');
});
test('reentrant start observers cannot send or install wallet listeners after closure', async t => {
  for (const kind of ['password', 'google', 'wallet']) {
    const registered = new Set(), ethereum = { request() { throw Error('No prompt permitted'); }, on(event, fn) { registered.add(fn); }, removeListener(event, fn) { registered.delete(fn); } };
    const f = fixture(t, { ethereum }); f.enable(); f.controller.subscribe(value => { if (value.busy) f.controller.close(); });
    if (kind === 'password') await f.controller.signIn(EMAIL, PASSWORD); if (kind === 'google') await f.controller.google(); if (kind === 'wallet') await f.controller.wallet();
    assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0); assert.equal(f.external.length, 0); assert.equal(registered.size, 0);
  }
});
test('accepted and leaving observers cannot navigate after synchronous closure or newer intent', async t => {
  for (const kind of ['password', 'google']) for (const retirement of ['close', 'intent']) {
    const f = fixture(t); f.enable(); f.controller.subscribe(value => { if (value.phase === 'accepted' || value.phase === 'leaving') { if (retirement === 'close') f.controller.close(); else f.replaceIntent(); } });
    if (kind === 'password') await f.controller.signIn(EMAIL, PASSWORD); else await f.controller.google();
    assert.equal(f.navigations.length, 0); assert.equal(f.external.length, 0);
  }
});
test('unsafe requested destinations normalize to the dashboard', async t => {
  for (const nextPath of ['https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/%2fevil.invalid', '/bad\npath']) {
    const f = fixture(t, { nextPath }); await login(f); assert.deepEqual(f.navigations, ['/dashboard']);
  }
});
test('invalid provider configuration and missing secure crypto fail before any work', t => {
  const f = fixture(t); for (const replacement of [{ crypto: {} }, { origin: ORIGIN + '/path' }, { providerOrigin: 'http://provider.invalid' }, { publishableKey: 'bad key' }, { timeoutMs: 0 }]) assert.throws(() => f.api.createWebAccount({ ...f.config, ...replacement }));
  assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
});
test.after(() => {
  assert.equal(fixtures, closed);
  console.log('WEB_ACCOUNT_PROOF ' + JSON.stringify({ fixtures, closed, cleanupObservers, cleanupTimers, providerCalls: 0, syntheticOnly: true, sourceBindings, runtimeHashes: runtimeBindings() }));
});
