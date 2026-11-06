import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server.js';
import { offlineApp } from './support/offline-app.mjs';

const ORIGIN = 'https://soe.example.test';
const PROVIDER = 'https://provider.invalid';
const INTENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OLD_INTENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_SUBJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNPROVISIONED = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EDGE_ROUTES = ['match', 'projects/create', 'projects/invite', 'movement/pod/sync'];

const projectionFor = memberId => ({
  member_id: memberId, primary_builder_archetype: 'Systems Architect', decentralization_conviction: 0.5,
  epistemic_vectors: { rationalism_vs_empiricism: 0.3, risk_acceleration_tolerance: 0.2, open_source_conviction: 0.1 },
  synergistic_skills: ['TypeScript'],
});

function selection(provider, subject, intent = INTENT) {
  return { soe_auth_provider: provider, soe_auth_intent: INTENT, soe_auth_selection_v1: `v1.${intent}.${provider}.${subject}` };
}

async function fixture(path) {
  const app = offlineApp(), { ADA, JULES } = app.fakes;
  app.context.console = { ...console, log() {}, info() {}, warn() {}, error() {} };
  app.context.performance = performance;
  Object.assign(app.context.process.env, {
    NEXT_PUBLIC_SUPABASE_URL: PROVIDER, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'SYNTHETIC_PUBLIC_KEY',
    SUPABASE_SERVICE_ROLE_KEY: 'SYNTHETIC_SERVICE_KEY',
  });
  const db = app.fakes.resetDb({ members: [
    { id: ADA, tier: 'member', supabase_auth_id: SUBJECT, wallet_address: null, email: 'private@example.invalid' },
    { id: JULES, tier: 'member', supabase_auth_id: OTHER_SUBJECT, wallet_address: null },
  ] });
  db.strictSingle = true;
  const auth = [], rest = [];
  const subjects = { 'subject-a': SUBJECT, 'subject-b': OTHER_SUBJECT, unprovisioned: UNPROVISIONED };
  function verify(token) {
    auth.push(token);
    return Object.hasOwn(subjects, token) ? { id: subjects[token] } : null;
  }
  app.setMock('next/server', () => ({ NextResponse }));
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));
  app.setMock('@/lib/supabase/server', () => ({ createClient() { throw Error('No cookie-based Supabase verification expected'); } }));
  app.setMock('@supabase/supabase-js', () => ({
    createClient(_url, key) {
      if (key === 'SYNTHETIC_SERVICE_KEY') return db;
      assert.equal(key, 'SYNTHETIC_PUBLIC_KEY');
      return { auth: { async getUser(token) { const user = verify(token); return { data: { user }, error: user ? null : { message: 'Synthetic refusal' } }; } } };
    },
  }));
  app.context.fetch = async (url, init) => {
    const target = new URL(url);
    assert.equal(target.origin, PROVIDER);
    if (target.pathname === '/auth/v1/user') {
      const user = verify(new Headers(init.headers).get('authorization').slice(7));
      return user ? Response.json(user) : Response.json({}, { status: 401 });
    }
    if (target.pathname === '/rest/v1/members') {
      rest.push(target.pathname);
      const column = target.searchParams.has('id') ? 'id' : 'supabase_auth_id';
      return Response.json(db.rows('members').filter(row => 'eq.' + row[column] === target.searchParams.get(column)));
    }
    throw Error('Unexpected external request');
  };
  const from = db.from.bind(db), selects = [];
  db.from = table => {
    const query = from(table), select = query.select.bind(query);
    query.select = columns => { selects.push({ table, columns }); return select(columns); };
    return query;
  };
  const wallet = await app.load('lib/auth/walletSession.ts').createWalletSessionValue(ADA);
  const route = app.load(`app/api/${path}/route.ts`);
  async function send({ cookies = {}, authorization, origin = ORIGIN, site, body = {}, accept } = {}) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (origin) headers.set('origin', origin);
    if (site) headers.set('sec-fetch-site', site);
    if (authorization) headers.set('authorization', authorization);
    if (accept) headers.set('accept', accept);
    headers.set('cookie', Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; '));
    const request = new NextRequest(`${ORIGIN}/api/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const response = await route.POST(request);
    return { response, request };
  }
  return { ADA, JULES, db, auth, rest, selects, send, wallet, walletCookies: { ...selection('wallet', ADA), soe_wallet_id: wallet } };
}

for (const path of EDGE_ROUTES) {
  test(`${path} rejects a retained wallet after a rejected bearer`, async () => {
    const f = await fixture(path);
    const body = path === 'match' ? { projection: projectionFor(f.ADA) } : {};
    for (const cookies of [f.walletCookies, { ...selection('supabase', SUBJECT), soe_wallet_id: f.wallet }]) {
      const { response, request } = await f.send({ cookies, authorization: 'Bearer denied', body });
      assert.equal(response.status, 401);
      assert.equal(request.bodyUsed, false);
    }
    assert.deepEqual(f.auth, ['denied']);
    assert.deepEqual(f.selects, []);
    assert.deepEqual(f.rest, []);
  });

  test(`${path} rejects unselected, stale and signed-out credentials before member access`, async () => {
    const f = await fixture(path);
    for (const attempt of [
      { cookies: { soe_wallet_id: f.wallet } },
      { cookies: { ...f.walletCookies, soe_auth_provider: 'signed_out' } },
      { cookies: { ...f.walletCookies, soe_auth_provider: 'signed_out' }, authorization: 'Bearer subject-a' },
      { cookies: { ...selection('wallet', f.ADA, OLD_INTENT), soe_wallet_id: f.wallet } },
      { cookies: { ...selection('wallet', f.JULES), soe_wallet_id: f.wallet } },
      { cookies: { ...selection('supabase', SUBJECT), soe_wallet_id: f.wallet } },
      { cookies: { ...selection('wallet', f.ADA), soe_wallet_id: f.ADA } },
      { cookies: f.walletCookies, authorization: 'Basic subject-a' },
    ]) {
      const { response, request } = await f.send(attempt);
      assert.equal(response.status, 401, await response.clone().text());
      assert.equal(request.bodyUsed, false);
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
    assert.deepEqual(f.auth, []);
    assert.deepEqual(f.selects, []);
    assert.deepEqual(f.rest, []);
  });

  test(`${path} refuses a browser bearer for a different selected subject`, async () => {
    const f = await fixture(path);
    const { response, request } = await f.send({ cookies: selection('supabase', SUBJECT), authorization: 'Bearer subject-b' });
    assert.equal(response.status, 401);
    assert.equal(request.bodyUsed, false);
    assert.deepEqual(f.auth, ['subject-b']);
    assert.deepEqual(f.selects, []);
  });

  test(`${path} rejects foreign origins and requires same-origin evidence for wallet posts`, async () => {
    const f = await fixture(path);
    for (const attempt of [
      { origin: 'https://sibling.example.test', site: 'same-site' },
      { origin: null, site: 'cross-site' },
    ]) {
      const { response, request } = await f.send({ ...attempt, cookies: f.walletCookies });
      assert.equal(response.status, 403);
      assert.equal(request.bodyUsed, false);
    }
    const { response, request } = await f.send({ origin: null, site: 'same-site', cookies: f.walletCookies });
    assert.equal(response.status, 403);
    assert.equal(request.bodyUsed, false);
    assert.deepEqual(f.auth, []);
    assert.deepEqual(f.selects, []);
  });

  test(`${path} preserves the selected wallet and exact bearer paths with a bounded member lookup`, async () => {
    const f = await fixture(path);
    for (const attempt of [
      { cookies: f.walletCookies },
      { cookies: f.walletCookies, origin: null, site: 'same-origin' },
      { cookies: selection('supabase', SUBJECT), authorization: 'Bearer subject-a' },
      { authorization: 'Bearer subject-a', origin: null },
    ]) {
      const { response, request } = await f.send(attempt);
      assert.equal(response.status, 400, await response.clone().text());
      assert.equal(request.bodyUsed, true);
    }
    assert.deepEqual(f.auth, ['subject-a', 'subject-a']);
    assert.deepEqual(f.selects, Array.from({ length: 4 }, () => ({ table: 'members', columns: 'id,tier,supabase_auth_id,wallet_address' })));
    assert.deepEqual(f.rest, []);
  });
}

test('Pod streaming retains an unauthorized event without parsing a rejected request', async () => {
  const f = await fixture('movement/pod/sync');
  const { response, request } = await f.send({ cookies: { soe_wallet_id: f.wallet }, authorization: 'Bearer unprovisioned', accept: 'text/event-stream' });
  assert.equal(response.status, 200);
  const events = await response.text();
  assert.match(events, /event: error\ndata: .*"http_status":401/);
  assert.doesNotMatch(events, /event: authenticated/);
  assert.equal(request.bodyUsed, false);
  assert.equal(f.selects.length, 1);
  assert.equal(f.db.log[0].filters[0][1], 'supabase_auth_id');
});

test('A selected wallet can still read a consented match without exposing private member fields', async () => {
  const f = await fixture('match');
  const projection = projectionFor(f.ADA);
  f.db.tables.consented_match_projections = [{ ...projection, member_id: f.JULES, private_note: 'private sentinel' }];
  const { response } = await f.send({ cookies: f.walletCookies, body: { projection } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source_member_id, f.ADA);
  assert.equal(result.matches[0].candidate_id, f.JULES);
  assert.doesNotMatch(JSON.stringify(result), /private sentinel|private@example.invalid/);
});

test('A verified bearer can still scaffold a project for the two authorized participants', async () => {
  const f = await fixture('projects/create');
  const body = { creator_member_id: f.ADA, partner_member_id: f.JULES, title: 'Synthetic project', description: 'Local fixture.' };
  const { response } = await f.send({ authorization: 'Bearer subject-a', origin: null, body });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).workspace_reference.participant_member_ids, [f.ADA, f.JULES]);
  const refused = await f.send({ authorization: 'Bearer subject-a', origin: null,
    body: { ...body, creator_member_id: '33333333-3333-4333-8333-333333333333', partner_member_id: f.JULES } });
  assert.equal(refused.response.status, 403);
  assert.equal(f.db.log.filter(entry => entry.op !== 'select').length, 0);
});
