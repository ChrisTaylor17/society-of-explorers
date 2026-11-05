import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { loadWebAccount, runtimeBindings, sourceBindings } from './web-account-loader.mjs';

const ORIGIN = 'https://wallet.invalid', PROVIDER = 'https://provider.invalid', KEY = 'sb_publishable_NONISSUED_WEB_WALLET';
const ADDRESS = '0x0000000000000000000000000000000000000001', OTHER_ADDRESS = '0x0000000000000000000000000000000000000002';
const MEMBER = '73333333-3333-4333-8333-333333333333', OTHER_MEMBER = '73444444-4444-4444-8444-444444444444';
const SIGNATURE = '0x' + '1'.repeat(130), NONCE = 'SYNTHETICNONCE1234';
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const tick = () => new Promise(done => setImmediate(done));
async function until(check) { for (let i = 0; i < 30; i++) { if (check()) return; await tick(); } assert(check(), 'Expected fixture boundary'); }
function reply(url, body, status = 200) { const response = new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); Object.defineProperty(response, 'url', { value: url }); return response; }
let fixtures = 0, closed = 0, remainingListeners = 0, remainingTimers = 0, remainingObservers = 0;

function fixture(t, options = {}) {
  const { api, timers } = loadWebAccount(), calls = [], walletCalls = [], observers = new Set(), listeners = new Map(), hooks = {}, navigations = [], models = [];
  let current = null, address = ADDRESS, chain = '0x1', registrations = 0;
  const ethereum = {
    async request(request) { walletCalls.push(request); const value = request.method === 'eth_chainId' ? chain : request.method === 'personal_sign' ? SIGNATURE : [address]; return hooks.wallet ? hooks.wallet(request, value) : value; },
    on(event, listener) { registrations++; if (options.throwRegister === registrations) throw Error('Synthetic registration failure'); listeners.set(event, listener); },
    removeListener(event, listener) { if (listeners.get(event) === listener) listeners.delete(event); if (options.throwRemove) throw Error('Synthetic removal failure'); },
  };
  if (options.withoutEvents) { delete ethereum.on; delete ethereum.removeListener; }
  const config = { origin: ORIGIN, providerOrigin: PROVIDER, publishableKey: KEY, nextPath: '/circles', crypto: webcrypto, ethereum,
    cookies: { getAll: () => [], set() { throw Error('Wallet cannot publish ordinary auth cookies'); } },
    intent: { begin() { current = randomUUID(); return current; }, current(id) { return current === id; }, retire(id) { if (current === id) current = randomUUID(); return current; } },
    subscribe(listener) { observers.add(listener); return () => observers.delete(listener); }, notify() { for (const listener of observers) listener(); },
    navigate(path) { navigations.push(path); }, externalNavigate() { throw Error('Wallet cannot redirect to an OAuth provider'); },
    async fetch(url, init) {
      assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.equal(init.referrerPolicy, 'no-referrer'); assert(init.signal);
      const call = { url, init, headers: new Headers(init.headers), body: init.body && JSON.parse(init.body) }; calls.push(call);
      let body;
      if (url === ORIGIN + '/api/auth/nonce') body = { nonce: NONCE, intent: current };
      else if (url === ORIGIN + '/api/auth/siwe') body = { verified: true, member: { id: MEMBER }, intent: current };
      else if (url === ORIGIN + '/api/auth/member') body = { member: { id: MEMBER }, auth: { provider: 'wallet', subject: MEMBER } };
      else throw Error('Unexpected wallet HTTP path');
      return hooks.reply ? hooks.reply(call, reply(url, body)) : reply(url, body);
    },
  };
  const controller = api.createWebAccount(config); controller.subscribe(value => models.push(value)); controller.activity(true); controller.connectivity(true); fixtures++;
  t.after(() => { controller.close(); assert.equal(timers.size, 0); assert.equal(observers.size, 0); assert.equal(listeners.size, 0); remainingTimers += timers.size; remainingObservers += observers.size; remainingListeners += listeners.size; closed++; });
  return { controller, calls, walletCalls, hooks, navigations, models, listeners, current: () => current,
    setAddress(value) { address = value; }, setChain(value) { chain = value; }, event(name) { listeners.get(name)?.(); },
    replace() { current = randomUUID(); for (const listener of observers) listener(); return current; } };
}

test('actual ethers and SIWE construct bounded intent-bound login followed by fresh member proof', async t => {
  const f = fixture(t); await f.controller.wallet(); assert.equal(f.controller.model().phase, 'accepted'); assert.deepEqual(f.navigations, ['/circles']);
  assert.deepEqual(f.calls.map(call => new URL(call.url).pathname), ['/api/auth/nonce', '/api/auth/siwe', '/api/auth/member']);
  assert.equal(f.calls[0].headers.get('X-SoE-Auth-Intent'), f.current()); assert.equal(f.calls[1].body.intent, f.current());
  assert.equal(f.calls[1].body.address, ADDRESS); assert.equal(f.calls[1].body.signature, SIGNATURE);
  const message = f.calls[1].body.message; assert(message.startsWith('wallet.invalid wants you to sign in with your Ethereum account:\n' + ADDRESS));
  assert(message.includes('URI: ' + ORIGIN)); assert(message.includes('Chain ID: 1')); assert(message.includes('Nonce: ' + NONCE));
  assert(f.walletCalls.some(call => call.method === 'personal_sign' && call.params[0] === message && call.params[1] === ADDRESS));
  for (const secret of [ADDRESS, SIGNATURE, NONCE]) assert(!JSON.stringify(f.models).includes(secret)); assert.equal(f.listeners.size, 0);
});
test('legitimate account or signature popup blur pauses until return and explicit Continue', async t => {
  for (const prompt of ['eth_requestAccounts', 'personal_sign']) {
    const f = fixture(t), hold = deferred(); f.hooks.wallet = (request, value) => request.method === prompt ? hold.promise.then(() => value) : value;
    const work = f.controller.wallet(); await until(() => f.walletCalls.some(call => call.method === prompt));
    f.controller.activity(false); assert.equal(f.controller.model().phase, 'wallet-paused'); f.controller.activity(true);
    assert.equal(f.controller.model().canContinueWallet, false); hold.resolve(); await work;
    assert.equal(f.controller.model().canContinueWallet, true); assert.equal(f.navigations.length, 0); assert.equal(f.calls.filter(call => call.url.endsWith('/siwe')).length, 0);
    await f.controller.continueWallet(); assert.equal(f.controller.model().phase, 'accepted'); assert.deepEqual(f.navigations, ['/circles']);
    assert.equal(f.walletCalls.filter(call => call.method === prompt).length, 1);
  }
});
test('late wallet popup results cannot resume closed, offline or superseded attempts', async t => {
  for (const prompt of ['eth_requestAccounts', 'personal_sign']) for (const retirement of ['close', 'offline', 'newer', 'mode']) {
    const f = fixture(t), hold = deferred(); f.hooks.wallet = (request, value) => request.method === prompt ? hold.promise.then(() => value) : value;
    const work = f.controller.wallet(); await until(() => f.walletCalls.some(call => call.method === prompt));
    if (retirement === 'close' || retirement === 'mode') f.controller.close(); if (retirement === 'offline') f.controller.connectivity(false);
    const newer = retirement === 'newer' ? f.replace() : null; hold.resolve(); await work;
    assert.equal(f.calls.filter(call => call.url.endsWith('/siwe')).length, 0); assert.equal(f.navigations.length, 0); assert.equal(f.listeners.size, 0);
    if (newer) assert.equal(f.current(), newer);
  }
});
test('reported account or chain changes during signing retire the attempt', async t => {
  for (const event of ['accountsChanged', 'chainChanged']) {
    const f = fixture(t), hold = deferred(); f.hooks.wallet = (request, value) => request.method === 'personal_sign' ? hold.promise.then(() => value) : value;
    const work = f.controller.wallet(); await until(() => f.walletCalls.some(call => call.method === 'personal_sign')); f.event(event); hold.resolve(); await work;
    assert.equal(f.calls.filter(call => call.url.endsWith('/siwe')).length, 0); assert.equal(f.navigations.length, 0); assert.equal(f.listeners.size, 0);
  }
});
test('silent account and chain changes are rechecked before signed submission', async t => {
  for (const change of ['account', 'chain']) {
    const f = fixture(t, { withoutEvents: true }), hold = deferred(); f.hooks.wallet = (request, value) => request.method === 'personal_sign' ? hold.promise.then(() => value) : value;
    const work = f.controller.wallet(); await until(() => f.walletCalls.some(call => call.method === 'personal_sign'));
    if (change === 'account') f.setAddress(OTHER_ADDRESS); else f.setChain('0x2'); hold.resolve(); await work;
    assert.equal(f.calls.filter(call => call.url.endsWith('/siwe')).length, 0); assert.equal(f.navigations.length, 0);
  }
});
test('nonce, SIWE and member intent or identity disagreements never navigate', async t => {
  for (const mutation of ['nonceIntent', 'nonceShape', 'siweIntent', 'memberSubject', 'memberId']) {
    const f = fixture(t); f.hooks.reply = async (call, response) => { const body = await response.json();
      if (call.url.endsWith('/nonce')) { if (mutation === 'nonceIntent') body.intent = OTHER_MEMBER; if (mutation === 'nonceShape') body.nonce = 'bad'; }
      if (call.url.endsWith('/siwe') && mutation === 'siweIntent') body.intent = OTHER_MEMBER;
      if (call.url.endsWith('/member')) { if (mutation === 'memberSubject') body.auth.subject = OTHER_MEMBER; if (mutation === 'memberId') body.member.id = OTHER_MEMBER; }
      return reply(call.url, body);
    };
    await f.controller.wallet(); assert.equal(f.navigations.length, 0); assert.notEqual(f.controller.model().phase, 'accepted'); assert.equal(f.listeners.size, 0);
  }
});
test('duplicate Continue while submission is pending cannot sign or post twice', async t => {
  const f = fixture(t), signature = deferred(), submission = deferred();
  f.hooks.wallet = (request, value) => request.method === 'personal_sign' ? signature.promise.then(() => value) : value;
  const first = f.controller.wallet(); await until(() => f.walletCalls.some(call => call.method === 'personal_sign')); f.controller.activity(false); f.controller.activity(true); signature.resolve(); await first;
  f.hooks.reply = (call, response) => call.url.endsWith('/siwe') ? submission.promise.then(() => response) : response;
  const a = f.controller.continueWallet(), b = f.controller.continueWallet(); await until(() => f.calls.some(call => call.url.endsWith('/siwe'))); submission.resolve(); await Promise.all([a, b]);
  assert.equal(f.walletCalls.filter(call => call.method === 'personal_sign').length, 1); assert.equal(f.calls.filter(call => call.url.endsWith('/siwe')).length, 1); assert.deepEqual(f.navigations, ['/circles']);
});
test('throwing wallet event adapters cannot escape registration or interrupt cleanup', async t => {
  for (const options of [{ throwRegister: 1 }, { throwRegister: 2 }, { throwRemove: true }]) {
    const f = fixture(t, options); await assert.doesNotReject(f.controller.wallet()); assert.doesNotThrow(() => f.controller.close()); assert.equal(f.listeners.size, 0);
    if (options.throwRegister) { assert.equal(f.calls.length, 0); assert.equal(f.walletCalls.length, 0); }
  }
});
test('rejected wallet prompts fail without identity selection or leaked listeners', async t => {
  for (const prompt of ['eth_requestAccounts', 'personal_sign']) {
    const f = fixture(t); f.hooks.wallet = (request, value) => { if (request.method === prompt) throw Error('Synthetic user rejection'); return value; };
    await f.controller.wallet(); assert.equal(f.calls.filter(call => call.url.endsWith('/siwe')).length, 0); assert.equal(f.navigations.length, 0); assert.equal(f.listeners.size, 0);
  }
});
test.after(() => { assert.equal(fixtures, closed); console.log('WEB_WALLET_PROOF ' + JSON.stringify({ fixtures, closed, remainingListeners, remainingTimers, remainingObservers,
  providerCalls: 0, syntheticOnly: true, sourceBindings, runtimeHashes: runtimeBindings() })); });
