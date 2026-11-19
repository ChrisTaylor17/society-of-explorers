// Actual TypeScript adapter; native epochs/storage/transport are explicit doubles.
// This proves JS fencing against the declared contract, not OS/Kotlin durability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

assert.ok(process.execArgv.some(value => value.endsWith('/deny-build-network.cjs')), 'Startup network deny guard required');

const origin = 'https://native-durable-fixture.test', key = 'synthetic-member-storage';
const circle = '11111111-1111-4111-8111-111111111111';
const uuid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const gate = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const unavailable = error => { assert.equal(error.message, 'Native member service unavailable'); return true; };
const loadPorts = () => sourceLoader()('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts;

function nativeAuthority({ nativeOrigin = origin, storageKey = key } = {}) {
  let generation = uuid(1), sequence = 1, handleSequence = 0;
  const values = new Map(), handles = new Map(), calls = [];
  const check = epoch => { if (epoch !== generation) throw Error('SYNTHETIC_NATIVE_STALE_EPOCH'); };
  const capabilities = () => ({ version: 2, origin: nativeOrigin, storageKey, redirectPolicy: 'reject-before-send', storagePolicy: 'os-protected', storageGeneration: generation });
  function bridge(label = 'bridge') {
    const hooks = {};
    const value = {
      async capabilities() { calls.push({ method: 'capabilities', label }); const reply = capabilities(); return hooks.capabilities ? hooks.capabilities(reply) : reply; },
      async begin(epoch) { calls.push({ method: 'begin', label, epoch }); check(epoch); const id = `${label}_handle_${++handleSequence}`; handles.set(id, epoch); return hooks.begin ? hooks.begin(id) : id; },
      async send(id, request) { calls.push({ method: 'send', label, id }); check(handles.get(id)); if (hooks.send) return hooks.send(id, request); return { status: 200, url: request.url, body: '{"synthetic":true}', redirected: false }; },
      async cancel(id) { calls.push({ method: 'cancel', label, id }); handles.delete(id); },
      async read(slot, epoch) { calls.push({ method: 'read', label, slot, epoch }); check(epoch); const reply = values.get(slot) ?? null; return hooks.read ? hooks.read(reply) : reply; },
      async write(slot, text, epoch) { calls.push({ method: 'write', label, slot, epoch }); if (hooks.write) await hooks.write(); check(epoch); values.set(slot, text); },
      async remove(slot, epoch) { calls.push({ method: 'remove', label, slot, epoch }); check(epoch); values.delete(slot); },
      async resetAccountStorage(epoch) {
        calls.push({ method: 'resetAccountStorage', label, epoch }); check(epoch);
        const previousGeneration = generation; generation = uuid(++sequence); values.clear();
        const receipt = { previousGeneration, generation, cleared: true };
        return hooks.reset ? hooks.reset(receipt) : receipt;
      },
    };
    return { bridge: value, hooks };
  }
  return { bridge, calls, values, capabilities, generation: () => generation, count: method => calls.filter(call => call.method === method).length };
}
const init = controller => ({ method: 'GET', headers: { Authorization: 'Bearer NONISSUED_NATIVE_DURABLE_FIXTURE' }, cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal });
const send = ports => ports.transport(origin + `/api/circles/${circle}/discussion`, init(new AbortController()));
const prepare = (create, bridge, timeoutMs = 1000) => create(bridge, { origin, storageKey: key, timeoutMs });

test('durable ports reject v1, missing epoch/reset and malformed capability authority', async () => {
  const create = loadPorts();
  for (const patch of [{ version: 1 }, { storageGeneration: undefined }, { storageGeneration: 'old-native-epoch' },
    { origin: 'https://other-fixture.test' }, { storageKey: 'other-key' }, { storagePolicy: 'memory-only' }, { redirectPolicy: 'follow' }]) {
    const a = nativeAuthority(), b = a.bridge(); b.hooks.capabilities = caps => ({ ...caps, ...patch });
    await assert.rejects(prepare(create, b.bridge), unavailable); assert.equal(a.count('begin'), 0); assert.equal(a.count('read'), 0);
  }
  const a = nativeAuthority(), b = a.bridge(); delete b.bridge.resetAccountStorage;
  await assert.rejects(prepare(create, b.bridge), unavailable); assert.equal(a.count('capabilities'), 0);
});

test('read/write/remove and request allocation carry the exact native ready generation', async () => {
  const a = nativeAuthority(), b = a.bridge(), ports = await prepare(loadPorts(), b.bridge), epoch = a.generation();
  await ports.storage.setItem(key, 'SYNTHETIC_SESSION'); assert.equal(await ports.storage.getItem(key), 'SYNTHETIC_SESSION');
  await ports.storage.setItem(key + '-code-verifier', 'SYNTHETIC_PKCE'); await ports.storage.removeItem(key + '-code-verifier');
  await ports.storage.setItem(key + '-user', 'SYNTHETIC_USER'); await ports.storage.removeItem(key + '-user');
  const response = await send(ports); assert.equal(response.status, 200); assert.deepEqual(JSON.parse(JSON.stringify(await response.json())), { synthetic: true });
  for (const call of a.calls.filter(call => ['read', 'write', 'remove', 'begin'].includes(call.method))) assert.equal(call.epoch, epoch);
  assert.equal(a.count('send'), 1); assert.equal(a.count('resetAccountStorage'), 0); assert.equal(a.count('cancel'), 0);
});

test('a shared bridge reset retires every prepared JS owner and calls one native reset, not three removes', async () => {
  const create = loadPorts(), a = nativeAuthority(), b = a.bridge(), first = await prepare(create, b.bridge), second = await prepare(create, b.bridge);
  for (const slot of ['session', 'pkce', 'user']) a.values.set(slot, 'SYNTHETIC_PRIVATE');
  let retired = 0; first.onAccountRetired(() => retired++); second.onAccountRetired(() => retired++);
  const epoch = a.generation(); await first.resetAccountStorage();
  assert.equal(retired, 2); assert.equal(a.count('resetAccountStorage'), 1); assert.equal(a.count('remove'), 0); assert.equal(a.values.size, 0);
  assert.equal(a.calls.find(call => call.method === 'resetAccountStorage').epoch, epoch); assert.notEqual(a.generation(), epoch);
  await assert.rejects(first.storage.getItem(key), unavailable); await assert.rejects(second.storage.setItem(key, 'STALE'), unavailable);
  await assert.rejects(second.resetAccountStorage(), unavailable); assert.equal(a.count('resetAccountStorage'), 1);
});

test('native reset bypasses a stalled JS read reply and queued stale writes never reach native storage', async () => {
  const create = loadPorts(), a = nativeAuthority(), b = a.bridge(), held = gate(); a.values.set('session', 'OLD_PRIVATE_VALUE');
  b.hooks.read = () => held.promise; const ports = await prepare(create, b.bridge);
  const oldRead = assert.rejects(ports.storage.getItem(key), unavailable); await flush();
  const queuedWrite = assert.rejects(ports.storage.setItem(key, 'STALE_QUEUED_WRITE'), unavailable);
  await ports.resetAccountStorage(); assert.equal(a.count('resetAccountStorage'), 1); assert.equal(a.count('write'), 0);
  const fresh = await prepare(create, b.bridge); await fresh.storage.setItem(key, 'NEW_CURRENT_VALUE');
  held.resolve('OLD_PRIVATE_VALUE'); await Promise.all([oldRead, queuedWrite]);
  assert.equal(a.count('write'), 1); assert.equal(a.values.get('session'), 'NEW_CURRENT_VALUE');
});

test('an old native write still awaiting execution cannot repopulate storage after reset', async () => {
  const create = loadPorts(), a = nativeAuthority(), b = a.bridge(), held = gate(); b.hooks.write = () => held.promise;
  const ports = await prepare(create, b.bridge), staleWrite = assert.rejects(ports.storage.setItem(key, 'STALE_NATIVE_WRITE'), unavailable);
  await flush(); assert.equal(a.count('write'), 1); await ports.resetAccountStorage();
  held.resolve(); await staleWrite; assert.equal(a.values.has('session'), false);
});

test('reset retirement is immediate and a stalled native reset is requested exactly once', async () => {
  const a = nativeAuthority(), b = a.bridge(), held = gate(), ports = await prepare(loadPorts(), b.bridge, 30);
  b.hooks.reset = () => held.promise; let retired = 0; ports.onAccountRetired(() => retired++);
  const resetting = assert.rejects(ports.resetAccountStorage(), unavailable);
  assert.equal(retired, 1); await assert.rejects(ports.resetAccountStorage(), unavailable);
  await resetting; assert.equal(a.count('resetAccountStorage'), 1); assert.equal(a.count('remove'), 0);
  held.resolve({ previousGeneration: uuid(1), generation: uuid(2), cleared: true }); await flush();
  await assert.rejects(ports.storage.getItem(key), unavailable);
});

test('lost committed reset reply quarantines old ready capabilities until a manual fresh native generation is confirmed', async () => {
  const create = loadPorts(), a = nativeAuthority(), b = a.bridge(), ports = await prepare(create, b.bridge, 30), staleCaps = a.capabilities();
  b.hooks.reset = () => new Promise(() => {});
  await assert.rejects(ports.resetAccountStorage(), unavailable); assert.notEqual(a.generation(), staleCaps.storageGeneration);
  assert.equal(a.count('capabilities'), 1, 'Recovery must not happen automatically');
  b.hooks.capabilities = () => staleCaps; await assert.rejects(prepare(create, b.bridge), unavailable);
  delete b.hooks.capabilities; const fresh = await prepare(create, b.bridge); await fresh.storage.setItem(key, 'FRESH_AFTER_MANUAL_RECOVERY');
  assert.equal(a.values.get('session'), 'FRESH_AFTER_MANUAL_RECOVERY'); assert.equal(a.count('resetAccountStorage'), 1);
});

test('malformed reset receipts stay closed; a later manual ready generation is the only recovery authority', async () => {
  for (const patch of [{ cleared: false }, { previousGeneration: uuid(99) }, { generation: uuid(1) }, { generation: 'malformed' }]) {
    const create = loadPorts(), a = nativeAuthority(), b = a.bridge(), ports = await prepare(create, b.bridge);
    b.hooks.reset = receipt => ({ ...receipt, ...patch }); await assert.rejects(ports.resetAccountStorage(), unavailable);
    await assert.rejects(ports.storage.getItem(key), unavailable); await assert.rejects(send(ports), unavailable);
    assert.equal(a.count('begin'), 0); const recovered = await prepare(create, b.bridge); assert.equal(await recovered.storage.getItem(key), null);
  }
});

test('capabilities captured before a reset cannot resurrect an earlier generation when delivered late', async () => {
  const create = loadPorts(), a = nativeAuthority(), b = a.bridge(), first = await prepare(create, b.bridge), held = gate();
  b.hooks.capabilities = caps => held.promise.then(() => caps);
  const preparing = assert.rejects(prepare(create, b.bridge), unavailable); await flush();
  await first.resetAccountStorage(); held.resolve(); await preparing;
  delete b.hooks.capabilities; const fresh = await prepare(create, b.bridge); await fresh.storage.setItem(key, 'CURRENT');
  assert.equal(a.values.get('session'), 'CURRENT');
});

test('overlapping prepare attempts accept only the latest capability sequence', async () => {
  const create = loadPorts(), a = nativeAuthority(), b = a.bridge(), held = gate();
  b.hooks.capabilities = caps => held.promise.then(() => caps);
  const older = assert.rejects(prepare(create, b.bridge), unavailable); await flush();
  delete b.hooks.capabilities; const latest = await prepare(create, b.bridge); held.resolve(); await older;
  await latest.storage.setItem(key, 'LATEST_CAPABILITY_OWNER'); assert.equal(a.values.get('session'), 'LATEST_CAPABILITY_OWNER');
});

test('fresh native capabilities may recover before a lost reset response; that late receipt cannot retire the new owner', async () => {
  const create = loadPorts(), a = nativeAuthority(), b = a.bridge(), old = await prepare(create, b.bridge), held = gate(); let receipt;
  b.hooks.reset = value => { receipt = value; return held.promise; };
  const resetting = assert.rejects(old.resetAccountStorage(), unavailable); await flush();
  const fresh = await prepare(create, b.bridge); await fresh.storage.setItem(key, 'NEW_OWNER');
  held.resolve(receipt); await resetting; assert.equal(await fresh.storage.getItem(key), 'NEW_OWNER');
});

test('new bridge objects cannot use old native epochs to write, allocate or send after another identity reset', async () => {
  const create = loadPorts(), a = nativeAuthority(), b1 = a.bridge('one'), old = await prepare(create, b1.bridge), b2 = a.bridge('two');
  const current = await prepare(create, b2.bridge); await current.resetAccountStorage();
  await assert.rejects(old.storage.setItem(key, 'STALE_OTHER_BRIDGE'), unavailable);
  await assert.rejects(send(old), unavailable); assert.equal(a.values.size, 0); assert.equal(a.count('send'), 0);
});

test('a second bridge identity reset retires a pending already-read private reply on the first identity', async () => {
  const create = loadPorts(), a = nativeAuthority(), b1 = a.bridge('one'), held = gate(); a.values.set('session', 'RETIRED_PRIVATE_VALUE');
  b1.hooks.read = reply => held.promise.then(() => reply); const old = await prepare(create, b1.bridge);
  let retired = 0; old.onAccountRetired(() => retired++);
  const reading = assert.rejects(old.storage.getItem(key), unavailable); await flush();
  const b2 = a.bridge('two'), fresh = await prepare(create, b2.bridge); fresh.onAccountRetired(() => retired++);
  await fresh.resetAccountStorage(); const retiredAtReset = retired;
  held.resolve(); await reading; assert.equal(a.values.size, 0); assert.equal(retiredAtReset, 2);
});

test('a late capability reply from a different bridge identity cannot undo a same-account reset', async () => {
  const create = loadPorts(), a = nativeAuthority(), b1 = a.bridge('one'), first = await prepare(create, b1.bridge), b2 = a.bridge('two'), held = gate();
  b2.hooks.capabilities = caps => held.promise.then(() => caps);
  const preparing = assert.rejects(prepare(create, b2.bridge), unavailable); await flush();
  await first.resetAccountStorage(); held.resolve(); await preparing;
  delete b2.hooks.capabilities; const fresh = await prepare(create, b2.bridge); await fresh.storage.setItem(key, 'ONLY_CURRENT_GENERATION');
  assert.equal(a.values.get('session'), 'ONLY_CURRENT_GENERATION');
});

test('concurrent prepare capability sequencing is shared across wrappers for the same account namespace', async () => {
  const create = loadPorts(), a = nativeAuthority(), b1 = a.bridge('one'), b2 = a.bridge('two'), held = gate();
  b1.hooks.capabilities = caps => held.promise.then(() => caps);
  const older = assert.rejects(prepare(create, b1.bridge), unavailable); await flush();
  const latest = await prepare(create, b2.bridge); held.resolve(); await older;
  await latest.storage.setItem(key, 'LATEST_WRAPPER'); assert.equal(a.values.get('session'), 'LATEST_WRAPPER');
});

test('shared retirement does not cross either approved origin or exact storage-key boundaries', async () => {
  for (const boundary of ['origin', 'storageKey']) {
    const create = loadPorts(), a = nativeAuthority(), b1 = a.bridge('one'), first = await prepare(create, b1.bridge);
    const otherOrigin = boundary === 'origin' ? 'https://other-native-fixture.test' : origin;
    const otherKey = boundary === 'storageKey' ? 'other-synthetic-storage' : key;
    const other = nativeAuthority({ nativeOrigin: otherOrigin, storageKey: otherKey }), b2 = other.bridge('other');
    const independent = await create(b2.bridge, { origin: otherOrigin, storageKey: otherKey, timeoutMs: 1000 });
    let retired = 0; independent.onAccountRetired(() => retired++);
    await first.resetAccountStorage(); await independent.storage.setItem(otherKey, 'INDEPENDENT_ACCOUNT_NAMESPACE');
    assert.equal(retired, 0); assert.equal(other.values.get('session'), 'INDEPENDENT_ACCOUNT_NAMESPACE'); assert.equal(other.count('resetAccountStorage'), 0);
  }
});

test('reset while begin reply is pending rejects without send and cancels the late allocated handle exactly once', async () => {
  const a = nativeAuthority(), b = a.bridge(), held = gate(); b.hooks.begin = id => held.promise.then(() => id);
  const ports = await prepare(loadPorts(), b.bridge), request = assert.rejects(send(ports), unavailable); await flush();
  assert.equal(a.count('begin'), 1); await ports.resetAccountStorage(); await request;
  held.resolve(); await flush(); assert.equal(a.count('send'), 0); assert.equal(a.count('cancel'), 1);
});

test('ordinary timeout or caller abort reaps late begin handles without transmitting credentials', async () => {
  for (const reason of ['timeout', 'abort']) {
    const a = nativeAuthority(), b = a.bridge(), held = gate(), controller = new AbortController(); b.hooks.begin = id => held.promise.then(() => id);
    const ports = await prepare(loadPorts(), b.bridge, reason === 'timeout' ? 30 : 1000);
    const request = assert.rejects(ports.transport(origin + `/api/circles/${circle}/discussion`, init(controller)), unavailable); await flush();
    if (reason === 'abort') controller.abort(); await request;
    held.resolve(); await flush(); controller.abort(); await flush(); assert.equal(a.count('send'), 0); assert.equal(a.count('cancel'), 1);
  }
});

for (const reason of ['reset', 'retireStorage', 'caller abort']) test(`an already-received private body refuses JSON access after ${reason}`, async () => {
  const a = nativeAuthority(), b = a.bridge(), ports = await prepare(loadPorts(), b.bridge), controller = new AbortController();
  const response = await ports.transport(origin + `/api/circles/${circle}/discussion`, init(controller));
  assert.equal(response.status, 200); assert.equal(a.count('send'), 1);
  if (reason === 'reset') await ports.resetAccountStorage();
  else if (reason === 'retireStorage') ports.retireStorage();
  else controller.abort();
  await assert.rejects(response.json(), unavailable);
  assert.equal(a.count('send'), 1, 'Retirement must not resend or fetch a replacement body');
});
