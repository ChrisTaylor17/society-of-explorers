import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PGlite } from '../tooling/node_modules/@electric-sql/pglite/dist/index.js';
import { offlineApp } from './support/offline-app.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const COMMUNITY = '44444444-4444-4444-8444-444444444444', OWNER = '11111111-1111-4111-8111-111111111111', PUBLIC = '22222222-2222-4222-8222-222222222222';
const row = index => `77777777-7777-4777-8777-${String(index).padStart(12, '0')}`;

async function fixture(t) {
  const db = new PGlite(); await db.waitReady; t.after(() => db.close());
  await db.exec(`CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE TABLE communities(id uuid PRIMARY KEY,slug text,name text,description text,mission text,is_active boolean);
    CREATE TABLE members(id uuid PRIMARY KEY,display_name text,bio text,discipline text,skills text[],project_description text,seeking text,philosophy text,profile_visibility text NOT NULL DEFAULT 'private',email text);
    CREATE TABLE community_members(community_id uuid REFERENCES communities(id),member_id uuid CONSTRAINT community_members_member_id_fkey REFERENCES members(id),joined_at timestamptz,PRIMARY KEY(community_id,member_id));
    ALTER TABLE members ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA public TO service_role; GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;`);
  await db.query('INSERT INTO communities VALUES($1,$2,$3,NULL,NULL,true)', [COMMUNITY, 'society-of-explorers', 'A fictional community']);
  await db.query("INSERT INTO members(id,display_name,profile_visibility,email) VALUES($1,'Private owner','private','PRIVATE_OWNER'),($2,'Published explorer','public','PRIVATE_EMAIL')", [OWNER, PUBLIC]);
  await db.query("INSERT INTO community_members VALUES($1,$2,'2026-01-01'),($1,$3,'2026-01-02')", [COMMUNITY, OWNER, PUBLIC]);
  // Sixty private rows lie before each sort boundary. A pre-filter cap of 20 or
  // 50 loses the public member even though the eligible result has one item.
  for (let index = 0; index < 120; index++) {
    await db.query("INSERT INTO members(id,display_name,email) VALUES($1,'PRIVATE_PADDING','PRIVATE_EMAIL')", [row(index)]);
    await db.query('INSERT INTO community_members VALUES($1,$2,$3)', [COMMUNITY, row(index), index < 60 ? '2020-01-01' : '2030-01-01']);
  }
  const app = offlineApp(), requests = [], queries = [];
  let actor = OWNER;
  app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async () => actor ? { memberId: actor } : null }));
  async function transport(input) {
    const url = new URL(typeof input === 'string' ? input : input.url), query = url.searchParams;
    assert.equal(url.origin, 'https://profile-fixture.invalid');
    const table = url.pathname.split('/').at(-1); requests.push({ table, select: query.get('select'), order: query.get('order'), limit: query.get('limit'), publication: query.get('profile.profile_visibility') });
    const eq = key => { const value = query.get(key); assert.ok(value?.startsWith('eq.'), 'Only explicit fixture equality predicates are allowed'); return value.slice(3); };
    let rows;
    try {
      await db.exec('SET ROLE service_role');
      if (table === 'communities') rows = (await db.query('SELECT * FROM communities WHERE slug=$1 AND is_active=$2', [eq('slug'), eq('is_active') === 'true'])).rows;
      else if (table === 'community_contracts' || table === 'dao_products') rows = [];
      else if (table === 'community_members' && query.has('member_id')) rows = (await db.query('SELECT community_id,member_id FROM community_members WHERE community_id=$1 AND member_id=$2', [eq('community_id'), eq('member_id')])).rows;
      else if (table === 'community_members') {
        assert.match(query.get('select'), /^community_id,member_id,profile:members!community_members_member_id_fkey!inner\(/);
        assert.equal(eq('profile.profile_visibility'), 'public');
        const relationship = await db.query("SELECT convalidated FROM pg_constraint WHERE conrelid='community_members'::regclass AND confrelid='members'::regclass AND conname='community_members_member_id_fkey'");
        if (relationship.rows.length !== 1 || !relationship.rows[0].convalidated) throw Error('Fixture relation unavailable');
        const direction = query.get('order'); assert.ok(direction === 'joined_at.asc' || direction === 'joined_at.desc');
        const limit = Number(query.get('limit')); assert.ok(limit === 20 || limit === 50);
        const sql = 'SELECT cm.community_id,cm.member_id,to_jsonb(m) AS profile FROM community_members cm INNER JOIN members m ON m.id=cm.member_id WHERE cm.community_id=$1 AND m.profile_visibility=$2 ORDER BY cm.joined_at ' + (direction.endsWith('desc') ? 'DESC' : 'ASC') + ' LIMIT $3';
        queries.push(sql); rows = (await db.query(sql, [eq('community_id'), 'public', limit])).rows;
      } else throw Error('Unexpected fixture transport');
      // The actual cached Supabase/PostgREST client owns URL serialization and
      // maybeSingle semantics. Only HTTP transport is replaced by disposable SQL.
      return Response.json(rows);
    } catch {
      return Response.json({ code: 'FIXTURE_UNAVAILABLE', message: 'Fictional database unavailable' }, { status: 400 });
    } finally { await db.exec('RESET ROLE'); }
  }
  const client = createClient('https://profile-fixture.invalid', 'FICTIONAL_FIXTURE_ONLY', {
    accessToken: async () => 'FICTIONAL_FIXTURE_ONLY', global: { fetch: transport },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => client }));
  const request = () => { const req = new Request('https://soe.invalid/api/members/discover'); req.nextUrl = new URL(req.url); return req; };
  return { db, requests, queries, setActor: value => { actor = value; },
    discover: () => app.load('app/api/members/discover/route.ts').GET(request()),
    community: () => app.load('app/api/communities/[slug]/route.ts').GET(request(), { params: Promise.resolve({ slug: 'society-of-explorers' }) }) };
}

test('actual SDK→route→service-role SQL applies publication before both public roster limits', async t => {
  const a = await fixture(t);
  for (const response of [await a.discover(), await a.community()]) {
    assert.equal(response.status, 200); const body = await response.json(); assert.deepEqual(body.members.map(profile => profile.id), [PUBLIC]);
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE_|email|profile_visibility|profile_revision|member_id|owner_member_id/);
  }
  assert.equal(a.queries.length, 2); assert.ok(a.requests.some(request => request.limit === '50')); assert.ok(a.requests.some(request => request.limit === '20'));
  await a.db.query("UPDATE members SET profile_visibility='private' WHERE id=$1", [PUBLIC]);
  assert.deepEqual((await (await a.discover()).json()).members, []); assert.deepEqual((await (await a.community()).json()).members, []);
});

test('actual SDK bounded rosters cap eligible published rows rather than private padding', async t => {
  const a = await fixture(t); await a.db.exec("UPDATE members SET profile_visibility='public',display_name='Published padding' WHERE id::text LIKE '77777777%'");
  assert.equal((await (await a.discover()).json()).members.length, 50);
  assert.equal((await (await a.community()).json()).members.length, 20);
});

test('missing publication column or verified relationship returns generic unavailable through the actual SDK', async t => {
  for (const ddl of ['ALTER TABLE members DROP COLUMN profile_visibility', 'ALTER TABLE community_members DROP CONSTRAINT community_members_member_id_fkey']) {
    const a = await fixture(t); await a.db.exec(ddl);
    for (const response of [await a.discover(), await a.community()]) { assert.equal(response.status, 503); const body = await response.json(); assert.equal('members' in body, false); assert.doesNotMatch(JSON.stringify(body), /members|profile_visibility|constraint|PRIVATE_/); }
  }
});

test('removed requester membership refuses directory before the SDK executes any profile join', async t => {
  const a = await fixture(t); await a.db.query('DELETE FROM community_members WHERE member_id=$1', [OWNER]);
  assert.equal((await a.discover()).status, 403); assert.equal(a.queries.length, 0);
});
