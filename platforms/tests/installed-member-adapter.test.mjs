// Execute actual installed adapter/account TypeScript with explicit platform,
// native storage, connectivity and provider reply doubles. No iOS device claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
assert(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')), 'Startup network denial required');
for (const extension of ['.js', '.json']) {
  const original = Module._extensions[extension];
  Module._extensions[extension] = (module, file) => {
    const info = fs.lstatSync(file);
    assert(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks), 'Refuse linked/offloaded dependency');
    return original(module, file);
  };
}
const { sourceLoader } = await import('./load-source.mjs');
const origin = 'https://installed-member.invalid', providerOrigin = 'https://installed-provider.invalid';
const publishableKey = 'sb_publishable_SYNTHETIC_INSTALLED_KEY_ONLY', storageKey = 'installed-account';
const generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const subject = '11111111-1111-4111-8111-111111111111', token = 'NONISSUED_INSTALLED_TOKEN';
const emailCallbackUrl = 'com.soe.synthetic.email://auth/callback';
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ os = 'ios', caps = {}, native = true, extraMocks = {} } = {}) {
  const calls = [], values = new Map(), handlers = new Set();
  let epoch = generation, sequence = 0, state = 'online', capabilityNumber = 0;
  const base = () => ({ version: 2, origin, storageKey, storageGeneration: epoch, redirectPolicy: 'reject-before-send',
    storagePolicy: 'os-protected', authPolicy: 'supabase-password-v1', providerOrigin, publishableKey });
  const check = (self, value = epoch) => { assert.equal(self, nativeModule); assert.equal(value, epoch); };
  const response = request => ({ status: 200, url: request.url, body: '{}', redirected: false });
  const nativeModule = {
    async capabilities() { check(this); calls.push('capabilities'); capabilityNumber++; return typeof caps === 'function' ? caps(base(), capabilityNumber) : { ...base(), ...caps }; },
    async begin(value) { check(this, value); const id = 'installed_' + (++sequence); calls.push(['begin', value, id]); return id; },
    async newRequestId(value) { check(this, value); calls.push(['requestId', value]); return subject; },
    async send(id, request) { check(this); calls.push(['member', id, request]); return response(request); },
    async sendReview(id, request) { check(this); calls.push(['review', id, request]); return response(request); },
    async sendCircleReview(id, request) { check(this); calls.push(['circleReview', id, request]); return response(request); },
    async sendPublic(id, request) { check(this); calls.push(['public', id, request]); return response(request); },
    async sendAuth(id, request) {
      check(this); calls.push(['auth', id, request]);
      const body = request.url.endsWith('/user') ? { id: subject }
        : { access_token: token, refresh_token: 'NONISSUED_REFRESH', token_type: 'bearer', expires_in: 3600, user: { id: subject } };
      return { ...response(request), body: JSON.stringify(body) };
    },
    async cancel(id) { check(this); calls.push(['cancel', id]); },
    async read(slot, value) { check(this, value); calls.push(['read', slot, value]); return values.get(slot) ?? null; },
    async write(slot, data, value) { check(this, value); calls.push(['write', slot, value]); values.set(slot, data); },
    async remove(slot, value) { check(this, value); calls.push(['remove', slot, value]); values.delete(slot); },
    async resetAccountStorage(value) { check(this, value); calls.push(['reset', value]); epoch = next; values.clear(); return { previousGeneration: value, generation: epoch, cleared: true }; },
    getConnectivitySnapshot() { check(this); return state; },
    onConnectivityChange(listener) { check(this); handlers.add(listener); return { remove() { handlers.delete(listener); } }; },
  };
  const load = sourceLoader({ 'react-native': { Platform: { OS: os }, TurboModuleRegistry: { get(name) { assert.equal(name, 'NativeSoeMember'); return native === false ? null : nativeModule; } } }, ...extraMocks });
  const api = load('platforms/native/src/circles/installed-member.ts');
  const nonCapabilityCalls = () => calls.filter(value => value !== 'capabilities');
  return { ...api, load, nativeModule, calls, nonCapabilityCalls, values, handlers, setState(value) { state = value; }, emit(value) { for (const listener of [...handlers]) listener(value); } };
}

test('shared preparation selects installed iOS and Android modules with no automatic storage or request', async () => {
  for (const os of ['ios', 'android']) {
    const f = fixture({ os }), prepared = await f.prepareInstalledAuthPorts();
    assert.equal(prepared.ports.providerOrigin, providerOrigin); assert.equal(prepared.publishableKey, publishableKey);
    assert.equal(prepared.ports.member.origin, origin); assert.equal(prepared.connectivity.snapshot(), 'online');
    assert.deepEqual(f.nonCapabilityCalls(), []); prepared.ports.retire();
  }
});
test('unsupported platforms and missing/incomplete installed modules never use a generic fallback', async () => {
  for (const os of ['web', 'macos', 'windows', 'IOS', '']) {
    const f = fixture({ os }); await assert.rejects(f.prepareInstalledAuthPorts(), /unavailable/);
    await assert.rejects(f.prepareInstalledMemberBinding({ origin, storageKey }), /unavailable/); assert.deepEqual(f.calls, []);
  }
  const missing = fixture({ native: false }); await assert.rejects(missing.prepareInstalledAuthPorts(), /unavailable/); assert.deepEqual(missing.calls, []);
  for (const key of ['capabilities', 'begin', 'send', 'cancel', 'read', 'write', 'remove', 'resetAccountStorage', 'getConnectivitySnapshot', 'onConnectivityChange']) {
    const f = fixture(); f.nativeModule[key] = undefined; await assert.rejects(f.prepareInstalledAuthPorts(), /unavailable/); assert.deepEqual(f.calls, []);
  }
});
test('iOS capability mismatch rejects before storage, allocation or transport', async () => {
  for (const caps of [{ version: 1 }, { version: '2' }, { redirectPolicy: 'follow' }, { storagePolicy: 'javascript' }, { storageGeneration: 'forged' },
    { authPolicy: 'supabase-password-v2' }, { authPolicy: undefined }, { providerOrigin: 'https://provider.invalid/' }, { publishableKey: 'sb_secret_PRIVATE' },
    { origin: 'http://member.invalid' }, { storageKey: '../account' }, { emailAuthPolicy: true }, { circleReviewPolicy: 'assigned-message-review-v1' }]) {
    const f = fixture({ caps }); await assert.rejects(f.prepareInstalledAuthPorts()); assert.deepEqual(f.nonCapabilityCalls(), []);
  }
  for (const bad of [null, [], false, 'caps']) { const f = fixture({ caps: () => bad }); await assert.rejects(f.prepareInstalledAuthPorts(), /unavailable/); assert.deepEqual(f.nonCapabilityCalls(), []); }
});
test('changed native origin/provider/key receipts cannot select JavaScript replacement configuration', async () => {
  for (const patch of [{ origin: 'https://changed.invalid' }, { storageKey: 'changed' }, { providerOrigin: 'https://changed.invalid' }, { publishableKey: 'sb_publishable_CHANGED_SYNTHETIC_KEY_ONLY' }, { authPolicy: undefined }]) {
    const f = fixture({ caps: (base, number) => ({ ...base, ...(number > 1 ? patch : {}) }) });
    await assert.rejects(f.prepareInstalledAuthPorts()); assert.deepEqual(f.nonCapabilityCalls(), []);
  }
});
test('advertised narrow lanes need their corresponding native methods; legacy omissions grant no lane', async () => {
  for (const [policy, value, method] of [['requestIdPolicy', 'os-random-uuid', 'newRequestId'], ['publicPolicy', 'circle-discovery-v1', 'sendPublic'],
    ['readingPolicy', 'pinned-passage-v1', 'sendPublic'], ['publicProfilePolicy', 'published-profile-v1', 'sendPublic'],
    ['hostingPolicy', 'circle-host-v1', 'sendPublic'], ['messageReviewPolicy', 'assigned-message-review-v1', 'sendReview'], ['circleReviewPolicy', 'assigned-circle-review-v1', 'sendCircleReview']]) {
    const f = fixture({ caps: { [policy]: value } }); f.nativeModule[method] = undefined;
    await assert.rejects(f.prepareInstalledAuthPorts(), /unavailable/); assert.deepEqual(f.nonCapabilityCalls(), []);
  }
  const f = fixture(); for (const method of ['sendPublic', 'sendReview', 'sendCircleReview', 'newRequestId']) f.nativeModule[method] = undefined;
  const { ports } = await f.prepareInstalledAuthPorts();
  for (const key of ['publicTransport', 'reviewerTransport', 'circleReviewerTransport', 'newRequestId']) assert.equal(ports.member[key], undefined);
  assert.equal(ports.email, undefined); ports.retire();
});
test('partial or malformed advertised email capability refuses before member allocation', async () => {
  const names = ['prepareEmailLink', 'pendingEmailLink', 'claimEmailLink', 'discardEmailLink', 'sendEmailAuth'];
  for (const missing of names) {
    const f = fixture({ caps: { emailAuthPolicy: 'supabase-email-pkce-v1', emailCallbackUrl } });
    for (const name of names) f.nativeModule[name] = async () => null;
    f.nativeModule[missing] = undefined; await assert.rejects(f.prepareInstalledAuthPorts(), /unavailable/); assert.deepEqual(f.nonCapabilityCalls(), []);
  }
  for (const callback of ['https://provider.invalid/auth/callback', emailCallbackUrl + '?flow=x', emailCallbackUrl + '/']) {
    const f = fixture({ caps: { emailAuthPolicy: 'supabase-email-pkce-v1', emailCallbackUrl: callback } });
    for (const name of names) f.nativeModule[name] = async () => null;
    await assert.rejects(f.prepareInstalledAuthPorts(), /unavailable/); assert.deepEqual(f.nonCapabilityCalls(), []);
  }
});
test('explicit iOS existing-member binding uses native storage generation and retires after reset', async () => {
  const f = fixture(), binding = await f.prepareInstalledMemberBinding({ origin, storageKey });
  await binding.storage.setItem(storageKey, 'SYNTHETIC_SESSION'); assert.equal(await binding.storage.getItem(storageKey), 'SYNTHETIC_SESSION');
  await binding.resetAccountStorage(); await assert.rejects(binding.storage.getItem(storageKey));
  const fresh = await f.prepareInstalledMemberBinding({ origin, storageKey }); assert.equal(await fresh.storage.getItem(storageKey), null); fresh.close();
});
test('legacy Android wrappers stay Android-only and preserve the shared adapter identity', async () => {
  const ios = fixture(), legacy = ios.load('platforms/native/src/circles/android-member.ts');
  await assert.rejects(legacy.prepareAndroidAuthPorts(), /unavailable/); await assert.rejects(legacy.prepareAndroidMemberBinding({ origin, storageKey }), /unavailable/);
  await assert.rejects(ios.load('platforms/native/src/auth/android-owned-account.ts').prepareAndroidOwnedAccount(), /unavailable/); assert.deepEqual(ios.calls, []);
  const f = fixture({ os: 'android' }), android = f.load('platforms/native/src/circles/android-member.ts');
  assert.equal(android.createAndroidMemberAdapter(f.nativeModule), f.createInstalledMemberAdapter(f.nativeModule));
  const owned = await f.load('platforms/native/src/auth/android-owned-account.ts').prepareAndroidOwnedAccount();
  assert.equal(owned.controller.model().active, false); assert.deepEqual(f.nonCapabilityCalls(), []); owned.close();
});
test('actual shared owned account starts inactive and performs explicit SDK sign-in through iOS native auth only', async t => {
  const f = fixture(), connection = await f.load('platforms/native/src/auth/installed-owned-account.ts').prepareInstalledOwnedAccount();
  t.after(connection.close); assert.equal(connection.controller.model().active, false); assert.equal(connection.controller.model().ready, false);
  await tick(); assert.deepEqual(f.nonCapabilityCalls(), []);
  connection.controller.activity(true); connection.controller.connectivity(true); await tick(); assert.deepEqual(f.nonCapabilityCalls(), []);
  await connection.controller.signIn('synthetic@example.invalid', 'SYNTHETIC_PASSWORD');
  assert.equal(connection.controller.model().ready, true);
  const requests = f.calls.filter(value => Array.isArray(value) && value[0] === 'auth').map(value => value[2]);
  assert.deepEqual(requests.map(value => value.url), [providerOrigin + '/auth/v1/token?grant_type=password', providerOrigin + '/auth/v1/user']);
  assert.equal(requests[1].bearer, token); assert.equal(JSON.parse(f.values.get('session')).user.id, subject);
  assert.equal(f.calls.some(value => Array.isArray(value) && value[0] === 'member'), false);
  connection.close(); connection.close(); assert.equal(connection.controller.model().ready, false);
  await assert.rejects(connection.config.transport(origin + '/api/auth/member', { method: 'GET', headers: { Authorization: 'Bearer ' + token }, signal: new AbortController().signal, cache: 'no-store', credentials: 'omit', redirect: 'error' }));
});
test('owned factory exposes optional actual email controller without claiming/loading/sending automatically', async t => {
  const f = fixture({ caps: { emailAuthPolicy: 'supabase-email-pkce-v1', emailCallbackUrl } });
  for (const name of ['prepareEmailLink', 'pendingEmailLink', 'claimEmailLink', 'discardEmailLink', 'sendEmailAuth']) f.nativeModule[name] = async function (...args) { assert.equal(this, f.nativeModule); f.calls.push([name, ...args]); return null; };
  const connection = await f.load('platforms/native/src/auth/installed-owned-account.ts').prepareInstalledOwnedAccount(); t.after(connection.close);
  assert(connection.email); assert.equal(connection.email.model().active, false); await tick(); assert.deepEqual(f.nonCapabilityCalls(), []);
  connection.email.activity(true); connection.email.connectivity(true); await connection.email.loadPending();
  assert.deepEqual(f.nonCapabilityCalls(), [['pendingEmailLink', generation]]); connection.close(); assert.equal(connection.email.model().phase, 'closed');
});
test('owned factory retires partial controllers and ports even when a cleanup throws', async () => {
  for (const failure of ['controller', 'email', 'activity']) {
    const calls = [], ports = { member: {}, email: {}, retire() { calls.push('ports-retire'); } };
    const controller = { auth: {}, activity() { if (failure === 'activity') throw Error('Synthetic activity failure'); }, close() { calls.push('controller-close'); throw Error('Synthetic cleanup failure'); } };
    const email = { activity() {}, close() { calls.push('email-close'); throw Error('Synthetic cleanup failure'); } };
    const load = sourceLoader({ '../circles/installed-member': { async prepareInstalledAuthPorts() { return { ports, publishableKey, connectivity: {} }; } },
      './owned-auth': { createOwnedNativeAuth() { if (failure === 'controller') throw Error('Synthetic constructor failure'); return controller; } },
      './email-auth': { createNativeEmailAuth() { if (failure === 'email') throw Error('Synthetic email failure'); return email; } } });
    await assert.rejects(load('platforms/native/src/auth/installed-owned-account.ts').prepareInstalledOwnedAccount(), /unavailable/);
    assert.deepEqual(calls, failure === 'controller' ? ['ports-retire'] : failure === 'email' ? ['controller-close', 'ports-retire'] : ['email-close', 'controller-close', 'ports-retire']);
  }
});
test('iOS connectivity events resample native state and retired observers cannot be revived', () => {
  const f = fixture(), port = f.createInstalledMemberAdapter(f.nativeModule).connectivity, states = [];
  const off = port.subscribe(value => states.push(value)); f.setState('offline'); f.emit({ state: 'online' }); assert.deepEqual(states, ['offline']);
  off(); f.setState('online'); f.emit({ state: 'online' }); assert.deepEqual(states, ['offline']); assert.equal(f.handlers.size, 0);
});
