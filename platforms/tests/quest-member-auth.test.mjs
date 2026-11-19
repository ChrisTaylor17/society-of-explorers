import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';
import { circleAuthorizationHeaders, createCircleHost } from '../quest/circle-host.mjs';

const { createQuestMemberAuth } = sourceLoader()('lib/circles/quest-member-auth.ts');
const origin = 'https://quest-auth-fixture.invalid';
const endpoint = origin + '/api/auth/member';
const subject = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const circle = '44444444-4444-4444-8444-444444444444';
const intent = '55555555-5555-4555-8555-555555555555';
const token = 'NONISSUED_FIXTURE_TOKEN';
const wallet = id => ({ member: { id, email: 'PRIVATE_FIXTURE' }, auth: { provider: 'wallet', subject: id } });
const supabase = (id = member, authId = subject) => ({
  member: { id, supabase_auth_id: authId, email: 'PRIVATE_FIXTURE' }, auth: { provider: 'supabase', subject: authId },
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function gate() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function fixture(options = {}) {
  let sdkCalls = 0, userGate, jsonGate, reply = supabase(), status = 200, url = endpoint, redirected = false;
  const requests = [], listeners = new Set();
  const sdk = {
    async getSession() {
      sdkCalls++;
      return { data: { session: { access_token: token, user: { id: subject, email: 'PRIVATE_FIXTURE' } } } };
    },
    async getUser(jwt) {
      sdkCalls++;
      assert.equal(jwt, token);
      if (userGate) await userGate.promise;
      return { data: { user: { id: subject, email: 'PRIVATE_FIXTURE' } } };
    },
    onAuthStateChange(listener) {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } };
    },
  };
  const bridge = createQuestMemberAuth(sdk, { origin, intent, request: async (input, init) => {
    requests.push({ input, init });
    return { status, url, redirected, async json() { if (jsonGate) await jsonGate.promise; return reply; } };
  }, ...options });
  return { bridge, binding: bridge.binding, requests, listeners, calls: () => sdkCalls, reply: value => { reply = value; },
    status: value => { status = value; }, url: value => { url = value; }, redirected: value => { redirected = value; },
    userGate: hold => { userGate = hold; }, jsonGate: hold => { jsonGate = hold; } };
}

test('the selected wallet verifies without SDK credentials and emits only the browser binding', async () => {
  const f = fixture();
  f.reply(wallet(member));
  assert.equal(f.calls(), 0);
  assert.equal(f.requests.length, 0);
  await f.binding.start();
  const scope = f.binding.owner.scope();
  assert(scope);
  const headers = await circleAuthorizationHeaders(f.binding.owner, scope);
  assert.deepEqual(headers, { 'x-soe-auth-intent': intent, 'x-soe-expected-member': member });
  assert.equal(f.calls(), 0);
  assert.equal(f.requests.length, 2);
  for (const { input, init } of f.requests) {
    assert.equal(input, endpoint);
    assert.equal(init.method, 'GET');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.mode, 'same-origin');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.deepEqual(Object.fromEntries(Object.entries(init.headers)), { 'x-soe-auth-intent': intent });
    assert(init.signal instanceof AbortSignal);
  }
  f.bridge.retire();
});

test('email and Google retain exact-token verification alongside the selected browser identity', async () => {
  const f = fixture();
  await f.binding.start();
  const scope = f.binding.owner.scope();
  assert(scope);
  const headers = await circleAuthorizationHeaders(f.binding.owner, scope);
  assert.deepEqual(headers, { 'x-soe-auth-intent': intent, 'x-soe-expected-member': member, Authorization: 'Bearer ' + token });
  assert.equal(f.calls(), 4);
  assert.equal(f.requests.length, 2);
  assert(!JSON.stringify(headers).includes('PRIVATE_FIXTURE'));
  f.bridge.retire();
});

for (const [label, body] of [
  ['wallet subject/member mismatch', { ...wallet(member), auth: { provider: 'wallet', subject: other } }],
  ['different Supabase SDK subject', supabase(member, other)],
  ['mismatched member link', { ...supabase(), member: { id: member, supabase_auth_id: other } }],
  ['malformed member', supabase('invalid')],
  ['missing auth', { member: { id: member, supabase_auth_id: subject } }],
  ['missing member', { auth: { provider: 'supabase', subject } }],
  ['unknown provider', { ...supabase(), auth: { provider: 'other', subject } }],
  ['array', []],
]) {
  test('malformed selected identity fails closed for ' + label, async () => {
    const f = fixture();
    f.reply(body);
    await f.binding.start();
    assert.equal(f.binding.owner.scope(), null);
    assert.equal(f.binding.model().phase, 'unavailable');
    assert.doesNotMatch(f.binding.model().message, /11111111|PRIVATE|TOKEN/);
    f.bridge.retire();
  });
}

test('status failures, redirects and changed response addresses confer no identity', async () => {
  for (const mutate of [f => f.status(401), f => f.status(503), f => f.status(302), f => f.redirected(true),
    f => f.url('https://other.invalid/api/auth/member'), f => f.url(endpoint + '?subject=' + subject)]) {
    const f = fixture();
    mutate(f);
    await f.binding.start();
    assert.equal(f.binding.owner.scope(), null);
    assert.equal(f.calls(), 0);
    f.bridge.retire();
  }
});

test('a changed provider, wallet member, or mapped account retires private Circle authority', async () => {
  for (const [before, after] of [[wallet(member), wallet(other)], [supabase(), wallet(member)], [supabase(), supabase(other)]]) {
    const f = fixture();
    f.reply(before);
    let sends = 0;
    const host = createCircleHost({ circleId: circle, origin, owner: f.binding.owner,
      transport: async () => { sends++; throw Error('Must not send under a changed identity'); } });
    host.connect();
    await f.binding.start();
    const scope = f.binding.owner.scope();
    assert(scope);
    f.reply(after);
    await host.openArchive();
    assert.equal(sends, 0);
    assert.equal(f.binding.owner.scope(), null);
    assert.equal(await circleAuthorizationHeaders(f.binding.owner, scope), null);
    host.disconnect();
    f.bridge.retire();
  }
});

test('the deadline includes provider verification and a late reply cannot restore authority', async () => {
  const f = fixture({ timeoutMs: 5 }), held = gate();
  f.userGate(held);
  await f.binding.start();
  assert.equal(f.binding.owner.scope(), null);
  assert.equal(f.requests[0].init.signal.aborted, true);
  held.resolve();
  await tick();
  assert.equal(f.binding.owner.scope(), null);
  f.bridge.retire();
});

test('activity invalidation aborts the metadata response body and prevents late SDK activity', async () => {
  const f = fixture(), held = gate();
  f.jsonGate(held);
  const checking = f.binding.start();
  await tick();
  assert.equal(f.requests.length, 1);
  f.bridge.invalidate();
  await checking;
  assert.equal(f.requests[0].init.signal.aborted, true);
  held.resolve();
  await tick();
  assert.equal(f.calls(), 0);
  assert.equal(f.binding.owner.scope(), null);
  f.bridge.retire();
});

test('a changed caller lifetime fences proof completion before SDK verification', async () => {
  let current = true;
  const f = fixture({ isCurrent: () => current }), held = gate();
  f.jsonGate(held);
  const checking = f.binding.start();
  await tick();
  current = false;
  held.resolve();
  await checking;
  assert.equal(f.calls(), 0);
  assert.equal(f.binding.owner.scope(), null);
  f.bridge.retire();
});

test('retirement removes the SDK subscription and invalidates the old scope and callback', async () => {
  const f = fixture();
  await f.binding.start();
  const scope = f.binding.owner.scope();
  const old = [...f.listeners][0];
  f.bridge.retire();
  old('SIGNED_IN', null);
  await tick();
  assert.equal(f.listeners.size, 0);
  assert.equal(await circleAuthorizationHeaders(f.binding.owner, scope), null);
  assert.equal(f.requests.length, 1);
  assert.equal(f.calls(), 2);
});

test('a missing or malformed browser sign-in choice prevents bridge construction', () => {
  for (const invalid of ['', null, undefined, 'http://fixture.invalid']) {
    assert.throws(() => fixture({ intent: invalid }), /Member session could not be confirmed/);
  }
});
