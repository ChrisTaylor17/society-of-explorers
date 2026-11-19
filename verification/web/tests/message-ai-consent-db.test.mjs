import test from 'node:test';
import assert from 'node:assert/strict';
import {stat,lstat} from 'node:fs/promises';

const ROOT=new URL('../../../',import.meta.url);
const support=new URL('./support/message-ai-db.mjs',import.meta.url),supportLink=await lstat(support),supportInfo=await stat(support);
assert.equal(supportLink.isSymbolicLink(),false);assert.ok(!supportInfo.size||supportInfo.blocks,'Refuse fixture placeholder');
const {createMessageAiDb,runMessageAiSql:apply,IDS,rpc,asRole,requestId,snapshotLegacyRows,POLICY,CONTENT}=await import('./support/message-ai-db.mjs');
const NAMES=['soe_circle_message_ai_consent_state','soe_circle_message_ai_consent_set','soe_circle_message_ai_snapshot'];
const signatures=[NAMES[0]+'(uuid,uuid,uuid)',NAMES[1]+'(uuid,uuid,uuid,bigint,text,text,boolean)',NAMES[2]+'(uuid,uuid,uuid)'];
const rejects=(work,code)=>assert.rejects(work,error=>{assert.equal(error.code,code,error.message);assert.doesNotMatch(error.message,/PRIVATE_REPORT_NOTE|PRIVATE_AUTHOR_LABEL/);return true;});
async function fixture(t,{install=true}={}){
 const f=await createMessageAiDb({install});t.after(()=>f.db.close());return f;
}
const state=(f,actor=f.author,message=f.message,circle=f.circle)=>rpc(f.db,NAMES[0],[actor,circle,message]);
async function set(f,allowed,{actor=f.author,message=f.message,circle=f.circle,revision,hash,policy=POLICY}={}){
 if(revision===undefined||hash===undefined){const current=await state(f,actor,message,circle);revision??=current.consentRevision;hash??=current.contentHash;}
 return rpc(f.db,NAMES[1],[actor,circle,message,revision,hash,policy,allowed]);
}
const snapshot=(f,actor=IDS.reviewer)=>rpc(f.db,NAMES[2],[actor,f.circle,f.message]);
async function safety(f){return rpc(f.db,'soe_circle_message_state',[f.author,f.circle,f.message]);}
async function report(f,note='PRIVATE_REPORT_NOTE: an allegation, never provider context.'){
 const s=await rpc(f.db,'soe_circle_message_state',[IDS.host,f.circle,f.message]);
 return rpc(f.db,'soe_circle_message_action',[IDS.host,f.circle,f.message,s.revision,s.contentHash,requestId(),'report','safety',note]);
}
async function decide(f,action='hide'){
 const d=await rpc(f.db,'soe_circle_message_review_detail',[IDS.reviewer,f.circle,f.message]);
 return rpc(f.db,'soe_circle_message_review_decide',[IDS.reviewer,f.circle,f.message,d.revision,d.contentHash,requestId(),action,
  action==='hide'?'safety':'resolved','Synthetic human explanation after independently checking conduct.',null,action==='hide'?'disagreement with an idea':null]);
}
async function withdraw(f){const s=await safety(f);return rpc(f.db,'soe_circle_message_action',[f.author,f.circle,f.message,s.revision,s.contentHash,requestId(),'withdraw',null,null]);}
const scalar=async(db,sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
const defaults=async db=>(await db.query('SELECT oid,defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY oid')).rows;

test('startup network denial and explicit sanitized-live fixture limits remain in force',async()=>{
 assert.throws(()=>fetch('https://fixture.invalid/no-provider'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
});
test('legacy absence is private false/revision zero; reads never initialize consent or change safety/data/defaults',async t=>{
 const f=await fixture(t,{install:false}),old=await snapshotLegacyRows(f.db),priorDefaults=await defaults(f.db),priorSafety=await safety(f);
 await apply(f.db);const a=await state(f),b=await state(f);
 assert.deepEqual(a,b);assert.deepEqual(Object.keys(a).sort(),['circleId','messageId','allowed','consentRevision','policy','contentHash','messageRevision','canEnable'].sort());
 assert.deepEqual({...a,contentHash:undefined},{circleId:f.circle,messageId:f.message,allowed:false,consentRevision:0,policy:POLICY,contentHash:undefined,messageRevision:0,canEnable:true});
 assert.match(a.contentHash,/^[a-f0-9]{64}$/);assert.equal(await scalar(f.db,'SELECT count(*)::int FROM circle_message_ai_consents'),0);
 assert.deepEqual(await safety(f),priorSafety);assert.deepEqual(await snapshotLegacyRows(f.db),old);assert.deepEqual(await defaults(f.db),priorDefaults);
 await rejects(()=>snapshot(f),'PT403');assert.equal(await scalar(f.db,'SELECT count(*)::int FROM circle_message_ai_consents'),0);
});
test('author-only consent does not grant authors or other members reviewer access',async t=>{
 const f=await fixture(t);
 for(const actor of [null,IDS.host,IDS.reviewer,IDS.outsider]){
  await rejects(()=>state(f,actor),'PT403');
  await rejects(()=>set(f,true,{actor,revision:0,hash:'0'.repeat(64)}),'PT403');
 }
 await set(f,true);for(const actor of [f.author,IDS.host,IDS.outsider])await rejects(()=>snapshot(f,actor),'PT403');
 await rejects(()=>state(f,f.author,f.message,IDS.salon),'PT404');
 await rejects(()=>state(f,f.author,IDS.legacyUnattributed,IDS.salon),'PT404');
});
test('explicit enable/revoke CAS uses an independent revision and exact hash/policy; stale requests never overwrite',async t=>{
 const f=await fixture(t),initial=await state(f),prior=await safety(f);
 const enabled=await set(f,true);assert.equal(enabled.allowed,true);assert.equal(enabled.consentRevision,1);
 assert.deepEqual(await set(f,true),enabled);assert.deepEqual(await safety(f),prior);
 await rejects(()=>set(f,false,{revision:0,hash:initial.contentHash}),'PT409');
 await rejects(()=>set(f,false,{hash:'0'.repeat(64)}),'PT409');
 await rejects(()=>set(f,false,{policy:'another-provider-policy'}),'PT400');
 await rejects(()=>set(f,null),'PT400');await rejects(()=>set(f,true,{revision:-1}),'PT400');
 const revoked=await set(f,false);assert.equal(revoked.allowed,false);assert.equal(revoked.consentRevision,2);
 assert.deepEqual(await set(f,false),revoked);assert.deepEqual(await safety(f),prior);await rejects(()=>snapshot(f),'PT403');
});
test('reviewer snapshot contains only one opted-in message and bound version/hash; no reports, author label, identity or context',async t=>{
 const f=await fixture(t);await report(f);await set(f,true);const value=await snapshot(f);
 assert.deepEqual(Object.keys(value).sort(),['circleId','messageId','content','revision','contentHash','consentRevision','policy'].sort());
 assert.equal(value.content,CONTENT);assert.equal(value.revision,1);assert.equal(value.consentRevision,1);assert.equal(value.policy,POLICY);
 assert.doesNotMatch(JSON.stringify(value),/PRIVATE_REPORT_NOTE|PRIVATE_AUTHOR_LABEL|reporter|member_name|created_at|reports|decisions/);
 const {message:other}=await rpc(f.db,'soe_circle_discussion_post',[f.author,f.circle,requestId(),'Another synthetic message with no permission.',null,null,null,'Private label']);
 await rejects(()=>rpc(f.db,NAMES[2],[IDS.reviewer,f.circle,other.id]),'PT403');
});
test('only a visible message can gain permission; prior opt-in survives human hide, and hidden author can revoke',async t=>{
 const f=await fixture(t);await set(f,true);await decide(f);const hidden=await state(f);
 assert.equal(hidden.allowed,true);assert.equal(hidden.canEnable,false);assert.equal((await snapshot(f)).content,CONTENT);
 await set(f,false);await rejects(()=>set(f,true),'PT409');await rejects(()=>snapshot(f),'PT403');
 await decide(f,'restore');assert.equal((await state(f)).canEnable,true);assert.equal((await set(f,true)).consentRevision,3);
});
test('withdrawal denies advice even with stored consent; owner can read/revoke after departure and hidden Circle',async t=>{
 const f=await fixture(t);await set(f,true);await withdraw(f);
 await f.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2',[f.circle,f.author]);
 await f.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1',[f.circle]);
 const own=await state(f);assert.equal(own.allowed,true);assert.equal(own.canEnable,false);await rejects(()=>snapshot(f),'PT403');
 const revoked=await set(f,false);assert.equal(revoked.allowed,false);assert.equal(revoked.consentRevision,2);await rejects(()=>set(f,true),'PT409');
 assert.equal(await scalar(f.db,'SELECT content FROM seminar_messages WHERE id=$1',[f.message]),CONTENT);
});
test('active assignment, expiry, revocation and conflict rules are rechecked on every advice snapshot',async t=>{
 const f=await fixture(t);await set(f,true);assert.equal((await snapshot(f)).content,CONTENT);
 for(const change of [
  "UPDATE circle_reviewer_grants SET expires_at=now()-interval '1 second' WHERE member_id=$1",
  'UPDATE circle_reviewer_grants SET revoked_at=now() WHERE member_id=$1',
 ]){
  await f.db.query(change,[IDS.reviewer]);await rejects(()=>snapshot(f),'PT403');
  await f.db.query('UPDATE circle_reviewer_grants SET expires_at=NULL,revoked_at=NULL WHERE member_id=$1',[IDS.reviewer]);
 }
 await f.db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[f.circle,IDS.reviewer]);await rejects(()=>snapshot(f),'PT403');
 await f.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2',[f.circle,IDS.reviewer]);
 await f.db.query("INSERT INTO circle_message_reports(cohort_id,message_id,reporter_member_id,reason,note) VALUES($1,$2,$3,'safety','PRIVATE_REPORT_NOTE')",[f.circle,f.message,IDS.reviewer]);await rejects(()=>snapshot(f),'PT403');
});
test('complete-case limit is enforced without transmitting its first100 reports as context',async t=>{
 const f=await fixture(t);await set(f,true);
 await f.db.query("INSERT INTO circle_message_reports(cohort_id,message_id,reporter_member_id,reason,note) SELECT $1,$2,$3,'safety','PRIVATE_REPORT_NOTE'||n FROM generate_series(1,100) n",[f.circle,f.message,IDS.host]);
 assert.equal((await snapshot(f)).content,CONTENT);
 await f.db.query("INSERT INTO circle_message_reports(cohort_id,message_id,reporter_member_id,reason) VALUES($1,$2,$3,'safety')",[f.circle,f.message,IDS.host]);
 await rejects(()=>snapshot(f),'PT409');assert.equal(await scalar(f.db,"SELECT count(*)::int FROM circle_message_reports WHERE status='open'"),101);
});
test('real database rechecks invalidate in-flight revoke/re-enable ABA and changed report/withdrawal snapshots',async t=>{
 const f=await fixture(t);await set(f,true);const admitted=await snapshot(f);
 await set(f,false);await rejects(()=>snapshot(f),'PT403');await set(f,true);const next=await snapshot(f);
 assert.equal(next.contentHash,admitted.contentHash);assert.equal(next.revision,admitted.revision);assert.equal(next.consentRevision,3);assert.notDeepEqual(next,admitted);
 await report(f);const changed=await snapshot(f);assert.equal(changed.consentRevision,next.consentRevision);assert.equal(changed.revision,next.revision+1);assert.notDeepEqual(changed,next);
 await withdraw(f);await rejects(()=>snapshot(f),'PT403');
});
test('stale consent source hash and exhausted/zero stored revisions fail closed without changing message safety',async t=>{
 const f=await fixture(t);await set(f,true);const prior=await safety(f);
 await f.db.query("UPDATE circle_message_ai_consents SET content_hash=$1",['0'.repeat(64)]);assert.equal((await state(f)).allowed,false);await rejects(()=>snapshot(f),'PT409');
 await set(f,true);assert.equal((await state(f)).consentRevision,2);
 await f.db.exec('UPDATE circle_message_ai_consents SET consent_revision=0');await rejects(()=>snapshot(f),'PT403');
 await f.db.exec('UPDATE circle_message_ai_consents SET consent_revision=9007199254740991');assert.equal((await state(f)).canEnable,false);await rejects(()=>snapshot(f),'PT403');await rejects(()=>set(f,false),'PT409');
 assert.deepEqual(await safety(f),prior);
});
test('new table and all three functions stay service-only despite broad table/function defaults',async t=>{
 const f=await fixture(t);await set(f,true);
 const metadata=(await f.db.query("SELECT relrowsecurity FROM pg_class WHERE oid='circle_message_ai_consents'::regclass")).rows[0];assert.equal(metadata.relrowsecurity,true);
 assert.equal(await scalar(f.db,"SELECT count(*)::int FROM pg_policy WHERE polrelid='circle_message_ai_consents'::regclass"),0);
 for(const role of ['anon','authenticated','ai_unrelated']){
  assert.equal(await scalar(f.db,"SELECT has_table_privilege($1,'circle_message_ai_consents','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')",[role]),false);
  assert.equal(await scalar(f.db,"SELECT has_any_column_privilege($1,'circle_message_ai_consents','SELECT,INSERT,UPDATE,REFERENCES')",[role]),false);
  for(const signature of signatures)assert.equal(await scalar(f.db,'SELECT has_function_privilege($1,$2,$3)',[role,'public.'+signature,'EXECUTE']),false);
 }
 for(const role of ['anon','authenticated']){
  await rejects(()=>asRole(f.db,role,tx=>tx.query('SELECT * FROM circle_message_ai_consents')),'42501');
  await rejects(()=>rpc(f.db,NAMES[0],[f.author,f.circle,f.message],role),'42501');
  const current=await state(f);
  await rejects(()=>rpc(f.db,NAMES[1],[f.author,f.circle,f.message,1,current.contentHash,POLICY,false],role),'42501');
  await rejects(()=>rpc(f.db,NAMES[2],[IDS.reviewer,f.circle,f.message],role),'42501');
 }
 assert.equal(await scalar(f.db,"SELECT has_table_privilege('service_role','circle_message_ai_consents','SELECT,INSERT,UPDATE')"),true);
 for(const privilege of ['DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])assert.equal(await scalar(f.db,'SELECT has_table_privilege($1,$2,$3)',['service_role','circle_message_ai_consents',privilege]),false);
 const attrs=(await f.db.query('SELECT prosecdef,proconfig FROM pg_proc WHERE proname=ANY($1)',[NAMES])).rows;assert.equal(attrs.length,3);assert.ok(attrs.every(x=>!x.prosecdef&&JSON.stringify(x.proconfig)==='["search_path=pg_catalog, public"]'));
});
test('plain migration refuses table/function collisions and second apply atomically',async t=>{
 for(const collision of ['CREATE TABLE circle_message_ai_consents(unrelated text)','CREATE FUNCTION soe_circle_message_ai_snapshot(text) RETURNS void LANGUAGE sql AS $$SELECT$$']){
  const f=await fixture(t,{install:false}),old=await snapshotLegacyRows(f.db),prior=await defaults(f.db);await f.db.exec(collision);await rejects(()=>apply(f.db),'PT409');assert.deepEqual(await snapshotLegacyRows(f.db),old);assert.deepEqual(await defaults(f.db),prior);
 }
 const f=await fixture(t);await set(f,true);const before=(await f.db.query('SELECT * FROM circle_message_ai_consents')).rows;await rejects(()=>apply(f.db),'PT409');assert.deepEqual((await f.db.query('SELECT * FROM circle_message_ai_consents')).rows,before);
});
test('unsafe role inheritance/authority and mismatched prerequisite ownership refuse before creating anything',async t=>{
 for(const change of ['ALTER ROLE anon BYPASSRLS','GRANT ai_unrelated TO authenticated','GRANT CREATE ON SCHEMA public TO anon','ALTER FUNCTION _soe_circle_message_hash(text) OWNER TO ai_unrelated']){
  const f=await fixture(t,{install:false});await f.db.exec(change);await rejects(()=>apply(f.db),'PT409');assert.equal(await scalar(f.db,"SELECT to_regclass('public.circle_message_ai_consents')"),null);
 }
});
