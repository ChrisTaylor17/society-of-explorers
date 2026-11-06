import test from 'node:test';
import assert from 'node:assert/strict';
import { messageAiApp } from './support/message-ai-app.mjs';
import { rpc } from './support/message-ai-allowance-db.mjs';
import { currentMessageAiApp, CONTENT } from './support/current-message-ai-consent-app.mjs';

async function reviewFixture(t,allowance={globalLimit:50,reviewerLimit:5}){
 const f=await currentMessageAiApp({allowance});t.after(()=>f.close());
 return f;
}
async function consent(f,allowed){
 f.setActor(f.authorId);const state=await (await f.dispatch(f.messagePath+'/ai-consent')).json();
 return f.dispatch(f.messagePath+'/ai-consent','POST',{expectedConsentRevision:state.consentRevision,contentHash:state.contentHash,policy:state.policy,allowed});
}
async function advise(f){
 f.setActor(f.reviewerId);const detail=await(await f.dispatch(f.reviewPath)).json();
 return f.dispatch(f.reviewPath+'/advice','POST',{expectedRevision:detail.revision,contentHash:detail.contentHash});
}
test('actual API+SQL: consent→single-message advice→revoke, without model-made decisions or report leakage',async t=>{
 const f=await reviewFixture(t);
 assert.equal((await advise(f)).status,403);assert.equal(f.providerCalls.length,0);
 const enabled=await consent(f,true);assert.equal(enabled.status,200);assert.equal((await enabled.json()).allowed,true);
 const accepted=await advise(f);assert.equal(accepted.status,200);const result=await accepted.json();assert.equal(result.consentRevision,1);
 assert.equal(f.providerCalls.length,1);assert.equal(f.providerCalls[0].content,CONTENT);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_REPORT_NOTE|PRIVATE_AUTHOR_LABEL/);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM circle_message_decisions')).rows[0]?.n??0,0);
 const revoked=await consent(f,false);assert.equal(revoked.status,200);assert.equal((await revoked.json()).consentRevision,2);
 assert.equal((await advise(f)).status,403);assert.equal(f.providerCalls.length,1);
});
test('actual API+SQL: strip an app-added reply link, preserve an authored look-alike, and reject quotes of the stripped link',async t=>{
 const f=await reviewFixture(t);
 const {formatDiscussionContent}=f.app.load('lib/circles/thread.ts');
 const {target}=await rpc(f.db,'soe_circle_discussion_target',[f.authorId,f.circleId,f.messageId]);
 const comment='I read that passage as an argument for patience, without a personal attack.';
 const stored=formatDiscussionContent(f.circleId,comment,target.message.id);
 const href=`/circles/${f.circleId}/discussion?message=${target.message.id}`;
 assert.equal(stored,`${comment}\n\nIn reply to message:\n${href}`);
 async function reportedPost(parent){
  const {message}=await rpc(f.db,'soe_circle_discussion_post',[f.authorId,f.circleId,crypto.randomUUID(),
   stored,parent?.message.id??null,parent?.revision??null,parent?.contentHash??null,'PRIVATE_AUTHOR_LABEL']);
  const child=await messageAiApp({fixture:{...f,messageId:message.id}});
  child.setActor(f.actors.other);
  const state=await (await child.dispatch(child.messagePath)).json();
  assert.equal((await child.dispatch(child.messagePath,'POST',{action:'report',expectedRevision:state.revision,
   contentHash:state.contentHash,requestId:crypto.randomUUID(),reason:'safety',note:'PRIVATE_REPLY_REPORT'})).status,200);
  assert.equal((await consent(child,true)).status,200);
  return {child,state};
 }
 const {child:reply,state}=await reportedPost(target);
 const accepted=await advise(reply);
 assert.equal(accepted.status,200);assert.equal((await accepted.json()).contentHash,state.contentHash);
 assert.deepEqual(reply.providerCalls.map(call=>call.content),[comment]);
 const linkQuote=async()=>({observations:[],counterevidence:[{excerpt:href,note:'Check the source.'}],questions:[]});
 reply.setProvider(linkQuote);
 assert.equal((await advise(reply)).status,503);
 assert.deepEqual(reply.providerCalls.map(call=>call.content),[comment,comment]);
 const {child:standalone}=await reportedPost(null);
 standalone.setProvider(linkQuote);
 assert.equal((await advise(standalone)).status,200);
 assert.deepEqual(standalone.providerCalls.map(call=>call.content),[stored]);
 const attempts=async()=> (await f.db.query('SELECT count(*)::int AS n FROM circle_message_ai_attempts')).rows[0].n;
 const reserved=await attempts();
 await f.db.exec('REVOKE SELECT ON public.circle_message_reply_links FROM service_role');
 assert.equal((await advise(reply)).status,503);
 assert.equal(await attempts(),reserved);
 assert.equal(reply.providerCalls.length,2);
});
test('actual API+SQL: consent revoked and re-enabled during generation retires prior advice',async t=>{
 const f=await reviewFixture(t);await consent(f,true);
 f.setProvider(async()=>{
  assert.equal((await consent(f,false)).status,200);assert.equal((await consent(f,true)).status,200);f.setActor(f.reviewerId);
  return{observations:[],counterevidence:[],questions:['What context is missing?']};
 });
 assert.equal((await advise(f)).status,409);assert.equal(f.providerCalls.length,1);
 const state=await f.db.query('SELECT allowed,consent_revision FROM circle_message_ai_consents WHERE message_id=$1',[f.messageId]);assert.equal(state.rows[0].allowed,true);assert.equal(Number(state.rows[0].consent_revision),3);
});
test('actual API+SQL: reviewer-grant revocation during generation suppresses the response',async t=>{
 const f=await reviewFixture(t);await consent(f,true);
 f.setProvider(async()=>{await f.db.query('UPDATE circle_reviewer_grants SET revoked_at=clock_timestamp() WHERE cohort_id=$1 AND member_id=$2',[f.circleId,f.reviewerId]);return{observations:[],counterevidence:[],questions:[]};});
 assert.equal((await advise(f)).status,403);assert.equal(f.providerCalls.length,1);
});

test('actual API+SQL: default-off allowance denies generation even after author consent',async t=>{
 const f=await reviewFixture(t,null);await consent(f,true);
 assert.equal((await advise(f)).status,503);assert.equal(f.providerCalls.length,0);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM circle_message_ai_attempts')).rows[0].n,0);
});

test('independent actual route instances share the same durable ceiling without cold-start reset',async t=>{
 const first=await reviewFixture(t,{globalLimit:2,reviewerLimit:2});await consent(first,true);
 assert.equal((await advise(first)).status,200);
 const second=await messageAiApp({fixture:first});assert.equal((await advise(second)).status,200);
 const restarted=await messageAiApp({fixture:first});assert.equal((await advise(restarted)).status,429);
 assert.equal(first.providerCalls.length,1);assert.equal(second.providerCalls.length,1);assert.equal(restarted.providerCalls.length,0);
 assert.equal((await first.db.query('SELECT count(*)::int n FROM circle_message_ai_attempts')).rows[0].n,2);
 assert.equal((await first.db.query('SELECT count(*)::int n FROM circle_message_decisions')).rows[0].n,0);
});

test('committed reservation with lost reply stays debited across app restart; never retried or sent',async t=>{
 const f=await reviewFixture(t,{globalLimit:1,reviewerLimit:1});await consent(f,true);
 f.setRpcReply(async(name,args,result)=>{if(name==='soe_circle_message_ai_reserve')throw Error('Synthetic lost reservation reply');return result;});
 assert.equal((await advise(f)).status,503);assert.equal(f.providerCalls.length,0);
 assert.equal(f.calls.filter(call=>call.name==='soe_circle_message_ai_reserve').length,1);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM circle_message_ai_attempts')).rows[0].n,1);
 const restarted=await messageAiApp({fixture:f});assert.equal((await advise(restarted)).status,429);assert.equal(restarted.providerCalls.length,0);
});

test('provider failure and revoked in-flight consent keep their shared debits without refunds',async t=>{
 const f=await reviewFixture(t,{globalLimit:2,reviewerLimit:2});await consent(f,true);
 f.setProvider(async()=>{throw Error('Synthetic provider uncertainty');});assert.equal((await advise(f)).status,503);
 const second=await messageAiApp({fixture:f});
 second.setProvider(async()=>{await consent(second,false);second.setActor(second.reviewerId);return{observations:[],counterevidence:[],questions:[]};});
 assert.equal((await advise(second)).status,403);await consent(second,true);
 const restarted=await messageAiApp({fixture:f});assert.equal((await advise(restarted)).status,429);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM circle_message_ai_attempts')).rows[0].n,2);
 assert.equal(f.providerCalls.length,1);assert.equal(second.providerCalls.length,1);assert.equal(restarted.providerCalls.length,0);
});
