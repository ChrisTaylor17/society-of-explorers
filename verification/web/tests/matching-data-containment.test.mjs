import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { PGlite } from '../tooling/node_modules/@electric-sql/pglite/dist/index.js';

const root = new URL('../../../', import.meta.url);
function source(path) {
  const file = new URL(path, root), info = lstatSync(file);
  assert(info.isFile() && (!info.size || info.blocks)); return readFileSync(file, 'utf8');
}
const apply = source('docs/sql/matching-data-containment-apply.sql');
const preflight = source('docs/sql/matching-data-containment-preflight.sql');
const targets = ['community_match_profiles', 'community_matches', 'consented_match_projections'];
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const community = '33333333-3333-4333-8333-333333333333';

async function fixture(t) {
  const db = await PGlite.create(); t.after(() => db.close());
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    CREATE TABLE members(id uuid PRIMARY KEY); CREATE TABLE communities(id uuid PRIMARY KEY);
    INSERT INTO members VALUES('${a}'),('${b}'); INSERT INTO communities VALUES('${community}');
    CREATE TABLE preserved_catalog(id int PRIMARY KEY,title text); INSERT INTO preserved_catalog VALUES(1,'Synthetic public reading');
    GRANT SELECT ON preserved_catalog TO anon,authenticated;`);
  await db.exec(source('supabase/migrations/20260413_consilience_platform.sql'));
  await db.exec(source('supabase/migrations/20260517_consented_match_projections.sql'));
  // The second permissive policy on each table is present in the hosted
  // 2026-11-08 09:16 UTC catalog, but absent from the original migration.
  await db.exec(`CREATE POLICY "Server full access community_match_profiles" ON community_match_profiles FOR ALL USING(true) WITH CHECK(true);
    CREATE POLICY "Server full access community_matches" ON community_matches FOR ALL USING(true) WITH CHECK(true);
    GRANT ALL ON community_match_profiles,community_matches,consented_match_projections TO anon,authenticated,service_role;
    INSERT INTO community_match_profiles(community_id,member_id,answers,philosophical_vector)
      VALUES('${community}','${a}','{"q":"Fictional private answer A"}','{}'),('${community}','${b}','{"q":"Fictional private answer B"}','{}');
    INSERT INTO community_matches(community_id,member_a,member_b) VALUES('${community}','${a}','${b}');
    INSERT INTO consented_match_projections(member_id,epistemic_vectors,primary_builder_archetype,decentralization_conviction,synergistic_skills)
      SELECT id,'{"rationalism_vs_empiricism":0.2,"risk_acceleration_tolerance":0.3,"open_source_conviction":0.4}'::jsonb,
        'Systems Architect',0.5,ARRAY['TypeScript'] FROM members;`);
  return db;
}
async function as(db, role, sql) {
  await db.exec('SET ROLE ' + role);
  try { return await db.query(sql); } finally { await db.exec('RESET ROLE'); }
}
async function rows(db) {
  const out = {};
  for (const table of [...targets, 'preserved_catalog']) out[table] = (await db.query(`SELECT to_jsonb(t) value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
  return out;
}
async function security(db) {
  return (await db.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,pg_get_userbyid(c.relowner) owner,
    (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) column_acls,
    (SELECT jsonb_agg(jsonb_build_object('name',p.polname,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid) policies
    FROM pg_class c WHERE c.oid IN ('community_match_profiles'::regclass,'community_matches'::regclass,'consented_match_projections'::regclass) ORDER BY c.relname`)).rows;
}

test('metadata preflight observes both open policies and no-RLS projection table without reading member records', async t => {
  const db = await fixture(t), result = await db.exec(preflight);
  const catalog = result.flatMap(batch => batch.rows ?? []).find(row => row.matching_catalog)?.matching_catalog;
  assert.equal(catalog.tables.length, 3);
  assert.deepEqual(catalog.tables.map(table => [table.name, table.rls, table.policies.length]),
    [['community_match_profiles', true, 2], ['community_matches', true, 2], ['consented_match_projections', false, 0]]);
  assert.equal(catalog.tables[2].triggers[0].definition_md5, '9a0f9084126afeef420b0421ea25eef2');
  assert.doesNotMatch(JSON.stringify(catalog), /Fictional private answer/);
});

test('containment denies direct browser reads/writes and preserves all rows and unrelated public reading', async t => {
  const db = await fixture(t), before = await rows(db);
  for (const role of ['anon', 'authenticated']) for (const table of targets) {
    assert((await as(db, role, `SELECT * FROM ${table}`)).rows.length > 0);
  }
  await db.exec(apply);
  assert.deepEqual(await rows(db), before);
  for (const role of ['anon', 'authenticated']) for (const table of targets) {
    for (const statement of [`SELECT * FROM ${table}`, `INSERT INTO ${table} DEFAULT VALUES`,
      `UPDATE ${table} SET ${table === 'consented_match_projections' ? 'member_id=member_id' : 'id=id'} WHERE false`,
      `DELETE FROM ${table} WHERE false`, `TRUNCATE ${table} CASCADE`]) {
      await assert.rejects(as(db, role, statement), error => error.code === '42501');
    }
  }
  assert.equal((await as(db, 'anon', 'SELECT title FROM preserved_catalog')).rows[0].title, 'Synthetic public reading');
  assert.deepEqual(await rows(db), before);
  const state = await security(db); assert(state.every(table => table.relrowsecurity && !table.relforcerowsecurity));
  const policies = (await db.query("SELECT polroles FROM pg_policy WHERE polrelid IN ('community_match_profiles'::regclass,'community_matches'::regclass)")).rows;
  assert.equal(policies.length, 4); assert(policies.every(policy => !policy.polroles.includes(0)));
});

test('column-specific PUBLIC/browser grants are removed too; service CRUD and the update trigger remain usable', async t => {
  const db = await fixture(t);
  await db.exec('GRANT SELECT(answers) ON community_match_profiles TO PUBLIC; GRANT UPDATE(philosophical_vector) ON community_match_profiles TO authenticated;');
  await db.exec(apply); const before = await rows(db);
  await assert.rejects(as(db, 'anon', 'SELECT answers FROM community_match_profiles'), error => error.code === '42501');
  await assert.rejects(as(db, 'authenticated', "UPDATE community_match_profiles SET philosophical_vector='{}'"), error => error.code === '42501');
  for (const table of targets) assert((await as(db, 'service_role', `SELECT * FROM ${table}`)).rows.length > 0);
  await db.exec('BEGIN; SET LOCAL ROLE service_role;');
  try {
    await db.exec(`DELETE FROM community_matches;
      INSERT INTO community_matches(community_id,member_a,member_b) VALUES('${community}','${a}','${b}');
      UPDATE community_matches SET status='accepted';
      DELETE FROM community_match_profiles WHERE member_id='${a}';
      INSERT INTO community_match_profiles(community_id,member_id,answers) VALUES('${community}','${a}','{}');
      UPDATE community_match_profiles SET philosophical_vector='{}';
      UPDATE consented_match_projections SET updated_at='2000-01-01' WHERE member_id='${a}';`);
    const updated = (await db.query(`SELECT updated_at > '2000-01-02'::timestamptz current FROM consented_match_projections WHERE member_id='${a}'`)).rows[0];
    assert.equal(updated.current, true);
    await db.exec(`DELETE FROM consented_match_projections WHERE member_id='${a}';
      INSERT INTO consented_match_projections(member_id,epistemic_vectors,primary_builder_archetype,decentralization_conviction,synergistic_skills)
      VALUES('${a}','{"rationalism_vs_empiricism":0.2,"risk_acceleration_tolerance":0.3,"open_source_conviction":0.4}','Systems Architect',0.5,ARRAY['TypeScript']);`);
  } finally { await db.exec('ROLLBACK'); }
  assert.deepEqual(await rows(db), before);
  const once = await security(db); await db.exec(apply); assert.deepEqual(await security(db), once); assert.deepEqual(await rows(db), before);
});

test('unexpected authority, policy, trigger or dependency state aborts the entire transaction', async t => {
  const mutations = [
    ['extra permissive policy', 'GRANT SELECT(answers) ON community_match_profiles TO PUBLIC; CREATE POLICY unexpected_access ON community_matches FOR SELECT USING(true);'],
    ['changed existing policy', 'ALTER POLICY "Server full access community_matches" ON community_matches USING(false);'],
    ['missing observed duplicate policy', 'DROP POLICY "Server full access community_matches" ON community_matches;'],
    ['browser schema creation', 'GRANT CREATE ON SCHEMA public TO authenticated;'],
    ['role inheritance', 'CREATE ROLE extra_group; GRANT extra_group TO authenticated;'],
    ['browser bypass', 'ALTER ROLE anon BYPASSRLS;'],
    ['lost service delete privilege', 'REVOKE DELETE ON consented_match_projections FROM service_role;'],
    ['dependent view', 'CREATE VIEW legacy_matching_view AS SELECT * FROM consented_match_projections;'],
    ['forced RLS', 'ALTER TABLE consented_match_projections FORCE ROW LEVEL SECURITY;'],
    ['changed trigger body', "CREATE OR REPLACE FUNCTION set_consented_match_projections_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END; $$;"],
    ['changed table owner', 'CREATE ROLE other_owner; ALTER TABLE consented_match_projections OWNER TO other_owner;'],
  ];
  for (const [name, sql] of mutations) await t.test(name, async child => {
    const db = await fixture(child); await db.exec(sql); const beforeRows = await rows(db), beforeSecurity = await security(db);
    await assert.rejects(db.exec(apply), error => error.code === 'PT409'); await db.exec('ROLLBACK');
    assert.deepEqual(await rows(db), beforeRows); assert.deepEqual(await security(db), beforeSecurity);
  });
});
