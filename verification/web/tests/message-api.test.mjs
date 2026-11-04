import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';
import { IDS, CONTENT, requestId } from './support/message-db.mjs';

const path=`/api/circles/${IDS.circle}/messages/${IDS.message}`;
const time='2026-11-03T12:00:00.000Z';
const state=()=>({circleId:IDS.circle,message:{id:IDS.message,member_name:'Synthetic Author',content:CONTENT,created_at:time,is_mine:false,visibility:'visible'},revision:0,contentHash:'a'.repeat(64),canReport:true,canWithdraw:false,explanations:[]});
function setup() {
 const app=offlineApp(),calls=[]; let actor=IDS.reader,reply={data:state(),error:null},limited=false;
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>actor?{memberId:actor,member:{id:actor}}:null}));
 app.setMock('@/lib/rateLimit',()=>({rateLimit:()=>limited?{ok:false,retryAfterS:60}:{ok:true}}));
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({rpc:async(name,args)=>{calls.push({name,args});return reply;}})}));
 const message=app.load('app/api/circles/[circleId]/messages/[messageId]/route.ts');
 const queue=app.load('app/api/admin/circles/messages/route.ts');
 const review=app.load('app/api/admin/circles/[circleId]/messages/[messageId]/route.ts');
 const contributions=app.load('app/api/circles/contributions/route.ts');
 const context={params:Promise.resolve({circleId:IDS.circle,messageId:IDS.message})};
 const request=(body,headers={},url=path)=>new Request('https://offline.invalid'+url,{method:body===undefined?'GET':'POST',headers:{origin:'https://offline.invalid',...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
 return {app,calls,message,queue,review,contributions,context,request,setActor:x=>{actor=x;},setReply:x=>{reply=x;},setLimited:x=>{limited=x;}};
}
const input=()=>({action:'report',requestId:requestId(),expectedRevision:0,contentHash:'a'.repeat(64),reason:'safety',note:'Private evidence for an assigned reviewer.'});

test('actual HTTP: canonical identity only, private headers and whitelist projection',async()=>{
 const a=setup(); a.setReply({data:{...state(),reporter_member_id:IDS.reviewer,private_note:'PRIVATE_NOTE',evidence_excerpt:'PRIVATE_EXCERPT'},error:null});
 const response=await a.message.GET(a.request(),a.context); assert.equal(response.status,200);
 assert.match(response.headers.get('cache-control'),/no-store/); assert.match(response.headers.get('vary'),/Cookie/);
 const body=await response.json(); assert.equal(JSON.stringify(body).includes('PRIVATE_'),false);
 assert.equal(a.calls[0].args.p_actor,IDS.reader);
 const before=a.calls.length;
 assert.equal((await a.message.POST(a.request({...input(),actor:IDS.author}),a.context)).status,400);
 assert.equal(a.calls.length,before);
 a.setActor(null); assert.equal((await a.message.GET(a.request(),a.context)).status,401); assert.equal(a.calls.length,before);
});

test('actual Request origin and streaming UTF8 byte bounds run before mutation RPC',async()=>{
 const a=setup();
 assert.equal((await a.message.POST(a.request(input(),{origin:'https://foreign.invalid'}),a.context)).status,403);
 assert.equal((await a.message.POST(a.request(input(),{'sec-fetch-site':'cross-site'}),a.context)).status,403);
 const ambiguous=new Request('https://offline.invalid'+path,{method:'POST',headers:{cookie:'fictional=1'},body:JSON.stringify(input())});
 assert.equal((await a.message.POST(ambiguous,a.context)).status,403);
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"note":"'+'é'.repeat(7000)));controller.close();}});
 const oversized=new Request('https://offline.invalid'+path,{method:'POST',headers:{origin:'https://offline.invalid'},body:stream,duplex:'half'});
 assert.equal((await a.message.POST(oversized,a.context)).status,413);
 assert.equal((await a.message.POST(a.request('{not-json'),a.context)).status,400);
 assert.equal(a.calls.length,0);
 const body=input(); const result={requestId:body.requestId,circleId:IDS.circle,messageId:IDS.message,state:{...state(),revision:1},replayed:false,received:true};
 a.setReply({data:result,error:null});
 const bearer=new Request('https://offline.invalid'+path,{method:'POST',headers:{authorization:'Bearer FICTIONAL_NON_ISSUED'},body:JSON.stringify(body)});
 assert.equal((await a.message.POST(bearer,a.context)).status,200);
 assert.equal(a.calls.length,1);
});

test('missing RPC/grants, malformed withheld content and mismatched receipt fail closed without raw error leakage',async()=>{
 const a=setup();
 for(const code of ['PGRST202','42501','42P01']) {
  a.setReply({data:null,error:{code,message:'PRIVATE_DB_DETAIL'}});
  const response=await a.message.GET(a.request(),a.context); assert.equal(response.status,503); assert.equal(JSON.stringify(await response.json()).includes('PRIVATE_DB_DETAIL'),false);
 }
 for(const [code,status] of [['PT400',400],['PT403',403],['PT404',404],['PT409',409]]) {
  a.setReply({data:null,error:{code}}); assert.equal((await a.message.GET(a.request(),a.context)).status,status);
 }
 a.setReply({data:{...state(),message:{...state().message,visibility:'hidden'},contentHash:null,canReport:false},error:null});
 assert.equal((await a.message.GET(a.request(),a.context)).status,503); // hidden raw text is refused
 const body=input();
 a.setReply({data:{requestId:requestId(),circleId:IDS.circle,messageId:IDS.message,state:state(),replayed:true,received:true},error:null});
 assert.equal((await a.message.POST(a.request(body),a.context)).status,503);
 a.setReply({data:{...state(),circleId:IDS.circle2},error:null}); assert.equal((await a.message.GET(a.request(),a.context)).status,503);
});

test('strict request fields, reviewer evidence and report budget prevent unsafe calls',async()=>{
 const a=setup(); const before=a.calls.length;
 for(const body of [{...input(),expectedRevision:-1},{...input(),expectedRevision:9007199254740992},{...input(),contentHash:'not-a-hash'},
   {...input(),note:'\u0000private'},{...input(),note:'x'.repeat(1001)},{...input(),action:'withdraw',reason:null,note:null},
   {...input(),action:'delete'}]) assert.equal((await a.message.POST(a.request(body),a.context)).status,400);
 const badDecision={expectedRevision:0,contentHash:'a'.repeat(64),requestId:requestId(),action:'restore',reason:'resolved',summary:'A deliberate author-facing human explanation.',evidenceReportId:null,evidenceExcerpt:'private retained evidence'};
 assert.equal((await a.review.POST(a.request(badDecision),a.context)).status,400);
 a.setLimited(true); assert.equal((await a.message.POST(a.request(input()),a.context)).status,429);
 assert.equal(a.calls.length,before);
 for(const url of ['/api/admin/circles/messages?limit=26','/api/admin/circles/messages?limit=1&limit=2','/api/circles/contributions?after=bad']) {
  const req=a.request(undefined,{},url); assert.equal((await (url.includes('/admin/')?a.queue:a.contributions).GET(req)).status,400);
 }
});

test('pure DTO parser removes private fields and rejects invalid cross-scope shapes',()=>{
 const a=setup(),dto=a.app.load('lib/circles/message-moderation.ts');
 const own={...state(),message:{...state().message,is_mine:true},canReport:false,canWithdraw:true,explanations:[{id:IDS.report,action:'hide',reason:'safety',summary:'A human deliberately authored this explanation.',created_at:time,reporter_member_id:IDS.reader,evidence_excerpt:'secret',report_count:12}]};
 const parsed=dto.parseMessageSafetyState(own); assert.ok(parsed); assert.equal(JSON.stringify(parsed).includes('evidence_excerpt'),false); assert.equal('report_count' in parsed.explanations[0],false);
 assert.equal(dto.parseMessageSafetyState({...own,message:{...own.message,is_mine:false},canWithdraw:false}),null);
 assert.equal(dto.parseMessageContributions({items:[state()],nextCursor:null}),null);
 assert.equal(dto.parseMessageReviewQueue({items:[{circleId:IDS.circle,messageId:IDS.message,circleTitle:'Fictional Circle',visibility:'visible',openReports:1,revision:0}],nextCursor:IDS.message2}),null);
});
