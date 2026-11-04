import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat,stat} from 'node:fs/promises';
const helper=new URL('./support/thinker-reward-db.mjs',import.meta.url),link=await lstat(helper),info=await stat(helper);
assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks,'Refuse offloaded accounting fixture');
const {A,B,REQUEST,HASH,createThinkerRewardDb,installAccounting,award,receipt,asRole,rewardRows,thinkerFixture,body,done,liveRewardMetadata}=await import('./support/thinker-reward-db.mjs');
const scalar=async(db,sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const count=db=>scalar(db,'SELECT count(*)::int FROM soe_thinker_reward_receipts');
const balance=(db,actor=A)=>scalar(db,'SELECT exp_tokens FROM members WHERE id=$1',[actor]);
const rejects=(fn,code)=>assert.rejects(fn,e=>{assert.equal(e.code,code,e.message);return true;});
test('atomic award uses current balance, fixed amount, one event, and no profile mutation; exact replay preserves the receipt',async t=>{
 const db=await createThinkerRewardDb(t),before=await rewardRows(db),legacy=await liveRewardMetadata(db);
 const first=await award(db);assert.equal(first.amount,8);assert.equal(first.replayed,false);
 await asRole(db,'service_role',tx=>tx.query('UPDATE members SET exp_tokens=exp_tokens+17 WHERE id=$1',[A]));
 const replay=await award(db);assert.deepEqual(replay,{...first,replayed:true});assert.equal(await balance(db),32);assert.equal(await count(db),1);
 const rows=await rewardRows(db);assert.equal(rows.events.length,1);assert.equal(rows.events[0].id,first.eventId);assert.equal(rows.events[0].member_id,A);
 assert.deepEqual({...rows.members[0],exp_tokens:before.members[0].exp_tokens},before.members[0]);assert.deepEqual(rows.members[1],before.members[1]);assert.deepEqual(await liveRewardMetadata(db),legacy);
 assert.deepEqual(await receipt(db),replay);assert.equal(await receipt(db,B),null);
});
test('changed hash/thinker/kind under a used key refuses without any new event or credit; actor scopes keys',async t=>{
 const db=await createThinkerRewardDb(t);await award(db);const prior=await rewardRows(db);
 for(const patch of [{hash:'b'.repeat(64)},{thinker:'plato'},{reaction:true}])await rejects(()=>award(db,patch),'PT409');
 assert.deepEqual(await rewardRows(db),prior);const own=await award(db,{actor:B,reaction:true});assert.equal(own.amount,4);assert.equal(await balance(db,B),7);assert.equal(await count(db),2);
});
test('null current balance becomes fixed award; missing actor and invalid input create nothing',async t=>{
 const db=await createThinkerRewardDb(t);await db.query('UPDATE members SET exp_tokens=NULL WHERE id=$1',[A]);await award(db,{reaction:true});assert.equal(await balance(db),4);
 const prior=await rewardRows(db);for(const patch of [{actor:null},{requestId:null},{hash:'bad'},{thinker:''},{thinker:'x'.repeat(81)},{reaction:null}])await rejects(()=>award(db,patch),'PT400');
 await rejects(()=>award(db,{actor:'99999999-9999-4999-8999-999999999999'}),'PT404');assert.deepEqual(await rewardRows(db),prior);
});
test('event failure, receipt failure, and integer overflow roll back all reward effects',async t=>{
 for(const failure of ['event','receipt','overflow']){
  const db=await createThinkerRewardDb(t);
  if(failure==='overflow')await db.query('UPDATE members SET exp_tokens=2147483647 WHERE id=$1',[A]);
  else await db.exec(`CREATE FUNCTION fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_ATOMIC_FAILURE';END$$;CREATE TRIGGER fixture_failure BEFORE INSERT ON ${failure==='event'?'exp_events':'soe_thinker_reward_receipts'} FOR EACH ROW EXECUTE FUNCTION fixture_fail();`);
  const prior=await rewardRows(db);await assert.rejects(()=>award(db));assert.deepEqual(await rewardRows(db),prior);assert.equal(await count(db),0);
 }
});
test('browser receives no new reward authority; service cannot erase receipts',async t=>{
 const db=await createThinkerRewardDb(t);for(const role of ['anon','authenticated']){
  await rejects(()=>award(db,{role}),'42501');await rejects(()=>receipt(db,A,REQUEST,role),'42501');await rejects(()=>asRole(db,role,tx=>tx.query('SELECT * FROM soe_thinker_reward_receipts')),'42501');
 }
 await award(db);for(const sql of ['DELETE FROM soe_thinker_reward_receipts','UPDATE soe_thinker_reward_receipts SET amount=4','TRUNCATE soe_thinker_reward_receipts'])await rejects(()=>asRole(db,'service_role',tx=>tx.exec(sql)),'42501');
 assert.equal(await count(db),1);
});
test('all unknown owner default grantees are scrubbed on new objects without changing global defaults or legacy functions',async t=>{
 const db=await createThinkerRewardDb(t,{install:false});
 await db.exec('CREATE ROLE fixture_unrelated NOLOGIN;GRANT USAGE ON SCHEMA public TO fixture_unrelated;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fixture_unrelated;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO fixture_unrelated;');
 const defaults=(await db.query('SELECT oid,defaclacl::text FROM pg_default_acl ORDER BY oid')).rows,legacy=await liveRewardMetadata(db);
 await installAccounting(db);
 assert.equal(await scalar(db,"SELECT has_table_privilege('fixture_unrelated','soe_thinker_reward_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')"),false);
 for(const signature of ['soe_thinker_reward_award(uuid,uuid,text,text,boolean)','soe_thinker_reward_receipt(uuid,uuid)'])assert.equal(await scalar(db,'SELECT has_function_privilege($1,$2,$3)',['fixture_unrelated',signature,'EXECUTE']),false);
 assert.deepEqual((await db.query('SELECT oid,defaclacl::text FROM pg_default_acl ORDER BY oid')).rows,defaults);assert.deepEqual(await liveRewardMetadata(db),legacy);
});
test('migration collisions and administrative/inherited service role drift refuse atomically',async t=>{
 const db=await createThinkerRewardDb(t);await rejects(()=>installAccounting(db),'PT409');assert.equal(await count(db),0);
 for(const change of ['ALTER ROLE service_role SUPERUSER','GRANT postgres TO service_role']){
  const fresh=await createThinkerRewardDb(t,{install:false});await fresh.exec(change);await rejects(()=>installAccounting(fresh),'PT409');assert.equal(await scalar(fresh,"SELECT to_regclass('soe_thinker_reward_receipts')"),null);
 }
});
test('actual Thinker route binds verified actor and normalized request, preserves private streaming, and confirms only actual atomic receipt',async t=>{
 const db=await createThinkerRewardDb(t),app=await thinkerFixture(db,{staleExpTokens:1});
 await asRole(db,'service_role',tx=>tx.query('UPDATE members SET exp_tokens=exp_tokens+50 WHERE id=$1',[A]));
 const response=await app.post(body({memberId:B}));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);
 const result=await done(response);assert.equal(result.last.expAwarded,8);assert.equal(result.last.reward.status,'confirmed');assert.equal(await balance(db),65);
 assert.equal(app.stats.authCalls,1);assert.equal(app.stats.providerCalls,1);assert.equal(app.stats.fallbacks,0);assert.equal(app.stats.eventInserts,0);assert.equal(app.stats.rpcCalls[0].name,'soe_thinker_reward_award');assert.equal(app.stats.rpcCalls[0].params.p_actor,A);assert.match(app.stats.rpcCalls[0].params.p_request_hash,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(result).includes('PRIVATE_SYNTHETIC_EMAIL'),false);assert.equal((await rewardRows(db)).events.length,1);
 const replay=await done(await app.post(body({memberId:B})));assert.equal(replay.last.expAwarded,0);assert.equal(replay.last.reward.replayed,true);assert.equal(await balance(db),65);
});
test('actual route DB errors/throws/malformed/lost responses never claim EXP and never use stale fallback; manual GET can confirm a lost committed award',async t=>{
 for(const rpcMode of ['error','throw','malformed','lost','wrong-request','wrong-amount']){
  const db=await createThinkerRewardDb(t),app=await thinkerFixture(db,{rpcMode});const result=await done(await app.post(body()));
  assert.equal(result.last.reward.status,'unknown');assert.equal('expAwarded' in result.last,false);assert.match(result.last.response,/Synthetic exact-body/);assert.equal(app.stats.fallbacks,0);assert.equal(result.text.includes('MUST_NOT_LEAK'),false);
  const normal=await thinkerFixture(db),confirmation=await normal.get('requestId='+REQUEST);assert.equal(confirmation.status,200);const state=await confirmation.json();assert.equal(state.status,['error','throw'].includes(rpcMode)?'unknown':'confirmed');assert.equal(normal.stats.providerCalls,0);assert.equal(normal.stats.authCalls,1);
 }
});
test('receipt GET validates exact query/origin/auth and never accepts another actor or malformed receipt',async t=>{
 const db=await createThinkerRewardDb(t);await award(db);const app=await thinkerFixture(db);
 for(const query of ['','requestId=bad','requestId='+REQUEST+'&requestId='+REQUEST,'requestId='+REQUEST+'&memberId='+B])assert.equal((await app.get(query)).status,400);
 assert.equal((await app.get('requestId='+REQUEST,{origin:'https://other.invalid'})).status,403);
 assert.equal((await app.get('requestId='+REQUEST,{'sec-fetch-site':'cross-site'})).status,403);
 const unauthorized=await thinkerFixture(db,{actor:null});assert.equal((await unauthorized.get('requestId='+REQUEST)).status,401);
 const other=await thinkerFixture(db,{actor:B});assert.equal((await(await other.get('requestId='+REQUEST)).json()).status,'unknown');
 const malformed=await thinkerFixture(db,{rpcMode:'malformed'});assert.equal((await malformed.get('requestId='+REQUEST)).status,503);
 assert.equal(app.stats.providerCalls,0);
});
test('authenticated missing/invalid request keys stop before provider, demo stays unchanged, unauthorized actor is refused first',async t=>{
 const db=await createThinkerRewardDb(t),app=await thinkerFixture(db);
 for(const requestId of [undefined,'bad'])assert.equal((await app.post(body({requestId}))).status,400);
 assert.equal(app.stats.providerCalls,0);assert.equal(app.stats.rpcCalls.length,0);
 const unauthorized=await thinkerFixture(db,{actor:null});assert.equal((await unauthorized.post(body({requestId:undefined}))).status,401);
 const demo=await done(await unauthorized.post({demo:true,thinkerId:'socrates',message:'Demo'}));assert.equal(demo.last.done,true);assert.equal('expAwarded'in demo.last,false);assert.equal('reward'in demo.last,false);
});
test('changed payload key yields SQL409 but the already-open actual SSE stream honestly reports unconfirmed, without new accounting effects',async t=>{
 const db=await createThinkerRewardDb(t),app=await thinkerFixture(db);await done(await app.post(body()));const prior=await rewardRows(db);
 const response=await app.post(body({message:'Changed synthetic private request'}));assert.equal(response.status,200);const result=await done(response);
 assert.equal(result.last.reward.status,'unknown');assert.equal('expAwarded'in result.last,false);assert.deepEqual(await rewardRows(db),prior);assert.equal(await count(db),1);
});
