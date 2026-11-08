import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { offlineApp } from './support/offline-app.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const { NextRequest } = require('next/server');
const origin = 'https://members.soe.test';
const sibling = 'https://sibling.soe.test';
const cohortId = '33333333-3333-4333-8333-333333333333';
const intent = '44444444-4444-4444-8444-444444444444';
const providerId = '55555555-5555-4555-8555-555555555555';
const salon = { bookId: 'apology', title: 'Synthetic book salon', requestId: '66666666-6666-4666-8666-666666666666' };
const payloads = { create: salon, join: { cohortId } };

async function fixture() {
  const app = offlineApp();
  const { JULES } = app.fakes;
  const db = app.fakes.resetDb({
    members: [{ id: JULES, display_name: 'Synthetic reader', supabase_auth_id: providerId }],
    book_cohorts: [{ id: cohortId, book_id: 'apology', title: 'Existing salon', max_members: 8, status: 'forming' }],
    book_cohort_members: [],
  });
  // The origin fixture checks the HTTP authority handoff. Actual locked join
  // behavior and raw-grant denial execute in circle-admission-db.test.mjs.
  const rpcCalls = [], originalRpc = db.rpc.bind(db);
  db.rpc = (name, args) => {
    if (name === 'soe_circle_legacy_salon_create') {
      const copy = JSON.parse(JSON.stringify(args));
      assert.equal(copy.p_actor, JULES);
      assert.equal(copy.p_request_id, salon.requestId);
      assert.equal(copy.p_input.bookId, 'apology');
      rpcCalls.push({ name, args: copy });
      return Promise.resolve({ data: { cohort: { id: cohortId, created_by: JULES }, requestId: salon.requestId,
        creatorJoined: true, replayed: false }, error: null });
    }
    if (name !== 'soe_circle_legacy_salon_join') return originalRpc(name, args);
    const copy = JSON.parse(JSON.stringify(args));
    assert.deepEqual(copy, { p_actor: JULES, p_cohort_id: cohortId });
    rpcCalls.push({ name, args: copy });
    return Promise.resolve({ data: { joined: true }, error: null });
  };
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));
  app.setMock('@supabase/supabase-js', () => ({ createClient: () => ({
    auth: { getUser: async token => ({
      data: { user: token === 'SYNTHETIC_SALON_BEARER' ? { id: providerId } : null }, error: null,
    }) },
  }) }));
  const signed = await app.load('lib/auth/walletSession.ts').createWalletSessionValue(JULES);
  assert(signed);
  const cookie = [
    'soe_auth_provider=wallet', `soe_auth_intent=${intent}`,
    `soe_auth_selection_v1=v1.${intent}.wallet.${JULES}`, `soe_wallet_id=${signed}`,
  ].join('; ');
  return {
    db, cookie, rpcCalls, memberId: JULES,
    handlers: {
      create: app.load('app/api/book-salons/route.ts').POST,
      join: app.load('app/api/book-salons/join/route.ts').POST,
      post: request => app.load('app/api/book-salons/[cohortId]/route.ts')
        .POST(request, { params: Promise.resolve({ cohortId }) }),
    },
  };
}

function request(action, headers, body) {
  const suffix = { create: '', join: '/join', post: '/' + cohortId }[action];
  return new NextRequest(origin + '/api/book-salons' + suffix, { method: 'POST', headers, body });
}

function privateHeaders(response) {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
}

for (const action of ['create', 'join']) {
  test(`a same-site sibling cannot ${action} a salon using the signed browser session`, async () => {
    const f = await fixture();
    // A text/plain form can serialize valid JSON as name=value plus CRLF.
    const plainForm = JSON.stringify({ ...payloads[action], padding: '=' }) + '\r\n';
    const req = request(action, {
      origin: sibling, 'sec-fetch-site': 'same-site', cookie: f.cookie, 'content-type': 'text/plain',
    }, plainForm);
    const response = await f.handlers[action](req);
    assert.equal(response.status, 403);
    assert.equal(req.bodyUsed, false);
    assert.equal(f.db.log.length, 0);
    privateHeaders(response);
  });
}

test('an ambiguous browser session or cross-origin message reaches no body or database read', async () => {
  const f = await fixture();
  for (const action of ['create', 'join', 'post']) {
    for (const headers of [{ cookie: f.cookie }, { cookie: f.cookie, origin: sibling, 'sec-fetch-site': 'same-site' }]) {
      const req = request(action, headers, JSON.stringify({ content: 'Synthetic body' }));
      const response = await f.handlers[action](req);
      assert.equal(response.status, 403);
      assert.equal(req.bodyUsed, false);
      assert.equal(f.db.log.length, 0);
      privateHeaders(response);
    }
  }
});

test('same-origin wallet creation and a verified cookie-free bearer join still work', async () => {
  const f = await fixture();
  const created = await f.handlers.create(request('create', {
    origin, 'sec-fetch-site': 'same-origin', cookie: f.cookie, 'content-type': 'application/json',
  }, JSON.stringify({ ...salon, expectedMemberId: f.memberId })));
  assert.equal(created.status, 200);
  const { cohort } = await created.json();
  assert.equal(cohort.created_by, f.memberId);
  assert.equal(f.rpcCalls[0].name, 'soe_circle_legacy_salon_create');
  assert.equal(f.db.rows('book_cohort_members').length, 0, 'The route must delegate both inserts to one controlled transaction');
  privateHeaders(created);

  const joined = await f.handlers.join(request('join', {
    authorization: 'Bearer SYNTHETIC_SALON_BEARER', 'content-type': 'application/json',
  }, JSON.stringify({ cohortId })));
  assert.equal(joined.status, 200);
  assert.deepEqual(await joined.json(), { joined: true });
  assert.deepEqual(f.rpcCalls.slice(1), [{ name: 'soe_circle_legacy_salon_join', args: { p_actor: f.memberId, p_cohort_id: cohortId } }]);
  assert.equal(f.db.rows('book_cohort_members').some(row => row.cohort_id === cohortId), false,
    'The HTTP handler must not bypass the controlled join with a raw membership write');
  privateHeaders(joined);
});

test('salon create and join refuse oversized JSON before resolving the account', async () => {
  const f = await fixture();
  for (const action of ['create', 'join']) {
    const req = request(action, { origin, cookie: f.cookie, 'content-type': 'application/json' },
      JSON.stringify({ ...payloads[action], padding: 'x'.repeat(64_000) }));
    const response = await f.handlers[action](req);
    assert.equal(response.status, 413);
    assert.equal(f.db.log.length, 0);
    privateHeaders(response);
  }
});
