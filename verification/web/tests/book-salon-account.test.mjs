import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { sourceLoader } from '../../../platforms/tests/load-source.mjs';
import { participationApp, IDS } from './support/participation-app.mjs';

const { createSalonAccount } = sourceLoader()('lib/book-salons/browser-account.ts');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const S = '33333333-3333-4333-8333-333333333333', I = '44444444-4444-4444-8444-444444444444';
const actor = (id = A, provider = 'wallet') => ({ member: { id, display_name: 'Fictional owner ' + id[0], supabase_auth_id: provider === 'supabase' ? B : null },
  auth: { provider, subject: provider === 'wallet' ? id : B } });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));
async function until(fn) { for (let n = 0; n < 100 && !fn(); n++) await new Promise(r => setTimeout(r, 2)); assert(fn(), 'fixture reached expected request'); }
function fixture(t, timeout = 1000) {
  const f = { identity: actor(), intent: I, member: false, override: null }, calls = [];
  const session = createSalonAccount(async (path, init) => {
    const call = { path, ...init }; calls.push(call);
    if (f.override) { const result = f.override(path, init); if (result !== undefined) return result; }
    if (path === '/api/auth/member') return reply(f.identity ?? {}, f.identity ? 200 : 401);
    if (path.startsWith('/api/book-salons/join?')) return reply({ cohortId: S, memberId: f.identity.member.id, isMember: f.member });
    if (path === '/api/book-salons/join') { f.member = true; return reply({ joined: true }); }
    if (path === '/api/book-salons') {
      const body = JSON.parse(init.body); return reply({ cohort: { id: S, created_by: body.expectedMemberId }, requestId: body.requestId, creatorJoined: true, replayed: false });
    }
    throw Error('Unexpected request');
  }, timeout, () => f.intent, webcrypto);
  t.after(() => session.dispose());
  return { state: f, session, calls, posts: () => calls.filter(c => c.method === 'POST'),
    async draft(title = 'Private draft canary') { await session.load(); session.openCreate(); session.editDraft({ bookId: 'apology', title, maxMembers: 8, startDate: '2026-11-12' }); } };
}

test('wallet and Supabase accounts use cookie-only fresh identity with both write preconditions', async t => {
  for (const provider of ['wallet', 'supabase']) {
    const f = fixture(t); f.state.identity = actor(A, provider); await f.draft(); await f.session.create();
    assert.equal(f.session.model().result.kind, 'created'); assert.equal(f.session.model().draft, null); assert.equal(f.posts().length, 1);
    for (const c of f.calls) {
      const h = new Headers(c.headers); assert(!h.has('authorization')); assert.equal(h.get('x-soe-auth-intent'), I);
      assert.equal(c.credentials, 'same-origin'); assert.equal(c.cache, 'no-store'); assert.equal(c.redirect, 'error');
      if (c.path !== '/api/auth/member') assert.equal(h.get('x-soe-expected-member'), A);
    }
    assert.equal(JSON.parse(f.posts()[0].body).expectedMemberId, A);
  }
});

test('absent selection, signed-out account and malformed identity never enable private actions', async t => {
  for (const modify of [f => { f.intent = null; }, f => { f.identity = null; }, f => { f.identity.auth.subject = S; }]) {
    const f = fixture(t); modify(f.state); await f.session.load(); f.session.openCreate(); await f.session.join(S);
    assert.equal(f.session.model().canAct, false); assert.equal(f.session.model().draft, null); assert.equal(f.posts().length, 0);
  }
});

test('invalid form values send no write, and concurrent creation clicks share one request', async t => {
  const f = fixture(t); await f.draft();
  for (const patch of [{ maxMembers: 13 }, { maxMembers: 8, startDate: '2026-02-30' }, { startDate: '', bookId: 'soe-circles-path' }]) {
    f.session.editDraft(patch); await f.session.create(); assert.equal(f.posts().length, 0); assert.match(f.session.model().error, /Choose a book/);
  }
  f.session.editDraft({ bookId: 'apology' }); await Promise.all([f.session.create(), f.session.create()]); assert.equal(f.posts().length, 1);
});

test('a lost creation reply retains the exact request, rejects changed details, and survives draft retirement without retaining text', async t => {
  const f = fixture(t); await f.draft(); f.state.override = (_p, init) => init.method === 'POST' ? Promise.reject(Error('Lost reply')) : undefined;
  await f.session.create(); const original = JSON.parse(f.posts()[0].body); assert(f.session.model().pendingCreation);
  f.session.editDraft({ title: 'Changed details' }); await f.session.create(); assert.equal(f.posts().length, 1); assert.match(f.session.model().error, /exactly the same/);
  f.session.retire(true); assert.equal(f.session.model().draft, null); assert(!JSON.stringify(f.session.model()).includes('Private draft canary'));
  f.session.activate(); await f.draft(); f.state.override = null; await f.session.create();
  assert.equal(JSON.parse(f.posts()[1].body).requestId, original.requestId); assert.equal(f.session.model().pendingCreation, false); assert.equal(f.session.model().result.kind, 'created');
});

test('pending creation belongs to its account and cannot be borrowed or silently discarded by a different account', async t => {
  const f = fixture(t); await f.draft(); f.state.override = (_p, init) => init.method === 'POST' ? reply({}, 503) : undefined;
  await f.session.create(); const original = JSON.parse(f.posts()[0].body).requestId;
  f.session.retire(); f.state.identity = actor(B); f.state.override = null; await f.draft('B draft'); assert.equal(f.session.model().pendingCreation, false);
  await f.session.create(); assert.notEqual(JSON.parse(f.posts()[1].body).requestId, original);
  f.session.retire(); f.state.identity = actor(); await f.draft(); assert(f.session.model().pendingCreation); await f.session.create();
  assert.equal(JSON.parse(f.posts()[2].body).requestId, original);
});

test('account or provider change before creation retires the draft and sends no write', async t => {
  for (const identity of [actor(B), actor(A, 'supabase'), null]) {
    const f = fixture(t); await f.draft(); f.state.identity = identity; await f.session.create();
    assert.equal(f.posts().length, 0); assert.equal(f.session.model().draft, null); assert.equal(f.session.model().phase, 'retired');
  }
});

test('a silent browser selection change clears the old draft before another edit or form opening', async t => {
  for (const action of ['edit', 'open']) {
    const f = fixture(t); await f.draft(); f.state.intent = S;
    if (action === 'edit') f.session.editDraft({ title: 'Replacement' }); else f.session.openCreate();
    assert.equal(f.session.model().draft, null); assert.equal(f.session.model().canAct, false); assert.equal(f.posts().length, 0);
  }
});

test('retirement during pre-write lookup prevents a delayed POST; retirement after transmission rejects late success', async t => {
  for (const stage of ['identity', 'post']) {
    const f = fixture(t); await f.draft(); const held = gate(); let reached = false;
    f.state.override = (p, init) => { if (stage === 'identity' ? p === '/api/auth/member' : init.method === 'POST') { reached = true; return held.promise; } };
    const save = f.session.create(); await until(() => reached); const count = f.calls.length;
    f.session.retire(); held.resolve(stage === 'identity' ? reply(actor()) : reply({ creatorJoined: true })); await save; await tick();
    assert.equal(f.calls.length, count); assert.equal(f.posts().length, stage === 'identity' ? 0 : 1);
    assert.equal(f.session.model().result, null); assert.equal(f.session.model().draft, null);
  }
});

test('changed selection without a notification and a failed post-write identity check clear private form state', async t => {
  for (const mode of ['intent', 'identity']) {
    const f = fixture(t); await f.draft(); f.state.override = (_p, init) => {
      if (init.method === 'POST') {
        if (mode === 'intent') f.state.intent = S; else f.state.identity = actor(B);
        const input = JSON.parse(init.body); return reply({ cohort: { id: S, created_by: A }, requestId: input.requestId, creatorJoined: true, replayed: false });
      }
    };
    await f.session.create(); assert.equal(f.session.model().phase, 'retired'); assert.equal(f.session.model().draft, null); assert.equal(f.session.model().result, null);
  }
});

test('malformed or wrong-owner creation receipts remain unconfirmed and never echo backend text', async t => {
  for (const value of [{ cohort: { id: S, created_by: B }, creatorJoined: true }, { creatorJoined: true, error: 'PRIVATE_BACKEND_CANARY' }]) {
    const f = fixture(t); await f.draft(); f.state.override = (_p, init) => init.method === 'POST' ? reply(value) : undefined;
    await f.session.create(); assert.equal(f.session.model().result, null); assert(f.session.model().pendingCreation); assert(!JSON.stringify(f.session.model()).includes('BACKEND_CANARY'));
  }
});

test('current member readback avoids a duplicate join and a new join is checked against its owner afterward', async t => {
  for (const already of [true, false]) {
    const f = fixture(t); f.state.member = already; await f.session.load(); await Promise.all([f.session.join(S), f.session.join(S)]);
    assert.equal(f.session.model().result.kind, 'member'); assert.equal(f.posts().length, already ? 0 : 1);
    assert.equal(f.session.model().pendingJoin, null);
  }
});

test('success-shaped join without owned membership stays locked until a later read-only check confirms it', async t => {
  const f = fixture(t); await f.session.load(); f.state.override = (p, init) => p === '/api/book-salons/join' && init.method === 'POST' ? reply({ joined: true }) : undefined;
  await f.session.join(S); assert.equal(f.session.model().result, null); assert.equal(f.session.model().pendingJoin, S);
  await f.session.load(); await f.session.join(S); assert.equal(f.posts().length, 1); assert.equal(f.session.model().result, null);
  f.state.member = true; await f.session.checkJoin(); assert.equal(f.posts().length, 1); assert.equal(f.session.model().result.kind, 'member');
});

test('wrong-owner, failed or malformed membership checks never authorize a join or report false membership', async t => {
  for (const response of [reply({ cohortId: S, memberId: B, isMember: true }), reply({ cohortId: A, memberId: A, isMember: true }), reply({}, 503), new Response('not json')]) {
    const f = fixture(t); await f.session.load(); f.state.override = p => p.includes('?cohortId') ? response : undefined;
    await f.session.join(S); assert.equal(f.posts().length, 0); assert.equal(f.session.model().result, null); assert.match(f.session.model().error, /not be confirmed/);
  }
});

test('a known rejected join and false membership permit a fresh explicit attempt, not automatic retry', async t => {
  const f = fixture(t); await f.session.load(); f.state.override = (_p, init) => init.method === 'POST' ? reply({ error: 'unavailable' }, 400) : undefined;
  await f.session.join(S); assert.equal(f.session.model().pendingJoin, null); assert.equal(f.posts().length, 1); assert.equal(f.session.model().result, null);
  f.state.override = null; await f.session.join(S); assert.equal(f.posts().length, 2); assert.equal(f.session.model().result.kind, 'member');
});

test('timeouts settle even when transport ignores abort; disposed controllers cannot restore or send private work', async t => {
  const f = fixture(t, 20), held = gate(); f.state.override = () => held.promise;
  await f.session.load(); assert.equal(f.session.model().phase, 'unavailable'); held.resolve(reply(actor())); await tick(); assert.equal(f.session.model().result, null);
  f.state.override = null; await f.draft(); const count = f.calls.length; f.session.dispose(); await f.session.create(); await f.session.load();
  assert.equal(f.calls.length, count); assert.equal(f.session.model().draft, null);
});

test('membership handler reads only the authenticated actor under real disposable SQL and preserves the controlled join', async t => {
  const f = await participationApp(); t.after(() => f.close()); f.setActor(IDS.newcomer);
  await f.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [IDS.salon, IDS.newcomer]);
  const path = '/api/book-salons/join?cohortId=' + IDS.salon;
  const read = async status => { const response = await f.dispatch(path); assert.equal(response.status, status); assert.match(response.headers.get('cache-control'), /private.*no-store/); return response.json(); };
  assert.deepEqual(await read(200), { cohortId: IDS.salon, memberId: IDS.newcomer, isMember: false });
  assert.equal((await f.dispatch('/api/book-salons/join', 'POST', { cohortId: IDS.salon })).status, 200);
  assert.deepEqual(await read(200), { cohortId: IDS.salon, memberId: IDS.newcomer, isMember: true });
  f.setActor(IDS.reader); await f.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [IDS.salon, IDS.reader]);
  assert.deepEqual(await read(200), { cohortId: IDS.salon, memberId: IDS.reader, isMember: false });
  f.setActor(null); const before = f.calls.length; await read(401); assert.equal(f.calls.length, before);
  f.setActor(IDS.reader); assert.equal((await f.dispatch('/api/book-salons/join?cohortId=' + IDS.circle)).status, 403);
  for (const query of ['', '?cohortId=bad', '?cohortId=' + IDS.salon + '&cohortId=' + IDS.salon, '?cohortId=' + IDS.salon + '&memberId=' + IDS.host]) {
    const n = f.calls.length; assert.equal((await f.dispatch('/api/book-salons/join' + query)).status, 400); assert.equal(f.calls.length, n);
  }
  await f.db.exec('REVOKE SELECT ON book_cohort_members FROM service_role;');
  try { const result = await read(503); assert.equal(Object.hasOwn(result, 'isMember'), false); }
  finally { await f.db.exec('GRANT SELECT ON book_cohort_members TO service_role;'); }
});
