// Additive local fixture: captured EXP event ACL/policy plus preserved exact reward bodies.
// All rows/identities/auth.uid behavior are synthetic; no provider or hosted SQL.
import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const ROOT = new URL('../../../../', import.meta.url);
export const EXP_SQL = ['preflight', 'apply', 'rollback'].map(stage => `docs/sql/exp-events-containment-${stage}.sql`);
export const EXP_RECEIPT = 'soe_exp_events_containment_v1_state';
export const METADATA = 'verification/web/tests/fixtures/full-chain-catalog-projection-2026-11-04.json';
const METADATA_SHA256 = '4e7c5e1fe7e8ffe85656b780ba9aae7201d7af26a3da6310fedb129271186a16';
export async function expSource(name) {
  const file = new URL(name, ROOT), info = await lstat(file);
  assert(info.isFile() && !info.isSymbolicLink() && (!info.size || info.blocks), 'Unavailable exact EXP input: ' + name);
  return readFile(file);
}
for (const name of ['verification/web/tests/support/reward-live-body-db.mjs', 'verification/web/tooling/node_modules/@electric-sql/pglite/dist/index.js']) await expSource(name);
const base = await import('./reward-live-body-db.mjs');
export const { A, B, AUTH_A, asRole, liveRewardMetadata } = base;
const metadataBytes = await expSource(METADATA);
assert.equal(createHash('sha256').update(metadataBytes).digest('hex'), METADATA_SHA256, 'Review changed captured event metadata');
const metadata = JSON.parse(metadataBytes);
export const EVENT_GRANTS = metadata.event.grants;
export const EVENT_POLICIES = metadata.event.policies;
const expectedAcl = '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}';
assert.deepEqual(EVENT_GRANTS.map(row => row.role).sort(), ['anon', 'authenticated', 'service_role']);
for (const row of EVENT_GRANTS) {
  assert.equal(row.explicit_acl, expectedAcl); assert.equal(row.rls, true);
  for (const field of ['can_select', 'can_insert', 'can_update', 'can_delete', 'can_truncate']) assert.equal(row[field], true);
}
assert.deepEqual(EVENT_POLICIES, [{ table_name: 'exp_events', policy_name: 'EXP events visible to owner', command: 'r', permissive: true, roles: '{PUBLIC}',
  using_expression: '(member_id IN ( SELECT members.id\n   FROM members\n  WHERE (members.supabase_auth_id = auth.uid())))', check_expression: null }]);
export const EXP_FIXTURE_LIMITS = Object.freeze({
  captured: '2026-11-04 dated table ACL/RLS and exact owner SELECT policy; original three reward definitions are executed unchanged from their pinned fixture.',
  schema: 'Observed five event-column types/defaults/PK/member FK endpoint; FK name/actions remain uncaptured. Original helper uses named synthetic NO ACTION; alternate-action test is synthetic.',
  identities: 'Synthetic members, event rows, auth.uid setting and local postgres role. Not a production restore, HTTP exploit, provider or independent-session proof.',
  boundaries: 'Original reward RPC containment is separately applied. EXP table containment alone does not close SECURITY DEFINER RPC authority. Accounting adds an incoming event FK which blocks ordinary TRUNCATE without removing its grant.',
  defaults: 'Broad synthetic new-table default grants stress receipt ACL cleanup; unchanged original helper is preserved.',
});
export async function expSourceHashes() {
  const result = { ...base.REWARD_LIVE_SOURCE_HASHES };
  for (const name of [METADATA, ...EXP_SQL, 'verification/web/tests/support/exp-events-containment-fixture.mjs', 'verification/web/tests/exp-events-containment-db.test.mjs']) result[name] = createHash('sha256').update(await expSource(name)).digest('hex');
  return result;
}
export async function runExpSql(db, stage) {
  assert(['preflight', 'apply', 'rollback'].includes(stage));
  try { return await db.exec((await expSource(`docs/sql/exp-events-containment-${stage}.sql`)).toString()); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}
export async function installAccounting(db) {
  try { return await db.exec((await expSource('docs/sql/thinker-reward-accounting.sql')).toString()); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}
export async function createExpEventsDb({ fkAction = 'NO ACTION' } = {}) {
  assert(['NO ACTION', 'SET NULL'].includes(fkAction));
  const db = await base.createRewardLiveDb();
  try {
    await base.runRewardSql(db, 'apply');
    await db.exec(`CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.auth.uid',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
      CREATE POLICY "EXP events visible to owner" ON public.exp_events FOR SELECT TO PUBLIC USING(member_id IN (SELECT members.id FROM public.members WHERE members.supabase_auth_id=auth.uid()));
      GRANT ALL ON public.exp_events TO anon,authenticated,service_role; CREATE ROLE unrelated_reader NOLOGIN; GRANT USAGE ON SCHEMA public TO unrelated_reader;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO unrelated_reader;`);
    if (fkAction !== 'NO ACTION') await db.exec('ALTER TABLE exp_events DROP CONSTRAINT exp_events_member_id_fkey; ALTER TABLE exp_events ADD CONSTRAINT synthetic_alternate_member_fk FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL;');
    await db.query("INSERT INTO exp_events(member_id,amount,reason) VALUES($1,8,'PRIVATE_SYNTHETIC_EVENT'),(NULL,4,'PRIVATE_SYNTHETIC_UNATTRIBUTED')", [A]);
    return db;
  } catch (error) { await db.close(); throw error; }
}
export const eventRows = async db => (await db.query('SELECT * FROM exp_events ORDER BY id')).rows;
export const queryAs = (db, role, sql, params = []) => asRole(db, role, tx => tx.query(sql, params));
export async function expMetadata(db) {
  return {
    table: (await db.query("SELECT relowner,relrowsecurity,relforcerowsecurity,relkind,relispartition,obj_description(oid,'pg_class') comment FROM pg_class WHERE oid='public.exp_events'::regclass")).rows,
    columns: (await db.query("SELECT a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,md5(pg_get_expr(d.adbin,d.adrelid)) default_md5 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.exp_events'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum")).rows,
    acl: (await db.query("SELECT a.grantor,a.grantee,a.privilege_type,a.is_grantable FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.exp_events'::regclass ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable")).rows,
    columnAcl: (await db.query("SELECT a.attnum,x.grantor,x.grantee,x.privilege_type,x.is_grantable FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='public.exp_events'::regclass ORDER BY a.attnum,x.grantor,x.grantee,x.privilege_type,x.is_grantable")).rows,
    constraints: (await db.query("SELECT oid,conname,pg_get_constraintdef(oid) definition,convalidated,condeferrable,condeferred FROM pg_constraint WHERE conrelid='public.exp_events'::regclass ORDER BY oid")).rows,
    indexes: (await db.query("SELECT indexrelid,pg_get_indexdef(indexrelid) definition,indisvalid,indisready FROM pg_index WHERE indrelid='public.exp_events'::regclass ORDER BY indexrelid")).rows,
    policies: (await db.query("SELECT oid,polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid) using_expr,pg_get_expr(polwithcheck,polrelid) check_expr FROM pg_policy WHERE polrelid='public.exp_events'::regclass ORDER BY oid")).rows,
    triggers: (await db.query("SELECT oid,tgname,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid='public.exp_events'::regclass ORDER BY oid")).rows,
    defaultAcl: (await db.query('SELECT oid,defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY oid')).rows,
    rewards: await liveRewardMetadata(db), members: (await db.query('SELECT * FROM members ORDER BY id')).rows, rows: await eventRows(db),
  };
}
