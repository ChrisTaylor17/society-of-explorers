import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../tooling/node_modules/@electric-sql/pglite/dist/index.js';
const ROOT = new URL('../../../', import.meta.url), SQL = {};
for (const name of ['preflight', 'apply', 'rollback']) SQL[name] = await readFile(new URL(`docs/sql/first-release-core-containment-${name}.sql`, ROOT), 'utf8');
const baseline = await readFile(new URL('./fixtures/core-containment-synthetic.sql', import.meta.url), 'utf8');
const TARGETS = ['members', 'reading_progress', 'book_highlights', 'great_books_progress', 'great_books_highlights', 'book_reflections', 'thinker_memory'];
const M = '11111111-1111-4111-8111-111111111111', U = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECEIPT = 'soe_core_containment_v1_state';
async function fixture(t) {
  const db = new PGlite(); await db.waitReady; t.after(() => db.close());
  await db.exec(baseline);
  return db;
}
async function run(db, name) { try { return await db.exec(SQL[name]); } catch (error) { await db.exec('ROLLBACK'); throw error; } }
async function role(db, name, query) { await db.exec('SET ROLE ' + name); try { return await db.query(query); } finally { await db.exec('RESET ROLE'); } }
const refused = error => { assert.equal(error.code, 'PT409', error.message); assert.doesNotMatch(error.message, /SYNTHETIC_PRIVATE|aaaaaaaa-aaaa/); return true; };
const denied = error => error.code === '42501';
async function inventory(db) {
  return {
    tables: (await db.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>$1 ORDER BY c.relname`, [RECEIPT])).rows,
    acl: (await db.query(`SELECT c.relname,a.grantor,a.grantee,a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>$1 ORDER BY c.relname,a.grantor,a.grantee,a.privilege_type`, [RECEIPT])).rows,
    columns: (await db.query(`SELECT c.relname,t.attname,a.grantor,a.grantee,a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_attribute t ON t.attrelid=c.oid CROSS JOIN LATERAL aclexplode(t.attacl) a WHERE c.relnamespace='public'::regnamespace AND c.relname<>$1 ORDER BY c.relname,t.attnum,a.grantor,a.grantee,a.privilege_type`, [RECEIPT])).rows,
    policies: (await db.query("SELECT oid,polname,polrelid,polcmd,polroles::text,pg_get_expr(polqual,polrelid) qual,pg_get_expr(polwithcheck,polrelid) check_expr FROM pg_policy ORDER BY oid")).rows,
    functions: (await db.query("SELECT oid,proacl::text,prosecdef,proconfig FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'auth'::regnamespace) ORDER BY oid")).rows,
    constraints: (await db.query(`SELECT conname,conrelid,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid IS DISTINCT FROM to_regclass('public.'||$1) ORDER BY oid`, [RECEIPT])).rows,
    data: await Promise.all(TARGETS.map(async table => ({ table, rows: (await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows }))),
  };
}
test('catalog-only preflight changes no grants, policies, functions or private rows and emits no values', async t => {
  const db = await fixture(t), before = await inventory(db), result = await run(db, 'preflight');
  assert.deepEqual(await inventory(db), before); assert.match(JSON.stringify(result), /core_containment_preflight_passed/); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE|FICTIONAL_READER|aaaaaaaa-aaaa/);
});
test('actual draft denies raw member billing and all seven private tables to both browser roles while preserving service CRUD', async t => {
  const db = await fixture(t);
  assert.equal((await role(db, 'anon', 'SELECT email,stripe_customer_id FROM members')).rows[0].email, 'SYNTHETIC_PRIVATE_EMAIL');
  await run(db, 'apply');
  for (const browser of ['anon', 'authenticated']) for (const table of TARGETS) {
    for (const query of [`SELECT * FROM ${table}`, `SELECT private_text FROM ${table}`, `DELETE FROM ${table}`, `UPDATE ${table} SET private_text='FORGED'`, `TRUNCATE ${table}`, `INSERT INTO ${table}(id) VALUES('22222222-2222-4222-8222-222222222222')`]) await assert.rejects(role(db, browser, query), denied);
  }
  for (const table of TARGETS) {
    assert.equal((await role(db, 'service_role', `SELECT private_text FROM ${table}`)).rows[0].private_text, 'PRIVATE_SYNTHETIC_TEXT');
    await role(db, 'service_role', `UPDATE ${table} SET private_text='SERVICE_UPDATED'`);
    await role(db, 'service_role', `DELETE FROM ${table}`);
    await role(db, 'service_role', table === 'members' ? `INSERT INTO members(id,display_name) VALUES('${M}','SERVICE_CREATED')` : `INSERT INTO ${table}(id) VALUES('${M}')`);
  }
});
test('apply preserves existing policies, rows, constraints, functions and unrelated table access', async t => {
  const db = await fixture(t), before = await inventory(db); await run(db, 'apply'); const after = await inventory(db);
  for (const name of ['data', 'policies', 'functions', 'constraints']) assert.deepEqual(after[name], before[name]);
  assert.equal((await role(db, 'anon', 'SELECT label FROM unrelated_public_catalog')).rows[0].label, 'PUBLIC_FIXTURE_CATALOG');
  assert.equal((await role(db, 'unrelated_reader', 'SELECT display_name FROM members')).rows[0].display_name, 'FICTIONAL_READER');
  assert.equal((await db.query("SELECT has_function_privilege('anon','public.fixture_secdef_boundary()','EXECUTE') allowed")).rows[0].allowed, true);
  for (const browser of ['anon', 'authenticated', 'service_role']) await assert.rejects(role(db, browser, `SELECT * FROM ${RECEIPT}`), denied);
  assert.equal((await db.query(`SELECT count(*)::integer n FROM ${RECEIPT}`)).rows[0].n, 7);
});
test('column grants, PUBLIC access and grant options are removed and restored exactly with prior RLS', async t => {
  const db = await fixture(t);
  await db.exec('REVOKE SELECT ON members FROM anon; GRANT SELECT(email) ON members TO anon WITH GRANT OPTION; GRANT UPDATE(tier) ON members TO authenticated WITH GRANT OPTION; GRANT SELECT ON book_reflections TO PUBLIC;');
  const before = await inventory(db); await run(db, 'apply');
  assert.equal((await db.query("SELECT has_column_privilege('anon','members','email','SELECT') allowed")).rows[0].allowed, false);
  await run(db, 'rollback'); assert.deepEqual(await inventory(db), before);
  assert.equal((await db.query("SELECT to_regclass('public.soe_core_containment_v1_state') receipt")).rows[0].receipt, null);
});
test('repeat preflight/apply and repeat rollback are idempotent and retain existing constraints', async t => {
  const db = await fixture(t), before = await inventory(db); await run(db, 'apply'); const receipt = (await db.query(`SELECT * FROM ${RECEIPT} ORDER BY target_table`)).rows;
  await run(db, 'preflight'); await run(db, 'apply'); assert.deepEqual((await db.query(`SELECT * FROM ${RECEIPT} ORDER BY target_table`)).rows, receipt);
  await run(db, 'rollback'); await run(db, 'rollback'); assert.deepEqual(await inventory(db), before);
});
test('caller search paths cannot alter metadata deparsing or persistently change caller configuration', async t => {
  const db = await fixture(t);
  await db.exec('SET search_path=public,auth'); const before = await inventory(db);
  await run(db, 'apply'); assert.equal((await db.query('SHOW search_path')).rows[0].search_path, 'public, auth');
  await db.exec('SET search_path=auth,public'); await run(db, 'preflight'); await run(db, 'rollback');
  assert.equal((await db.query('SHOW search_path')).rows[0].search_path, 'auth, public');
  await db.exec('SET search_path=public,auth'); assert.deepEqual(await inventory(db), before);
});
test('missing service privileges abort the whole migration before browser permissions change', async t => {
  const db = await fixture(t); await db.exec('REVOKE SELECT ON thinker_memory FROM service_role'); const before = await inventory(db);
  await assert.rejects(run(db, 'apply'), refused); assert.deepEqual(await inventory(db), before);
});
test('service CRUD inherited solely from PUBLIC cannot be lost by a committed containment', async t => {
  const db = await fixture(t);
  await db.exec('REVOKE ALL ON members FROM service_role; GRANT SELECT,INSERT,UPDATE,DELETE ON members TO PUBLIC');
  const before = await inventory(db);
  assert.equal((await role(db, 'service_role', 'SELECT private_text FROM members')).rows.length, 1);
  await assert.rejects(run(db, 'apply'), refused);
  assert.deepEqual(await inventory(db), before);
  assert.equal((await db.query("SELECT to_regclass('public.soe_core_containment_v1_state') receipt")).rows[0].receipt, null);
});
test('unknown table schema or ownership aborts without repair', async t => {
  for (const change of ['ALTER TABLE thinker_memory ALTER COLUMN member_id TYPE text', 'ALTER TABLE thinker_memory OWNER TO unrelated_reader']) {
    const db = await fixture(t); await db.exec(change); const before = await inventory(db); await assert.rejects(run(db, 'apply'), refused); assert.deepEqual(await inventory(db), before);
  }
});
test('browser bypass or inherited membership requires review instead of silent partial containment', async t => {
  for (const change of ['ALTER ROLE anon BYPASSRLS', 'GRANT unrelated_reader TO authenticated']) {
    const db = await fixture(t); await db.exec(change); const before = await inventory(db); await assert.rejects(run(db, 'preflight'), refused); await assert.rejects(run(db, 'apply'), refused); assert.deepEqual(await inventory(db), before);
  }
});
test('unknown same-name metadata object is never adopted or dropped', async t => {
  const db = await fixture(t); await db.exec(`CREATE TABLE ${RECEIPT}(unrelated text); INSERT INTO ${RECEIPT} VALUES('KEEP_UNRELATED')`);
  await assert.rejects(run(db, 'apply'), refused); await assert.rejects(run(db, 'rollback'), refused); assert.equal((await db.query(`SELECT unrelated FROM ${RECEIPT}`)).rows[0].unrelated, 'KEEP_UNRELATED');
});
test('later table grants or policy changes refuse rollback without undoing other tables', async t => {
  for (const change of ['GRANT SELECT ON thinker_memory TO anon', 'CREATE POLICY later_policy ON thinker_memory FOR SELECT USING(true)', 'ALTER TABLE thinker_memory ADD COLUMN later_data text', 'ALTER TABLE thinker_memory ALTER COLUMN id SET DEFAULT gen_random_uuid()', 'CREATE INDEX later_index ON thinker_memory(member_id)']) {
    const db = await fixture(t); await run(db, 'apply'); await db.exec(change); const before = await inventory(db);
    await assert.rejects(run(db, 'rollback'), refused); assert.deepEqual(await inventory(db), before); assert.equal((await db.query(`SELECT count(*)::integer n FROM ${RECEIPT}`)).rows[0].n, 7);
  }
});
test('receipt content, integrity or access tampering refuses apply and rollback', async t => {
  for (const change of [`UPDATE ${RECEIPT} SET prior_state=jsonb_set(prior_state,'{rls}','false') WHERE target_table='members'`, `DELETE FROM ${RECEIPT} WHERE target_table='members'`, `GRANT SELECT ON ${RECEIPT} TO authenticated`, `COMMENT ON TABLE ${RECEIPT} IS 'unrecognized'`]) {
    const db = await fixture(t); await run(db, 'apply'); await db.exec(change); const before = await inventory(db);
    await assert.rejects(run(db, 'apply'), refused); await assert.rejects(run(db, 'rollback'), refused); assert.deepEqual(await inventory(db), before);
  }
});
test('non-owner browser and service roles cannot run draft metadata or DDL operations', async t => {
  const db = await fixture(t), before = await inventory(db);
  for (const browser of ['anon', 'authenticated', 'service_role']) {
    await db.exec('SET ROLE ' + browser); try { for (const name of ['preflight', 'apply', 'rollback']) await assert.rejects(run(db, name), refused); } finally { await db.exec('RESET ROLE'); }
  }
  assert.deepEqual(await inventory(db), before);
});
