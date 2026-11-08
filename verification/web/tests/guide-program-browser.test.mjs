import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from '../../../platforms/tests/load-source.mjs';
import { guideProgramFixture, MEMBER } from './support/guide-program-read-fixture.mjs';

const { createGuideProgramSession, parseGuideProgram } = sourceLoader()('lib/salons/browser-program.ts');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const S = '33333333-3333-4333-8333-333333333333';
const empty = () => ({ salon: null, members: [], sessions: [], stats: null, guide: null, myMembership: null });
const membership = { sessions_attended: 2, sessions_led: 1, is_guide_candidate: false };
const program = (title = 'Fictional private program A') => ({ salon: { id: S, title, status: 'active' },
  members: [{ id: 'salon-member-1', role: 'member', ...membership, members: { display_name: 'Fictional private member A' } }],
  sessions: [{ id: 'salon-session-1', session_date: '2026-11-09', session_number: 1, status: 'scheduled', track: 'blockchain', topic: 'Fictional private topic' }],
  stats: { current_week: 1 }, guide: { display_name: 'Fictional guide', guide_level: 1 }, myMembership: { ...membership } });
const actor = (id = A, provider = 'wallet') => ({ member: { id, supabase_auth_id: provider === 'supabase' ? B : null }, auth: { provider, subject: provider === 'wallet' ? id : B } });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));
function fixture(t, timeout = 1000) {
  const calls = [], f = { identity: actor(), body: program(), override: null, intent: S };
  const session = createGuideProgramSession(async (path, init) => {
    calls.push({ path, ...init });
    if (f.override) { const r = f.override(path, init); if (r !== undefined) return r; }
    if (path === '/api/auth/member') return reply(f.identity ?? { session: 'signed_out' }, f.identity ? 200 : 401);
    if (path === '/api/salons/my-salon') return reply(f.body);
    if (path === '/api/salons/' + S && init.method === 'POST') { f.body = program(); return reply({ success: true }); }
    throw Error('Unexpected request');
  }, timeout, () => f.intent);
  t.after(() => session.dispose()); return { ...f, state: f, session, calls };
}

test('wallet and Supabase selections use only cookies and server-checked member preconditions', async t => {
  for (const provider of ['wallet', 'supabase']) {
    const f = fixture(t); f.state.identity = actor(A, provider); await f.session.load();
    assert.equal(f.session.model().program.salon.title, program().salon.title);
    assert.equal(f.session.model().phase, 'ready');
    assert.equal(f.calls.filter(c => c.path === '/api/auth/member').length, 2);
    for (const call of f.calls) {
      assert.equal(call.method, 'GET'); assert.equal(call.credentials, 'same-origin'); assert.equal(call.cache, 'no-store');
      assert.equal(new Headers(call.headers).get('x-soe-auth-intent'), S); assert.equal(call.redirect, 'error'); assert(!new Headers(call.headers).has('authorization'));
      if (call.path.includes('/salons/')) assert.equal(new Headers(call.headers).get('x-soe-expected-member'), A);
    }
  }
});

test('sign-out cannot look like a verified empty membership, and never provisions a member', async t => {
  const f = fixture(t); f.state.identity = null; await f.session.load();
  assert.equal(f.session.model().phase, 'signed-out'); assert.equal(f.session.model().canJoin, false);
  assert.equal(f.calls.length, 1); assert.equal(f.session.model().program, null);
});

test('a genuine empty program enables a single explicit join; readback verifies membership and progress', async t => {
  const f = fixture(t); f.state.body = empty(); await f.session.load();
  assert.equal(f.session.model().canJoin, true);
  await Promise.all([f.session.join(S), f.session.join(S)]);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(f.session.model().program.myMembership.sessions_attended, 2);
  assert.equal(f.session.model().canJoin, false);
  assert.equal(f.calls.find(c => c.method === 'POST').body, '{"action":"join"}');
});

test('sign-out/account retirement clears all displayed private state before any follow-up request', async t => {
  const f = fixture(t); await f.session.load(); const count = f.calls.length;
  f.session.retire(); const view = f.session.model();
  assert.equal(view.program, null); assert.equal(view.phase, 'retired'); assert.equal(view.canJoin, false);
  assert(!JSON.stringify(view).includes('Fictional private')); assert.equal(f.calls.length, count);
  f.state.identity = actor(B); f.state.body = program('Fictional private program B');
  await f.session.load(); assert.equal(f.session.model().program.salon.title, 'Fictional private program B');
});

test('an old account response that ignores abort cannot overwrite a freshly checked account', async t => {
  const f = fixture(t), gate = deferred(); let held = false;
  f.state.override = path => { if (path === '/api/salons/my-salon' && !held) { held = true; return gate.promise; } };
  const first = f.session.load(); await tick(); assert(held);
  f.session.retire(); f.state.identity = actor(B); f.state.body = program('Fictional B'); await f.session.load();
  gate.resolve(reply(program('Late private A'))); await first; await tick();
  assert.equal(f.session.model().program.salon.title, 'Fictional B');
});

test('account change without a notification is caught by the final identity check', async t => {
  const f = fixture(t); let proofs = 0;
  f.state.override = path => { if (path === '/api/auth/member') return reply(actor(++proofs === 1 ? A : B)); };
  await f.session.load(); assert.equal(f.session.model().program, null); assert.equal(f.session.model().phase, 'unavailable');
});

test('changing provider or member before a join sends no write', async t => {
  for (const next of [actor(B), actor(A, 'supabase')]) {
    const f = fixture(t); f.state.body = empty(); await f.session.load(); f.state.identity = next;
    await f.session.join(S); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
    assert.equal(f.session.model().program, null); assert.equal(f.session.model().canJoin, false);
  }
});

test('retirement while the pre-join identity lookup waits prevents a delayed POST', async t => {
  const f = fixture(t); f.state.body = empty(); await f.session.load(); const gate = deferred();
  f.state.override = path => path === '/api/auth/member' ? gate.promise : undefined;
  const joining = f.session.join(S); await tick(); f.session.retire(); gate.resolve(reply(actor())); await joining;
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0); assert.equal(f.session.model().phase, 'retired');
});

test('retirement after transmission ignores the reply and does not send a follow-up read', async t => {
  const f = fixture(t); f.state.body = empty(); await f.session.load(); const gate = deferred();
  f.state.override = (_path, init) => init.method === 'POST' ? gate.promise : undefined;
  const joining = f.session.join(S); await tick(); assert.equal(f.calls.at(-1).method, 'POST'); const count = f.calls.length;
  f.session.retire(); gate.resolve(reply({ success: true })); await joining; await tick();
  assert.equal(f.calls.length, count); assert.equal(f.session.model().program, null); assert.equal(f.session.model().phase, 'retired');
});

test('unconfirmed join stays locked against repeat writes even after an empty refresh', async t => {
  const f = fixture(t); f.state.body = empty(); await f.session.load();
  f.state.override = (_p, init) => init.method === 'POST' ? reply({ error: 'PRIVATE_BACKEND_CANARY' }, 503) : undefined;
  await f.session.join(S); assert.equal(f.session.model().phase, 'unknown'); assert(!JSON.stringify(f.session.model()).includes('CANARY'));
  await f.session.load(); await f.session.join(S); assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(f.session.model().canJoin, false);
  f.state.body = program(); await f.session.load(); assert.equal(f.session.model().phase, 'ready');
});

test('private read denial and malformed bodies never show stale data or false availability', async t => {
  for (const response of [reply({}, 401), reply({}, 403), reply({}, 503), reply({ salon: {} }), new Response('not json')]) {
    const f = fixture(t); await f.session.load();
    f.state.override = path => path === '/api/salons/my-salon' ? response : undefined;
    await f.session.load(); assert.equal(f.session.model().phase, 'unavailable'); assert.equal(f.session.model().program, null); assert.equal(f.session.model().canJoin, false);
  }
});

test('timeouts complete promptly even when transport ignores abort, then late success is discarded', async t => {
  const f = fixture(t, 20), gate = deferred(); f.state.override = () => gate.promise;
  await f.session.load(); assert.equal(f.session.model().phase, 'unavailable');
  gate.resolve(reply(actor())); await tick(); assert.equal(f.calls.length, 1); assert.equal(f.session.model().program, null);
});

test('background/offline retirement prevents requests until active and explicitly refreshed', async t => {
  const f = fixture(t); await f.session.load(); f.session.retire(true); const count = f.calls.length;
  await f.session.load(); assert.equal(f.calls.length, count); assert.equal(f.session.model().program, null);
  f.session.activate(); assert.equal(f.calls.length, count); await f.session.load(); assert.equal(f.session.model().phase, 'ready');
});

test('unmount disposes subscriptions and ignores late identity responses without further requests', async t => {
  const f = fixture(t), gate = deferred(), emitted = [];
  f.state.override = () => gate.promise; f.session.subscribe(v => emitted.push(v));
  const pending = f.session.load(); await tick(); f.session.dispose(); const count = emitted.length;
  gate.resolve(reply(actor())); await pending; await tick(); await f.session.join(S); await f.session.load();
  assert.equal(emitted.length, count); assert.equal(f.calls.length, 1);
});

test('program presentation projects needed fields and rejects overlarge or malformed rows', () => {
  const data = program(); data.email = 'PRIVATE_CANARY'; data.members[0].members.email = 'PRIVATE_CANARY';
  assert(!JSON.stringify(parseGuideProgram(data)).includes('PRIVATE_CANARY'));
  for (const bad of [{ ...data, members: [...data.members, ...data.members] }, { ...data, sessions: [{ ...data.sessions[0], topic: {} }] },
    { ...data, stats: { current_week: 50 } }, { ...data, guide: {} }, { ...empty(), members: data.members }, { ...data, myMembership: null }]) {
    assert.equal(parseGuideProgram(bad), null);
  }
});

test('missing intent refuses access, and changing intent before joining cannot select another account', async t => {
  const f = fixture(t); f.state.intent = null; await f.session.load();
  assert.equal(f.calls.length, 0); assert.equal(f.session.model().phase, 'unavailable');
  f.state.intent = S; f.state.body = empty(); await f.session.load();
  f.state.intent = B; await f.session.join(S);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
});

test('the browser accepts the actual personal-program route projection over disposable SQL', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  const response = await f.read('mine'); assert.equal(response.status, 200);
  const value = parseGuideProgram(await response.json());
  assert(value?.program); assert.equal(value.program.members[0].members.display_name, 'Fictional Member');
  assert.equal(value.program.sessions[0].session_date, '2026-11-09');
  assert(!JSON.stringify(value).includes('PRIVATE_'));
});
