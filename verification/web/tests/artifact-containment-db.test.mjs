import test from 'node:test';
import assert from 'node:assert/strict';
import {createArtifactDb,runArtifactSql,asRole,snapshotArtifactRows,HALL_CATALOG,HALL_SUPPLEMENT,FIXTURE_EXCEPTIONS,ARTIFACT_IDS as ID} from './support/artifact-containment-fixture.mjs';
const RECEIPT='soe_artifact_containment_v1_state';
const ALL=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
const refused=e=>{assert.equal(e.code,'PT409',e.message);assert.doesNotMatch(e.message,/PRIVATE_SYNTHETIC|aaaaaaaa-aaaa/);return true;};
const denied=e=>{assert.equal(e.code,'42501',e.message);return true;};
async function fixture(t,options){const db=await createArtifactDb(options);t.after(()=>db.close());return db;}
const run=(db,stage)=>runArtifactSql(db,'docs/sql/artifact-containment-'+stage+'.sql');
const queryAs=(db,role,sql,params=[])=>asRole(db,role,tx=>tx.query(sql,params));
async function metadata(db){
 return {
  table:(await db.query("SELECT relowner,relrowsecurity,relforcerowsecurity,relkind,relispartition,obj_description(oid,'pg_class') comment FROM pg_class WHERE oid='public.artifacts'::regclass")).rows,
  columns:(await db.query("SELECT a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,md5(pg_get_expr(d.adbin,d.adrelid)) default_md5,col_description(a.attrelid,a.attnum) comment FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.artifacts'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum")).rows,
  acl:(await db.query("SELECT a.grantor,a.grantee,a.privilege_type,a.is_grantable FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.artifacts'::regclass ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable")).rows,
  columnAcl:(await db.query("SELECT a.attnum,x.grantor,x.grantee,x.privilege_type,x.is_grantable FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='public.artifacts'::regclass ORDER BY a.attnum,x.grantor,x.grantee,x.privilege_type,x.is_grantable")).rows,
  constraints:(await db.query("SELECT oid,conname,conrelid,pg_get_constraintdef(oid) definition,convalidated,condeferrable,condeferred FROM pg_constraint WHERE conrelid IN('public.artifacts'::regclass,'public.nft_mints'::regclass,'public.artifact_merch'::regclass) ORDER BY oid")).rows,
  indexes:(await db.query("SELECT indexrelid,pg_get_indexdef(indexrelid) definition,indisvalid,indisready FROM pg_index WHERE indrelid='public.artifacts'::regclass ORDER BY indexrelid")).rows,
  policies:(await db.query("SELECT oid,polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid) using_expr,pg_get_expr(polwithcheck,polrelid) check_expr FROM pg_policy WHERE polrelid='public.artifacts'::regclass ORDER BY oid")).rows,
  triggers:(await db.query("SELECT oid,tgname,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid='public.artifacts'::regclass ORDER BY oid")).rows,
  defaultAcl:(await db.query("SELECT oid,defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY oid")).rows,
  externalTables:(await db.query("SELECT relname,relacl::text,relrowsecurity FROM pg_class WHERE oid IN('public.members'::regclass,'public.nft_mints'::regclass,'public.artifact_merch'::regclass) ORDER BY relname")).rows,
  externalRows:{members:(await db.query('SELECT * FROM members ORDER BY id')).rows,nft:(await db.query('SELECT * FROM nft_mints ORDER BY id')).rows,merch:(await db.query('SELECT * FROM artifact_merch ORDER BY id')).rows},
  rows:await snapshotArtifactRows(db),
 };
}
test('tracked fixture matches observed thirteen columns, safe defaults, ACLs, policies and all six FK trigger semantics',async t=>{
 const db=await fixture(t),m=await metadata(db);
 assert.equal(m.columns.length,13);assert.deepEqual(m.columns.map(c=>({name:c.attname,type:c.type,not_null:c.attnotnull})),HALL_CATALOG.columns.map(({name,type,not_null})=>({name,type,not_null})));
 for(const c of m.columns){const observed=HALL_CATALOG.columns.find(x=>x.name===c.attname);if(c.attname==='theme'){assert.equal(observed.default_md5,FIXTURE_EXCEPTIONS.theme.observedDefaultMD5);assert.notEqual(c.default_md5,observed.default_md5);}else assert.equal(c.default_md5,observed.default_md5);}
 const actual=(await db.query("SELECT a.privilege_type privilege,pg_get_userbyid(a.grantee) grantee,pg_get_userbyid(a.grantor) grantor,a.is_grantable grantable FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid='public.artifacts'::regclass ORDER BY grantee,privilege")).rows;
 assert.deepEqual(actual,[...HALL_SUPPLEMENT.acl].sort((a,b)=>a.grantee.localeCompare(b.grantee)||a.privilege.localeCompare(b.privilege)));
 const actualTriggers=(await db.query("SELECT p.proname function_name,t.tgtype type,t.tgenabled enabled,t.tgisinternal internal,c.relname referenced_table FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgconstrrelid WHERE t.tgrelid='public.artifacts'::regclass ORDER BY p.proname,c.relname")).rows;
 const observedTriggers=HALL_SUPPLEMENT.triggers.map(({function_name,type,enabled,internal,referenced_table})=>({function_name,type,enabled,internal,referenced_table})).sort((a,b)=>a.function_name.localeCompare(b.function_name)||a.referenced_table.localeCompare(b.referenced_table));
 assert.deepEqual(actualTriggers,observedTriggers);assert.equal(m.policies.length,2);assert.equal(m.indexes.length,1);
});
test('read-only preflight does not modify rows, defaults, policies, foreign keys, grants or unrelated objects',async t=>{
 const db=await fixture(t),before=await metadata(db);const result=await run(db,'preflight');assert.deepEqual(await metadata(db),before);assert.match(JSON.stringify(result),/artifact_containment_preflight_passed/);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SYNTHETIC|Synthetic public artifact|aaaaaaaa-aaaa/);
});
test('actual raw public prompt exposure closes for both browser roles, including table and column authority and all eight privileges',async t=>{
 const db=await fixture(t);
 assert.equal((await queryAs(db,'anon','SELECT prompt_used FROM artifacts WHERE id=$1',[ID.public])).rows[0].prompt_used,'PRIVATE_SYNTHETIC_PROMPT');
 await db.exec('GRANT SELECT(conversation_context) ON artifacts TO PUBLIC;GRANT UPDATE(prompt_used) ON artifacts TO authenticated WITH GRANT OPTION');
 await run(db,'apply');
 for(const role of ['anon','authenticated']){
  for(const privilege of ALL)assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) allowed',[role,'public.artifacts',privilege])).rows[0].allowed,false);
  assert.equal((await db.query('SELECT has_any_column_privilege($1,$2,$3) allowed',[role,'public.artifacts','SELECT,INSERT,UPDATE,REFERENCES'])).rows[0].allowed,false);
  for(const sql of ['SELECT * FROM artifacts','SELECT prompt_used,conversation_context FROM artifacts','UPDATE artifacts SET title=\'FORGED\'','DELETE FROM artifacts','TRUNCATE artifacts',"INSERT INTO artifacts(thinker_id,title,is_public) VALUES('socrates','FORGED',true)"])await assert.rejects(queryAs(db,role,sql),denied);
 }
});
test('service create/read/update/delete remains operational without adding broader privileges',async t=>{
 const db=await fixture(t);const serviceOid=(await db.query("SELECT oid FROM pg_roles WHERE rolname='service_role'")).rows[0].oid;const before=(await metadata(db)).acl.filter(x=>x.grantee===serviceOid);
 await run(db,'apply');
 const result=await queryAs(db,'service_role',"INSERT INTO artifacts(member_id,thinker_id,title,prompt_used,is_public) VALUES($1,'socrates','Service-created','PRIVATE_SYNTHETIC_NEW_PROMPT',false) RETURNING id",[ID.member]);const id=result.rows[0].id;
 assert.equal((await queryAs(db,'service_role','SELECT prompt_used FROM artifacts WHERE id=$1',[id])).rows[0].prompt_used,'PRIVATE_SYNTHETIC_NEW_PROMPT');
 await queryAs(db,'service_role',"UPDATE artifacts SET title='Service-updated' WHERE id=$1",[id]);assert.equal((await queryAs(db,'service_role','SELECT title FROM artifacts WHERE id=$1',[id])).rows[0].title,'Service-updated');
 await queryAs(db,'service_role','DELETE FROM artifacts WHERE id=$1',[id]);assert.equal((await queryAs(db,'service_role','SELECT count(*)::int n FROM artifacts WHERE id=$1',[id])).rows[0].n,0);
 assert.deepEqual((await metadata(db)).acl.filter(x=>x.grantee===serviceOid),before);
});
test('containment preserves all rows, thirteen defaults/types, policies, FK/index/trigger behavior and unrelated authority',async t=>{
 const db=await fixture(t);await db.exec('GRANT SELECT ON artifacts TO unrelated_reader');const before=await metadata(db);await run(db,'apply');const after=await metadata(db);
 for(const key of ['columns','constraints','indexes','policies','triggers','defaultAcl','externalTables','externalRows','rows'])assert.deepEqual(after[key],before[key]);
 assert.equal((await queryAs(db,'unrelated_reader','SELECT title FROM artifacts WHERE id=$1',[ID.public])).rows[0].title,'Synthetic public artifact');
 for(const role of ['anon','authenticated','service_role','unrelated_reader'])await assert.rejects(queryAs(db,role,'SELECT * FROM '+RECEIPT),denied);
 const receipt=JSON.stringify((await db.query('SELECT * FROM '+RECEIPT)).rows);assert.doesNotMatch(receipt,/PRIVATE_SYNTHETIC|syntheticFixtureOnly|LITERAL_REDACTED|Synthetic public artifact/);assert.match(receipt,/"default_md5"/);
});
test('exact rollback restores prior PUBLIC/table/column grant options and RLS while never dropping schema',async t=>{
 const db=await fixture(t);await db.exec('ALTER TABLE artifacts DISABLE ROW LEVEL SECURITY;REVOKE SELECT ON artifacts FROM anon;GRANT SELECT(prompt_used) ON artifacts TO anon WITH GRANT OPTION;GRANT SELECT ON artifacts TO PUBLIC;GRANT UPDATE(conversation_context) ON artifacts TO authenticated WITH GRANT OPTION');
 const before=await metadata(db);await run(db,'apply');await run(db,'rollback');await run(db,'rollback');assert.deepEqual(await metadata(db),before);assert.equal((await db.query("SELECT to_regclass('public."+RECEIPT+"') receipt")).rows[0].receipt,null);
});
test('preflight/apply/rollback are idempotent and stable under different caller search paths',async t=>{
 const db=await fixture(t);await db.exec('SET search_path=public,pg_catalog');const before=await metadata(db);await run(db,'apply');const receipt=(await db.query('SELECT * FROM '+RECEIPT)).rows;await db.exec('SET search_path=pg_catalog,public');await run(db,'preflight');await run(db,'apply');assert.deepEqual((await db.query('SELECT * FROM '+RECEIPT)).rows,receipt);await run(db,'rollback');assert.equal((await db.query('SHOW search_path')).rows[0].search_path,'pg_catalog, public');await db.exec('SET search_path=public,pg_catalog');assert.deepEqual(await metadata(db),before);
});
test('absent service CRUD and PUBLIC-only service CRUD abort without partial containment or receipt',async t=>{
 for(const sql of ['REVOKE SELECT ON artifacts FROM service_role','REVOKE ALL ON artifacts FROM service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON artifacts TO PUBLIC']){
  const db=await fixture(t);await db.exec(sql);const before=await metadata(db);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await metadata(db),before);assert.equal((await db.query("SELECT to_regclass('public."+RECEIPT+"') receipt")).rows[0].receipt,null);
 }
});
test('browser bypass, inheritance/schema creation and non-owner execution fail without repair',async t=>{
 for(const sql of ['ALTER ROLE anon BYPASSRLS','CREATE ROLE inherited_reader;GRANT inherited_reader TO authenticated','GRANT CREATE ON SCHEMA public TO anon']){
  const db=await fixture(t);await db.exec(sql);const before=await metadata(db);await assert.rejects(run(db,'preflight'),refused);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await metadata(db),before);
 }
 const db=await fixture(t),before=await metadata(db);for(const role of ['anon','authenticated','service_role']){await db.exec('SET ROLE '+role);try{for(const stage of ['preflight','apply','rollback'])await assert.rejects(run(db,stage),refused);}finally{await db.exec('SET ROLE postgres');}}assert.deepEqual(await metadata(db),before);
});
test('unexpected ownership or thirteen-column schema refuses before revocation',async t=>{
 for(const sql of ['ALTER TABLE artifacts ALTER COLUMN conversation_context TYPE varchar(100)','ALTER TABLE artifacts ADD COLUMN unknown_data text','ALTER TABLE artifacts OWNER TO unrelated_reader']){
  const db=await fixture(t);await db.exec(sql);const before=await metadata(db);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await metadata(db),before);
 }
});
test('unknown receipt objects and altered receipt content/access are never adopted, normalized or removed',async t=>{
 const collision=await fixture(t);await collision.exec('CREATE TABLE '+RECEIPT+'(unrelated text);INSERT INTO '+RECEIPT+" VALUES('KEEP_UNRELATED')");for(const stage of ['apply','rollback'])await assert.rejects(run(collision,stage),refused);assert.equal((await collision.query('SELECT unrelated FROM '+RECEIPT)).rows[0].unrelated,'KEEP_UNRELATED');
 for(const sql of ['GRANT SELECT ON '+RECEIPT+' TO authenticated',"UPDATE "+RECEIPT+" SET prior_state='{}'::jsonb","COMMENT ON TABLE "+RECEIPT+" IS 'unknown'"]){
  const db=await fixture(t);await run(db,'apply');await db.exec(sql);const before=await metadata(db);for(const stage of ['preflight','apply','rollback'])await assert.rejects(run(db,stage),refused);assert.deepEqual(await metadata(db),before);
 }
});
test('later grant/default/policy/FK/trigger/index drift refuses rollback atomically',async t=>{
 for(const sql of ['GRANT MAINTAIN ON artifacts TO anon',"ALTER TABLE artifacts ALTER COLUMN theme SET DEFAULT '{}'::jsonb",'CREATE POLICY later_policy ON artifacts FOR SELECT USING(true)','ALTER TABLE artifacts DROP CONSTRAINT artifacts_member_id_fkey','ALTER TABLE artifacts DISABLE TRIGGER ALL','CREATE INDEX later_artifact_index ON artifacts(is_public)','ALTER TABLE nft_mints DROP CONSTRAINT nft_mints_artifact_id_fkey']){
  const db=await fixture(t);await run(db,'apply');await db.exec(sql);const before=await metadata(db);await assert.rejects(run(db,'rollback'),refused);assert.deepEqual(await metadata(db),before);
 }
});
test('delegated browser grantors require review instead of incomplete grant reversal',async t=>{
 const db=await fixture(t);await db.exec('CREATE ROLE delegator;GRANT SELECT ON artifacts TO delegator WITH GRANT OPTION;SET ROLE delegator;GRANT SELECT ON artifacts TO anon;SET ROLE postgres');const before=await metadata(db);await assert.rejects(run(db,'preflight'),refused);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await metadata(db),before);
});
test('unknown theme default stays untouched and is fingerprinted, not reconstructed or stored as literal',async t=>{
 const db=await fixture(t);const value='PRIVATE_SYNTHETIC_UNKNOWN_DEFAULT';await db.query("ALTER TABLE artifacts ALTER COLUMN theme SET DEFAULT '{\"privateSynthetic\":\"PRIVATE_SYNTHETIC_UNKNOWN_DEFAULT\"}'::jsonb");const before=(await metadata(db)).columns;await run(db,'preflight');await run(db,'apply');assert.deepEqual((await metadata(db)).columns,before);const receipt=(await db.query('SELECT * FROM '+RECEIPT)).rows[0];assert.doesNotMatch(JSON.stringify(receipt),new RegExp(value));assert.equal(receipt.post_state.columns.find(c=>c.name==='theme').default_md5,before.find(c=>c.attname==='theme').default_md5);await run(db,'rollback');assert.deepEqual((await metadata(db)).columns,before);
});
test('outgoing member CASCADE and incoming merchandise restriction/NFT cascade survive containment',async t=>{
 const db=await fixture(t);await run(db,'apply');await assert.rejects(queryAs(db,'service_role','DELETE FROM artifacts WHERE id=$1',[ID.dependency]),e=>e.code==='23503');
 await db.query('DELETE FROM artifact_merch WHERE artifact_id=$1',[ID.dependency]);await queryAs(db,'service_role','DELETE FROM artifacts WHERE id=$1',[ID.dependency]);assert.equal((await db.query('SELECT count(*)::int n FROM nft_mints')).rows[0].n,0);
 await db.query('DELETE FROM members WHERE id=$1',[ID.member]);assert.equal((await db.query('SELECT count(*)::int n FROM artifacts WHERE member_id=$1',[ID.member])).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM artifacts WHERE id=$1',[ID.nullOwner])).rows[0].n,1);
});
test('catalog-only rollback preserves used rows but deliberately restores prior raw access and cannot claim unused status',async t=>{
 const db=await fixture(t);await run(db,'apply');const inserted=await queryAs(db,'service_role',"INSERT INTO artifacts(thinker_id,title,prompt_used,conversation_context,is_public) VALUES('socrates','New after containment','PRIVATE_SYNTHETIC_NEW_PUBLIC_PROMPT','PRIVATE_SYNTHETIC_NEW_PUBLIC_CONTEXT',true) RETURNING id");
 const id=inserted.rows[0].id,before=await snapshotArtifactRows(db);await assert.rejects(queryAs(db,'anon','SELECT prompt_used FROM artifacts WHERE id=$1',[id]),denied);await run(db,'rollback');assert.deepEqual(await snapshotArtifactRows(db),before);assert.equal((await queryAs(db,'anon','SELECT prompt_used FROM artifacts WHERE id=$1',[id])).rows[0].prompt_used,'PRIVATE_SYNTHETIC_NEW_PUBLIC_PROMPT');
});
