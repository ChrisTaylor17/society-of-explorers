import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { offlineApp } from './support/offline-app.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const OWNER = '11111111-1111-4111-8111-111111111111';
const PUBLIC = '22222222-2222-4222-8222-222222222222';
const PRIVATE = '33333333-3333-4333-8333-333333333333';
const COMMUNITY = '44444444-4444-4444-8444-444444444444';
const ELSEWHERE = '55555555-5555-4555-8555-555555555555';
const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const authored = (id = PUBLIC, extra = {}) => ({ id, display_name: 'A published explorer', bio: 'An authored biography.', discipline: 'History', skills: ['Reading'],
  project_description: null, seeking: null, philosophy: null, profile_visibility: 'public', ...extra });
const privateExtras = { email: 'PRIVATE_EMAIL', wallet_address: 'PRIVATE_WALLET', supabase_auth_id: 'PRIVATE_SUBJECT',
  tier: 'PRIVATE_TIER', exp_tokens: 987654321, coherence_data: { private: 'PRIVATE_COHERENCE' }, current_streak: 987654322,
  total_responses: 987654323, stripe_customer_id: 'PRIVATE_BILLING', created_at: 'PRIVATE_JOINED', profile_revision: 987654324 };

function fixture({ visibility = 'private', rows, member = true } = {}) {
  const app = offlineApp();
  const db = app.fakes.resetDb({ members: rows ?? [authored(OWNER, { supabase_auth_id: SUBJECT, profile_visibility: visibility }), authored(PUBLIC, privateExtras), authored(PRIVATE, { profile_visibility: 'private', display_name: 'PRIVATE_NAME' })],
    communities: [{ id: COMMUNITY, slug: 'society-of-explorers', name: 'A public community', is_active: true, description: 'Public description', mission: null, owner_member_id: 'PRIVATE_OWNER', secret: 'PRIVATE_COMMUNITY' }],
    community_members: [ ...(member ? [{ community_id: COMMUNITY, member_id: OWNER, role: 'owner', joined_at: '2026-01-01' }] : []),
      { community_id: COMMUNITY, member_id: PUBLIC, role: 'moderator', joined_at: '2026-01-02' }, { community_id: COMMUNITY, member_id: PRIVATE, role: 'member', joined_at: '2026-01-03' }],
    community_contracts: [{ community_id: COMMUNITY, contract_type: 'governance', parameters: { template: 'custom', private_owner: 'PRIVATE_PARAMETERS', reputation_token: { symbol: 'REP', owner: 'PRIVATE_TOKEN' } } }],
    dao_products: [], question_responses: [{ member_id: PUBLIC, response_text: 'PRIVATE_RESPONSE' }], exp_events: [{ member_id: PUBLIC, amount: 987654325 }] });
  db.strictSingle = true;
  // FakeDb has no relation support. This bounded transport adapter supplies the
  // explicit FK inner-join shape; separate PGlite/SDK coverage checks SQL order.
  const from = db.from.bind(db);
  db.from = table => {
    const q = from(table), select = q.select.bind(q), eq = q.eq.bind(q), exec = q.exec.bind(q);
    let joined = false;
    q.select = (columns, ...options) => { joined = typeof columns === 'string' && columns.includes('profile:members!community_members_member_id_fkey!inner('); return select(columns, ...options); };
    q.eq = (column, value) => { if (column === 'profile.profile_visibility') { q.filters.push(['profile-eq', column, value]); return q; } return eq(column, value); };
    q.exec = () => {
      if (!joined) return exec();
      const limit = q.lim; q.lim = undefined; const response = exec(); q.lim = limit;
      if (response.error) return response;
      const publication = q.filters.find(filter => filter[1] === 'profile.profile_visibility');
      assert.equal(publication?.[2], 'public');
      const rows = response.data.flatMap(row => {
        const profile = db.rows('members').find(profile => profile.id === row.member_id && profile.profile_visibility === publication[2]);
        return profile ? [{ community_id: row.community_id, member_id: row.member_id, profile }] : [];
      });
      return { data: rows.slice(0, limit), error: null };
    };
    return q;
  };
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db }));
  let authCalls = 0;
  app.setMock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => { authCalls++; return { data: { user: { id: SUBJECT } }, error: null }; } } }) }));
  app.setMock('@/components/PublicNav', () => ({ __esModule: true, default: () => null }));
  app.setMock('@/components/PublicFooter', () => ({ __esModule: true, default: () => null }));
  app.setMock('next/navigation', () => ({ notFound() { const error = new Error('Not found'); error.digest = 'NEXT_HTTP_ERROR_FALLBACK;404'; throw error; } }));
  return { ...app, db, get authCalls() { return authCalls; } };
}
async function request(app, { provider = 'supabase', url = 'https://soe.invalid/api/members/discover', signed = true } = {}) {
  const req = new Request(url); req.nextUrl = new URL(url);
  const wallet = provider === 'wallet' && signed ? await app.load('lib/auth/walletSession.ts').createWalletSessionValue(OWNER) : null;
  req.cookies = { get: name => name === 'soe_auth_provider' ? { value: provider } : name === 'soe_wallet_id' && wallet ? { value: wallet } : undefined };
  return req;
}
const explorer = (app, id) => app.load('app/api/explorer/[id]/route.ts').GET(new Request('https://soe.invalid/api/explorer/' + id), { params: Promise.resolve({ id }) });
const discover = async (app, options) => app.load('app/api/members/discover/route.ts').GET(await request(app, options));
const community = app => app.load('app/api/communities/[slug]/route.ts').GET(new Request('https://soe.invalid/api/communities/society-of-explorers'), { params: Promise.resolve({ slug: 'society-of-explorers' }) });
function noPrivate(value) { assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|98765432|current_streak|recentResponses|responseDates|total_responses|exp_tokens|tier|wallet_address|supabase_auth_id|email|profile_revision|owner_member_id|joined_at|"role"|memberCount/); }
function failQuery(app, predicate) {
  const from = app.db.from.bind(app.db);
  app.db.from = table => { const q = from(table), exec = q.exec.bind(q); q.exec = () => predicate(table, q)
    ? { data: null, error: { code: '42703', message: 'PRIVATE_SCHEMA_FAILURE profile_visibility members service_role' } } : exec(); return q; };
}

test('actual public loader needs explicit current publication and never reads reflections, activity or billing', async () => {
  const a = fixture(), loader = a.load('lib/explorer/publicProfile.ts');
  assert.equal(await loader.loadPublicExplorerProfile(OWNER), null);
  assert.equal(await loader.loadPublicExplorerProfile(PRIVATE), null);
  assert.equal(await loader.loadPublicExplorerProfile(ELSEWHERE), null);
  assert.equal(await loader.loadPublicExplorerProfile('invalid'), null);
  const profile = await loader.loadPublicExplorerProfile(PUBLIC); assert.equal(profile.id, PUBLIC); noPrivate(profile);
  assert.deepEqual(Object.keys(profile).sort(), ['bio', 'discipline', 'display_name', 'id', 'philosophy', 'project_description', 'seeking', 'skills']);
  assert.ok(a.db.log.every(q => q.table === 'members' && q.op === 'select' && q.filters.some(f => f[1] === 'profile_visibility' && f[2] === 'public')));
  assert.equal(a.authCalls, 0);
});

test('publication revocation removes the same profile on the next actual loader/API read without a cached public fallback', async () => {
  const a = fixture(); assert.equal((await explorer(a, PUBLIC)).status, 200);
  a.db.rows('members').find(row => row.id === PUBLIC).profile_visibility = 'private';
  const response = await explorer(a, PUBLIC); assert.equal(response.status, 404); noPrivate(await response.json());
  assert.match(response.headers.get('cache-control'), /private.*no-store/); assert.match(response.headers.get('x-robots-tag'), /noindex/);
});

test('explorer API whitelists authored fields and gives private/missing IDs the same generic no-store result', async () => {
  const a = fixture(), response = await explorer(a, PUBLIC), body = await response.json(); assert.equal(response.status, 200); noPrivate(body);
  assert.deepEqual(Object.keys(body), ['profile']);
  const failures = await Promise.all([OWNER, PRIVATE, ELSEWHERE, 'invalid'].map(async id => { const r = await explorer(a, id); assert.equal(r.status, 404); return r.text(); }));
  assert.ok(failures.every(body => body === failures[0]));
});

test('schema failure, duplicate public ID and malformed public rows never become public or an empty success', async () => {
  for (const configure of [a => failQuery(a, table => table === 'members'), a => a.db.rows('members').push(authored(PUBLIC)), a => { a.db.rows('members').find(row => row.id === PUBLIC).bio = {}; }]) {
    const a = fixture(); configure(a); const r = await explorer(a, PUBLIC); assert.equal(r.status, 503); noPrivate(await r.json());
  }
  const a = fixture(); failQuery(a, table => table === 'members');
  await assert.rejects(a.load('lib/explorer/publicProfile.ts').loadPublicExplorerProfile(PUBLIC), error => error.message === 'Public profile unavailable');
});

test('DTO validation still denies non-public or mismatched rows if an upstream adapter ignores query predicates', async () => {
  for (const value of [authored(PUBLIC, { profile_visibility: 'private' }), authored(ELSEWHERE)]) {
    const a = fixture(), from = a.db.from.bind(a.db);
    a.db.from = table => { const q = from(table); if (table === 'members') q.exec = () => ({ data: value, error: null }); return q; };
    assert.equal((await explorer(a, PUBLIC)).status, 503);
  }
});

test('actual explorer page renders only published authored fields and generic metadata reads no account data', async () => {
  const a = fixture(), page = a.load('app/explorer/[id]/page.tsx'), meta = page.generateMetadata();
  assert.equal(meta.robots.index, false); assert.equal(meta.robots.follow, false); assert.equal(a.db.log.length, 0);
  noPrivate(meta); assert.equal(JSON.stringify(meta).includes('A published explorer'), false);
  const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ id: PUBLIC }) }));
  assert.match(html, /A published explorer/); assert.match(html, /An authored biography/); noPrivate(html);
  assert.doesNotMatch(html, /RECENT REFLECTIONS|STREAK|\$EXP|RESPONSES|DAYS ACTIVE/);
  for (const id of [PRIVATE, ELSEWHERE]) await assert.rejects(page.default({ params: Promise.resolve({ id }) }), error => error.digest === 'NEXT_HTTP_ERROR_FALLBACK;404');
  failQuery(a, table => table === 'members');
  await assert.rejects(page.default({ params: Promise.resolve({ id: PUBLIC }) }), error => error.digest === 'NEXT_HTTP_ERROR_FALLBACK;404');
});

test('directory authenticates selected Supabase or signed wallet owner and returns only published community profiles', async () => {
  for (const provider of ['supabase', 'wallet']) {
    const a = fixture(), response = await discover(a, { provider }), body = await response.json(); assert.equal(response.status, 200); noPrivate(body);
    assert.deepEqual(body.members.map(profile => profile.id), [PUBLIC]);
    const queries = a.db.log, membership = queries.findIndex(q => q.table === 'community_members' && q.filters.some(f => f[1] === 'member_id' && f[2] === OWNER));
    const roster = queries.findIndex(q => q.table === 'community_members' && !q.filters.some(f => f[1] === 'member_id'));
    assert.ok(membership >= 0 && roster > membership);
    const publicRead = queries.find(q => q.table === 'community_members' && q.filters.some(f => f[1] === 'profile.profile_visibility'));
    assert.ok(publicRead.filters.some(f => f[1] === 'profile.profile_visibility' && f[2] === 'public'));
    if (provider === 'wallet') assert.equal(a.authCalls, 0);
  }
});

test('signed-in outsiders and forged wallet hints cannot read the roster or published profiles', async () => {
  const a = fixture({ member: false }), response = await discover(a); assert.equal(response.status, 403); noPrivate(await response.json());
  assert.equal(a.db.log.filter(q => q.table === 'community_members').length, 1);
  assert.ok(!a.db.log.some(q => q.table === 'members' && q.filters.some(f => f[1] === 'profile_visibility')));
  const b = fixture(), denied = await discover(b, { provider: 'wallet', signed: false }); assert.equal(denied.status, 401); assert.equal(b.db.log.length, 0);
});

test('directory membership, roster and publication-schema failures return unavailable without profiles or a false empty success', async () => {
  for (const predicate of [(table, q) => table === 'community_members' && q.filters.some(f => f[1] === 'member_id'), (table, q) => table === 'community_members' && !q.filters.some(f => f[1] === 'member_id'), (table, q) => table === 'community_members' && q.filters.some(f => f[1] === 'profile.profile_visibility')]) {
    const a = fixture(); failQuery(a, predicate); const response = await discover(a); assert.equal(response.status, 503); const body = await response.json(); assert.equal('members' in body, false); noPrivate(body);
  }
  const a = fixture(); assert.equal((await discover(a, { url: 'https://soe.invalid/api/members/discover?community=one&community=two' })).status, 400);
});

test('public community route publishes only opt-in authored profiles and safe metadata without owner capabilities or identity', async () => {
  const a = fixture(), response = await community(a), body = await response.json(); assert.equal(response.status, 200); noPrivate(body);
  assert.deepEqual(body.members.map(profile => profile.id), [PUBLIC]); assert.deepEqual(body.viewer, { canManage: false });
  assert.equal(body.contracts.governance.parameters.reputation_token.symbol, 'REP');
  assert.equal(a.authCalls, 0); assert.ok(!a.db.log.some(q => q.table === 'question_responses' || q.table === 'exp_events'));
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  a.db.rows('members').find(row => row.id === PUBLIC).profile_visibility = 'private';
  assert.deepEqual((await (await community(a)).json()).members, []);
});

test('public community missing publication schema fails closed instead of exposing old roster defaults', async () => {
  const a = fixture(); failQuery(a, (table, q) => table === 'community_members' && q.filters.some(f => f[1] === 'profile.profile_visibility')); const response = await community(a); assert.equal(response.status, 503); const body = await response.json(); assert.equal('members' in body, false); noPrivate(body);
});

test('more than fifty private members before either ordering boundary cannot hide a published community profile', async () => {
  const a = fixture();
  for (let index = 0; index < 120; index++) {
    const id = `77777777-7777-4777-8777-${String(index).padStart(12, '0')}`;
    a.db.rows('members').push(authored(id, { profile_visibility: 'private', display_name: 'PRIVATE_PADDING' }));
    a.db.rows('community_members').push({ community_id: COMMUNITY, member_id: id, joined_at: index < 60 ? '2020-01-01' : '2030-01-01' });
  }
  for (const response of [await discover(a), await community(a)]) {
    assert.equal(response.status, 200); const body = await response.json(); assert.deepEqual(body.members.map(profile => profile.id), [PUBLIC]); noPrivate(body);
  }
});

test('both roster routes validate publication and relationship scope again after the database predicate', async () => {
  const valid = { community_id: COMMUNITY, member_id: PUBLIC, profile: authored(PUBLIC) };
  for (const rows of [[null], [{ ...valid, profile: authored(PUBLIC, { profile_visibility: 'private' }) }], [{ ...valid, community_id: ELSEWHERE }], [{ ...valid, member_id: ELSEWHERE }], [valid, valid]]) {
    const a = fixture(), from = a.db.from.bind(a.db);
    a.db.from = table => { const q = from(table), exec = q.exec.bind(q); q.exec = () => q.filters.some(filter => filter[1] === 'profile.profile_visibility') ? { data: rows, error: null } : exec(); return q; };
    for (const response of [await discover(a), await community(a)]) { assert.equal(response.status, 503); assert.equal('members' in await response.json(), false); }
  }
});
