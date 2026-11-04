import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineApp} from './support/offline-app.mjs';
const circle='11111111-1111-4111-8111-111111111111',message='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333';
const session='44444444-4444-4444-8444-444444444444',token='55555555-5555-4555-8555-555555555555',other='66666666-6666-4666-8666-666666666666',requestId='77777777-7777-4777-8777-777777777777',hash='a'.repeat(64);
const report=n=>({id:`88888888-8888-4888-8888-${String(n).padStart(12,'0')}`,reason:'safety',note:'Synthetic evidence note '+n,created_at:'2026-11-04T12:00:00Z'});
const page=(kind,extra={})=>({sessionId:session,circleId:circle,messageId:kind==='message'?message:null,revision:2,contentHash:kind==='message'?hash:null,
 totalReports:101,reviewedReports:0,pageToken:token,reports:Array.from({length:50},(_,i)=>report(i+1)),complete:false,expiresAt:'2099-01-01T12:00:00Z',pageNumber:1,acknowledged:false,...extra});
const decisionInput=kind=>({sessionId:session,expectedRevision:2,...(kind==='message'?{contentHash:hash}:{}),requestId,action:'hide',reason:'safety',summary:'A synthetic explanation based on conduct.',evidenceReportId:null,evidenceExcerpt:'Synthetic evidence'});
const receipt=kind=>({sessionId:session,decision:{id:other,action:'hide',reason:'safety',summary:'A synthetic explanation based on conduct.',created_at:'2026-11-04T12:00:00Z',report_count:101},replayed:false,
 ...(kind==='message'?{requestId,circleId:circle,messageId:message,safety:{revision:3,visibility:'hidden'}}:{revision:3,hidden:true})});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const waitFor=async fn=>{for(let i=0;i<100&&!fn();i++)await new Promise(r=>setImmediate(r));assert.ok(fn(),'expected dependency began');};
function fixture(kind='listing'){
 const app=offlineApp(),calls=[],timers=[];let authCalls=0,auth=async()=>({memberId:actor}),rpc=async name=>({data:name.endsWith('_decide')?receipt(kind):page(kind),error:null});
 app.context.setTimeout=(fn,ms)=>{assert.equal(ms,12000);const t={fn,cleared:false};timers.push(t);return t;};app.context.clearTimeout=t=>{t.cleared=true;};
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>{authCalls++;return auth();}}));
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({rpc:async(name,args)=>{calls.push({name,args});return rpc(name,args);}})}));
 const base=kind==='message'?'app/api/admin/circles/[circleId]/messages/[messageId]/coverage':'app/api/admin/circles/reports/[circleId]/coverage';
 const route=app.load(base+'/route.ts'),decide=app.load(base+'/decision/route.ts');
 const context={params:Promise.resolve({circleId:circle,...(kind==='message'?{messageId:message}:{})})};
 const request=(method='POST',body={action:'start',expectedRevision:2,contentHash:kind==='message'?hash:null},query='',signal,headers={})=>new Request('https://offline.invalid/review'+query,{method,headers:{origin:'https://offline.invalid',...headers},...(method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),signal});
 return {app,calls,timers,route,decide,context,request,kind,authCalls:()=>authCalls,setAuth:v=>auth=v,setRpc:v=>rpc=v};
}

test('both real coverage route families bind only authenticated server identity and project bounded private pages',async()=>{
 for(const kind of ['listing','message']){
  const f=fixture(kind),response=await f.route.POST(f.request(),f.context);assert.equal(response.status,200);
  assert.deepEqual(await response.json(),page(kind));assert.equal(f.calls.length,1);
  assert.deepEqual(structuredClone(f.calls[0]),{name:'soe_circle_review_coverage_start',args:{p_actor:actor,p_circle_id:circle,p_message_id:kind==='message'?message:null,p_expected_revision:2,p_content_hash:kind==='message'?hash:null}});
  assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.match(response.headers.get('vary'),/Cookie/);assert.ok(f.timers.every(t=>t.cleared));
 }
});
test('origin, identity, target and exact mutation fields refuse forged authority before RPC',async()=>{
 const f=fixture();
 assert.equal((await f.route.POST(f.request('POST',undefined,'',undefined,{origin:'https://foreign.invalid'}),f.context)).status,403);
 for(const body of [{action:'start',expectedRevision:2,contentHash:null,actor:other},{action:'start',expectedRevision:2,contentHash:hash},
  {action:'ack',sessionId:session,pageToken:token,reviewedReports:101},{action:'ack',sessionId:session,pageToken:'bad'},
  {action:'start',expectedRevision:-1,contentHash:null}])assert.equal((await f.route.POST(f.request('POST',body),f.context)).status,400);
 assert.equal((await f.route.POST(f.request(),{params:Promise.resolve({circleId:'bad'})})).status,400);
 f.setAuth(async()=>null);assert.equal((await f.route.POST(f.request(),f.context)).status,401);assert.equal(f.calls.length,0);
});
test('page reads reject malformed, duplicate, unbounded and extraneous cursors',async()=>{
 const f=fixture();
 for(const q of ['',`?sessionId=${session}&sessionId=${other}`,`?sessionId=${session}&page=0`,`?sessionId=${session}&page=1&page=2`,
  `?sessionId=${session}&page=42949674`,`?sessionId=${session}&page=1.5`,`?sessionId=${session}&actor=${actor}`])assert.equal((await f.route.GET(f.request('GET',undefined,q),f.context)).status,400);
 assert.equal(f.calls.length,0);
 assert.equal((await f.route.GET(f.request('GET',undefined,`?sessionId=${session}&page=1`),f.context)).status,200);
 assert.deepEqual(structuredClone(f.calls[0].args),{p_actor:actor,p_circle_id:circle,p_message_id:null,p_session_id:session,p_page_number:1});
});
test('page acknowledgements send one exact token and accept only matching case/session',async()=>{
 const f=fixture('message');const body={action:'ack',sessionId:session,pageToken:token};
 f.setRpc(async()=>({data:page('message',{reviewedReports:50,pageNumber:2,reports:Array.from({length:50},(_,i)=>report(i+51))}),error:null}));
 assert.equal((await f.route.POST(f.request('POST',body),f.context)).status,200);
 assert.deepEqual(structuredClone(f.calls[0]),{name:'soe_circle_review_coverage_ack',args:{p_actor:actor,p_circle_id:circle,p_message_id:message,p_session_id:session,p_page_token:token}});
 for(const change of [{sessionId:other},{circleId:other},{messageId:other}]){
  f.setRpc(async()=>({data:page('message',change),error:null}));assert.equal((await f.route.POST(f.request('POST',body),f.context)).status,503);
 }
});
test('page parser rejects false completion, skipped pages, duplicate/oversized reports and private top-level extras',()=>{
 const parse=fixture().app.load('lib/circles/review-coverage.ts').parseReviewCoveragePage;
 for(const change of [{complete:true},{reviewedReports:1},{reviewedReports:102},{pageNumber:3},{acknowledged:true},{reports:Array.from({length:51},(_,i)=>report(i))},
  {reports:Array(50).fill(report(1))},{reports:Array.from({length:50},(_,i)=>({...report(i),note:'x'.repeat(1001)}))},{totalReports:2147483648},{actorId:actor}])assert.equal(parse(page('listing',change)),null);
 const completed=page('listing',{reviewedReports:101,complete:true,pageNumber:3,acknowledged:true,reports:[report(101)]});assert.ok(parse(completed));
 assert.ok(parse(page('listing',{totalReports:0,reviewedReports:0,complete:true,acknowledged:true,reports:[]})));
 const previous=page('listing',{reviewedReports:100,acknowledged:true});assert.ok(parse(previous));
 const data=page('listing');data.reports[0].reporter_id='PRIVATE_REPORTER';assert.doesNotMatch(JSON.stringify(parse(data)),/PRIVATE_REPORTER|reporter_id/);
});
test('start snapshot and explicitly requested page must match the returned proof',async()=>{
 const f=fixture('message');
 for(const change of [{revision:3},{contentHash:'b'.repeat(64)}]){f.setRpc(async()=>({data:page('message',change),error:null}));assert.equal((await f.route.POST(f.request(),f.context)).status,503);}
 f.setRpc(async()=>({data:page('message'),error:null}));assert.equal((await f.route.GET(f.request('GET',undefined,`?sessionId=${session}&page=2`),f.context)).status,503);
});
test('covered decisions preserve actual legacy input validation and full-count private receipt bindings',async()=>{
 for(const kind of ['listing','message']){
  const f=fixture(kind);const response=await f.decide.POST(f.request('POST',decisionInput(kind)),f.context);assert.equal(response.status,200);assert.deepEqual(await response.json(),receipt(kind));
  assert.equal(f.calls[0].name,'soe_circle_review_coverage_decide');assert.equal(f.calls[0].args.p_actor,actor);assert.equal(f.calls[0].args.p_session_id,session);
  for(const body of [{...decisionInput(kind),actor:other},{...decisionInput(kind),summary:'short'},{...decisionInput(kind),sessionId:'bad'}])assert.equal((await f.decide.POST(f.request('POST',body),f.context)).status,400);
  f.setRpc(async()=>({data:{...receipt(kind),sessionId:other},error:null}));assert.equal((await f.decide.POST(f.request('POST',decisionInput(kind)),f.context)).status,503);
 }
});
test('legacy detail and receipt projections accept full report counts while preserving100-item bounds',()=>{
 const f=fixture(),listing=f.app.load('lib/circles/moderation.ts'),messages=f.app.load('lib/circles/message-moderation.ts');
 assert.equal(listing.parseCircleDecisionReceipt(receipt('listing')).decision.report_count,101);
 assert.equal(messages.parseMessageDecisionReceipt(receipt('message')).decision.report_count,101);
 for(const fn of [listing.parseCircleDecisionReceipt,messages.parseMessageDecisionReceipt])assert.equal(fn({...receipt(fn===listing.parseCircleDecisionReceipt?'listing':'message'),decision:{...receipt('listing').decision,report_count:2147483648}}),null);
 const detail={circle:{id:circle,title:'Synthetic Circle',description:null,hidden:false},revision:2,reports:[],decisions:[receipt('listing').decision],complete:true};
 assert.ok(listing.parseCircleReviewDetail(detail));assert.equal(listing.parseCircleReviewDetail({...detail,reports:Array.from({length:101},(_,i)=>report(i))}),null);
 assert.equal(listing.parseCircleReviewDetail({...detail,decisions:Array(101).fill(receipt('listing').decision)}),null);
});
test('RPC denials and unknown mutation outcomes are generic and never automatically retried',async()=>{
 for(const [code,status] of [['PT400',400],['PT403',403],['PT404',404],['PT409',409],['42501',503],['PGRST202',503]]){
  const f=fixture();f.setRpc(async()=>({data:null,error:{code,message:'PRIVATE_DETAIL'}}));const r=await f.route.POST(f.request(),f.context);
  assert.equal(r.status,status);assert.doesNotMatch(await r.text(),/PRIVATE_DETAIL/);assert.equal(f.calls.length,1);
 }
 const f=fixture();f.setRpc(async()=>{throw Error('Unknown committed mutation');});assert.equal((await f.route.POST(f.request(),f.context)).status,503);assert.equal(f.calls.length,1);
});
test('deadline covers parameter resolution before authentication, for all four new wrappers',async()=>{
 for(const kind of ['listing','message'])for(const mode of ['page','decision']){
  const f=fixture(kind),hold=deferred();const method=mode==='page'?f.route.POST:f.decide.POST;
  const work=method(f.request('POST',mode==='page'?undefined:decisionInput(kind)),{params:hold.promise});
  assert.equal(f.timers.length,1);f.timers[0].fn();assert.equal((await work).status,503);
  hold.resolve({circleId:circle,...(kind==='message'?{messageId:message}:{})});await new Promise(r=>setImmediate(r));assert.equal(f.authCalls(),0);assert.equal(f.calls.length,0);
 }
});
test('abort and elapsed deadline retire noncooperative authentication and RPC without late private output',async()=>{
 for(const stage of ['auth','rpc'])for(const mode of ['abort','elapsed']){
  const f=fixture(),hold=deferred(),controller=new AbortController();let now=1000;
  f.app.context.Date=class extends Date{static now(){return now;}};
  if(stage==='auth')f.setAuth(()=>hold.promise);else f.setRpc(()=>hold.promise);
  const work=f.route.POST(f.request('POST',undefined,'',controller.signal),f.context);await waitFor(()=>stage==='auth'?f.authCalls()>0:f.calls.length>0);
  if(mode==='abort')controller.abort();else now+=12000;
  hold.resolve(stage==='auth'?{memberId:actor}:{data:page('listing'),error:null});const response=await work;assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/Synthetic evidence|pageToken/);
  assert.equal(f.calls.length,stage==='auth'?0:1);
 }
});
test('deadline cancels stalled body before account access and oversized JSON is bounded',async()=>{
 const f=fixture();let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
 const request=new Request('https://offline.invalid/review',{method:'POST',headers:{origin:'https://offline.invalid'},body,duplex:'half'});
 const work=f.route.POST(request,f.context);await new Promise(r=>setImmediate(r));f.timers[0].fn();assert.equal((await work).status,503);assert.equal(cancelled,true);assert.equal(f.authCalls(),0);
 assert.equal((await f.route.POST(f.request('POST','x'.repeat(12001)),f.context)).status,413);assert.equal(f.calls.length,0);
});
