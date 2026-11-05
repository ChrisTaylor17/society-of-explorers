import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpEventsDb, runExpSql as run, installAccounting, expMetadata, eventRows, queryAs, A, EXP_RECEIPT as RECEIPT, EVENT_GRANTS, EVENT_POLICIES, expSourceHashes } from './support/exp-events-containment-fixture.mjs';
const ALL = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
const refused = error => { assert.equal(error.code, 'PT409', error.message); assert.doesNotMatch(error.message, /PRIVATE_SYNTHETIC|11111111-1111/); return true; };
const denied = error => { assert.equal(error.code, '42501', error.message); return true; };
async function fixture(t, options) { const db = await createExpEventsDb(options); t.after(() => db.close()); return db; }
const receiptExists = async db => (await db.query("SELECT to_regclass('public." + RECEIPT + "') value")).rows[0].value !== null;
async function browserDenied(db) {
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ALL) assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) value', [role, 'public.exp_events', privilege])).rows[0].value, false);
    assert.equal((await db.query('SELECT has_any_column_privilege($1,$2,$3) value', [role, 'public.exp_events', 'SELECT,INSERT,UPDATE,REFERENCES'])).rows[0].value, false);
    for (const sql of ['SELECT * FROM exp_events', 'SELECT reason FROM exp_events', "INSERT INTO exp_events(amount,reason) VALUES(9,'FORGED')", 'UPDATE exp_events SET amount=99', 'DELETE FROM exp_events', 'TRUNCATE exp_events']) await assert.rejects(queryAs(db, role, sql), denied);
  }
}
async function truncateThenRollback(db, role) {
  await db.exec('BEGIN');
  try { await db.exec('SET LOCAL ROLE ' + role); await db.exec('TRUNCATE exp_events'); await db.exec('RESET ROLE'); assert.equal((await db.query('SELECT count(*)::int n FROM exp_events')).rows[0].n, 0); }
  finally { await db.exec('ROLLBACK'); }
}

test('dated event grants/policy and exact reward body provenance are bound; browser TRUNCATE succeeds before accounting only in a rolled-back synthetic transaction', async t => {
  const db = await fixture(t), before = await expMetadata(db);
  assert.equal(EVENT_GRANTS.length, 3); assert.equal(EVENT_POLICIES.length, 1);
  assert.equal(before.policies[0].using_expr, EVENT_POLICIES[0].using_expression);
  const acl = (await db.query("SELECT relacl::text value FROM pg_class WHERE oid='public.exp_events'::regclass")).rows[0].value;
  const entries = value => value.slice(1, -1).split(',').sort();
  assert.deepEqual(entries(acl), entries(EVENT_GRANTS[0].explicit_acl));
  for (const role of ['anon', 'authenticated']) await truncateThenRollback(db, role);
  assert.deepEqual(await expMetadata(db), before);
  assert.equal(Object.keys(await expSourceHashes()).filter(name => name.startsWith('docs/sql/exp-events-containment')).length, 3);
});

test('read-only preflight preserves rows, policy, grants, reward definitions, defaults and member state', async t => {
  const db = await fixture(t), before = await expMetadata(db), result = await run(db, 'preflight');
  assert.deepEqual(await expMetadata(db), before); assert.match(JSON.stringify(result), /exp_events_containment_preflight_passed/);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SYNTHETIC|11111111-1111/); assert.equal(await receiptExists(db), false);
});

test('containment denies all browser table/column authority and scrubs broad receipt defaults while preserving event/member rows, policy and reward bodies', async t => {
  const db = await fixture(t);
  await db.exec('GRANT SELECT(reason) ON exp_events TO PUBLIC;GRANT UPDATE(amount) ON exp_events TO authenticated WITH GRANT OPTION;GRANT SELECT ON exp_events TO unrelated_reader');
  const before = await expMetadata(db); await run(db, 'apply'); await browserDenied(db); const after = await expMetadata(db);
  for (const key of ['columns', 'constraints', 'indexes', 'policies', 'triggers', 'defaultAcl', 'rewards', 'members', 'rows']) assert.deepEqual(after[key], before[key]);
  assert.equal((await db.query("SELECT has_table_privilege('unrelated_reader','exp_events','SELECT') value")).rows[0].value, true);
  for (const role of ['anon', 'authenticated', 'service_role']) await assert.rejects(queryAs(db, role, 'SELECT * FROM ' + RECEIPT), denied);
  assert.equal((await db.query("SELECT has_table_privilege('unrelated_reader',$1,'SELECT') value", [RECEIPT])).rows[0].value, false);
  const receipt = JSON.stringify((await db.query('SELECT * FROM ' + RECEIPT)).rows);
  assert.doesNotMatch(receipt, /PRIVATE_SYNTHETIC_EVENT|PRIVATE_SYNTHETIC_UNATTRIBUTED/); assert.match(receipt, /default_md5/);
});

test('service CRUD and exact captured add_exp body remain operational with unchanged service grants', async t => {
  const db = await fixture(t), before = await expMetadata(db), service = (await db.query("SELECT oid FROM pg_roles WHERE rolname='service_role'")).rows[0].oid;
  await run(db, 'apply');
  const id = (await queryAs(db, 'service_role', "INSERT INTO exp_events(member_id,amount,reason) VALUES($1,4,'SYNTHETIC_NEW') RETURNING id", [A])).rows[0].id;
  await queryAs(db, 'service_role', "UPDATE exp_events SET reason='SYNTHETIC_UPDATED' WHERE id=$1", [id]);
  assert.equal((await queryAs(db, 'service_role', 'SELECT reason FROM exp_events WHERE id=$1', [id])).rows[0].reason, 'SYNTHETIC_UPDATED');
  await queryAs(db, 'service_role', 'DELETE FROM exp_events WHERE id=$1', [id]);
  await queryAs(db, 'service_role', "SELECT add_exp($1,4,'SYNTHETIC_SERVICE_REWARD')", [A]);
  const after = await expMetadata(db); assert.deepEqual(after.acl.filter(row => row.grantee === service), before.acl.filter(row => row.grantee === service));
  assert.deepEqual(after.rewards, before.rewards); assert.equal(after.members[0].profile_revision, before.members[0].profile_revision);
  assert.equal(after.rows.length, before.rows.length + 1);
});

test('exact rollback restores PUBLIC/table/column grant options and prior RLS without replacing schema or data', async t => {
  const db = await fixture(t);
  await db.exec('ALTER TABLE exp_events DISABLE ROW LEVEL SECURITY;REVOKE SELECT ON exp_events FROM anon;GRANT SELECT(reason) ON exp_events TO anon WITH GRANT OPTION;GRANT SELECT ON exp_events TO PUBLIC;GRANT UPDATE(amount) ON exp_events TO authenticated WITH GRANT OPTION');
  const before = await expMetadata(db); await run(db, 'apply'); await run(db, 'rollback'); await run(db, 'rollback');
  assert.deepEqual(await expMetadata(db), before); assert.equal(await receiptExists(db), false);
});

test('unchanged preflight/reapply/rollback preserve receipt bytes across caller search paths', async t => {
  const db = await fixture(t); await db.exec('SET search_path=public,pg_catalog'); const before = await expMetadata(db);
  await run(db, 'apply'); const receipt = (await db.query('SELECT * FROM ' + RECEIPT)).rows;
  await db.exec('SET search_path=pg_catalog,public'); await run(db, 'preflight'); await run(db, 'apply'); assert.deepEqual((await db.query('SELECT * FROM ' + RECEIPT)).rows, receipt);
  await run(db, 'rollback'); assert.equal((await db.query('SHOW search_path')).rows[0].search_path, 'pg_catalog, public');
  await db.exec('SET search_path=public,pg_catalog'); assert.deepEqual(await expMetadata(db), before);
});

test('missing or PUBLIC-derived service CRUD refuses atomically without widening grants or leaving a receipt', async t => {
  for (const sql of ['REVOKE SELECT ON exp_events FROM service_role', 'REVOKE ALL ON exp_events FROM service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON exp_events TO PUBLIC']) {
    const db = await fixture(t); await db.exec(sql); const before = await expMetadata(db);
    await assert.rejects(run(db, 'apply'), refused); assert.deepEqual(await expMetadata(db), before); assert.equal(await receiptExists(db), false);
  }
});

test('browser/service role authority, inherited access and non-owner execution refuse without repair', async t => {
  for (const sql of ['ALTER ROLE anon BYPASSRLS', 'CREATE ROLE inherited_reader;GRANT inherited_reader TO authenticated', 'CREATE ROLE inherited_service;GRANT inherited_service TO service_role', 'ALTER ROLE service_role CREATEROLE', 'GRANT CREATE ON SCHEMA public TO anon']) {
    const db = await fixture(t); await db.exec(sql); const before = await expMetadata(db);
    await assert.rejects(run(db, 'preflight'), refused); await assert.rejects(run(db, 'apply'), refused); assert.deepEqual(await expMetadata(db), before);
  }
  const db = await fixture(t), before = await expMetadata(db);
  for (const role of ['anon', 'authenticated', 'service_role']) { await db.exec('SET ROLE ' + role); try { for (const stage of ['preflight', 'apply', 'rollback']) await assert.rejects(run(db, stage), refused); } finally { await db.exec('SET ROLE postgres'); } }
  assert.deepEqual(await expMetadata(db), before);
});

test('unknown owner, column shape, FK endpoint or policy refuses before revocation', async t => {
  for (const sql of ['ALTER TABLE exp_events ADD COLUMN unknown_data text', 'ALTER TABLE exp_events ALTER COLUMN reason TYPE varchar(100)', 'ALTER TABLE exp_events OWNER TO unrelated_reader', 'ALTER TABLE exp_events DROP CONSTRAINT exp_events_member_id_fkey', 'CREATE POLICY unreviewed_events ON exp_events FOR SELECT USING(true)', 'ALTER POLICY "EXP events visible to owner" ON exp_events USING(true)']) {
    const db = await fixture(t); await db.exec(sql); const before = await expMetadata(db);
    await assert.rejects(run(db, 'apply'), refused); assert.deepEqual(await expMetadata(db), before);
  }
});

test('delegated browser table and column grantors refuse rather than lose grant-chain provenance', async t => {
  for (const sql of ['GRANT SELECT ON exp_events TO delegator WITH GRANT OPTION;SET ROLE delegator;GRANT SELECT ON exp_events TO anon;SET ROLE postgres', 'GRANT UPDATE(amount) ON exp_events TO delegator WITH GRANT OPTION;SET ROLE delegator;GRANT UPDATE(amount) ON exp_events TO authenticated;SET ROLE postgres']) {
    const db = await fixture(t); await db.exec('CREATE ROLE delegator;GRANT USAGE ON SCHEMA public TO delegator;' + sql); const before = await expMetadata(db);
    await assert.rejects(run(db, 'preflight'), refused); await assert.rejects(run(db, 'apply'), refused); assert.deepEqual(await expMetadata(db), before);
  }
});

test('unknown receipt objects and receipt integrity/access drift are never adopted or removed', async t => {
  const collision = await fixture(t); await collision.exec('CREATE TABLE ' + RECEIPT + "(unrelated text);INSERT INTO " + RECEIPT + " VALUES('KEEP')");
  for (const stage of ['preflight', 'apply', 'rollback']) await assert.rejects(run(collision, stage), refused);
  assert.equal((await collision.query('SELECT unrelated FROM ' + RECEIPT)).rows[0].unrelated, 'KEEP');
  for (const sql of ['GRANT SELECT ON ' + RECEIPT + ' TO authenticated', 'UPDATE ' + RECEIPT + " SET prior_state='{}'::jsonb", 'COMMENT ON TABLE ' + RECEIPT + " IS 'unknown'"]) {
    const db = await fixture(t); await run(db, 'apply'); await db.exec(sql); const before = await expMetadata(db);
    for (const stage of ['preflight', 'apply', 'rollback']) await assert.rejects(run(db, stage), refused); assert.deepEqual(await expMetadata(db), before);
  }
});

test('later grants/defaults/policies/FKs/triggers/indexes refuse replay and reversal without partial changes', async t => {
  for (const sql of ['GRANT MAINTAIN ON exp_events TO anon', "ALTER TABLE exp_events ALTER COLUMN reason SET DEFAULT 'LATER'", 'CREATE POLICY later_policy ON exp_events FOR SELECT USING(true)', 'ALTER TABLE exp_events DROP CONSTRAINT exp_events_member_id_fkey', 'ALTER TABLE exp_events DISABLE TRIGGER ALL', 'CREATE INDEX later_event_index ON exp_events(amount)']) {
    const db = await fixture(t); await run(db, 'apply'); await db.exec(sql); const before = await expMetadata(db);
    for (const stage of ['preflight', 'apply', 'rollback']) await assert.rejects(run(db, stage), refused); assert.deepEqual(await expMetadata(db), before);
  }
});

test('uncaptured FK name/actions are preserved semantically and fingerprinted, not invented', async t => {
  const db = await fixture(t, { fkAction: 'SET NULL' }), before = await expMetadata(db);
  assert.match(before.constraints.find(row => row.definition.startsWith('FOREIGN KEY')).definition, /ON DELETE SET NULL/);
  await run(db, 'preflight'); await run(db, 'apply'); await run(db, 'rollback'); assert.deepEqual(await expMetadata(db), before);
});

test('accounting alone blocks ordinary browser TRUNCATE through its FK while the captured TRUNCATE privilege still exists', async t => {
  const db = await fixture(t); await installAccounting(db);
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) value', [role, 'exp_events', 'TRUNCATE'])).rows[0].value, true);
    await assert.rejects(queryAs(db, role, 'TRUNCATE exp_events'), error => error.code === '0A000');
  }
});

test('later real accounting preserves containment and exact reward replay but invalidates the earlier catalog fingerprint', async t => {
  const db = await fixture(t); await run(db, 'apply'); await installAccounting(db);
  const request = '33333333-3333-4333-8333-333333333333', args = [A, request, 'a'.repeat(64), 'socrates', false];
  const award = () => queryAs(db, 'service_role', 'SELECT soe_thinker_reward_award($1,$2,$3,$4,$5) value', args);
  const first = (await award()).rows[0].value, replay = (await award()).rows[0].value;
  assert.equal(first.replayed, false); assert.equal(replay.replayed, true); assert.equal(replay.eventId, first.eventId);
  assert.equal((await db.query('SELECT count(*)::int n FROM soe_thinker_reward_receipts')).rows[0].n, 1);
  await browserDenied(db); const before = await expMetadata(db), receipt = (await db.query('SELECT * FROM soe_thinker_reward_receipts')).rows;
  for (const stage of ['preflight', 'apply', 'rollback']) await assert.rejects(run(db, stage), refused);
  assert.deepEqual(await expMetadata(db), before); assert.deepEqual((await db.query('SELECT * FROM soe_thinker_reward_receipts')).rows, receipt); await browserDenied(db);
});

test('rollback retains rows written after containment while deliberately restoring captured TRUNCATE authority', async t => {
  const db = await fixture(t); await run(db, 'apply');
  await queryAs(db, 'service_role', "INSERT INTO exp_events(amount,reason) VALUES(4,'PRIVATE_SYNTHETIC_LATER_EVENT')");
  const before = await eventRows(db); await run(db, 'rollback'); assert.deepEqual(await eventRows(db), before);
  for (const role of ['anon', 'authenticated']) await truncateThenRollback(db, role); assert.deepEqual(await eventRows(db), before);
});
