import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';

const CIRCLE='33333333-3333-4333-8333-333333333333',MESSAGE='55555555-5555-4555-8555-555555555555',OTHER='77777777-7777-4777-8777-777777777777';
const ORIGIN='https://offline.invalid',PATH=`/api/circles/${CIRCLE}/messages/${MESSAGE}/ai-consent`,POLICY='anthropic-message-review-v1',HASH='a'.repeat(64);
const context=(circleId=CIRCLE,messageId=MESSAGE)=>({params:Promise.resolve({circleId,messageId})});
const state=(extra={})=>({circleId:CIRCLE,messageId:MESSAGE,allowed:false,consentRevision:0,policy:POLICY,contentHash:HASH,messageRevision:2,canEnable:true,...extra});
const input=(extra={})=>({expectedConsentRevision:0,contentHash:HASH,policy:POLICY,allowed:true,...extra});
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const app=offlineApp(),{ADA,JULES}=app.fakes;
 app.setUser({id:'fictional-author',user_metadata:{memberId:JULES,role:'admin'}});
 const db=app.fakes.resetDb({members:[{id:ADA,supabase_auth_id:'fictional-author',display_name:'Synthetic Author'},{id:JULES,display_name:'Other synthetic author'}]});
 const calls=[];let providerImports=0;const f={app,ADA,JULES,calls,reply:()=>({data:state(),error:null})};
 db.rpc=async(name,args)=>{calls.push({name,args:plain(args)});return f.reply(name,args);};
 app.setMock('@/lib/ai/anthropic',()=>{providerImports++;throw Error('Consent settings cannot invoke a provider');});
 f.route=app.load('app/api/circles/[circleId]/messages/[messageId]/ai-consent/route.ts');
 f.parser=app.load('lib/circles/message-ai-consent.ts');
 f.request=(body=undefined,headers={origin:ORIGIN},path=PATH)=>app.fakes.makeReq(body,{url:ORIGIN+path,headers});
 f.providers=()=>providerImports;
 return f;
}
function privateResponse(response){
 assert.match(response.headers.get('cache-control'),/private.*no-store/);
 assert.equal(response.headers.get('surrogate-control'),'no-store');
 assert.match(response.headers.get('vary'),/Cookie/);assert.match(response.headers.get('vary'),/Authorization/);
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
}
test('strict consent parser whitelists fields, fixed policy and valid safe revisions without treating unavailable as false',()=>{
 const f=fixture();assert.deepEqual(plain(f.parser.parseMessageAiConsent({...state(),privateNote:'PRIVATE_NOTE',memberId:OTHER})),state());
 for(const value of [null,{},state({allowed:0}),state({consentRevision:-1}),state({consentRevision:1.5}),state({consentRevision:Number.MAX_SAFE_INTEGER+1}),state({messageRevision:-1}),state({policy:'old-policy'}),state({contentHash:'A'.repeat(64)}),state({contentHash:null}),state({canEnable:null}),state({messageId:'not-a-uuid'})])assert.equal(f.parser.parseMessageAiConsent(value),null);
 assert.equal(f.parser.parseMessageAiConsent(state({allowed:true,canEnable:false})).allowed,true,'hidden prior permission remains readable/revocable');
});
test('request parser accepts exactly four typed fields and rejects forged actor/consent/defaults',()=>{
 const f=fixture();assert.deepEqual(plain(f.parser.parseMessageAiConsentInput(input())),input());
 for(const value of [null,{},input({actorMemberId:OTHER}),input({allowed:'true'}),input({policy:'old'}),input({expectedConsentRevision:-1}),input({expectedConsentRevision:Number.MAX_SAFE_INTEGER+1}),input({contentHash:null}),{...input(),expectedRevision:0}])assert.equal(f.parser.parseMessageAiConsentInput(value),null);
});
test('actual GET derives the server actor and projects only author consent state, without provider calls',async()=>{
 const f=fixture();f.reply=()=>({data:state({memberId:f.JULES,content:'PRIVATE_MESSAGE',report:'PRIVATE_REPORT'}),error:null});
 const response=await f.route.GET(f.request(),context());assert.equal(response.status,200);privateResponse(response);assert.deepEqual(await response.json(),state());
 assert.deepEqual(f.calls,[{name:'soe_circle_message_ai_consent_state',args:{p_circle_id:CIRCLE,p_message_id:MESSAGE,p_actor:f.ADA}}]);assert.equal(f.providers(),0);
});
test('actual POST forwards exact CAS/hash/policy/flag and verified server actor only',async()=>{
 const f=fixture();f.reply=()=>({data:state({allowed:true,consentRevision:1}),error:null});
 const response=await f.route.POST(f.request(input()),context());assert.equal(response.status,200);privateResponse(response);assert.equal((await response.json()).allowed,true);
 assert.deepEqual(f.calls,[{name:'soe_circle_message_ai_consent_set',args:{p_circle_id:CIRCLE,p_message_id:MESSAGE,p_expected_consent_revision:0,p_content_hash:HASH,p_policy:POLICY,p_allowed:true,p_actor:f.ADA}}]);assert.equal(f.providers(),0);
});
test('author revoke remains available for an already-enabled hidden/withdrawn state',async()=>{
 const f=fixture();f.reply=()=>({data:state({allowed:true,consentRevision:5,canEnable:false}),error:null});
 assert.equal((await f.route.GET(f.request(),context())).status,200);
 f.reply=()=>({data:state({allowed:false,consentRevision:6,canEnable:false}),error:null});
 const response=await f.route.POST(f.request(input({allowed:false,expectedConsentRevision:5})),context());assert.equal(response.status,200);assert.equal((await response.json()).allowed,false);assert.equal(f.calls[1].args.p_allowed,false);
});
test('anonymous and raw UUID-cookie callers cannot reach either service RPC',async()=>{
 const f=fixture();f.app.setUser(null);
 for(const method of ['GET','POST']){
  const req=f.app.fakes.makeReq(method==='POST'?input():undefined,{url:ORIGIN+PATH,headers:{origin:ORIGIN},cookies:{soe_wallet_id:f.ADA}});
  const response=await f.route[method](req,context());assert.equal(response.status,401);privateResponse(response);
 }
 assert.equal(f.calls.length,0);
});
test('forged cross-origin mutations, malformed bodies and unexpected actor fields stop before RPC',async()=>{
 const f=fixture();
 for(const headers of [{origin:'https://foreign.invalid'},{origin:ORIGIN,'sec-fetch-site':'cross-site'}])assert.equal((await f.route.POST(f.request(input(),headers),context())).status,403);
 for(const body of [input({actorMemberId:f.JULES}),input({allowed:'true'}),input({policy:'unpublished'}),{}])assert.equal((await f.route.POST(f.request(body),context())).status,400);
 const broken=f.request();broken.text=async()=>'{broken';assert.equal((await f.route.POST(broken,context())).status,400);
 assert.equal((await f.route.POST(f.request(input(),{origin:ORIGIN,'content-length':'999999'}),context())).status,413);
 assert.equal(f.calls.length,0);
});
test('invalid IDs/query modes stop before authority work and uppercase IDs normalize',async()=>{
 const f=fixture();
 for(const method of ['GET','POST']){
  assert.equal((await f.route[method](f.request(input()),context('bad'))).status,400);
  assert.equal((await f.route[method](f.request(input(),{origin:ORIGIN},PATH+'?actorMemberId='+OTHER),context())).status,400);
 }
 assert.equal(f.calls.length,0);
 assert.equal((await f.route.GET(f.request(),context(CIRCLE.toUpperCase(),MESSAGE.toUpperCase()))).status,200);
 assert.equal(f.calls[0].args.p_circle_id,CIRCLE);
});
test('missing SQL or malformed GET never silently grants/denies permission as a successful false state',async()=>{
 const f=fixture();
 for(const data of [null,{},state({circleId:OTHER}),state({messageId:OTHER}),state({policy:'obsolete'}),state({canEnable:undefined})]){
  f.reply=()=>({data,error:null});const response=await f.route.GET(f.request(),context());assert.equal(response.status,503);privateResponse(response);assert.doesNotMatch(await response.text(),/"allowed"/);
 }
});
test('set receipts must bind exact IDs/content/flag/policy and a bounded CAS revision',async()=>{
 const f=fixture();
 for(const data of [state({allowed:true,consentRevision:1,circleId:OTHER}),state({allowed:true,consentRevision:1,messageId:OTHER}),state({allowed:false,consentRevision:1}),state({allowed:true,consentRevision:1,contentHash:'b'.repeat(64)}),state({allowed:true,consentRevision:2}),state({allowed:true,consentRevision:1,policy:'other'})]){
  f.reply=()=>({data,error:null});assert.equal((await f.route.POST(f.request(input()),context())).status,503);
 }
});
test('SQL authorization/conflict/schema failures preserve status and redact provider/database details',async()=>{
 const f=fixture();
 for(const [code,status] of [['PT400',400],['PT403',403],['PT404',404],['PT409',409],['42P01',503],['42883',503],['PGRST202',503]]){
  f.reply=()=>({data:null,error:{code,message:'PRIVATE_CONNECTION',details:'PRIVATE_MESSAGE'}});
  const response=await f.route.POST(f.request(input()),context());assert.equal(response.status,status);privateResponse(response);assert.doesNotMatch(await response.text(),/PRIVATE_/);
 }
});
