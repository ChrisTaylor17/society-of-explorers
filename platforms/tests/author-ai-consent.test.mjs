import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync } from 'node:fs';
const leaf = new URL('./load-source.mjs', import.meta.url), info = lstatSync(leaf);
assert.ok(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks));
const { sourceLoader } = await import('./load-source.mjs');
const load = sourceLoader(), { createMessageAiConsent, MESSAGE_AI_POLICY } = load('platforms/shared/message-ai-consent.ts');
const { createMemberContributions } = load('platforms/shared/member-contributions.ts');
const circle = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222', key = '33333333-3333-4333-8333-333333333333';
const origin = 'https://consent.invalid', endpoint = `/api/circles/${circle}/messages/${id}/ai-consent`;
const clone = value => JSON.parse(JSON.stringify(value)), tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const consent = (extra = {}) => ({ circleId: circle, messageId: id, allowed: false, consentRevision: 0, policy: MESSAGE_AI_POLICY, contentHash: 'a'.repeat(64), messageRevision: 2, canEnable: true, ...extra });
const safety = (extra = {}) => ({ circleId: circle, message: { id, member_name: 'Synthetic author', content: 'Synthetic contribution text.', created_at: '2026-11-05T12:00:00Z', is_mine: true, visibility: 'visible' }, revision: 2, contentHash: 'a'.repeat(64), canReport: false, canWithdraw: true, explanations: [], ...extra });
let fixtures = 0, closed = 0;
function fixture(t, extra = {}) {
  fixtures++; const controllers = [], calls = [], snapshots = []; let current = consent(extra), hook = null;
  const request = async (path, options, mayTransmit) => {
    assert.equal(path, endpoint); assert.equal(mayTransmit(), true);
    const call = { path, options: clone(options), mayTransmit }; calls.push(call);
    const respond = () => {
      if (options.method === 'GET') return { http: 200, body: clone(current) };
      const input = JSON.parse(options.body);
      assert.deepEqual(Object.keys(input).sort(), ['allowed', 'contentHash', 'expectedConsentRevision', 'policy']);
      if (input.expectedConsentRevision !== current.consentRevision || input.contentHash !== current.contentHash || input.policy !== current.policy || input.allowed && !current.canEnable) return { http: 409, body: {} };
      current = { ...current, allowed: input.allowed, consentRevision: current.consentRevision + 1 };
      return { http: 200, body: clone(current) };
    };
    return hook ? hook(call, respond) : respond();
  };
  const create = (context = controllers.length + 1) => { const controller = createMessageAiConsent(request, circle, id, context); controllers.push(controller); controller.subscribe(model => snapshots.push(model)); controller.activity(true); return controller; };
  const controller = create();
  t.after(() => { for (const item of controllers) item.retire(); closed++; });
  return { controller, create, calls, snapshots, request, get current() { return current; }, set current(value) { current = value; }, setHook(fn) { hook = fn; },
    async check(c = controller) { await c.check(c.model().action); },
    async choose(allowed, c = controller) { if (allowed) c.confirm(true, c.model().action); await c.change(allowed, c.model().action); } };
}

test('construction and activity do not fetch; every change needs fresh explicit consent state', async t => {
  const f = fixture(t), c = f.controller;
  c.activity(true); c.activity(false); c.activity(true); await c.change(false, c.model().action);
  assert.equal(f.calls.length, 0); assert.equal(c.model().canAllow, false); assert.equal(c.model().canKeepOff, false);
  await f.check(); assert.equal(f.calls.length, 1); assert.equal(c.model().canKeepOff, true); assert.equal(c.model().canAllow, false);
});
test('allow and reaffirm need a new policy checkbox; exact receipt and matching readback confirm', async t => {
  const f = fixture(t), c = f.controller; await f.check(); await f.choose(true);
  assert.equal(c.model().phase, 'confirmed'); assert.equal(c.model().state.allowed, true); assert.equal(c.model().confirmed, false); assert.equal(c.model().canAllow, false);
  assert.equal(f.calls.length, 3); assert.equal(f.current.consentRevision, 1); await f.choose(true);
  assert.equal(f.current.consentRevision, 2); assert.equal(c.model().phase, 'confirmed');
  await f.choose(false); assert.equal(f.current.consentRevision, 3); assert.equal(c.model().state.allowed, false);
  assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 3);
});
test('hidden and withdrawn own messages retain keep-off/revoke but never grant', async t => {
  for (const allowed of [false, true]) {
    const f = fixture(t, { allowed, canEnable: false }), c = f.controller; await f.check();
    assert.equal(c.model().canConfirm, false); assert.equal(c.model().canAllow, false); assert.equal(c.model().canKeepOff, true);
    c.confirm(true, c.model().action); await c.change(true, c.model().action); assert.equal(f.calls.length, 1);
    await f.choose(false); assert.equal(c.model().phase, 'confirmed'); assert.equal(f.current.allowed, false);
  }
});
test('every captured action binds interaction, exact own keys and same-message context', async t => {
  const f = fixture(t), c = f.controller, first = c.model().action; await f.check();
  const checked = c.model().action; c.confirm(true, checked);
  await c.change(true, checked); await c.check(first); assert.equal(f.calls.length, 1);
  const current = c.model().action;
  for (const action of [{ ...current, extra: true }, { ...current, circleId: key }, { ...current, messageId: key }, { ...current, contextRevision: current.contextRevision + 1 }, Object.create(current)]) {
    await c.change(true, action); await c.check(action); c.confirm(false, action);
  }
  assert.equal(f.calls.length, 1); assert.equal(c.model().confirmed, true);
  const second = f.create(); await second.check(current); assert.equal(f.calls.length, 1);
});
test('malformed and mismatched consent reads never manufacture an off state', async t => {
  for (const change of [{ circleId: key }, { messageId: key }, { policy: 'other' }, { consentRevision: -1 }, { contentHash: 'x' }, { allowed: 'false' }, { canEnable: 'true' }]) {
    const f = fixture(t); f.setHook(() => ({ http: 200, body: { ...f.current, ...change } })); await f.check();
    assert.equal(f.controller.model().state, null); assert.equal(f.controller.model().phase, 'unavailable'); assert.equal(f.controller.model().canKeepOff, false);
  }
});
test('same-base, over-advanced, wrong-choice and wrong-hash receipts remain unknown without readback', async t => {
  for (const patch of [{ consentRevision: 0 }, { consentRevision: 2 }, { allowed: true }, { contentHash: 'b'.repeat(64) }, { messageRevision: 1 }, { messageId: key }]) {
    const f = fixture(t); await f.check(); f.setHook((call, respond) => call.options.method === 'POST' ? { http: 200, body: { ...respond().body, ...patch } } : respond());
    await f.choose(false); assert.equal(f.calls.length, 2); assert.equal(f.controller.model().phase, 'unknown'); assert.equal(f.controller.model().uncertain, true);
  }
});
test('mismatching readback and lost write replies remain uncertain; a later GET cannot settle them', async t => {
  for (const failure of ['write', 'readback']) {
    const f = fixture(t), c = f.controller; await f.check();
    let wrote = false;
    f.setHook((call, respond) => {
      if (call.options.method === 'POST') { wrote = true; const result = respond(); if (failure === 'write') throw Error('lost committed write'); return result; }
      return wrote && failure === 'readback' ? { http: 200, body: { ...f.current, messageRevision: 3 } } : respond();
    });
    await f.choose(false); assert.equal(c.model().uncertain, true); assert.equal(c.model().phase, 'unknown'); assert.equal(c.model().canNavigate, true);
    f.setHook(null); await f.check(); assert.equal(c.model().phase, 'ready'); assert.equal(c.model().uncertain, true); assert.match(c.model().message, /does not cancel/);
    const before = f.calls.length; await tick(); assert.equal(f.calls.length, before); await f.choose(false); assert.equal(c.model().uncertain, false); assert.equal(c.model().phase, 'confirmed');
  }
});
test('a newer unchanged choice fences a held older opposite choice in both directions', async t => {
  for (const latest of [false, true]) {
    const f = fixture(t, { allowed: latest }), older = f.controller, newer = f.create(); await f.check(older); await f.check(newer);
    const held = deferred(); let first = true, release;
    f.setHook((call, respond) => {
      if (call.options.method === 'POST' && first) { first = false; release = () => held.resolve(respond()); return held.promise; }
      return respond();
    });
    const old = f.choose(!latest, older); await tick(); await f.choose(latest, newer);
    assert.equal(newer.model().phase, 'confirmed'); assert.equal(f.current.allowed, latest); assert.equal(f.current.consentRevision, 1);
    release(); await old; assert.equal(older.model().phase, 'unknown'); assert.equal(f.current.allowed, latest); assert.equal(f.current.consentRevision, 1);
  }
});
test('lifecycle and reentrant observers retire work before request or readback', async t => {
  for (const stage of ['loading', 'sending', 'checking']) {
    const f = fixture(t), c = f.controller;
    if (stage !== 'loading') await f.check();
    const stop = c.subscribe(model => { if (model.phase === stage) c.activity(false); });
    if (stage === 'loading') await f.check(); else await f.choose(false);
    stop(); assert.equal(f.calls.length, stage === 'loading' ? 0 : stage === 'sending' ? 1 : 2);
    assert.equal(c.model().state, null); assert.equal(c.model().confirmed, false); const count = f.calls.length; c.activity(true); await tick(); assert.equal(f.calls.length, count);
  }
});
test('a late consent response cannot restore retired authority or use a captured checkbox', async t => {
  const f = fixture(t), c = f.controller, held = deferred(); await f.check(); c.confirm(true, c.model().action); const action = c.model().action;
  f.setHook(() => held.promise); const changing = c.change(true, action); await tick(); c.activity(false);
  held.resolve({ http: 200, body: consent({ allowed: true, consentRevision: 1 }) }); await changing; c.activity(true); c.confirm(true, action); await c.change(true, action);
  assert.equal(f.calls.length, 2); assert.equal(c.model().state, null); assert.equal(c.model().confirmed, false); assert.equal(c.model().uncertain, true);
});
test('revision exhaustion and detached model mutation never authorize a write', async t => {
  const f = fixture(t, { consentRevision: Number.MAX_SAFE_INTEGER }), c = f.controller; await f.check();
  const snapshot = c.model(); snapshot.state.consentRevision = 0; snapshot.state.canEnable = true; snapshot.confirmed = true;
  await c.change(false, snapshot.action); await c.change(true, snapshot.action); assert.equal(f.calls.length, 1); assert.equal(c.model().canKeepOff, false);
});

function parentFixture(t, options = {}) {
  const { initial = safety(), mockChild = null } = options;
  const aiConsent = Object.hasOwn(options, 'aiConsent') ? options.aiConsent : true;
  fixtures++; let scope = 'synthetic-owner', message = clone(initial), choice = consent({ canEnable: initial.message.visibility === 'visible' }), hook = null, bearerCount = 0, bearerHook = null;
  const calls = [], owners = new Set();
  const factory = mockChild ? sourceLoader({ './message-ai-consent': { createMessageAiConsent: mockChild } })('platforms/shared/member-contributions.ts').createMemberContributions : createMemberContributions;
  const session = factory({ origin, aiConsent, initialOnline: true, timeoutMs: 100, newRequestId: async () => key,
    owner: { scope: () => scope, subscribe(fn) { owners.add(fn); return () => owners.delete(fn); }, async bearer() { bearerCount++; return bearerHook ? bearerHook() : 'SYNTHETIC_NONISSUED'; } },
    transport: async (url, options) => {
      calls.push({ url, options });
      const response = () => {
        let body, status = 200;
        if (url === origin + '/api/circles/contributions') body = { items: [clone(message)], nextCursor: null };
        else if (url === origin + endpoint) {
          if (options.method === 'POST') { const input = JSON.parse(options.body); if (input.expectedConsentRevision !== choice.consentRevision) status = 409; else choice = { ...choice, allowed: input.allowed, consentRevision: choice.consentRevision + 1 }; }
          body = status === 200 ? clone(choice) : {};
        } else if (options.method === 'GET') body = clone(message);
        else { const input = JSON.parse(options.body); message = { ...message, revision: message.revision + 1, message: { ...message.message, content: null, visibility: 'withdrawn' }, canWithdraw: false }; body = { requestId: input.requestId, circleId: circle, messageId: id, replayed: false, withdrawn: true, state: clone(message) }; }
        return { status, url, redirected: false, json: async () => body };
      };
      return hook ? hook(url, options, response) : response();
    } });
  session.connect(); t.after(() => { session.disconnect(); assert.equal(owners.size, 0); closed++; });
  return { session, calls, setHook(fn) { hook = fn; }, setBearerHook(fn) { bearerHook = fn; }, get bearerCount() { return bearerCount; }, get choice() { return choice; },
    async select() { await session.refresh(); await session.select(circle, id); },
    async check() { await session.checkAiConsent(session.model().aiConsent.action); },
    changeOwner() { scope = 'new-synthetic-owner'; for (const fn of owners) fn(); } };
}
test('parent opt-in capability defaults off; current own selection is required and consent check stays explicit', async t => {
  for (const aiConsent of [false, undefined]) {
    const f = parentFixture(t, { aiConsent }); await f.select(); assert.equal(f.session.model().aiConsent, null); assert.equal(f.calls.length, 2);
  }
  const f = parentFixture(t); assert.equal(f.session.model().aiConsent, null); await f.select(); assert.equal(f.calls.length, 2); assert.equal(f.session.model().aiConsent.canCheck, true);
  await f.check(); assert.equal(f.calls.length, 3); assert.equal(f.session.model().aiConsent.state.allowed, false);
});
test('parent accepts own hidden and withdrawn selections for revoke or keep-off', async t => {
  for (const visibility of ['hidden', 'withdrawn']) {
    const state = safety(); state.message.visibility = visibility; state.message.content = null; state.canWithdraw = visibility !== 'withdrawn';
    const f = parentFixture(t, { initial: state }); await f.select(); await f.check(); assert.equal(f.session.model().aiConsent.canKeepOff, true); assert.equal(f.session.model().aiConsent.canAllow, false);
    await f.session.setAiConsent(false, f.session.model().aiConsent.action); assert.equal(f.session.model().aiConsent.phase, 'confirmed');
  }
});
test('same-message reselection rejects old consent callbacks before credentials; author changes clear child', async t => {
  const f = parentFixture(t); await f.select(); await f.check(); const old = f.session.model().aiConsent.action; f.session.back(); await f.select();
  const count = f.calls.length, credentials = f.bearerCount; await f.session.checkAiConsent(old); f.session.confirmAiConsent(true, old); await f.session.setAiConsent(false, old);
  assert.equal(f.calls.length, count); assert.equal(f.bearerCount, credentials); f.changeOwner(); assert.equal(f.session.model().aiConsent, null); assert.equal(f.session.model().selected, null);
});
test('consent in flight disables withdrawal and navigation; unresolved withdrawal disables all consent', async t => {
  const f = parentFixture(t), held = deferred(); await f.select(); await f.check();
  f.setHook((url, options, response) => url.endsWith('/ai-consent') && options.method === 'POST' ? held.promise : response());
  const run = f.session.setAiConsent(false, f.session.model().aiConsent.action); await tick(); const count = f.calls.length;
  assert.equal(f.session.model().canNavigate, false); f.session.confirm(true); await f.session.withdraw(); await f.session.check(); f.session.back(); assert.equal(f.calls.length, count);
  held.resolve({ status: 503, url: origin + endpoint, redirected: false, json: async () => ({}) }); await run;
  assert.equal(f.session.model().aiConsent.uncertain, true); assert.equal(f.session.model().canBack, true);
  f.setHook((url, options, response) => { if (!url.endsWith('/ai-consent') && options.method === 'POST') { response(); throw Error('lost withdrawal'); } return response(); });
  f.session.confirm(true); await f.session.withdraw(); assert.equal(f.session.model().safety.phase, 'unknown'); assert.equal(f.session.model().aiConsent, null); assert.equal(f.session.model().canNavigate, false);
});
test('unknown consent survives a message refresh without becoming confirmed; navigation discards it with warning', async t => {
  const f = parentFixture(t); await f.select(); await f.check(); f.setHook((url, options, response) => { if (url.endsWith('/ai-consent') && options.method === 'POST') { response(); throw Error('lost consent'); } return response(); });
  await f.session.setAiConsent(false, f.session.model().aiConsent.action); f.setHook(null); await f.session.check();
  assert.equal(f.session.model().aiConsent.uncertain, true); await f.check(); assert.equal(f.session.model().aiConsent.uncertain, true); assert.equal(f.session.model().aiConsent.phase, 'ready');
  f.session.back(); assert.equal(f.session.model().aiConsent, null); assert.match(f.session.model().message, /may still finish/);
});
test('reentrant consent observers can close selection before transport and readback', async t => {
  for (const phase of ['loading', 'sending', 'checking']) {
    const f = parentFixture(t); await f.select(); if (phase !== 'loading') await f.check();
    const stop = f.session.subscribe(model => { if (model.aiConsent?.phase === phase) f.session.close(); });
    if (phase === 'loading') await f.check(); else await f.session.setAiConsent(false, f.session.model().aiConsent.action);
    stop(); assert.equal(f.session.model().selected, null); assert.equal(f.calls.length, phase === 'loading' ? 2 : phase === 'sending' ? 3 : 4);
  }
});
test('parent request firewall rejects arbitrary consent routes and malformed bodies before credentials', async t => {
  let request;
  const fake = (port, circleId, messageId, contextRevision) => { request = port; return { model: () => ({ active: true, busy: false, uncertain: false, action: { circleId, messageId, contextRevision, interactionRevision: 0 } }), activity() {}, retire() {}, subscribe() { return () => {}; } }; };
  const f = parentFixture(t, { mockChild: fake }); await f.select(); const credentials = f.bearerCount, count = f.calls.length;
  const valid = { expectedConsentRevision: 0, contentHash: 'a'.repeat(64), policy: MESSAGE_AI_POLICY, allowed: false };
  for (const body of [{ ...valid, actor: key }, { ...valid, allowed: 'false' }, { ...valid, policy: 'other' }, { ...valid, contentHash: 'bad' }, { ...valid, expectedConsentRevision: -1 }]) {
    await assert.rejects(request(endpoint, { method: 'POST', cache: 'no-store', redirect: 'error', body: JSON.stringify(body) }, () => true));
  }
  for (const path of [endpoint + '?extra=1', endpoint.replace(id, key), endpoint + '/anything']) await assert.rejects(request(path, { method: 'GET', cache: 'no-store', redirect: 'error' }, () => true));
  await assert.rejects(request(endpoint, { method: 'GET', cache: 'no-store', redirect: 'error', body: '{}' }, () => true));
  assert.equal(f.bearerCount, credentials); assert.equal(f.calls.length, count);
});

test('cross-action reentrant observers cannot overlap consent and withdrawal while confirmations clear', async t => {
  const f = parentFixture(t); await f.select(); await f.check(); let armed = true;
  const stop = f.session.subscribe(model => {
    if (armed && model.aiConsent?.active && model.aiConsent.phase === 'idle') {
      armed = false; void f.session.checkAiConsent(model.aiConsent.action); f.session.confirm(true); void f.session.withdraw();
    }
  });
  f.session.confirm(true); await tick(); stop(); assert.equal(armed, false);
  assert.equal(f.calls.length, 3); assert.equal(f.session.model().safety.confirmed, true); assert.equal(f.session.model().aiConsent.state, null);
  let attempted = false;
  const stopOpposite = f.session.subscribe(model => {
    if (!attempted && model.safety?.confirmed === false && model.aiConsent?.phase === 'idle') {
      attempted = true; f.session.confirm(true); void f.session.withdraw();
    }
  });
  await f.check(); stopOpposite(); assert.equal(attempted, true); assert.equal(f.calls.length, 4);
  assert.equal(f.session.model().safety.confirmed, false); assert.equal(f.session.model().aiConsent.phase, 'ready');
  assert.equal(f.calls.some(call => call.options.method === 'POST'), false);
});
test('credential and response-body continuations cannot restore consent after lifecycle or owner retirement', async t => {
  for (const stage of ['credential', 'body']) for (const retire of ['activity', 'connectivity', 'owner']) {
    const f = parentFixture(t), held = deferred(); await f.select(); const count = f.calls.length;
    if (stage === 'credential') f.setBearerHook(() => held.promise);
    else f.setHook((url, options, response) => url.endsWith('/ai-consent') ? { status: 200, url, redirected: false, json: () => held.promise } : response());
    const checking = f.check(); await tick();
    if (retire === 'owner') f.changeOwner(); else f.session[retire](false);
    held.resolve(stage === 'credential' ? 'SYNTHETIC_NONISSUED' : consent()); await checking;
    assert.equal(f.calls.length, count + (stage === 'body' ? 1 : 0)); assert.equal(f.session.model().aiConsent, null); assert.equal(f.session.model().selected, null);
    const after = f.calls.length; if (retire !== 'owner') f.session[retire](true); await tick(); assert.equal(f.calls.length, after);
  }
});
test('capability accepts only actual booleans before observing account or transport', () => {
  let observed = 0;
  for (const aiConsent of ['true', 1, null, {}]) assert.throws(() => createMemberContributions({
    origin, aiConsent, initialOnline: true,
    owner: { scope() { observed++; return 'synthetic-owner'; }, bearer: async () => { observed++; return 'SYNTHETIC_NONISSUED'; }, subscribe() { observed++; return () => {}; } },
    transport: async () => { observed++; throw Error('must not run'); },
  }));
  assert.equal(observed, 0);
});
test.after(() => { assert.equal(fixtures, closed); console.log('AUTHOR_AI_CONSENT_STATS ' + JSON.stringify({ fixtures, closed, providerCalls: 0, syntheticOnly: true })); });
