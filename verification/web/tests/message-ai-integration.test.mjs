import test from 'node:test';
import assert from 'node:assert/strict';
import { messageAiApp, CONTENT } from './support/message-ai-app.mjs';

async function consent(f,allowed){
 f.setActor(f.authorId);const state=await (await f.dispatch(f.messagePath+'/ai-consent')).json();
 return f.dispatch(f.messagePath+'/ai-consent','POST',{expectedConsentRevision:state.consentRevision,contentHash:state.contentHash,policy:state.policy,allowed});
}
async function advise(f){
 f.setActor(f.reviewerId);const detail=await(await f.dispatch(f.reviewPath)).json();
 return f.dispatch(f.reviewPath+'/advice','POST',{expectedRevision:detail.revision,contentHash:detail.contentHash});
}
test('actual API+SQL: consent→single-message advice→revoke, without model-made decisions or report leakage',async t=>{
 const f=await messageAiApp();t.after(()=>f.close());
 assert.equal((await advise(f)).status,403);assert.equal(f.providerCalls.length,0);
 const enabled=await consent(f,true);assert.equal(enabled.status,200);assert.equal((await enabled.json()).allowed,true);
 const accepted=await advise(f);assert.equal(accepted.status,200);const result=await accepted.json();assert.equal(result.consentRevision,1);
 assert.equal(f.providerCalls.length,1);assert.equal(f.providerCalls[0].content,CONTENT);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_REPORT_NOTE|PRIVATE_AUTHOR_LABEL/);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM circle_message_decisions')).rows[0]?.n??0,0);
 const revoked=await consent(f,false);assert.equal(revoked.status,200);assert.equal((await revoked.json()).consentRevision,2);
 assert.equal((await advise(f)).status,403);assert.equal(f.providerCalls.length,1);
});
test('actual API+SQL: consent revoked and re-enabled during generation retires prior advice',async t=>{
 const f=await messageAiApp();t.after(()=>f.close());await consent(f,true);
 f.setProvider(async()=>{
  assert.equal((await consent(f,false)).status,200);assert.equal((await consent(f,true)).status,200);f.setActor(f.reviewerId);
  return{observations:[],counterevidence:[],questions:['What context is missing?']};
 });
 assert.equal((await advise(f)).status,409);assert.equal(f.providerCalls.length,1);
 const state=await f.db.query('SELECT allowed,consent_revision FROM circle_message_ai_consents WHERE message_id=$1',[f.messageId]);assert.equal(state.rows[0].allowed,true);assert.equal(Number(state.rows[0].consent_revision),3);
});
test('actual API+SQL: reviewer-grant revocation during generation suppresses the response',async t=>{
 const f=await messageAiApp();t.after(()=>f.close());await consent(f,true);
 f.setProvider(async()=>{await f.db.query('UPDATE circle_reviewer_grants SET revoked_at=clock_timestamp() WHERE cohort_id=$1 AND member_id=$2',[f.circleId,f.reviewerId]);return{observations:[],counterevidence:[],questions:[]};});
 assert.equal((await advise(f)).status,403);assert.equal(f.providerCalls.length,1);
});
