import test from 'node:test';
import assert from 'node:assert/strict';
import {stat,lstat} from 'node:fs/promises';
const support=new URL('./support/message-ai-allowance-db.mjs',import.meta.url),link=await lstat(support),info=await stat(support);
assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks,'Refuse allowance fixture placeholder');
const {createMessageAiAllowanceDb,applyAllowance,activateAllowance,enableConsent,adviceSnapshot,reserveAllowance,
 IDS,rpc,asRole,requestId,POLICY,snapshotLegacyRows}=await import('./support/message-ai-allowance-db.mjs');
const NAME='soe_circle_message_ai_reserve',SIGNATURE=NAME+'(uuid,uuid,uuid,uuid,bigint,text,bigint,text)';
const scalar=async(db,sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
const count=f=>scalar(f.db,'SELECT count(*)::int FROM circle_message_ai_attempts');
const reject=(work,code)=>assert.rejects(work,error=>{assert.equal(error.code,code,error.message);assert.doesNotMatch(error.message,/PRIVATE_|Synthetic disagreement/);return true;});
const asTestRole=(db,role,work)=>role==='ai_unrelated'?db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE ai_unrelated');return work(tx);}):asRole(db,role,work);
async function fixture(t,{install=true,active=false}={}){
 const f=await createMessageAiAllowanceDb({install});t.after(()=>f.db.close());
 await enableConsent(f);if(active)await activateAllowance(f.db);return f;
}
const reserveArgs=(f,s,id=requestId(),actor=IDS.reviewer)=>[actor,f.circleId,f.messageId,id,s.revision,s.contentHash,s.consentRevision,POLICY];

test('startup denial is active; allowance defaults disabled/zero and never initializes activity',async t=>{
 assert.throws(()=>fetch('https://fixture.invalid/no-provider'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
 const f=await fixture(t),row=(await f.db.query('SELECT * FROM circle_message_ai_allowance')).rows[0];
 assert.deepEqual(row,{singleton:1,enabled:false,starts_at:null,ends_at:null,global_limit:0,per_reviewer_limit:0,lock_marker:false});
 await reject(()=>reserveAllowance(f),'PT503');assert.equal(await count(f),0);
});
test('additive install preserves old rows, consent, function bodies and global defaults',async t=>{
 const f=await fixture(t,{install:false}),rows=await snapshotLegacyRows(f.db);
 const consent=(await f.db.query('SELECT * FROM circle_message_ai_consents')).rows;
 const defaults=(await f.db.query('SELECT oid,defaclacl::text FROM pg_default_acl ORDER BY oid')).rows;
 const functions=(await f.db.query("SELECT oid,md5(prosrc) body FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY oid")).rows;
 await applyAllowance(f.db);assert.deepEqual(await snapshotLegacyRows(f.db),rows);
 assert.deepEqual((await f.db.query('SELECT * FROM circle_message_ai_consents')).rows,consent);
 assert.deepEqual((await f.db.query('SELECT oid,defaclacl::text FROM pg_default_acl ORDER BY oid')).rows,defaults);
 assert.deepEqual((await f.db.query('SELECT oid,md5(prosrc) body FROM pg_proc WHERE oid=ANY($1) ORDER BY oid',[functions.map(f=>f.oid)])).rows,functions);
});
test('fresh reservation returns only exact bound send lease and records one durable private debit',async t=>{
 const f=await fixture(t,{active:true}),s=await adviceSnapshot(f),id=requestId(),r=await reserveAllowance(f,{attemptId:id,snapshot:s});
 assert.deepEqual(Object.keys(r).sort(),['attemptId','circleId','messageId','revision','contentHash','consentRevision','policy','validForMs'].sort());
 assert.deepEqual({...r,validForMs:undefined},{attemptId:id,circleId:f.circleId,messageId:f.messageId,revision:s.revision,contentHash:s.contentHash,consentRevision:s.consentRevision,policy:POLICY,validForMs:undefined});
 assert.ok(Number.isInteger(r.validForMs)&&r.validForMs>=1&&r.validForMs<=8000);
 const attempt=(await f.db.query('SELECT * FROM circle_message_ai_attempts')).rows[0];
 assert.equal(attempt.actor_id,IDS.reviewer);assert.equal(attempt.attempt_id,id);assert.equal(await count(f),1);
 assert.doesNotMatch(JSON.stringify(r),/content\"|PRIVATE_|actor|report|allowance|limit/);
});
test('same or changed binding replay never returns new send authority or another debit',async t=>{
 const f=await fixture(t,{active:true}),s=await adviceSnapshot(f),id=requestId();await reserveAllowance(f,{attemptId:id,snapshot:s});
 await reject(()=>reserveAllowance(f,{attemptId:id,snapshot:s}),'PT409');
 await reject(()=>reserveAllowance(f,{attemptId:id,snapshot:s,hash:'0'.repeat(64)}),'PT409');
 await f.db.exec("UPDATE circle_message_ai_attempts SET debited_at=clock_timestamp()-interval '2 hours',valid_until=clock_timestamp()-interval '2 hours'+interval '1 second'");
 await reject(()=>reserveAllowance(f,{attemptId:id,snapshot:s}),'PT409');assert.equal(await count(f),1);
});
test('global ceiling spans distinct reviewers and remains cumulative across window/config changes',async t=>{
 const f=await fixture(t,{active:true});await activateAllowance(f.db,{globalLimit:2,reviewerLimit:2});
 await f.db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)',[f.circleId,IDS.outsider]);
 await reserveAllowance(f);await reserveAllowance(f,{actor:IDS.outsider});
 await reject(()=>reserveAllowance(f),'PT429');assert.equal(await count(f),2);
 await f.db.exec("UPDATE circle_message_ai_allowance SET enabled=false,starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour'");
 await activateAllowance(f.db,{globalLimit:2,reviewerLimit:2});await reject(()=>reserveAllowance(f),'PT429');assert.equal(await count(f),2);
 // Explicit owner increase adds capacity; changing dates alone did not.
 await activateAllowance(f.db,{globalLimit:3,reviewerLimit:3});await reserveAllowance(f);assert.equal(await count(f),3);
});
test('per-reviewer lifetime ceiling leaves another eligible reviewer their own remaining allowance',async t=>{
 const f=await fixture(t,{active:true});await activateAllowance(f.db,{globalLimit:3,reviewerLimit:1});
 await f.db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)',[f.circleId,IDS.outsider]);
 await reserveAllowance(f);await reject(()=>reserveAllowance(f),'PT429');await reserveAllowance(f,{actor:IDS.outsider});
 assert.equal(await count(f),2);
});
test('past/future/disabled windows deny, short remaining DB window limits lease',async t=>{
 const f=await fixture(t,{active:true});
 for(const options of [{startOffsetSeconds:-20,endOffsetSeconds:-10},{startOffsetSeconds:10,endOffsetSeconds:20}]){
  await activateAllowance(f.db,options);await reject(()=>reserveAllowance(f),'PT503');
 }
 await activateAllowance(f.db,{endOffsetSeconds:3.5});const r=await reserveAllowance(f);assert.ok(r.validForMs>0&&r.validForMs<=3500);
 await f.db.exec('UPDATE circle_message_ai_allowance SET enabled=false');await reject(()=>reserveAllowance(f),'PT503');assert.equal(await count(f),1);
 for(const change of ["UPDATE circle_message_ai_allowance SET ends_at='infinity'",'UPDATE circle_message_ai_allowance SET enabled=true,global_limit=0,per_reviewer_limit=0'])await reject(()=>f.db.exec(change),'23514');
});
test('atomic fresh binding rejects report revisions, changed hashes, policy and consent revoke/re-enable',async t=>{
 const f=await fixture(t,{active:true}),s=await adviceSnapshot(f);
 for(const override of [{revision:s.revision+1},{hash:'0'.repeat(64)},{policy:'another-policy'},{consentRevision:s.consentRevision+1}])await reject(()=>reserveAllowance(f,{snapshot:s,...override}),'PT409');
 const own=await rpc(f.db,'soe_circle_message_ai_consent_state',[f.authorId,f.circleId,f.messageId]);
 await rpc(f.db,'soe_circle_message_ai_consent_set',[f.authorId,f.circleId,f.messageId,own.consentRevision,own.contentHash,POLICY,false]);
 await reject(()=>reserveAllowance(f,{snapshot:s}),'PT403');await enableConsent(f);
 await reject(()=>reserveAllowance(f,{snapshot:s}),'PT409');assert.equal(await count(f),0);
 await reserveAllowance(f);assert.equal(await count(f),1);
});
test('unauthorized/conflicted/withdrawn/incomplete cases never debit allowance',async t=>{
 const f=await fixture(t,{active:true}),s=await adviceSnapshot(f);
 for(const actor of [f.authorId,IDS.host,IDS.outsider])await reject(()=>rpc(f.db,NAME,reserveArgs(f,s,requestId(),actor)),'PT403');
 await f.db.query('UPDATE circle_reviewer_grants SET revoked_at=clock_timestamp() WHERE member_id=$1',[IDS.reviewer]);
 await reject(()=>reserveAllowance(f,{snapshot:s}),'PT403');
 await f.db.query('UPDATE circle_reviewer_grants SET revoked_at=NULL WHERE member_id=$1',[IDS.reviewer]);
 await f.db.query("INSERT INTO circle_message_reports(cohort_id,message_id,reporter_member_id,reason) SELECT $1,$2,$3,'safety' FROM generate_series(1,101)",[f.circleId,f.messageId,IDS.host]);
 await reject(()=>reserveAllowance(f,{snapshot:s}),'PT409');assert.equal(await count(f),0);
 const own=await rpc(f.db,'soe_circle_message_state',[f.authorId,f.circleId,f.messageId]);
 await rpc(f.db,'soe_circle_message_action',[f.authorId,f.circleId,f.messageId,own.revision,own.contentHash,requestId(),'withdraw',null,null]);
 await reject(()=>reserveAllowance(f,{snapshot:s}),'PT403');assert.equal(await count(f),0);
});
test('assignment expiry bounds the lease and a deterministic post-first-check expiry is reauthorized before debit',async t=>{
 const f=await fixture(t,{active:true});
 await f.db.query("UPDATE circle_reviewer_grants SET expires_at=clock_timestamp()+interval '3 seconds' WHERE member_id=$1",[IDS.reviewer]);
 const lease=await reserveAllowance(f);assert.ok(lease.validForMs>=1&&lease.validForMs<=3000);
 await f.db.query('UPDATE circle_reviewer_grants SET expires_at=NULL WHERE member_id=$1',[IDS.reviewer]);
 // Test-only owner wrapper expires the assignment after the first exact real
 // snapshot. This proves the second real check, not concurrent lock scheduling.
 await f.db.exec(`ALTER FUNCTION soe_circle_message_ai_snapshot(uuid,uuid,uuid) RENAME TO fixture_real_ai_snapshot;
  CREATE TABLE fixture_ai_snapshot_calls(n integer NOT NULL);INSERT INTO fixture_ai_snapshot_calls VALUES(0);
  CREATE FUNCTION soe_circle_message_ai_snapshot(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $seam$
  DECLARE result jsonb; calls integer;
  BEGIN result:=public.fixture_real_ai_snapshot(p_actor,p_circle_id,p_message_id);
   UPDATE public.fixture_ai_snapshot_calls SET n=n+1 RETURNING n INTO calls;
   IF calls=1 THEN UPDATE public.circle_reviewer_grants SET expires_at=clock_timestamp()-interval '1 second'
    WHERE cohort_id=p_circle_id AND member_id=p_actor;END IF;
   RETURN result;
  END $seam$;
  REVOKE ALL ON FUNCTION soe_circle_message_ai_snapshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
  GRANT EXECUTE ON FUNCTION soe_circle_message_ai_snapshot(uuid,uuid,uuid) TO service_role;`);
 const s=(await asRole(f.db,'service_role',tx=>tx.query('SELECT public.fixture_real_ai_snapshot($1,$2,$3) value',[IDS.reviewer,f.circleId,f.messageId]))).rows[0].value;
 await reject(()=>reserveAllowance(f,{snapshot:s}),'PT403');assert.equal(await count(f),1);
});
test('committed but unobserved/unsent/expired debits never refund; explicit transaction rollback is atomic',async t=>{
 const f=await fixture(t,{active:true});await activateAllowance(f.db,{globalLimit:1,reviewerLimit:1});
 // Caller intentionally discards the returned receipt; no provider exists here.
 await reserveAllowance(f);await reject(()=>reserveAllowance(f),'PT429');assert.equal(await count(f),1);
 await activateAllowance(f.db,{globalLimit:2,reviewerLimit:2});const s=await adviceSnapshot(f);
 await assert.rejects(()=>asRole(f.db,'service_role',async tx=>{await tx.query(`SELECT public.${NAME}($1,$2,$3,$4,$5,$6,$7,$8)`,reserveArgs(f,s));throw Error('Synthetic transaction rollback');}),/Synthetic transaction rollback/);
 assert.equal(await count(f),1);await reserveAllowance(f);assert.equal(await count(f),2);
});
test('non-READ-COMMITTED caller isolation fails closed before any debit',async t=>{
 const f=await fixture(t,{active:true}),s=await adviceSnapshot(f);
 for(const isolation of ['REPEATABLE READ','SERIALIZABLE']){
  await reject(()=>f.db.transaction(async tx=>{await tx.exec('SET TRANSACTION ISOLATION LEVEL '+isolation);await tx.query(`SELECT public.${NAME}($1,$2,$3,$4,$5,$6,$7,$8)`,reserveArgs(f,s));}),'PT503');
 }
 assert.equal(await count(f),0);await reserveAllowance(f);assert.equal(await count(f),1);
});
test('browser/unrelated roles have no table/column/RPC authority despite inherited defaults',async t=>{
 const f=await fixture(t,{active:true}),s=await adviceSnapshot(f);
 for(const table of ['circle_message_ai_allowance','circle_message_ai_attempts']){
  assert.equal(await scalar(f.db,'SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',[table]),true);
  assert.equal(await scalar(f.db,'SELECT count(*)::int FROM pg_policy WHERE polrelid=$1::regclass',[table]),0);
  for(const role of ['anon','authenticated','ai_unrelated']){
   assert.equal(await scalar(f.db,'SELECT has_table_privilege($1,$2,$3)',[role,table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN']),false);
   assert.equal(await scalar(f.db,'SELECT has_any_column_privilege($1,$2,$3)',[role,table,'SELECT,INSERT,UPDATE,REFERENCES']),false);
   await reject(()=>asTestRole(f.db,role,tx=>tx.query('SELECT * FROM public.'+table)),'42501');
  }
 }
 for(const role of ['anon','authenticated','ai_unrelated']){
  assert.equal(await scalar(f.db,'SELECT has_function_privilege($1,$2,$3)',[role,'public.'+SIGNATURE,'EXECUTE']),false);
  await reject(()=>asTestRole(f.db,role,tx=>tx.query(`SELECT public.${NAME}($1,$2,$3,$4,$5,$6,$7,$8)`,reserveArgs(f,s))),'42501');
 }
 const attrs=(await f.db.query('SELECT prosecdef,provolatile,proconfig FROM pg_proc WHERE oid=$1::regprocedure',['public.'+SIGNATURE])).rows[0];
 assert.deepEqual(attrs,{prosecdef:false,provolatile:'v',proconfig:['search_path=pg_catalog, public']});
});
test('service can serialize/debit but cannot edit limits/windows, erase or refund attempts',async t=>{
 const f=await fixture(t,{active:true});await reserveAllowance(f);
 await asRole(f.db,'service_role',tx=>tx.exec('UPDATE circle_message_ai_allowance SET lock_marker=false WHERE singleton=1'));
 for(const sql of ['UPDATE circle_message_ai_allowance SET global_limit=1000','UPDATE circle_message_ai_allowance SET enabled=false',
  "UPDATE circle_message_ai_allowance SET ends_at='2099-01-01'",'DELETE FROM circle_message_ai_allowance','TRUNCATE circle_message_ai_allowance',
  'UPDATE circle_message_ai_attempts SET consent_revision=2','DELETE FROM circle_message_ai_attempts','TRUNCATE circle_message_ai_attempts'])await reject(()=>asRole(f.db,'service_role',tx=>tx.exec(sql)),'42501');
 await reject(()=>asRole(f.db,'service_role',tx=>tx.exec('UPDATE circle_message_ai_allowance SET lock_marker=true')),'23514');assert.equal(await count(f),1);
});
test('object collisions, unsafe roles/prerequisite ownership and repeat apply refuse atomically',async t=>{
 for(const change of ['CREATE TABLE circle_message_ai_allowance(unrelated text)','CREATE FUNCTION soe_circle_message_ai_reserve(text) RETURNS void LANGUAGE sql AS $$SELECT$$',
  'ALTER ROLE anon BYPASSRLS','GRANT ai_unrelated TO authenticated','ALTER FUNCTION soe_circle_message_ai_snapshot(uuid,uuid,uuid) OWNER TO ai_unrelated']){
  const f=await fixture(t,{install:false});await f.db.exec(change);await reject(()=>applyAllowance(f.db),'PT409');assert.equal(await scalar(f.db,"SELECT to_regclass('public.circle_message_ai_attempts')"),null);
 }
 const f=await fixture(t,{active:true});await reserveAllowance(f);await reject(()=>applyAllowance(f.db),'PT409');assert.equal(await count(f),1);
});
test('inherited owner authority or administrative service role cannot enable budget edits or debit erasure',async t=>{
 // Fixture postgres already inherits service_role. Remove that synthetic reverse
 // edge before modeling the unsafe owner-inheritance path (PG rejects cycles).
 for(const change of ['REVOKE service_role FROM postgres;GRANT postgres TO service_role','ALTER ROLE service_role SUPERUSER']){
  const f=await fixture(t,{install:false});await f.db.exec(change);await reject(()=>applyAllowance(f.db),'PT409');
  assert.equal(await scalar(f.db,"SELECT to_regclass('public.circle_message_ai_allowance')"),null);
  assert.equal(await scalar(f.db,"SELECT to_regclass('public.circle_message_ai_attempts')"),null);
 }
});
