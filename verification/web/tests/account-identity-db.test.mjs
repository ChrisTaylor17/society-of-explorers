import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../tooling/node_modules/@electric-sql/pglite/dist/index.js';
const ROOT=new URL('../../../',import.meta.url),SQL={};
for(const name of ['preflight','unique','rollback'])SQL[name]=await readFile(new URL(`docs/sql/member-identity-${name}.sql`,ROOT),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',U='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function fixture(t,schema='CREATE TABLE public.members(id uuid PRIMARY KEY, supabase_auth_id uuid, display_name text)'){
 const db=new PGlite();await db.waitReady;t.after(()=>db.close());await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;');if(schema)await db.exec(schema);return db;
}
async function run(db,name){try{return await db.exec(SQL[name]);}catch(error){await db.exec('ROLLBACK');throw error;}}
const error=code=>value=>{assert.equal(value.code,code,value.message);assert.doesNotMatch(value.message,new RegExp(A+'|'+B+'|'+U));return true;};
const indexes=async db=>(await db.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='members' ORDER BY indexname")).rows.map(x=>x.indexname);

test('owner-only read-only preflight reveals no identity values and makes no changes',async t=>{
 const db=await fixture(t);await db.query('INSERT INTO members VALUES($1,$2,$3)',[A,U,'Fictional']);const before=await indexes(db),results=await run(db,'preflight');assert.deepEqual(await indexes(db),before);const output=JSON.stringify(results);assert.match(output,/member_identity_preflight_passed/);assert.doesNotMatch(output,new RegExp(U+'|Fictional'));
});
test('unique draft allows multiple null wallet identities and rejects duplicate nonnull subjects',async t=>{
 const db=await fixture(t);await run(db,'unique');await db.query('INSERT INTO members(id) VALUES($1),($2)',[A,B]);await db.query('UPDATE members SET supabase_auth_id=$1 WHERE id=$2',[U,A]);await assert.rejects(db.query('UPDATE members SET supabase_auth_id=$1 WHERE id=$2',[U,B]),e=>e.code==='23505');assert.equal((await db.query('SELECT count(*)::int n FROM members')).rows[0].n,2);
});
test('duplicate subject preflight and migration abort without exposing or repairing account rows',async t=>{
 const db=await fixture(t);await db.query('INSERT INTO members VALUES($1,$3,$4),($2,$3,$4)',[A,B,U,'Private synthetic label']);for(const name of ['preflight','unique']){await assert.rejects(run(db,name),error('PT409'));assert.deepEqual(await indexes(db),['members_pkey']);assert.equal((await db.query('SELECT count(*)::int n FROM members')).rows[0].n,2);}
});
test('schema assumptions fail closed for absent table, text subject, nonnullable subject and wrong primary key',async t=>{
 for(const schema of [null,'CREATE TABLE members(id uuid PRIMARY KEY, supabase_auth_id text)','CREATE TABLE members(id uuid PRIMARY KEY,supabase_auth_id uuid NOT NULL)','CREATE TABLE members(id uuid, supabase_auth_id uuid)','CREATE TABLE members(id integer PRIMARY KEY,supabase_auth_id uuid)']){const db=await fixture(t,schema);await assert.rejects(run(db,'preflight'),error('PT409'));}
});
test('idempotent apply and rollback affect only the marked draft index',async t=>{
 const db=await fixture(t);await run(db,'unique');const oid=(await db.query("SELECT 'public.soe_members_auth_subject_key'::regclass::oid oid")).rows[0].oid;await run(db,'unique');assert.equal((await db.query("SELECT 'public.soe_members_auth_subject_key'::regclass::oid oid")).rows[0].oid,oid);await run(db,'rollback');assert.deepEqual(await indexes(db),['members_pkey']);await run(db,'rollback');assert.deepEqual(await indexes(db),['members_pkey']);
});
test('equivalent pre-existing unique constraints and differently named indexes are retained',async t=>{
 for(const statement of ['ALTER TABLE members ADD CONSTRAINT existing_subject UNIQUE(supabase_auth_id)','CREATE UNIQUE INDEX existing_subject ON members(supabase_auth_id)','CREATE UNIQUE INDEX existing_subject ON members(supabase_auth_id) WHERE supabase_auth_id IS NOT NULL','CREATE UNIQUE INDEX existing_subject ON members(supabase_auth_id) INCLUDE(display_name)']){const db=await fixture(t);await db.exec(statement);const before=await indexes(db);await run(db,'unique');assert.deepEqual(await indexes(db),before);await run(db,'rollback');assert.deepEqual(await indexes(db),before);}
});
test('same-name unrelated, expression and invalid-semantic indexes are refused rather than IF NOT EXISTS skipped',async t=>{
 for(const statement of ['CREATE INDEX soe_members_auth_subject_key ON members(display_name)','CREATE UNIQUE INDEX soe_members_auth_subject_key ON members((supabase_auth_id::text))','CREATE UNIQUE INDEX soe_members_auth_subject_key ON members(supabase_auth_id) WHERE id IS NULL']){const db=await fixture(t);await db.exec(statement);const before=await indexes(db);await assert.rejects(run(db,'unique'),error('PT409'));assert.deepEqual(await indexes(db),before);await run(db,'rollback');assert.deepEqual(await indexes(db),before);}
});
test('existing same-name equivalent index is not adopted or dropped by rollback',async t=>{
 const db=await fixture(t);await db.exec("CREATE UNIQUE INDEX soe_members_auth_subject_key ON members(supabase_auth_id); COMMENT ON INDEX soe_members_auth_subject_key IS 'owned by previous migration';");await run(db,'unique');await run(db,'rollback');assert.deepEqual(await indexes(db),['members_pkey','soe_members_auth_subject_key']);assert.equal((await db.query("SELECT obj_description('soe_members_auth_subject_key'::regclass,'pg_class') comment")).rows[0].comment,'owned by previous migration');
});
test('rollback refuses a pre-existing constraint even if its index has the draft ownership marker',async t=>{
 const db=await fixture(t);await db.exec("ALTER TABLE members ADD CONSTRAINT soe_members_auth_subject_key UNIQUE(supabase_auth_id); COMMENT ON INDEX soe_members_auth_subject_key IS 'soe-member-identity:v1:created-by-reviewed-draft';");await assert.rejects(run(db,'rollback'),error('PT409'));assert.equal((await db.query("SELECT count(*)::int n FROM pg_constraint WHERE conname='soe_members_auth_subject_key'")).rows[0].n,1);
});
test('NULLS NOT DISTINCT existing constraint is flagged because it excludes multiple wallet members',async t=>{
 const db=await fixture(t);await db.exec('ALTER TABLE members ADD CONSTRAINT different_nulls UNIQUE NULLS NOT DISTINCT(supabase_auth_id)');await assert.rejects(run(db,'preflight'),error('PT409'));await assert.rejects(run(db,'unique'),error('PT409'));assert.deepEqual(await indexes(db),['different_nulls','members_pkey']);
});
test('browser and service roles cannot execute owner preflight or perform draft DDL, even with SELECT grants',async t=>{
 const db=await fixture(t);await db.exec('GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role; GRANT SELECT ON members TO anon,authenticated,service_role;');for(const role of ['anon','authenticated','service_role']){await db.exec('SET ROLE '+role);for(const name of ['preflight','unique','rollback'])await assert.rejects(run(db,name),error('42501'));await db.exec('RESET ROLE');}assert.deepEqual(await indexes(db),['members_pkey']);
});
test('draft changes no RLS, policies, grants, rows or installed function privileges',async t=>{
 const db=await fixture(t);await db.exec('ALTER TABLE members ENABLE ROW LEVEL SECURITY; GRANT SELECT ON members TO authenticated; CREATE POLICY existing_owner_policy ON members TO authenticated USING(false);');await db.query('INSERT INTO members VALUES($1,$2,$3)',[A,U,'Fictional']);
 const state=async()=>({table:(await db.query("SELECT relrowsecurity,relforcerowsecurity,relacl::text FROM pg_class WHERE oid='members'::regclass")).rows,policies:(await db.query("SELECT policyname,roles,cmd,qual FROM pg_policies WHERE tablename='members'")).rows,functions:(await db.query("SELECT oid,proacl::text FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY oid")).rows,rows:(await db.query('SELECT * FROM members ORDER BY id')).rows});
 const before=await state();await run(db,'unique');assert.deepEqual(await state(),before);await run(db,'rollback');assert.deepEqual(await state(),before);
});
