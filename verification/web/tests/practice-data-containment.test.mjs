import assert from 'node:assert/strict';
import test from 'node:test';
import { practiceDb, applySql, tables } from './support/practice-privacy-fixture.mjs';

const roles = ['anon', 'authenticated'];
async function as(db, role, sql) {
  assert([...roles, 'service_role'].includes(role));
  await db.exec('SET ROLE ' + role);
  try { return await db.query(sql); }
  finally { await db.exec('RESET ROLE'); }
}
async function apply(db) {
  try { await db.exec(applySql); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}
const denied = error => error.code === '42501';
const refused = error => error.code === 'PT409';
async function policies(db) {
  return (await db.query("SELECT polname,polroles::text,polcmd FROM pg_policy ORDER BY polname")).rows;
}
async function snapshot(db) {
  return Promise.all(tables.map(async table => ({
    table,
    rows: (await db.query('SELECT * FROM ' + table + ' ORDER BY id')).rows,
    acl: (await db.query("SELECT relacl::text FROM pg_class WHERE oid = $1::regclass", [table])).rows[0],
  })));
}

test('the observed grants and legacy policies allow anonymous reads and writes in the synthetic baseline', async t => {
  const db = await practiceDb(t.after.bind(t));
  assert.equal((await as(db, 'anon', 'SELECT response_text FROM question_responses ORDER BY response_text')).rows[0].response_text, 'OWNER_A_ANSWER');
  assert.equal((await as(db, 'anon', 'SELECT reflection_text FROM practice_reflections ORDER BY reflection_text')).rows[1].reflection_text, 'OWNER_B_REFLECTION');
  assert.equal((await as(db, 'anon', 'SELECT match_reason FROM matched_conversations')).rows[0].match_reason, 'MATCH_PRIVATE_FIXTURE');
  const written = await as(db, 'anon', "UPDATE question_responses SET response_text='ANONYMOUS_FIXTURE_WRITE' RETURNING id");
  assert.equal(written.rows.length, 2);
});

test('the exact draft denies both browser roles across all four tables and preserves service CRUD and rows', async t => {
  const db = await practiceDb(t.after.bind(t));
  const before = await snapshot(db);
  await apply(db);
  const after = await snapshot(db);
  assert.deepEqual(after.map(x => x.rows), before.map(x => x.rows));
  for (const role of roles) for (const table of tables) {
    const verbs = ['SELECT id FROM ', 'DELETE FROM ', 'TRUNCATE ', 'INSERT INTO '];
    for (const prefix of verbs) {
      await assert.rejects(as(db, role, prefix + table + (prefix === 'INSERT INTO ' ? ' DEFAULT VALUES' : '')), denied);
    }
    await assert.rejects(as(db, role, 'UPDATE ' + table + ' SET id=id'), denied);
  }
  await assert.rejects(as(db, 'anon', 'SELECT reflection_text FROM practice_reflections'), denied);
  await assert.rejects(as(db, 'authenticated', 'SELECT response_text FROM question_responses'), denied);
  const privileges = (await db.query(
    "SELECT bool_and(has_table_privilege('service_role', name, 'SELECT')"
    + " AND has_table_privilege('service_role', name, 'INSERT') AND has_table_privilege('service_role', name, 'UPDATE')"
    + " AND has_table_privilege('service_role', name, 'DELETE')) AS intact FROM unnest($1::text[]) AS target(name)",
    [tables],
  )).rows[0];
  assert.equal(privileges.intact, true);
  await as(db, 'service_role', "UPDATE practice_reflections SET reflection_text='OWNER_SERVICE_UPDATE'");
  assert.equal((await as(db, 'service_role', 'SELECT reflection_text FROM practice_reflections')).rows[0].reflection_text, 'OWNER_SERVICE_UPDATE');
  assert.equal((await as(db, 'anon', 'SELECT label FROM unrelated_catalog')).rows[0].label, 'PUBLIC_SAMPLE');
  const serviceOid = (await db.query("SELECT oid FROM pg_roles WHERE rolname='service_role'")).rows[0].oid;
  assert((await policies(db)).every(p => p.polroles === '{' + serviceOid + '}' && p.polcmd === '*'));
  await apply(db);
  assert.deepEqual((await snapshot(db)).map(x => x.acl), after.map(x => x.acl));
});

test('an unexpected policy on the final table aborts every earlier grant and policy change', async t => {
  const db = await practiceDb(t.after.bind(t));
  await db.exec('CREATE POLICY "Unreviewed" ON question_responses FOR SELECT USING (false)');
  const before = await snapshot(db), rules = await policies(db);
  await assert.rejects(apply(db), refused);
  assert.deepEqual(await snapshot(db), before);
  assert.deepEqual(await policies(db), rules);
});

test('an inherited browser role refuses the reviewed containment', async t => {
  const db = await practiceDb(t.after.bind(t));
  await db.exec('CREATE ROLE inherited_reader; GRANT inherited_reader TO anon');
  await assert.rejects(apply(db), refused);
  assert.equal((await as(db, 'anon', 'SELECT count(*)::int AS n FROM question_responses')).rows[0].n, 2);
});

test('a lost service grant aborts without broadening service access or changing the other tables', async t => {
  const db = await practiceDb(t.after.bind(t));
  await db.exec('REVOKE SELECT ON question_responses FROM service_role; GRANT SELECT ON question_responses TO PUBLIC');
  const before = await snapshot(db), rules = await policies(db);
  await assert.rejects(apply(db), refused);
  assert.deepEqual(await snapshot(db), before);
  assert.deepEqual(await policies(db), rules);
});
