// Actual cached AuthClient and actual TS controller/native ports. Native storage,
// provider replies and hardware delivery are explicit synthetic doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')), 'Startup network denial required');
for (const extension of ['.js', '.json']) {
  const original = Module._extensions[extension];
  Module._extensions[extension] = (module, file) => {
    const s = fs.lstatSync(file); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks), 'Refuse linked/offloaded dependency');
    return original(module, file);
  };
}
const { sourceLoader } = await import('./load-source.mjs');
const ORIGIN = 'https://owned-member.invalid', PROVIDER = 'https://owned-provider.invalid';
const KEY = 'synthetic-owned-auth', PUBLIC = 'sb_publishable_NONISSUED_SYNTHETIC_PUBLIC_KEY';
const SUBJECT = '73111111-1111-4111-8111-111111111111', OTHER = '73222222-2222-4222-8222-222222222222';
const EMAIL = 'synthetic-existing@example.invalid', PASSWORD = 'SYNTHETIC_PASSWORD_NOT_ISSUED';
const TOKEN = 'NONISSUED_ACCESS_TOKEN', REFRESH = 'NONISSUED_REFRESH_TOKEN';
const SESSION = '44444444-4444-4444-8444-444444444444';
const LOGOUT = '/auth/v1/logout?scope=local';
const jwt = (claims = {}) => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: SUBJECT, session_id: SESSION, ...claims })).toString('base64url') + '.synthetic';
const epoch = n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tick = () => new Promise(resolve => setImmediate(resolve));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const session = (patch = {}) => ({ access_token: TOKEN, refresh_token: REFRESH, expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600, token_type: 'bearer', user: { id: SUBJECT, email: EMAIL, user_metadata: { private: 'PRIVATE_PROVIDER_METADATA' } }, ...patch });
async function fixture(t, { saved, timeoutMs = 1000 } = {}) {
  const load = sourceLoader(), values = new Map(saved === undefined ? [] : [['session', typeof saved === 'string' ? saved : JSON.stringify(saved)]]);
  const calls = [], providerCalls = [], handles = new Map(), hooks = {};
  let generation = 1, handleNumber = 0, tokenValue = TOKEN, user = SUBJECT;
  const check = value => { if (value !== epoch(generation)) throw Error('Synthetic stale native generation'); };
  const bridge = {
    async capabilities() { calls.push('capabilities'); return { version: 2, origin: ORIGIN, storageKey: KEY, storageGeneration: epoch(generation), redirectPolicy: 'reject-before-send', storagePolicy: 'os-protected',
      authPolicy: 'supabase-password-v1', providerOrigin: PROVIDER, publishableKey: PUBLIC }; },
    async begin(value) { check(value); const id = 'owned_handle_' + (++handleNumber); handles.set(id, value); calls.push('begin'); return id; },
    async send() { throw Error('No member API in SDK unit proof'); },
    async sendAuth(id, request) {
      check(handles.get(id)); providerCalls.push({ ...request }); calls.push('provider');
      const endpoint = request.url.slice(PROVIDER.length);
      let status = 200;
      let body;
      if (endpoint === '/auth/v1/token?grant_type=password') body = session({ access_token: tokenValue, user: { id: user, email: EMAIL } });
      else if (endpoint === '/auth/v1/token?grant_type=refresh_token') body = session({ access_token: tokenValue, user: { id: user, email: EMAIL } });
      else if (endpoint === '/auth/v1/user') { assert.equal(request.bearer, tokenValue); body = { user: { id: user, email: EMAIL, user_metadata: { private: 'PRIVATE_PROVIDER_METADATA' } } }; }
      else if (endpoint === LOGOUT) { assert.equal(request.bearer, tokenValue); assert.equal(request.body, undefined); status = 204; }
      else throw Error('Unexpected synthetic provider endpoint');
      const reply = { status, url: request.url, redirected: false, body: status === 204 ? '' : JSON.stringify(body) };
      return hooks.provider ? hooks.provider(reply, request) : reply;
    },
    async cancel(id) { calls.push('cancel'); handles.delete(id); },
    async read(slot, value) { check(value); calls.push('read'); const data = values.get(slot) ?? null; return hooks.read ? hooks.read(data) : data; },
    async write(slot, text, value) { calls.push('write-start'); if (hooks.write) await hooks.write(); check(value); values.set(slot, text); calls.push('write-committed'); if (hooks.writeReply) await hooks.writeReply(); },
    async remove(slot, value) { check(value); calls.push('remove'); values.delete(slot); },
    async resetAccountStorage(value) { check(value); calls.push('reset'); const previousGeneration = epoch(generation++); values.clear(); const reply = { previousGeneration, generation: epoch(generation), cleared: true }; return hooks.reset ? hooks.reset(reply) : reply; },
  };
  const createPorts = load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts;
  const create = load('platforms/native/src/auth/owned-auth.ts').createOwnedNativeAuth;
  const controllers = [];
  async function prepare() {
    const ports = await createPorts(bridge, { origin: ORIGIN, providerOrigin: PROVIDER, publishableKey: PUBLIC, storageKey: KEY, timeoutMs });
    const controller = create({ ports, publishableKey: PUBLIC, timeoutMs }); controllers.push(controller); return { ports, controller };
  }
  const first = await prepare();
  t.after(() => { for (const controller of controllers) controller.close(); });
  return { ...first, create, prepare, load, calls, providerCalls, values, hooks, setToken(value) { tokenValue = value; }, setSubject(value) { user = value; },
    enable(controller = first.controller) { controller.activity(true); controller.connectivity(true); },
    count(name) { return calls.filter(value => value === name).length; } };
}
const login = async f => { f.enable(); await f.controller.signIn(EMAIL, PASSWORD); assert.equal(f.controller.model().ready, true); };
const paths = f => f.providerCalls.map(call => call.url.slice(PROVIDER.length));

test('only exact verified same-subject session tokens can revoke one phone session', async t => {
  for (const value of [TOKEN, jwt({ session_id: undefined }), jwt({ session_id: '00000000-0000-0000-0000-000000000000' }),
    jwt({ Session_Id: '' }), jwt({ '\u017fession_id': '' }), jwt({ sub: OTHER })]) {
    const f = await fixture(t);
    f.setToken(value);
    await login(f);
    assert.equal(f.controller.model().canSignOut, false);
    await f.controller.signOutDevice();
    assert.deepEqual(paths(f), ['/auth/v1/token?grant_type=password', '/auth/v1/user']);
    assert.equal(f.count('reset'), 0);
    assert.equal(f.controller.model().canClear, true);
  }
});

test('explicit phone sign-out retires authority before sending exactly one local logout and confirms durable clearing', async t => {
  const f = await fixture(t), pending = gate(), access = jwt();
  f.setToken(access);
  await login(f);
  assert.equal(f.controller.model().canSignOut, true);
  f.hooks.provider = (reply, request) => request.url.endsWith(LOGOUT) ? pending.promise.then(() => reply) : reply;
  const first = f.controller.signOutDevice();
  assert.equal(f.controller.model().phase, 'signing_out');
  assert.equal((await f.controller.auth.getSession()).data.session, null);
  await f.controller.signOutDevice();
  await f.controller.resume();
  assert.equal(f.count('reset'), 0);
  pending.resolve();
  await first;
  assert.equal(paths(f).filter(path => path === LOGOUT).length, 1);
  assert.equal(f.providerCalls.at(-1).bearer, access);
  assert.equal(f.values.size, 0);
  assert.equal(f.count('reset'), 1);
  assert.match(f.controller.model().message, /^Signed out of this phone/);
  const next = await f.prepare();
  f.enable(next.controller);
  await next.controller.resume();
  assert.equal(next.controller.model().ready, false);
  assert.equal(paths(f).length, 3);
});

test('wrong or missing provider acknowledgement still clears saved sign-in and does not claim revocation', async t => {
  for (const transform of [reply => ({ ...reply, status: 403 }), reply => ({ ...reply, status: 200 }),
    reply => ({ ...reply, redirected: true }), reply => ({ ...reply, url: PROVIDER + '/auth/v1/user' }),
    () => new Promise(() => {})]) {
    const f = await fixture(t, { timeoutMs: 200 });
    f.setToken(jwt());
    await login(f);
    f.hooks.provider = (reply, request) => request.url.endsWith(LOGOUT) ? transform(reply) : reply;
    await f.controller.signOutDevice();
    assert.equal(paths(f).filter(path => path === LOGOUT).length, 1);
    assert.equal(f.values.size, 0);
    assert.equal(f.count('reset'), 1);
    assert.equal(f.controller.model().message, 'Saved sign-in cleared. Online sign-out is unconfirmed.');
  }
});

test('lifecycle loss before or during logout fences transmission and late acknowledgement', async t => {
  for (const beforeSend of [true, false]) {
    const f = await fixture(t), held = gate();
    f.setToken(jwt());
    await login(f);
    let retired = false;
    if (beforeSend) f.controller.subscribe(model => {
      if (model.phase !== 'signing_out' || retired) return;
      retired = true;
      f.controller.activity(false);
      f.controller.activity(true);
    });
    else f.hooks.provider = (reply, request) => request.url.endsWith(LOGOUT) ? held.promise.then(() => reply) : reply;
    const action = f.controller.signOutDevice();
    if (!beforeSend) {
      while (!paths(f).includes(LOGOUT)) await tick();
      f.controller.connectivity(false);
    }
    await action;
    held.resolve();
    await tick();
    assert.equal(paths(f).filter(path => path === LOGOUT).length, beforeSend ? 0 : 1);
    assert.equal(f.values.size, 0);
    assert.equal(f.controller.model().ready, false);
    assert.equal(f.controller.model().message, 'Saved sign-in cleared. Online sign-out is unconfirmed.');
  }
});

test('provider acceptance with an invalid storage receipt keeps the phone outcome unconfirmed', async t => {
  const f = await fixture(t);
  f.setToken(jwt());
  await login(f);
  f.hooks.reset = receipt => ({ ...receipt, cleared: false });
  await f.controller.signOutDevice();
  assert.equal(f.controller.model().phase, 'clear_unknown');
  assert.equal(f.controller.model().canResume, false);
  assert.equal(f.controller.model().canClear, false);
  assert.match(f.controller.model().message, /Online sign-out accepted. Device clearing is unconfirmed/);
  assert.equal(paths(f).filter(path => path === LOGOUT).length, 1);
});

test('factory, subscription, lifecycle activation and cached sessions perform no storage or provider work', async t => {
  for (const cached of [undefined, session(), session({ expires_at: 1 }), { access_token: TOKEN, refresh_token: REFRESH, expires_at: 1 }]) {
    const f = await fixture(t, { saved: cached }), snapshots = [], off = f.controller.subscribe(value => snapshots.push(value));
    assert.equal(f.controller.model().active, false); f.enable(); await tick();
    assert.equal((await f.controller.auth.getSession()).data.session, null); assert.deepEqual(paths(f), []); assert.equal(f.count('read'), 0);
    f.controller.activity(false); f.controller.activity(true); f.controller.connectivity(false); f.controller.connectivity(true); await tick();
    assert.equal(f.count('read'), 0); assert.deepEqual(paths(f), []); off(); f.controller.close();
  }
});
test('actual SDK password login and exact-token user proof precede protected persistence; model contains no credentials or identity', async t => {
  const f = await fixture(t), snapshots = []; f.controller.subscribe(value => snapshots.push(value)); await login(f);
  assert.deepEqual(paths(f), ['/auth/v1/token?grant_type=password', '/auth/v1/user']);
  assert(f.calls.indexOf('write-start') > f.calls.lastIndexOf('provider'));
  assert.deepEqual(JSON.parse(f.providerCalls[0].body), { email: EMAIL, password: PASSWORD, gotrue_meta_security: {} });
  const stored = JSON.parse(f.values.get('session')); assert.equal(stored.user.id, SUBJECT); assert.equal(stored.access_token, TOKEN);
  assert.equal(stored.user.email, undefined); assert.equal(stored.user.user_metadata, undefined);
  for (const secret of [EMAIL, PASSWORD, TOKEN, REFRESH, SUBJECT, 'PRIVATE_PROVIDER_METADATA']) assert(!JSON.stringify(snapshots).includes(secret));
  assert.equal((await f.controller.auth.getSession()).data.session.access_token, TOKEN); assert.equal(f.providerCalls.length, 2);
  const first = await f.controller.auth.getUser(TOKEN), second = await f.controller.auth.getUser(TOKEN);
  assert.equal(first.data.user.id, SUBJECT); assert.equal(second.data.user.id, SUBJECT); assert.equal(f.providerCalls.length, 4);
  assert(f.providerCalls.slice(1).every(call => call.bearer === TOKEN));
});
test('normal provider expires_in without expires_at is supported and persisted with a derived expiry', async t => {
  const f = await fixture(t); f.hooks.provider = (reply, request) => {
    if (request.url.includes('/token?')) { const body = JSON.parse(reply.body); delete body.expires_at; return { ...reply, body: JSON.stringify(body) }; } return reply;
  };
  await login(f); assert(JSON.parse(f.values.get('session')).expires_at > Math.floor(Date.now() / 1000) + 3500);
});
test('malformed, fractional, unbounded and near-expired provider expiry refuses authority and persistence', async t => {
  for (const expiresIn of [null, '3600', -1, 0, 3.5, 31536001, 20]) {
    const f = await fixture(t); f.enable(); f.hooks.provider = reply => { const body = JSON.parse(reply.body); delete body.expires_at; body.expires_in = expiresIn; return { ...reply, body: JSON.stringify(body) }; };
    await f.controller.signIn(EMAIL, PASSWORD); assert.equal(f.controller.model().ready, false); assert.equal(f.count('write-start'), 0); assert.equal(f.providerCalls.length, 1);
  }
});
test('wrong fresh provider subject and malformed token response never become a saved device identity', async t => {
  for (const mode of ['subject', 'token', 'missing-refresh']) {
    const f = await fixture(t); f.enable(); f.hooks.provider = (reply, request) => {
      const body = JSON.parse(reply.body);
      if (mode === 'subject' && request.url.endsWith('/user')) body.user.id = OTHER;
      if (mode === 'token' && request.url.includes('/token?')) body.access_token = 'token\nheader';
      if (mode === 'missing-refresh' && request.url.includes('/token?')) delete body.refresh_token;
      return { ...reply, body: JSON.stringify(body) };
    };
    await f.controller.signIn(EMAIL, PASSWORD); assert.equal(f.controller.model().ready, false); assert.equal(f.count('write-start'), 0);
  }
});
test('explicit fresh-cache resume uses only fresh exact-token user verification and sanitizes saved metadata', async t => {
  const f = await fixture(t, { saved: session() }); f.enable(); assert.equal(f.count('read'), 0); await f.controller.resume();
  assert.equal(f.controller.model().ready, true); assert.deepEqual(paths(f), ['/auth/v1/user']); assert.equal(f.count('read'), 1);
  assert.deepEqual(JSON.parse(f.values.get('session')).user, { id: SUBJECT });
});
test('explicit expired-cache resume performs exactly one SDK refresh, verifies its new token and saves it', async t => {
  const f = await fixture(t, { saved: session({ expires_at: 1 }) }); f.setToken('NONISSUED_REFRESHED_ACCESS'); f.enable(); await f.controller.resume();
  assert.equal(f.controller.model().ready, true); assert.deepEqual(paths(f), ['/auth/v1/token?grant_type=refresh_token', '/auth/v1/user']);
  assert.deepEqual(JSON.parse(f.providerCalls[0].body), { refresh_token: REFRESH }); assert.equal(f.providerCalls[1].bearer, 'NONISSUED_REFRESHED_ACCESS');
  assert.equal(JSON.parse(f.values.get('session')).access_token, 'NONISSUED_REFRESHED_ACCESS');
});
test('missing or malformed saved sessions never contact provider or automatically clear protected data', async t => {
  for (const cached of [undefined, '{bad json', '{}', session({ refresh_token: null }), session({ user: { id: 'invalid' } })]) {
    const f = await fixture(t, { saved: cached }); f.enable(); await f.controller.resume();
    assert.equal(f.controller.model().ready, false); assert.deepEqual(paths(f), []); assert.equal(f.count('remove'), 0); assert.equal(f.count('reset'), 0);
  }
});
test('refresh provider failure does not enter the SDK automatic retry loop or erase the saved session', async t => {
  for (const status of [401, 503]) {
    const f = await fixture(t, { saved: session({ expires_at: 1 }) }); f.enable(); f.hooks.provider = reply => ({ ...reply, status, body: '{"message":"PRIVATE_PROVIDER_FAILURE"}' });
    await f.controller.resume(); await wait(230); assert.equal(f.providerCalls.length, 1); assert.equal(f.controller.model().ready, false);
    assert(f.values.has('session')); assert(!JSON.stringify(f.controller.model()).includes('PRIVATE_PROVIDER_FAILURE'));
  }
});
test('refresh cannot silently change the saved account subject', async t => {
  const f = await fixture(t, { saved: session({ expires_at: 1 }) }); f.setSubject(OTHER); f.enable(); await f.controller.resume();
  assert.equal(f.controller.model().ready, false); assert.equal(f.providerCalls.length, 1); assert.equal(f.count('write-start'), 0);
});
test('held password reply is retired immediately by offline/background and never restores identity on return', async t => {
  for (const event of ['offline', 'background']) {
    const f = await fixture(t), held = gate(); f.enable(); f.hooks.provider = reply => held.promise.then(() => reply);
    const signingIn = f.controller.signIn(EMAIL, PASSWORD); await tick();
    if (event === 'offline') f.controller.connectivity(false); else f.controller.activity(false);
    await signingIn; assert.equal(f.controller.model().ready, false); f.controller.connectivity(true); f.controller.activity(true); held.resolve(); await tick();
    assert.equal(f.providerCalls.length, 1); assert.equal(f.count('write-start'), 0); assert.equal((await f.controller.auth.getSession()).data.session, null);
  }
});
test('held JSON is covered by the controller lifetime and cannot create a session after reconnect', async t => {
  const f = await fixture(t), held = gate(), original = f.ports.fetch; f.enable();
  f.ports.fetch = async (...args) => { const response = await original(...args), json = response.json.bind(response); response.json = async () => { await held.promise; return json(); }; return response; };
  const signingIn = f.controller.signIn(EMAIL, PASSWORD); await tick(); f.controller.connectivity(false); await signingIn; f.controller.connectivity(true); held.resolve(); await tick();
  assert.equal(f.providerCalls.length, 1); assert.equal(f.count('write-start'), 0); assert.equal(f.controller.model().ready, false);
});
test('deadline and late old SDK completion cannot borrow a subsequent sign-in request permit', async t => {
  const f = await fixture(t, { timeoutMs: 40 }), held = gate(); f.enable(); let first = true;
  f.hooks.provider = reply => { if (first) { first = false; return held.promise.then(() => reply); } return reply; };
  await f.controller.signIn(EMAIL, PASSWORD); assert.equal(f.controller.model().ready, false); f.setToken('NONISSUED_SECOND_ATTEMPT');
  await f.controller.signIn(EMAIL, PASSWORD); assert.equal(f.controller.model().ready, true); held.resolve(); await tick();
  assert.equal(f.providerCalls.length, 3); assert.equal(JSON.parse(f.values.get('session')).access_token, 'NONISSUED_SECOND_ATTEMPT');
});
test('a protected write dispatched before background may finish, but only explicit resume can verify it', async t => {
  const f = await fixture(t), held = gate(); f.enable(); f.hooks.write = () => held.promise;
  const signingIn = f.controller.signIn(EMAIL, PASSWORD); while (!f.count('write-start')) await tick(); f.controller.activity(false); await signingIn;
  held.resolve(); await tick(); assert(f.values.has('session')); assert.equal(f.controller.model().ready, false); f.controller.activity(true); await tick(); assert.equal(f.providerCalls.length, 2);
  delete f.hooks.write; await f.controller.resume(); assert.equal(f.controller.model().ready, true); assert.equal(f.providerCalls.length, 3);
});
test('explicit durable local clear fences an already-dispatched stale native write and performs no provider logout', async t => {
  const f = await fixture(t), held = gate(); f.enable(); f.hooks.write = () => held.promise;
  const signingIn = f.controller.signIn(EMAIL, PASSWORD); while (!f.count('write-start')) await tick(); await f.controller.clearDeviceSession(); await signingIn;
  held.resolve(); await tick(); assert.equal(f.count('reset'), 1); assert.equal(f.values.size, 0); assert.equal(f.controller.model().phase, 'closed');
  assert.match(f.controller.model().message, /Provider sessions were not revoked/); assert(paths(f).every(path => !path.includes('/logout')));
});
test('lost committed local clear reports unknown, never retries, and fresh native preparation observes the cleared epoch', async t => {
  const f = await fixture(t, { timeoutMs: 40 }); await login(f); f.hooks.reset = () => new Promise(() => {});
  await f.controller.clearDeviceSession(); assert.equal(f.controller.model().phase, 'clear_unknown'); assert.equal(f.controller.model().canClear, false); assert.equal(f.values.size, 0);
  await f.controller.clearDeviceSession(); assert.equal(f.count('reset'), 1); delete f.hooks.reset;
  const fresh = await f.prepare(); f.enable(fresh.controller); await fresh.controller.resume(); assert.equal(fresh.controller.model().ready, false); assert.equal(f.providerCalls.length, 2);
});
test('ordinary close preserves saved device data and retires every in-memory auth capability without provider revocation', async t => {
  const f = await fixture(t); await login(f); const events = []; f.controller.auth.onAuthStateChange(event => events.push(event)); f.controller.close();
  assert(f.values.has('session')); assert.equal(f.count('reset'), 0); assert.equal((await f.controller.auth.getSession()).data.session, null); assert.equal((await f.controller.auth.getUser(TOKEN)).data.user, null);
  assert.deepEqual(events, ['SIGNED_OUT']); assert.equal(f.providerCalls.length, 2); assert.match(f.controller.model().message, /saved device session may remain/);
});
test('facade user verification is serialized, fresh for each caller and keeps member readiness stable', async t => {
  const f = await fixture(t); await login(f); const held = gate(); let first = true;
  f.hooks.provider = reply => { if (first) { first = false; return held.promise.then(() => reply); } return reply; };
  const one = f.controller.auth.getUser(TOKEN), two = f.controller.auth.getUser(TOKEN); await tick(); assert.equal(f.providerCalls.length, 3); assert.equal(f.controller.model().ready, true); assert.equal(f.controller.model().busy, true);
  held.resolve(); const results = await Promise.all([one, two]); assert(results.every(result => result.data.user.id === SUBJECT)); assert.equal(f.providerCalls.length, 4); assert.equal(f.controller.model().busy, false);
});
test('wrong facade token retires memory and emits an auth retirement without sending it', async t => {
  const f = await fixture(t); await login(f); const events = []; f.controller.auth.onAuthStateChange(event => events.push(event));
  const result = await f.controller.auth.getUser('NONISSUED_WRONG_TOKEN'); assert.equal(result.data.user, null); assert.equal(f.controller.model().ready, false); assert.deepEqual(events, ['SIGNED_OUT']); assert.equal(f.providerCalls.length, 2);
});
test('invalid replacement sign-in retires the previous ready account without a provider or storage call', async t => {
  const f = await fixture(t); await login(f); const before = [...f.calls], events = [];
  f.controller.auth.onAuthStateChange(event => events.push(event)); await f.controller.signIn('invalid email', '');
  assert.equal(f.controller.model().ready, false); assert.equal((await f.controller.auth.getSession()).data.session, null);
  assert.deepEqual(f.calls, before); assert.deepEqual(events, ['SIGNED_OUT']);
  await f.controller.resume(); assert.equal(f.controller.model().ready, true); assert.equal(f.providerCalls.length, 3);
});
test('actual verified owner loses its scope when a fresh facade user proof changes subject', async t => {
  const f = await fixture(t); await login(f); const binding = f.load('platforms/native/src/circles/verified-member-session.ts').createVerifiedSupabaseCircleOwner(f.controller.auth);
  t.after(() => binding.stop()); await binding.start(); const scope = binding.owner.scope(); assert(scope);
  f.setSubject(OTHER); const value = await binding.owner.bearer(scope); assert.equal(value, null); assert.equal(binding.owner.scope(), null); assert.equal(f.controller.model().ready, false);
});
test('late facade proof after background cannot recover its previous owner lifetime', async t => {
  const f = await fixture(t); await login(f); const held = gate(); f.hooks.provider = reply => held.promise.then(() => reply);
  const checking = f.controller.auth.getUser(TOKEN); await tick(); f.controller.activity(false); const result = await checking; f.controller.activity(true); held.resolve(); await tick();
  assert.equal(result.data.user, null); assert.equal(f.controller.model().ready, false); assert.equal(f.providerCalls.length, 3);
});
test('verified memory expires locally without provider refresh or silent restoration', async t => {
  const f = await fixture(t); f.hooks.provider = (reply, request) => { if (request.url.includes('/token?')) { const body = JSON.parse(reply.body); body.expires_at = Math.floor(Date.now() / 1000) + 31; return { ...reply, body: JSON.stringify(body) }; } return reply; };
  await login(f); const events = []; f.controller.auth.onAuthStateChange(event => events.push(event)); await wait(1050);
  assert.equal((await f.controller.auth.getSession()).data.session, null); assert.equal(f.controller.model().ready, false); assert.deepEqual(events, ['SIGNED_OUT']); assert.equal(f.providerCalls.length, 2);
});
test('reentrant observer closure during sign-in preparation sends nothing', async t => {
  const f = await fixture(t); f.enable(); f.controller.subscribe(model => { if (model.phase === 'signing_in') f.controller.close(); });
  await f.controller.signIn(EMAIL, PASSWORD); assert.equal(f.providerCalls.length, 0); assert.equal(f.count('read'), 0); assert.equal(f.controller.model().ready, false);
});
