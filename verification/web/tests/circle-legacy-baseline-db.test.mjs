import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveDb,runSql,asRole,snapshotLegacyRows,IDS} from './support/circle-live-db.mjs';
const TARGETS=['book_cohorts','book_cohort_members','seminar_messages'];
const RECEIPT='soe_circle_legacy_baseline_v1_state';
const PRIVILEGES=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
const refused=e=>{assert.equal(e.code,'PT409',e.message);assert.doesNotMatch(e.message,/Synthetic historical|bbbbbbbb-bbbb/);return true;};
const denied=e=>{assert.equal(e.code,'42501',e.message);return true;};
async function fixture(t){const db=await createLiveDb();t.after(()=>db.close());return db;}
async function run(db,stage){try{return await runSql(db,'docs/sql/circle-legacy-baseline-'+stage+'.sql');}catch(e){await db.exec('ROLLBACK');throw e;}}
async function applyFile(db,path){try{return await runSql(db,path);}catch(e){await db.exec('ROLLBACK');throw e;}}
const roleQuery=(db,role,sql,params=[])=>asRole(db,role,tx=>tx.query(sql,params));
async function metadata(db){
 return {
  columns:(await db.query("SELECT c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) default_expr,col_description(a.attrelid,a.attnum) comment FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",[TARGETS])).rows,
  tables:(await db.query("SELECT c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',x.grantor,'grantee',x.grantee,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable) FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x),'[]') acl FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1) ORDER BY c.relname",[TARGETS])).rows,
  columnsAcl:(await db.query("SELECT c.relname,a.attname,a.attacl::text FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",[TARGETS])).rows,
  constraints:(await db.query("SELECT conrelid,conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1)) ORDER BY oid",[TARGETS])).rows,
  indexes:(await db.query("SELECT indexrelid,pg_get_indexdef(indexrelid) definition FROM pg_index WHERE indrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1)) ORDER BY indexrelid",[TARGETS])).rows,
  policies:(await db.query("SELECT polrelid,polname,polcmd,polroles::text,polpermissive,polqual::text,polwithcheck::text FROM pg_policy WHERE polrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1)) ORDER BY oid",[TARGETS])).rows,
  triggers:(await db.query("SELECT tgrelid,tgname,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1)) ORDER BY oid",[TARGETS])).rows,
  rows:await snapshotLegacyRows(db)
 };
}
async function beforeMessage(db){await run(db,'apply');for(const path of ['supabase/migrations/20261027_soe_circles.sql','docs/sql/circle-moderation.sql'])await applyFile(db,path);}
async function beforeParticipation(db){await beforeMessage(db);await applyFile(db,'docs/sql/circle-message-moderation.sql');}

test('catalog-only preflight leaves every legacy row, grant, default and schema object unchanged',async t=>{
 const db=await fixture(t),before=await metadata(db);const result=await run(db,'preflight');assert.deepEqual(await metadata(db),before);assert.match(JSON.stringify(result),/circle_legacy_baseline_preflight_passed/);assert.doesNotMatch(JSON.stringify(result),/Synthetic historical|bbbbbbbb-bbbb/);
});
test('strict baseline closes all eight browser table privileges and column/PUBLIC grants while retaining service CRUD',async t=>{
 const db=await fixture(t);await db.exec('GRANT SELECT(sender_name) ON seminar_messages TO PUBLIC;GRANT UPDATE(content) ON seminar_messages TO authenticated WITH GRANT OPTION;');
 await run(db,'apply');
 for(const role of ['anon','authenticated'])for(const table of TARGETS){
  for(const privilege of PRIVILEGES)assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) allowed',[role,'public.'+table,privilege])).rows[0].allowed,false,role+' '+table+' '+privilege);
  assert.equal((await db.query('SELECT has_any_column_privilege($1,$2,$3) allowed',[role,'public.'+table,'SELECT,INSERT,UPDATE,REFERENCES'])).rows[0].allowed,false);
  for(const sql of ['SELECT * FROM '+table,'DELETE FROM '+table,'TRUNCATE '+table])await assert.rejects(roleQuery(db,role,sql),denied);
 }
 for(const role of ['anon','authenticated','service_role'])await assert.rejects(roleQuery(db,role,'SELECT * FROM '+RECEIPT),denied);
 await roleQuery(db,'service_role',"INSERT INTO book_cohorts(id,book_id,thinker_id) VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','synthetic','socrates')");
 await roleQuery(db,'service_role',"UPDATE book_cohorts SET title='Service changed' WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'");
 assert.equal((await roleQuery(db,'service_role',"SELECT title FROM book_cohorts WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'")).rows[0].title,'Service changed');
 await roleQuery(db,'service_role',"INSERT INTO book_cohort_members(id,cohort_id,member_id) VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',$1)",[IDS.reader]);
 await roleQuery(db,'service_role',"UPDATE book_cohort_members SET current_section=2 WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'");
 assert.equal((await roleQuery(db,'service_role',"SELECT current_section FROM book_cohort_members WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'")).rows[0].current_section,2);
 await roleQuery(db,'service_role',"DELETE FROM book_cohort_members WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'");
 await roleQuery(db,'service_role',"INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content) VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',$1,'Synthetic new verified label','Synthetic new post')",[IDS.reader]);
 await roleQuery(db,'service_role',"UPDATE seminar_messages SET content='Synthetic service update' WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'");
 const written=(await roleQuery(db,'service_role',"SELECT content,sender_type,sender_name,member_name FROM seminar_messages WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'")).rows[0];
 assert.deepEqual(written,{content:'Synthetic service update',sender_type:'member',sender_name:null,member_name:'Synthetic new verified label'});
 await roleQuery(db,'service_role',"DELETE FROM seminar_messages WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'");
 await roleQuery(db,'service_role',"DELETE FROM book_cohorts WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'");
});
test('additive member_name is nullable with no default/backfill and every observed sender/progress field remains exact',async t=>{
 const db=await fixture(t),before=await metadata(db);await run(db,'apply');const after=await metadata(db);
 assert.deepEqual(after.rows,before.rows);for(const key of ['constraints','indexes','triggers','policies'])assert.deepEqual(after[key],before[key]);
 assert.deepEqual(after.columns.filter(c=>c.attname!=='member_name'),before.columns);
 const label=after.columns.find(c=>c.attname==='member_name');assert.equal(label.type,'text');assert.equal(label.attnotnull,false);assert.equal(label.default_expr,null);
 assert.equal((await db.query('SELECT count(*)::int n FROM seminar_messages WHERE member_name IS NOT NULL')).rows[0].n,0);
 assert.ok(before.rows.seminar_messages.some(m=>m.sender_type==='thinker'));assert.ok(before.rows.seminar_messages.some(m=>m.cohort_id===null));
 const receipt=(await db.query('SELECT * FROM '+RECEIPT)).rows;assert.equal(receipt.length,3);assert.doesNotMatch(JSON.stringify(receipt),/syntheticFixtureOnly|Synthetic historical|REDACTED_LITERAL/);
});
test('unused rollback restores exact prior table/column ACLs including grant options and leaves original rows intact',async t=>{
 const db=await fixture(t);await db.exec('REVOKE SELECT ON seminar_messages FROM anon;GRANT SELECT(sender_name) ON seminar_messages TO anon WITH GRANT OPTION;GRANT SELECT ON book_cohorts TO PUBLIC;');
 const before=await metadata(db);await run(db,'apply');await run(db,'rollback');await run(db,'rollback');assert.deepEqual(await metadata(db),before);
 assert.equal((await db.query("SELECT to_regclass('public."+RECEIPT+"') receipt")).rows[0].receipt,null);
});
test('preflight/apply are idempotent before the chain and caller search_path cannot change receipt recognition',async t=>{
 const db=await fixture(t);await db.exec('SET search_path=public,pg_catalog');await run(db,'apply');const receipt=(await db.query('SELECT * FROM '+RECEIPT+' ORDER BY target_table')).rows;await db.exec('SET search_path=pg_catalog,public');await run(db,'preflight');await run(db,'apply');assert.deepEqual((await db.query('SELECT * FROM '+RECEIPT+' ORDER BY target_table')).rows,receipt);await run(db,'rollback');assert.equal((await db.query('SHOW search_path')).rows[0].search_path,'pg_catalog, public');
});
test('missing service CRUD and service access supplied solely by PUBLIC abort atomically',async t=>{
 for(const sql of ['REVOKE SELECT ON seminar_messages FROM service_role','REVOKE ALL ON seminar_messages FROM service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON seminar_messages TO PUBLIC']){
  const db=await fixture(t);await db.exec(sql);const before=await metadata(db);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await metadata(db),before);assert.equal((await db.query("SELECT to_regclass('public."+RECEIPT+"') receipt")).rows[0].receipt,null);
 }
});
test('unexpected policies, pre-existing adapter column and changed live nullability/defaults require explicit review',async t=>{
 for(const sql of ["CREATE POLICY unknown_public_read ON seminar_messages FOR SELECT USING(true)",'ALTER TABLE seminar_messages ADD COLUMN member_name text',"ALTER TABLE book_cohorts ALTER COLUMN thinker_id SET DEFAULT 'socrates'",'ALTER TABLE book_cohort_members ALTER COLUMN cohort_id SET NOT NULL']){
  const db=await fixture(t);if(sql.includes('SET NOT NULL'))await db.exec('DELETE FROM book_cohort_members WHERE cohort_id IS NULL');await db.exec(sql);const before=await metadata(db);await assert.rejects(run(db,'preflight'),refused);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await metadata(db),before);
 }
});
test('browser role inheritance/bypass/schema creation and non-owner callers cannot install the baseline',async t=>{
 for(const sql of ['ALTER ROLE anon BYPASSRLS','CREATE ROLE inherited_reader;GRANT inherited_reader TO authenticated','GRANT CREATE ON SCHEMA public TO anon']){
  const db=await fixture(t);await db.exec(sql);const before=await metadata(db);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await metadata(db),before);
 }
 const db=await fixture(t),before=await metadata(db);for(const role of ['anon','authenticated','service_role']){await db.exec('SET ROLE '+role);try{await assert.rejects(run(db,'apply'),refused);}finally{await db.exec('SET ROLE postgres');}}assert.deepEqual(await metadata(db),before);
});
test('unknown receipt collisions or altered receipt access/content are never adopted or removed',async t=>{
 const collision=await fixture(t);await collision.exec('CREATE TABLE '+RECEIPT+'(unrelated text)');await assert.rejects(run(collision,'apply'),refused);await assert.rejects(run(collision,'rollback'),refused);
 for(const sql of ['GRANT SELECT ON '+RECEIPT+' TO anon',"UPDATE "+RECEIPT+" SET prior_state='{}'::jsonb WHERE target_table='seminar_messages'"]){
  const db=await fixture(t);await run(db,'apply');await db.exec(sql);const before=await metadata(db);for(const stage of ['preflight','apply','rollback'])await assert.rejects(run(db,stage),refused);assert.deepEqual(await metadata(db),before);
 }
});
test('later grants/defaults/indexes/policies/chain changes refuse rollback without erasing other decisions',async t=>{
 for(const sql of ['GRANT MAINTAIN ON seminar_messages TO anon',"ALTER TABLE book_cohorts ALTER COLUMN weekly_schedule SET DEFAULT '{}'::jsonb",'CREATE INDEX later_label_index ON seminar_messages(member_name)','CREATE POLICY later_policy ON book_cohorts FOR SELECT USING(true)','ALTER TABLE book_cohorts ADD COLUMN later_circle_data text']){
  const db=await fixture(t);await run(db,'apply');await db.exec(sql);const before=await metadata(db);await assert.rejects(run(db,'rollback'),refused);assert.deepEqual(await metadata(db),before);
 }
});
test('a used additive label refuses unused rollback and exposes no label in the refusal',async t=>{
 const db=await fixture(t);await run(db,'apply');await db.query('UPDATE seminar_messages SET member_name=$1 WHERE id=$2',['Synthetic historical private label',IDS.legacyMember]);const before=await metadata(db);await assert.rejects(run(db,'rollback'),refused);assert.deepEqual(await metadata(db),before);
});
test('strict zero-policy path becomes exactly five restrictive policies and participation accepts without creating permissive access',async t=>{
 const db=await fixture(t);await beforeParticipation(db);
 const policies=(await db.query("SELECT polname,polpermissive FROM pg_policy WHERE polrelid IN('book_cohorts'::regclass,'book_cohort_members'::regclass,'seminar_messages'::regclass) ORDER BY polname")).rows;
 assert.equal(policies.length,5);assert.ok(policies.every(p=>p.polpermissive===false));await applyFile(db,'docs/sql/circle-participation.sql');
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_policy WHERE polrelid IN('book_cohorts'::regclass,'book_cohort_members'::regclass,'seminar_messages'::regclass)")).rows[0].n,5);
 for(const role of ['anon','authenticated'])for(const table of TARGETS)await assert.rejects(roleQuery(db,role,'SELECT * FROM '+table),denied);
});
test('both strict preflight branches refuse newly reopened table or column authority',async t=>{
 for(const phase of ['message','participation'])for(const sql of ['GRANT SELECT ON book_cohorts TO anon','GRANT SELECT(content) ON seminar_messages TO authenticated']){
  const db=await fixture(t);if(phase==='message')await beforeMessage(db);else await beforeParticipation(db);await db.exec(sql);const before=await metadata(db);await assert.rejects(applyFile(db,'docs/sql/circle-'+(phase==='message'?'message-moderation':'participation')+'.sql'),/Strict legacy Circle baseline protection requires review/);assert.deepEqual(await metadata(db),before);
 }
});
test('strict branch receipt loss or unexpected mixed policies fail instead of falling back to historical access',async t=>{
 const db=await fixture(t);await beforeMessage(db);await db.exec('DROP TABLE '+RECEIPT);await assert.rejects(applyFile(db,'docs/sql/circle-message-moderation.sql'),/Strict legacy Circle baseline protection requires review/);
 const mixed=await fixture(t);await beforeParticipation(mixed);await mixed.exec("DROP POLICY circle_cohorts_browser_insert_restrict ON book_cohorts;CREATE POLICY \"Cohorts insert\" ON book_cohorts FOR INSERT WITH CHECK(true)");await assert.rejects(applyFile(mixed,'docs/sql/circle-participation.sql'),/Unknown legacy policy authority/);
});
test('a strict receipt cannot be combined with the old four or nine policy fallback',async t=>{
 for(const phase of ['message','participation']){
  const db=await fixture(t);if(phase==='message')await beforeMessage(db);else await beforeParticipation(db);
  await db.exec('CREATE POLICY "Cohorts public read" ON book_cohorts FOR SELECT USING(true);CREATE POLICY "Cohorts insert" ON book_cohorts FOR INSERT WITH CHECK(true);CREATE POLICY "Cohort members open" ON book_cohort_members FOR ALL USING(true) WITH CHECK(true);CREATE POLICY "Seminar messages open" ON seminar_messages FOR ALL USING(true) WITH CHECK(true)');
  await assert.rejects(applyFile(db,'docs/sql/circle-'+(phase==='message'?'message-moderation':'participation')+'.sql'),/Strict legacy Circle baseline cannot fall back to historical policies/);
 }
});
test('unobserved grants or same-named changed index semantics are refused without repair',async t=>{
 for(const sql of ['CREATE ROLE unexpected_reader;GRANT SELECT ON seminar_messages TO unexpected_reader','DROP INDEX idx_cohort_status;CREATE INDEX idx_cohort_status ON book_cohorts(book_id,status)']){
  const db=await fixture(t);await db.exec(sql);const before=await metadata(db);await assert.rejects(run(db,'preflight'),refused);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await metadata(db),before);
 }
});
