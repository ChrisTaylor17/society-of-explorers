import test from 'node:test';
import assert from 'node:assert/strict';
import {A,B,SIGNATURES,CATALOG,rewardDb,runRewardSql as run,asRole,callReward,rewardMetadata} from './support/reward-rpc-fixture.mjs';
import {offlineApp} from './support/offline-app.mjs';
const RECEIPT='soe_reward_rpc_containment_v1_state';
const refused=e=>{assert.equal(e.code,'PT409',e.message);assert.doesNotMatch(e.message,/PRIVATE_SYNTHETIC|11111111-1111/);return true;};
const denied=e=>{assert.equal(e.code,'42501',e.message);return true;};
const args=signature=>signature.includes('add_exp')?[A,1,'Synthetic representative reason']:[A,1];
test('representative reward bodies are explicitly different from every corresponding observed live body digest',async t=>{
 const db=await rewardDb(t),m=await rewardMetadata(db);
 for(const f of m.functions)assert.notEqual(f.body_md5,CATALOG.find(x=>x.name===f.proname).body_md5);
 assert.equal(m.helper[0].body_md5,CATALOG.find(x=>x.name==='current_prompt_member_id').body_md5);
 assert.equal(m.policies.filter(p=>p.polname!=='old_public').length,8);
});
test('catalog-only preflight preserves reward bodies/ACLs, all tables, helper, eight policies and leaderboard',async t=>{
 const db=await rewardDb(t),before=await rewardMetadata(db);const result=await run(db,'preflight');assert.deepEqual(await rewardMetadata(db),before);assert.match(JSON.stringify(result),/reward_rpc_containment_preflight_passed/);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SYNTHETIC|REPRESENTATIVE_FIXTURE_ONLY/);
});
test('browser execution of all exact reward signatures closes while service and unrelated EXECUTE remain exact',async t=>{
 const db=await rewardDb(t);await callReward(db,SIGNATURES[0],[A,2,'Synthetic precontainment'],'anon');const before=await rewardMetadata(db);await run(db,'apply');const after=await rewardMetadata(db);
 for(const key of ['functions','helper','policies','leaderboard','tableACL','defaults','members','events'])assert.deepEqual(after[key],before[key]);
 const removed=(await db.query("SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated')")).rows.map(x=>x.oid);assert.deepEqual(after.acl,before.acl.filter(a=>a.grantee!==0&&!removed.includes(a.grantee)));
 for(const role of ['anon','authenticated'])for(const signature of SIGNATURES){assert.equal((await db.query('SELECT has_function_privilege($1,$2,$3) allowed',[role,signature,'EXECUTE'])).rows[0].allowed,false);await assert.rejects(callReward(db,signature,args(signature),role),denied);}
 for(const role of ['service_role','unrelated_executor'])for(const signature of SIGNATURES)assert.equal((await db.query('SELECT has_function_privilege($1,$2,$3) allowed',[role,signature,'EXECUTE'])).rows[0].allowed,true);
 for(const role of ['anon','authenticated','service_role','unrelated_executor'])await assert.rejects(asRole(db,role,tx=>tx.query('SELECT * FROM '+RECEIPT)),denied);
});
test('synthetic service rewards preserve protected profile fields and do not bump the actual profile revision guard',async t=>{
 const db=await rewardDb(t);await run(db,'apply');const before=(await db.query('SELECT * FROM members WHERE id=$1',[A])).rows[0];
 await callReward(db,SIGNATURES[1],[A,8]);const after=(await db.query('SELECT * FROM members WHERE id=$1',[A])).rows[0];
 assert.equal(after.exp_tokens,before.exp_tokens+8);assert.equal(after.profile_revision,0);assert.deepEqual({...after,exp_tokens:before.exp_tokens},before);
 await assert.rejects(asRole(db,'service_role',tx=>tx.query('UPDATE members SET profile_revision=99 WHERE id=$1',[A])),e=>e.code==='PT400');
});
test('exact ACL rollback/reapply preserves grant options and later reward rows rather than pretending data reversal',async t=>{
 const db=await rewardDb(t);await db.exec('GRANT EXECUTE ON FUNCTION public.increment_exp(uuid,integer) TO authenticated WITH GRANT OPTION');const before=await rewardMetadata(db);await run(db,'apply');const receipt=(await db.query('SELECT * FROM '+RECEIPT+' ORDER BY target_signature')).rows;
 await run(db,'preflight');await run(db,'apply');assert.deepEqual((await db.query('SELECT * FROM '+RECEIPT+' ORDER BY target_signature')).rows,receipt);
 await callReward(db,SIGNATURES[1],[A,8]);const rows=(await db.query('SELECT * FROM members ORDER BY id')).rows;await run(db,'rollback');await run(db,'rollback');const after=await rewardMetadata(db);
 assert.deepEqual(after.acl,before.acl);assert.deepEqual(after.functions,before.functions);assert.deepEqual(after.members,rows);assert.notDeepEqual(after.members,before.members);
 assert.equal((await db.query("SELECT has_function_privilege('anon','public.add_exp(uuid,integer,text)','EXECUTE') allowed")).rows[0].allowed,true);
});
test('service access inherited solely from PUBLIC aborts atomically without adding service grants',async t=>{
 const db=await rewardDb(t);await db.exec('REVOKE EXECUTE ON FUNCTION public.increment_exp_tokens(uuid,integer) FROM service_role');const before=await rewardMetadata(db);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await rewardMetadata(db),before);assert.equal((await db.query("SELECT to_regclass('public."+RECEIPT+"') receipt")).rows[0].receipt,null);
});
test('unknown owners, overloads, observed attribute drift and browser role authority require review',async t=>{
 for(const change of ['ALTER FUNCTION public.increment_exp(uuid,integer) OWNER TO unrelated_executor','CREATE FUNCTION public.increment_exp(text) RETURNS void LANGUAGE sql AS $$ SELECT $$','ALTER FUNCTION public.increment_exp(uuid,integer) STABLE','ALTER FUNCTION public.increment_exp(uuid,integer) SET search_path=public','ALTER ROLE anon BYPASSRLS','GRANT unrelated_executor TO authenticated','GRANT CREATE ON SCHEMA public TO anon']){
  const db=await rewardDb(t);await db.exec(change);const before=await rewardMetadata(db);await assert.rejects(run(db,'preflight'),refused);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await rewardMetadata(db),before);
 }
});
test('direct catalog function dependencies refuse before apply and after containment without deleting the dependency',async t=>{
 for(const installed of [false,true]){
  const db=await rewardDb(t);if(installed)await run(db,'apply');await db.exec('CREATE FUNCTION public.synthetic_reward_dependency(uuid) RETURNS void LANGUAGE sql BEGIN ATOMIC SELECT public.increment_exp($1,1); END');const before=await rewardMetadata(db);
  await assert.rejects(run(db,installed?'rollback':'apply'),refused);assert.deepEqual(await rewardMetadata(db),before);assert.ok((await db.query("SELECT to_regprocedure('public.synthetic_reward_dependency(uuid)') dependency")).rows[0].dependency);
 }
});
test('unknown receipt objects and access/integrity tampering are never adopted or dropped',async t=>{
 const collision=await rewardDb(t);await collision.exec('CREATE TABLE '+RECEIPT+'(unrelated text)');await assert.rejects(run(collision,'apply'),refused);await assert.rejects(run(collision,'rollback'),refused);
 for(const change of ['GRANT SELECT ON '+RECEIPT+' TO anon',"UPDATE "+RECEIPT+" SET prior_state='{}'::jsonb WHERE target_signature LIKE '%add_exp%'"]){
  const db=await rewardDb(t);await run(db,'apply');await db.exec(change);const before=await rewardMetadata(db);for(const stage of ['preflight','apply','rollback'])await assert.rejects(run(db,stage),refused);assert.deepEqual(await rewardMetadata(db),before);
 }
});
test('body and uncaptured function attribute or ACL drift refuse exact rollback before any restoration',async t=>{
 for(const change of ['ALTER FUNCTION public.increment_exp_tokens(uuid,integer) COST 543','ALTER FUNCTION public.increment_exp_tokens(uuid,integer) STRICT','GRANT EXECUTE ON FUNCTION public.increment_exp_tokens(uuid,integer) TO anon','CREATE OR REPLACE FUNCTION public.increment_exp_tokens(member_id_input uuid,amount_input integer) RETURNS void LANGUAGE sql AS $$ -- REPRESENTATIVE_FIXTURE_DRIFT\n UPDATE members SET exp_tokens=0 WHERE id=member_id_input; $$']){
  const db=await rewardDb(t);await run(db,'apply');await db.exec(change);const before=await rewardMetadata(db);await assert.rejects(run(db,'rollback'),refused);assert.deepEqual(await rewardMetadata(db),before);assert.equal((await db.query("SELECT has_function_privilege('anon','public.add_exp(uuid,integer,text)','EXECUTE') allowed")).rows[0].allowed,false);
 }
});
test('non-owner roles cannot run any containment stage or read the owner receipt',async t=>{
 const db=await rewardDb(t),before=await rewardMetadata(db);for(const role of ['anon','authenticated','service_role']){await db.exec('SET ROLE '+role);try{for(const stage of ['preflight','apply','rollback'])await assert.rejects(run(db,stage),refused);}finally{await db.exec('SET ROLE postgres');}}assert.deepEqual(await rewardMetadata(db),before);
});
test('current canonical Thinker route uses atomic reward RPC and auth-bound actor without a profile edit',async t=>{
 const db=await rewardDb(t);await run(db,'apply');const {installAccounting}=await import('./support/thinker-reward-db.mjs');await installAccounting(db);const app=offlineApp(),rpcCalls=[];let fallback=0;
 const noop=async()=>undefined;
 app.setMock('@/lib/ai/anthropic',()=>({createAnthropicClient:()=>({messages:{stream:()=>({on:(kind,callback)=>{if(kind==='text')callback('Synthetic offline reply.');},finalMessage:async()=>({usage:{}})})}}),resolveClaudeModel:()=> 'SYNTHETIC_MODEL',logClaudeUsage:()=>{}}));
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>({memberId:A,member:(await db.query('SELECT * FROM members WHERE id=$1',[A])).rows[0],auth:{provider:'supabase',subject:A}})}));
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({
  from(table){if(table==='exp_events')return{insert:async row=>{await asRole(db,'service_role',tx=>tx.query('INSERT INTO exp_events(member_id,amount,reason) VALUES($1,$2,$3)',[row.member_id,row.amount,row.reason]));return{error:null};}};fallback++;throw Error('Unexpected fallback/table '+table);},
   rpc:async(name,params)=>{rpcCalls.push({name,params:{...params}});assert.equal(name,'soe_thinker_reward_award');const result=await asRole(db,'service_role',tx=>tx.query('SELECT public.soe_thinker_reward_award($1,$2,$3,$4,$5) value',[params.p_actor,params.p_request_id,params.p_request_hash,params.p_thinker_id,params.p_is_reaction]));return{data:result.rows[0].value,error:null};},
 })}));
 app.setMock('@/lib/claude/thinkers',()=>({buildSystemPrompt:()=> 'Synthetic system'}));
 app.setMock('@/lib/thinkerMemory',()=>({getMemory:async()=>null,recordInteraction:noop}));
 app.setMock('@/lib/thinkerActions',()=>({parseActions:text=>({actions:[],cleanText:text})}));
 app.setMock('@/lib/actions/executeActions',()=>({executeActionsWithResults:async()=>[]}));
 app.setMock('@/lib/rateLimit',()=>({limitModelCall:()=>null}));
 app.setMock('@/lib/salons/access',()=>({memberCanUseSharedSalon:async()=>false}));
 app.setMock('@/lib/memory/embeddings',()=>({storeConversationEmbedding:noop}));
 app.setMock('@/lib/memory/sharedMemory',()=>({getThinkerContext:async()=>null,storeEpisode:noop,extractMemory:noop}));
 app.setMock('@/lib/community/getCommunity',()=>({getCommunityThinkerPrompts:async()=>({})}));
 app.setMock('@/lib/governance/hats',()=>({checkPermission:async()=>true}));
 const route=app.load('app/api/thinker/route.ts'),before=(await db.query('SELECT * FROM members ORDER BY id')).rows;
  const requestId='33333333-3333-4333-8333-333333333333';const request=new Request('https://soe.invalid/api/thinker',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId,thinkerId:'socrates',message:'Synthetic local council request',isCouncilMode:true,memberId:B})});
  const response=await route.POST(request);assert.equal(response.status,200);const text=await response.text();assert.match(text,/Synthetic offline reply/);assert.equal(fallback,0);assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'soe_thinker_reward_award');assert.equal(rpcCalls[0].params.p_actor,A);assert.equal(rpcCalls[0].params.p_request_id,requestId);assert.match(rpcCalls[0].params.p_request_hash,/^[a-f0-9]{64}$/);
 const after=(await db.query('SELECT * FROM members ORDER BY id')).rows;assert.equal(after[0].exp_tokens,before[0].exp_tokens+8);assert.equal(after[0].profile_revision,0);assert.deepEqual({...after[0],exp_tokens:before[0].exp_tokens},before[0]);assert.deepEqual(after[1],before[1]);assert.equal((await db.query('SELECT member_id,amount FROM exp_events')).rows[0].member_id,A);
});
test('delegated function grantors refuse instead of cascading grants or changing unrelated access',async t=>{
 const db=await rewardDb(t);await db.exec('GRANT EXECUTE ON FUNCTION public.increment_exp(uuid,integer) TO unrelated_executor WITH GRANT OPTION;SET ROLE unrelated_executor;GRANT EXECUTE ON FUNCTION public.increment_exp(uuid,integer) TO anon;SET ROLE postgres');const before=await rewardMetadata(db);await assert.rejects(run(db,'preflight'),refused);await assert.rejects(run(db,'apply'),refused);assert.deepEqual(await rewardMetadata(db),before);
});
