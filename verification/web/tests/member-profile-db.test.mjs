import test from 'node:test';
import assert from 'node:assert/strict';
import {profileDb,runProfileSql,updateProfile,A,B} from './support/member-profile-fixture.mjs';
const code=expected=>error=>{assert.equal(error.code,expected,error.message);assert.doesNotMatch(error.message,/PRIVATE_SYNTHETIC|11111111-1111/);return true;};
test('unapplied schema defaults every legacy member private without altering authored or protected fields',async t=>{
 const db=await profileDb(t);const before=(await db.query('SELECT * FROM members ORDER BY id')).rows;await runProfileSql(db,'preflight');await runProfileSql(db,'apply');
 const rows=(await db.query('SELECT * FROM members ORDER BY id')).rows;assert.deepEqual(rows.map(({profile_visibility,profile_revision,...rest})=>rest),before);assert.ok(rows.every(row=>row.profile_visibility==='private'&&row.profile_revision===0));
 await runProfileSql(db,'preflight');await runProfileSql(db,'apply');assert.deepEqual((await db.query('SELECT * FROM members ORDER BY id')).rows,rows);
});
test('actual service-only optimistic RPC preserves omitted fields and protected columns',async t=>{
 const db=await profileDb(t);await runProfileSql(db,'apply');const result=await updateProfile(db,A,0,{displayName:'Changed A',visibility:'public'});
 assert.equal(result.id,A);assert.equal(result.profile_revision,1);assert.equal(result.profile_visibility,'public');assert.equal(result.bio,'KEEP_OMITTED_BIO');assert.deepEqual(result.skills,['KEEP_OMITTED_SKILL']);
 const rows=(await db.query('SELECT id,display_name,tier,exp_tokens,email FROM members ORDER BY id')).rows;assert.equal(rows[0].tier,'protected-tier');assert.equal(rows[0].exp_tokens,7);assert.equal(rows[0].email,'PRIVATE_SYNTHETIC_EMAIL');assert.equal(rows[1].display_name,'Existing B');
 assert.deepEqual(Object.keys(result).sort(),['id','profile_revision','profile_visibility','display_name','bio','discipline','skills','project_description','seeking','philosophy'].sort());
});
test('stale revision and absent owner refuse without changing another member',async t=>{
 const db=await profileDb(t);await runProfileSql(db,'apply');await updateProfile(db,A,0,{bio:'FIRST'});const before=(await db.query('SELECT * FROM members ORDER BY id')).rows;
 await assert.rejects(updateProfile(db,A,0,{bio:'STALE'}),code('PT409'));await assert.rejects(updateProfile(db,'33333333-3333-4333-8333-333333333333',0,{bio:'FORGED'}),code('PT409'));assert.deepEqual((await db.query('SELECT * FROM members ORDER BY id')).rows,before);
});
test('legacy authored-field updates bump revision while no-op or protected-field updates do not',async t=>{
 const db=await profileDb(t);await runProfileSql(db,'apply');await db.query("UPDATE members SET philosophy='Legacy writer' WHERE id=$1",[A]);assert.equal((await db.query('SELECT profile_revision FROM members WHERE id=$1',[A])).rows[0].profile_revision,1);
 await db.query("UPDATE members SET philosophy='Legacy writer',exp_tokens=8 WHERE id=$1",[A]);assert.equal((await db.query('SELECT profile_revision FROM members WHERE id=$1',[A])).rows[0].profile_revision,1);
 await assert.rejects(db.query('UPDATE members SET profile_revision=99 WHERE id=$1',[A]),code('PT400'));
 await assert.rejects(db.query("INSERT INTO members(id,display_name,profile_revision) VALUES('44444444-4444-4444-8444-444444444444','Counter injection',9)"),code('PT400'));
});
test('empty fields and skills can be deliberately cleared; no effective change retains revision',async t=>{
 const db=await profileDb(t);await runProfileSql(db,'apply');const result=await updateProfile(db,A,0,{bio:'',skills:[]});assert.equal(result.bio,'');assert.deepEqual(result.skills,[]);assert.equal(result.profile_revision,1);assert.equal((await updateProfile(db,A,1,{bio:'',skills:[]})).profile_revision,1);
});
test('RPC rejects protected/unknown/null/oversized/malformed values transactionally',async t=>{
 const db=await profileDb(t);await runProfileSql(db,'apply');const before=(await db.query('SELECT * FROM members ORDER BY id')).rows;
 for(const patch of [{},{tier:'paid'},{email:'forged'},{profile_revision:0},{supabase_auth_id:A},{displayName:''},{bio:null},{visibility:'PUBLIC'},{skills:['']},{skills:[1]},{skills:Array(41).fill('x')},{displayName:'x'.repeat(201)},{bio:'x'.repeat(2001)},{discipline:'x'.repeat(101)},{seeking:'x'.repeat(1001)},{skills:['😀'.repeat(51)]},{bio:'x'.repeat(70000)}])await assert.rejects(updateProfile(db,A,0,patch),code('PT400'));
 assert.deepEqual((await db.query('SELECT * FROM members ORDER BY id')).rows,before);
});
test('all valid field maxima including UTF16-bounded astral text are accepted',async t=>{
 const db=await profileDb(t);await runProfileSql(db,'apply');const result=await updateProfile(db,A,0,{displayName:'😀'.repeat(100),bio:'😀'.repeat(1000),discipline:'x'.repeat(100),skills:Array(40).fill('😀'.repeat(50)),projectDescription:'x'.repeat(2000),seeking:'x'.repeat(1000),philosophy:'x'.repeat(2000)});assert.equal(result.profile_revision,1);assert.equal(result.bio.length,2000);
});
test('both browser roles cannot call either function or touch raw member data; service trigger still fires',async t=>{
 const db=await profileDb(t);await runProfileSql(db,'apply');for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);try{for(const query of ["SELECT * FROM members","SELECT public.soe_member_profile_revision_guard()",`SELECT public.soe_member_profile_update('${A}',0,'{"bio":"forged"}')`])await assert.rejects(db.query(query),code('42501'));}finally{await db.exec('RESET ROLE');}}
 assert.equal((await db.query("SELECT has_function_privilege('service_role','public.soe_member_profile_revision_guard()','EXECUTE') allowed")).rows[0].allowed,false);assert.equal((await updateProfile(db,A,0,{bio:'SERVICE'})).profile_revision,1);
});
test('disabled guard makes RPC fail before mutation instead of reporting success without revision',async t=>{
 const db=await profileDb(t);await runProfileSql(db,'apply');await db.exec('ALTER TABLE members DISABLE TRIGGER soe_member_profile_revision_guard');const before=(await db.query('SELECT * FROM members ORDER BY id')).rows;await assert.rejects(updateProfile(db,A,0,{bio:'UNGUARDED'}),code('PT503'));assert.deepEqual((await db.query('SELECT * FROM members ORDER BY id')).rows,before);
});
test('same-named UPDATE OF trigger cannot skip profile fields and no-op guard body cannot fake revision success',async t=>{
 for(const change of ["DROP TRIGGER soe_member_profile_revision_guard ON members; CREATE TRIGGER soe_member_profile_revision_guard BEFORE INSERT OR UPDATE OF exp_tokens ON members FOR EACH ROW EXECUTE FUNCTION public.soe_member_profile_revision_guard()", "CREATE OR REPLACE FUNCTION public.soe_member_profile_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$"]){
  const db=await profileDb(t);await runProfileSql(db,'apply');await db.exec(change);const before=(await db.query('SELECT * FROM members ORDER BY id')).rows;await assert.rejects(updateProfile(db,A,0,{bio:'MUST_ROLL_BACK'}),code('PT503'));assert.deepEqual((await db.query('SELECT * FROM members ORDER BY id')).rows,before);
 }
});
test('changed publication/revision defaults or weakened check definitions are never accepted as an existing migration',async t=>{
 for(const change of ["ALTER TABLE members ALTER COLUMN profile_visibility SET DEFAULT 'public'",'ALTER TABLE members ALTER COLUMN profile_revision SET DEFAULT 5',"ALTER TABLE members DROP CONSTRAINT soe_member_profile_visibility_check; ALTER TABLE members ADD CONSTRAINT soe_member_profile_visibility_check CHECK(profile_visibility IS NOT NULL)","ALTER TABLE members DROP CONSTRAINT soe_member_profile_revision_check; ALTER TABLE members ADD CONSTRAINT soe_member_profile_revision_check CHECK(profile_revision>=0)"]){
  const db=await profileDb(t);await runProfileSql(db,'apply');await db.exec(change);for(const action of ['preflight','apply','rollback'])await assert.rejects(runProfileSql(db,action),code('PT409'));
 }
});
test('containment prerequisite and unknown object collisions fail closed without overwriting source',async t=>{
 const exposed=await profileDb(t,{contained:false});await assert.rejects(runProfileSql(exposed,'apply'),code('PT409'));assert.equal((await exposed.query("SELECT count(*)::int n FROM pg_attribute WHERE attrelid='members'::regclass AND attname='profile_visibility'")).rows[0].n,0);
 const db=await profileDb(t);await db.exec('ALTER TABLE members ADD COLUMN profile_visibility text');await assert.rejects(runProfileSql(db,'apply'),code('PT409'));
});
test('unused rollback removes only owned new schema and preserves all original profiles/policies/grants',async t=>{
 const db=await profileDb(t);const before=(await db.query('SELECT * FROM members ORDER BY id')).rows;const policies=(await db.query('SELECT oid,polname,polqual::text FROM pg_policy ORDER BY oid')).rows;const acl=(await db.query("SELECT relacl::text FROM pg_class WHERE oid='members'::regclass")).rows;
 await runProfileSql(db,'apply');await runProfileSql(db,'rollback');await runProfileSql(db,'rollback');assert.deepEqual((await db.query('SELECT * FROM members ORDER BY id')).rows,before);assert.deepEqual((await db.query('SELECT oid,polname,polqual::text FROM pg_policy ORDER BY oid')).rows,policies);assert.deepEqual((await db.query("SELECT relacl::text FROM pg_class WHERE oid='members'::regclass")).rows,acl);
});
test('rollback refuses any actual profile edit/publication and edited function definitions',async t=>{
 for(const change of [async db=>updateProfile(db,A,0,{visibility:'public'}),async db=>updateProfile(db,A,0,{bio:'PRIVATE_EDIT'}),async db=>db.exec("CREATE OR REPLACE FUNCTION public.soe_member_profile_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$")]){
  const db=await profileDb(t);await runProfileSql(db,'apply');await change(db);await assert.rejects(runProfileSql(db,'rollback'),code('PT409'));assert.equal((await db.query("SELECT count(*)::int n FROM pg_attribute WHERE attrelid='members'::regclass AND attname='profile_visibility'")).rows[0].n,1);
 }
});
test('rollback never implicitly drops a later profile index or constraint with a new column',async t=>{
 for(const change of ['CREATE INDEX later_profile_index ON members(profile_visibility)',"ALTER TABLE members ADD CONSTRAINT later_profile_check CHECK(profile_visibility<>'unknown')"]){
  const db=await profileDb(t);await runProfileSql(db,'apply');await db.exec(change);const before=(await db.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='members'::regclass ORDER BY oid")).rows;await assert.rejects(runProfileSql(db,'rollback'),code('PT409'));assert.deepEqual((await db.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='members'::regclass ORDER BY oid")).rows,before);assert.equal((await db.query("SELECT count(*)::int n FROM pg_attribute WHERE attrelid='members'::regclass AND attname='profile_visibility'")).rows[0].n,1);
 }
});
test('function volatility or strictness drift is refused without replacing or dropping the altered function',async t=>{
 for(const change of ['ALTER FUNCTION public.soe_member_profile_update(uuid,bigint,jsonb) STABLE','ALTER FUNCTION public.soe_member_profile_revision_guard() STABLE','ALTER FUNCTION public.soe_member_profile_update(uuid,bigint,jsonb) STRICT']){
  const db=await profileDb(t);await runProfileSql(db,'apply');await db.exec(change);const before=(await db.query("SELECT oid,provolatile,proisstrict,prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'soe_member_profile_%' ORDER BY oid")).rows;for(const action of ['preflight','apply','rollback'])await assert.rejects(runProfileSql(db,action),code('PT409'));assert.deepEqual((await db.query("SELECT oid,provolatile,proisstrict,prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'soe_member_profile_%' ORDER BY oid")).rows,before);
 }
});
