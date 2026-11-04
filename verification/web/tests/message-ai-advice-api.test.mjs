import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';

const circleId='11111111-1111-4111-8111-111111111111',messageId='22222222-2222-4222-8222-222222222222',actorId='33333333-3333-4333-8333-333333333333';
const other='44444444-4444-4444-8444-444444444444',hash='a'.repeat(64);
const content='I disagree with that position. I quoted “hurt them” to condemn the threat.';
const snapshot=()=>({circleId,messageId,content,revision:2,contentHash:hash,consentRevision:1,policy:'anthropic-message-review-v1'});
const advice=()=>({observations:[{rule:'context',excerpt:'“hurt them”',note:'This is a quotation; examine the stated condemnation.'}],counterevidence:[{excerpt:'to condemn the threat',note:'The author disavows the quoted conduct.'}],questions:['Is there surrounding context the human reviewer should check?']});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const turns=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture() {
 const app=offlineApp(),calls=[],providerCalls=[],timers=[];
 let available=true,actor=actorId,authCalls=0,auth=async()=>actor?{memberId:actor}:null;
 let rpc=async()=>({data:snapshot(),error:null}),provider=async()=>advice(),limited=false;
 app.context.setTimeout=(fn,ms)=>{if(ms===12000){const item={fn,cleared:false};timers.push(item);return item;}return setTimeout(fn,ms);};
 app.context.clearTimeout=id=>id&&typeof id==='object'&&'cleared'in id?id.cleared=true:clearTimeout(id);
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>{authCalls++;return auth();}}));
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({rpc:async(name,args)=>{calls.push({name,args});return rpc(calls.length);}})}));
 app.setMock('@/lib/rateLimit',()=>({rateLimit:()=>({ok:!limited,retryAfterS:60})}));
 app.setMock('@/lib/circles/message-ai-provider',()=>({providerAvailable:()=>available,requestMessageAdvice:async(text,signal)=>{providerCalls.push({text,signal});return provider();}}));
 const route=app.load('app/api/admin/circles/[circleId]/messages/[messageId]/advice/route.ts');
 const context={params:Promise.resolve({circleId,messageId})};
 const request=(body={expectedRevision:2,contentHash:hash},headers={},signal)=>new Request(`https://offline.invalid/api/admin/circles/${circleId}/messages/${messageId}/advice`,{method:'POST',headers:{origin:'https://offline.invalid',...headers},body:typeof body==='string'?body:JSON.stringify(body),signal});
 return {app,calls,providerCalls,timers,route,context,request,authCalls:()=>authCalls,setAvailable:x=>available=x,setActor:x=>actor=x,setAuth:x=>auth=x,setRpc:x=>rpc=x,setProvider:x=>provider=x,setLimited:x=>limited=x};
}

test('advice remains disabled without explicit provider configuration; no auth/database/provider work',async()=>{
 const f=fixture();f.setAvailable(false);const response=await f.route.POST(f.request(),f.context);
 assert.equal(response.status,503);assert.equal(f.authCalls(),0);assert.equal(f.calls.length,0);assert.equal(f.providerCalls.length,0);
 assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.ok(f.timers.every(t=>t.cleared));
});
test('origin, exact input and canonical actor boundaries reject forgery',async()=>{
 const f=fixture();
 assert.equal((await f.route.POST(f.request(undefined,{origin:'https://foreign.invalid'}),f.context)).status,403);
 for(const input of [{expectedRevision:2,contentHash:hash,actor:other},{expectedRevision:-1,contentHash:hash},{expectedRevision:2,contentHash:'bad'}])assert.equal((await f.route.POST(f.request(input),f.context)).status,400);
 f.setActor(null);assert.equal((await f.route.POST(f.request(),f.context)).status,401);assert.equal(f.calls.length,0);assert.equal(f.providerCalls.length,0);
});
test('actual route transmits only current consented text, rechecks actor and snapshot, projects private response',async()=>{
 const f=fixture();f.setRpc(async()=>({data:{...snapshot(),member_name:'PRIVATE_NAME',reports:['PRIVATE_REPORT'],email:'PRIVATE_EMAIL'},error:null}));
 const response=await f.route.POST(f.request(),f.context);assert.equal(response.status,200);
 const result=await response.json();assert.deepEqual(result.advice,advice());assert.equal(result.consentRevision,1);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|"content":/);assert.equal(f.authCalls(),2);assert.equal(f.calls.length,2);
 for(const call of f.calls){assert.equal(call.name,'soe_circle_message_ai_snapshot');assert.deepEqual(structuredClone(call.args),{p_actor:actorId,p_circle_id:circleId,p_message_id:messageId});}
 assert.equal(f.providerCalls.length,1);assert.equal(f.providerCalls[0].text,content);assert.equal(f.providerCalls[0].signal.aborted,true);
 assert.match(response.headers.get('vary'),/Cookie/);assert.match(response.headers.get('cache-control'),/no-store/);
});
test('absent consent, incomplete case, stale revision and unavailable schema prevent provider work',async()=>{
 for(const [code,status]of[['PT403',403],['PT409',409],['PT404',409],['PGRST202',503],['42501',503]]){
  const f=fixture();f.setRpc(async()=>({data:null,error:{code,message:'PRIVATE_DATABASE_DETAIL'}}));const r=await f.route.POST(f.request(),f.context);
  assert.equal(r.status,status);assert.doesNotMatch(await r.text(),/PRIVATE_/);assert.equal(f.providerCalls.length,0);
 }
 const f=fixture();assert.equal((await f.route.POST(f.request({expectedRevision:1,contentHash:hash}),f.context)).status,409);assert.equal(f.providerCalls.length,0);
 f.setRpc(async()=>({data:{...snapshot(),consentRevision:0},error:null}));assert.equal((await f.route.POST(f.request(),f.context)).status,503);assert.equal(f.providerCalls.length,0);
});
test('revoked consent, changed evidence, new reports and revoke/re-enable invalidate an in-flight answer',async()=>{
 for(const change of [{consentRevision:3},{revision:3},{content:'A replacement message.'},{contentHash:'b'.repeat(64)},{policy:'other-policy'}]){
  const f=fixture();f.setRpc(async n=>({data:n===1?snapshot():{...snapshot(),...change},error:null}));
  const r=await f.route.POST(f.request(),f.context);assert.equal(r.status,change.policy?503:409);assert.equal(f.providerCalls.length,1);assert.doesNotMatch(await r.text(),/observations|condemn/);
 }
 const f=fixture();f.setRpc(async n=>n===1?{data:snapshot(),error:null}:{data:null,error:{code:'PT403'}});
 assert.equal((await f.route.POST(f.request(),f.context)).status,403);assert.equal(f.providerCalls.length,1);
});
test('changed server identity after generation cannot obtain advice or perform the second evidence read',async()=>{
 const f=fixture();f.setProvider(async()=>{f.setActor(other);return advice();});assert.equal((await f.route.POST(f.request(),f.context)).status,403);
 assert.equal(f.calls.length,1);assert.equal(f.providerCalls.length,1);
});
test('fabricated citations, extra decision/action fields, invalid text and oversized suggestions fail closed',async()=>{
 for(const output of [{...advice(),action:'hide'},{...advice(),observations:[{rule:'safety',excerpt:'invented quote',note:'Claim'}]},
  {...advice(),observations:[{rule:'religion',excerpt:'I disagree',note:'Claim'}]},{...advice(),questions:['x'.repeat(301)]},
  {...advice(),counterevidence:[{excerpt:'to condemn',note:'bad\u0000note'}]},{...advice(),observations:Array(5).fill(advice().observations[0])}]){
  const f=fixture();f.setProvider(async()=>output);const r=await f.route.POST(f.request(),f.context);assert.equal(r.status,503);assert.equal(f.calls.length,1);
 }
});
test('total deadline retires stalled authentication and does not start late database/provider work',async()=>{
 const f=fixture(),pending=deferred();f.setAuth(()=>pending.promise);const work=f.route.POST(f.request(),f.context);await turns();assert.equal(f.authCalls(),1);
 f.timers[0].fn();assert.equal((await work).status,503);pending.resolve({memberId:actorId});await turns();assert.equal(f.calls.length,0);assert.equal(f.providerCalls.length,0);
});
test('total deadline cancels a stalled request body before authentication or provider work',async()=>{
 const f=fixture();let cancelled=false;
 const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
 const req=new Request('https://offline.invalid/advice',{method:'POST',headers:{origin:'https://offline.invalid'},body,duplex:'half'});
 const work=f.route.POST(req,f.context);await turns();f.timers[0].fn();assert.equal((await work).status,503);await turns();
 assert.equal(cancelled,true);assert.equal(f.authCalls(),0);assert.equal(f.providerCalls.length,0);
});
test('request abort and timeout discard noncooperative provider results without a follow-up read or retry',async()=>{
 for(const mode of ['abort','deadline']){
  const f=fixture(),pending=deferred(),controller=new AbortController();f.setProvider(()=>pending.promise);
  const work=f.route.POST(f.request(undefined,{},controller.signal),f.context);await turns();assert.equal(f.providerCalls.length,1);
  if(mode==='abort')controller.abort();else f.timers[0].fn();assert.equal((await work).status,503);assert.equal(f.providerCalls[0].signal.aborted,true);
  pending.resolve(advice());await turns();assert.equal(f.calls.length,1);assert.equal(f.providerCalls.length,1);
 }
});
test('per-instance budget refuses generation after access check',async()=>{
 const f=fixture();f.setLimited(true);const r=await f.route.POST(f.request(),f.context);assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');assert.equal(f.providerCalls.length,0);
});
test('elapsed deadline rejects late continuations even when the timer callback has not run',async()=>{
 const f=fixture();let now=1000;
 f.app.context.Date=class extends Date{static now(){return now;}};
 f.setProvider(async()=>{now+=12000;return advice();});
 assert.equal((await f.route.POST(f.request(),f.context)).status,503);
 assert.equal(f.providerCalls.length,1);assert.equal(f.calls.length,1);assert.equal(f.authCalls(),1);
});
test('swapped-viewpoint and quoted-hostility fixtures pass exact-quote parsing without an automated decision',()=>{
 const {parseMessageAdvice}=fixture().app.load('lib/circles/message-ai.ts');
 for(const belief of ['Christian','atheist','conservative','liberal']){
  const text=`I am ${belief}. I reject “hurt them” and welcome disagreement.`;
  const value={observations:[{rule:'context',excerpt:'“hurt them”',note:'Quotation alone does not establish endorsement.'}],counterevidence:[{excerpt:'welcome disagreement',note:'This expresses openness.'}],questions:['What surrounding context is available?']};
  const parsed=parseMessageAdvice(value,text);assert.ok(parsed);assert.equal('action'in parsed,false);
 }
 // These are validator fixtures, not evidence of a real model's fairness.
});
