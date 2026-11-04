import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,stat} from 'node:fs/promises';
const file=new URL('./support/reward-live-body-db.mjs',import.meta.url),link=await lstat(file),info=await stat(file);
assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks,'Refuse offloaded exact-body helper');
const {A,B,AUTH_A,LIVE_BODIES,LIVE_CATALOG,SIGNATURES,createRewardLiveDb,asRole,callReward,runRewardSql:run,liveRewardMetadata,rewardRows,thinkerFixture}=await import('./support/reward-live-body-db.mjs');
async function fixture(t,options){const db=await createRewardLiveDb(options);t.after(()=>db.close());return db;}
const scalar=async(db,query,args=[])=>Object.values((await db.query(query,args)).rows[0])[0];
const balance=(db,id=B)=>scalar(db,'SELECT exp_tokens FROM members WHERE id=$1',[id]);
const events=db=>db.query('SELECT member_id,amount,reason FROM exp_events ORDER BY created_at,id').then(x=>x.rows);
const reject=(work,code)=>assert.rejects(work,e=>{assert.equal(e.code,code,e.message);return true;});
const acl=db=>db.query("SELECT p.oid,a.grantor,a.grantee,a.privilege_type,a.is_grantable FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.pronamespace='public'::regnamespace AND p.proname IN('add_exp','increment_exp','increment_exp_tokens') ORDER BY p.oid,a.grantor,a.grantee").then(x=>x.rows);

test('startup denial; exact definitions reproduce saved catalog and definition body digests and lengths',async t=>{
 assert.throws(()=>fetch('https://fixture.invalid/no-provider'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
 const db=await fixture(t,{profileGuard:false}),meta=await liveRewardMetadata(db);
 for(const f of LIVE_BODIES){const body=f.definition.match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1];assert.equal(typeof body,'string');
  assert.equal(Buffer.byteLength(body),f.body_bytes);assert.equal(createHash('md5').update(body).digest('hex'),f.body_md5);
  const name=f.signature.split('(')[0],live=LIVE_CATALOG.find(x=>x.name===name),actual=meta.find(x=>x.signature===f.signature);
  assert.equal(actual.body_md5,f.body_md5);assert.equal(actual.body_md5,live.body_md5);assert.equal(actual.body_bytes,f.body_bytes);assert.equal(actual.body_characters,live.body_characters);
  assert.equal(actual.language,f.language);assert.equal(actual.security_definer,f.security_definer);assert.equal(actual.owner,'postgres');assert.equal(actual.volatility,'v');assert.equal(actual.settings,null);
 }
 const add=meta.find(f=>f.signature.startsWith('add_exp('));assert.equal(add.default_count,1);assert.equal(add.default_expression,"''::text");
 const tables=(await db.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN('members'::regclass,'exp_events'::regclass) ORDER BY relname")).rows;
 assert.deepEqual(tables,[{relname:'exp_events',relrowsecurity:true,relforcerowsecurity:false},{relname:'members',relrowsecurity:true,relforcerowsecurity:false}]);
 assert.equal(await scalar(db,"SELECT count(*)::int FROM pg_trigger WHERE tgrelid IN('members'::regclass,'exp_events'::regclass) AND NOT tgisinternal"),0);
 assert.equal(await scalar(db,"SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE a.attrelid='members'::regclass AND a.attname='exp_tokens'"),'10');
});
test('precontainment anonymous add_exp changes an arbitrary synthetic member without any auth identity or raw table access',async t=>{
 const db=await fixture(t),before=await rewardRows(db);
 await reject(()=>asRole(db,'anon',tx=>tx.query('SELECT * FROM members')),'42501');
 assert.equal(await asRole(db,'anon',tx=>scalar(tx,"SELECT current_setting('request.jwt.claim.sub',true)")),null);
 await callReward(db,'add_exp',[B,5],'anon');
 assert.equal(await balance(db),8);assert.equal(await balance(db,A),7);
 assert.deepEqual(await events(db),[{member_id:B,amount:5,reason:''}]);
 const after=await rewardRows(db);assert.deepEqual({...after.members[1],exp_tokens:before.members[1].exp_tokens},before.members[1]);assert.deepEqual(after.members[0],before.members[0]);
});
test('add_exp accepts negative and zero amounts and repeats every call without deduplication',async t=>{
 const db=await fixture(t);await callReward(db,'add_exp',[B,-4,'same request text'],'anon');await callReward(db,'add_exp',[B,-4,'same request text'],'anon');await callReward(db,'add_exp',[B,0,null],'anon');
 assert.equal(await balance(db),-5);const rows=await events(db);assert.equal(rows.length,3);assert.deepEqual(rows.map(x=>x.amount).sort((a,b)=>a-b),[-4,-4,0]);assert.equal(rows.find(x=>x.amount===0).reason,null);
});
test('add_exp leaves a null balance null but records its event; null amount rolls the whole call back',async t=>{
 const db=await fixture(t);await db.query('UPDATE members SET exp_tokens=NULL WHERE id=$1',[B]);await callReward(db,'add_exp',[B,6,'null balance'],'anon');assert.equal(await balance(db),null);assert.deepEqual(await events(db),[{member_id:B,amount:6,reason:'null balance'}]);
 await db.query('UPDATE members SET exp_tokens=3 WHERE id=$1',[B]);const before=await rewardRows(db);await reject(()=>callReward(db,'add_exp',[B,null,'null amount'],'anon'),'23502');assert.deepEqual(await rewardRows(db),before);
});
test('nullable target creates an unattributed event; missing target fails the observed foreign key atomically',async t=>{
 const db=await fixture(t);await callReward(db,'add_exp',[null,2],'anon');assert.deepEqual(await events(db),[{member_id:null,amount:2,reason:''}]);
 const before=await rewardRows(db);await reject(()=>callReward(db,'add_exp',['99999999-9999-4999-8999-999999999999',2],'anon'),'23503');assert.deepEqual(await rewardRows(db),before);
});
test('both exact invoker functions coalesce null balance, accept negative/repeated values and null amount without producing events',async t=>{
 const db=await fixture(t);
 for(const name of ['increment_exp','increment_exp_tokens']){
  await db.query('UPDATE members SET exp_tokens=NULL WHERE id=$1',[B]);await callReward(db,name,[B,5]);assert.equal(await balance(db),5);
  await callReward(db,name,[B,-2]);await callReward(db,name,[B,-2]);assert.equal(await balance(db),1);
  await callReward(db,name,[B,null]);assert.equal(await balance(db),null);await callReward(db,name,[null,8]);assert.equal(await balance(db),null);
 }
 assert.equal((await events(db)).length,0);
 // Their browser EXECUTE permission does not itself bypass invoker table authority.
 for(const name of ['increment_exp','increment_exp_tokens'])await reject(()=>callReward(db,name,[B,4],'anon'),'42501');
});
test('integer overflow is a database failure, not input validation, and leaves no partial add_exp event',async t=>{
 const db=await fixture(t);await db.query('UPDATE members SET exp_tokens=2147483647 WHERE id=$1',[B]);const before=await rewardRows(db);
 for(const name of ['add_exp','increment_exp','increment_exp_tokens'])await reject(()=>callReward(db,name,name==='add_exp'?[B,1,'overflow']:[B,1]),'22003');
 assert.deepEqual(await rewardRows(db),before);
});
test('unchanged catalog-only preflight and containment preserve exact bodies/default argument/data, then deny every browser reward signature',async t=>{
 const db=await fixture(t);await callReward(db,'add_exp',[B,1,'prior event'],'anon');const before=await rewardRows(db),meta=await liveRewardMetadata(db),grants=await acl(db);
 await run(db,'preflight');assert.deepEqual(await rewardRows(db),before);assert.deepEqual(await liveRewardMetadata(db),meta);assert.deepEqual(await acl(db),grants);
 await run(db,'apply');assert.deepEqual(await rewardRows(db),before);assert.deepEqual(await liveRewardMetadata(db),meta);
 const removed=(await db.query("SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated')")).rows.map(x=>x.oid);
 assert.deepEqual(await acl(db),grants.filter(x=>x.grantee!==0&&!removed.includes(x.grantee)));
 for(const role of ['anon','authenticated'])for(const name of ['add_exp','increment_exp','increment_exp_tokens'])await reject(()=>callReward(db,name,name==='add_exp'?[B,1]:[B,1],role),'42501');
 for(const role of ['anon','authenticated','service_role'])await reject(()=>asRole(db,role,tx=>tx.query('SELECT * FROM soe_reward_rpc_containment_v1_state')),'42501');
 for(const signature of SIGNATURES)assert.equal(await scalar(db,'SELECT has_function_privilege($1,$2,$3)',['service_role',signature,'EXECUTE']),true);
});
test('service calls of all exact bodies preserve protected profile fields and profile revision; default reason still works after containment',async t=>{
 const db=await fixture(t);await run(db,'apply');const before=await rewardRows(db);
 await callReward(db,'add_exp',[A,2]);await callReward(db,'increment_exp',[A,3]);await callReward(db,'increment_exp_tokens',[A,4]);
 const after=await rewardRows(db);assert.equal(after.members[0].exp_tokens,16);assert.equal(after.members[0].profile_revision,0);assert.deepEqual({...after.members[0],exp_tokens:before.members[0].exp_tokens},before.members[0]);assert.deepEqual(after.members[1],before.members[1]);assert.deepEqual(await events(db),[{member_id:A,amount:2,reason:''}]);
 await reject(()=>asRole(db,'service_role',tx=>tx.query('UPDATE members SET profile_revision=99 WHERE id=$1',[A])),'PT400');
});
test('rollback restores exact ACLs/body/defaults and preserves rewards/events created after containment',async t=>{
 const db=await fixture(t),meta=await liveRewardMetadata(db),grants=await acl(db);await run(db,'apply');await callReward(db,'add_exp',[A,4,'later service event']);await callReward(db,'increment_exp',[B,-2]);const later=await rewardRows(db);
 await run(db,'rollback');assert.deepEqual(await rewardRows(db),later);assert.deepEqual(await liveRewardMetadata(db),meta);assert.deepEqual(await acl(db),grants);assert.equal(await scalar(db,"SELECT has_function_privilege('anon','public.add_exp(uuid,integer,text)','EXECUTE')"),true);
 assert.equal(await scalar(db,"SELECT to_regclass('public.soe_reward_rpc_containment_v1_state')"),null);
});
test('exact live body drift after containment refuses rollback before restoring any browser authority',async t=>{
 const db=await fixture(t);await run(db,'apply');await db.exec(LIVE_BODIES.find(f=>f.signature==='increment_exp(uuid,integer)').definition.replace('  update members','  -- SYNTHETIC_OWNER_DRIFT\n  update members'));const changed=await liveRewardMetadata(db);await reject(()=>run(db,'rollback'),'PT409');assert.deepEqual(await liveRewardMetadata(db),changed);
 for(const signature of SIGNATURES)assert.equal(await scalar(db,'SELECT has_function_privilege($1,$2,$3)',['anon',signature,'EXECUTE']),false);
});
test('actual Thinker route ignores forged body memberId, invokes exact service increment and records exactly one event without a profile edit',async t=>{
 const db=await fixture(t);await run(db,'apply');const app=await thinkerFixture(db),before=await rewardRows(db);
 const response=await app.post({thinkerId:'socrates',message:'Synthetic local exact-body request',isCouncilMode:true,memberId:B});assert.equal(response.status,200);assert.match(await response.text(),/Synthetic exact-body offline reply/);
 assert.equal(app.stats.authCalls,1);assert.equal(app.stats.providerCalls,1);assert.equal(app.stats.fallbacks,0);assert.equal(app.stats.eventInserts,1);assert.deepEqual(app.stats.rpcCalls,[{name:'increment_exp',params:{member_id_input:A,amount_input:8}}]);
 const after=await rewardRows(db);assert.equal(after.members[0].exp_tokens,before.members[0].exp_tokens+8);assert.equal(after.members[0].profile_revision,0);assert.deepEqual({...after.members[0],exp_tokens:before.members[0].exp_tokens},before.members[0]);assert.deepEqual(after.members[1],before.members[1]);assert.deepEqual(await events(db),[{member_id:A,amount:8,reason:'Conversation with socrates'}]);
 assert.notEqual(A,AUTH_A,'Verified subject and member ID are deliberately distinct in the auth double');
});
test('actual Thinker route with no verified member refuses forged actor before provider/reward/event work',async t=>{
 const db=await fixture(t);await run(db,'apply');const app=await thinkerFixture(db,{actor:null}),before=await rewardRows(db);
 const response=await app.post({thinkerId:'socrates',message:'Synthetic unauthorized request',isCouncilMode:true,memberId:B});assert.equal(response.status,401);assert.equal(app.stats.providerCalls,0);assert.equal(app.stats.rpcCalls.length,0);assert.equal(app.stats.eventInserts,0);assert.deepEqual(await rewardRows(db),before);
});
