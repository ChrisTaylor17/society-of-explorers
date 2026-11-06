// Actual canonical handlers + current strict Circle SQL. Identity credentials,
// HTTPS delivery and SDK transport remain explicitly synthetic and nonissued.
import assert from 'node:assert/strict';
import {lstat,stat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ROOT=new URL('../../../../',import.meta.url);
export async function threadSource(name){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks,'Refuse offloaded source '+name);return readFile(file);}
await threadSource('verification/web/tests/support/review-coverage-db.mjs');
await threadSource('verification/web/tests/support/offline-app.mjs');
const {createReviewCoverageDb,rpc,IDS,requestId,COVERAGE_SOURCE_HASHES,COVERAGE_FIXTURE_LIMITS}=await import('./review-coverage-db.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export const ORIGIN='https://platforms-thread.test';
export const SUBJECTS=Object.freeze({author:'72111111-1111-4111-8111-111111111111',outsider:'72222222-2222-4222-8222-222222222222'});
export const TOKENS=Object.freeze({author:'NONISSUED_THREAD_AUTHOR',outsider:'NONISSUED_THREAD_OUTSIDER'});
export {requestId,IDS,COVERAGE_SOURCE_HASHES,COVERAGE_FIXTURE_LIMITS};
export const THREAD_APP_SOURCES=Object.freeze([
 'app/api/auth/member/route.ts','app/api/circles/[circleId]/discussion/route.ts','app/api/circles/[circleId]/discussion/preview/route.ts',
 'lib/circles/thread-server.ts','lib/circles/thread.ts','lib/circles/moderation-server.ts','lib/http/routeError.ts','lib/auth/memberDto.ts','lib/auth/provider.ts','lib/ids/uuid.ts',
 'verification/web/tests/support/offline-app.mjs','tests/security/fakes.ts','verification/web/tests/support/platforms-thread-app.mjs',
]);
export async function threadAppHashes(){return{...COVERAGE_SOURCE_HASHES,...Object.fromEntries(await Promise.all(THREAD_APP_SOURCES.map(async name=>[name,createHash('sha256').update(await threadSource(name)).digest('hex')])))};}

export async function createPlatformsThreadApp({profileAware=false}={}){
 const f=profileAware
  ? await (await import('./public-profile-app.mjs')).createPublicProfileApp()
  : await createReviewCoverageDb({reportCount:0});
 const app=offlineApp(),calls=[],http=[],names=new Map();
 let selected={actor:'author',provider:'supabase'},closed=false,identitySequence=null,rpcHook=null,httpHook=null;
 const actors={author:f.authorId,outsider:f.reviewerId};
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async req=>{
  const bearer=req.headers.get('authorization');
  const actor=identitySequence?.length?identitySequence.shift():bearer?Object.keys(TOKENS).find(key=>bearer==='Bearer '+TOKENS[key]):selected?.actor;
  if(!actor)return null;assert.ok(Object.hasOwn(actors,actor));
  const provider=bearer?'supabase':selected.provider;
  return{memberId:actors[actor],member:{id:actors[actor],supabase_auth_id:SUBJECTS[actor],display_name:'Synthetic own-session author'},auth:{provider,subject:provider==='supabase'?SUBJECTS[actor]:actors[actor]}};
 }}));
 const allowed=[profileAware?'soe_circle_discussion_read_profiles':'soe_circle_discussion_read',profileAware?'soe_circle_discussion_thread_profiles':'soe_circle_discussion_thread','soe_circle_discussion_target',profileAware?'soe_circle_discussion_receipt_profiles':'soe_circle_discussion_receipt','soe_circle_discussion_post'];
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({rpc:async(name,args)=>{
  assert.ok(allowed.includes(name),'Unexpected platform RPC '+name);
  const call={name,args:structuredClone(args),status:'pending'};calls.push(call);
  let result;
  try{
   if(!names.has(name)){const rows=(await f.db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name])).rows;assert.equal(rows.length,1);names.set(name,rows[0].proargnames);}
   const keys=names.get(name);assert.deepEqual(Object.keys(args).sort(),[...keys].sort());
   result={data:await rpc(f.db,name,keys.map(key=>args[key])),error:null};call.status='ok';
  }catch(error){call.status=error.code??'FIXTURE_ERROR';result={data:null,error:{code:call.status}};}
  // Hook runs AFTER actual SQL commit. A deliberately lost reply therefore
  // exercises real receipt recovery rather than a fabricated confirmed DTO.
  return rpcHook?rpcHook(name,args,result):result;
 }})}));
 try{
  for(const name of THREAD_APP_SOURCES)await threadSource(name);
  const member=app.load('app/api/auth/member/route.ts'),discussion=app.load('app/api/circles/[circleId]/discussion/route.ts'),preview=app.load('app/api/circles/[circleId]/discussion/preview/route.ts');
  async function dispatch(path,{method='GET',headers={},body,signal}={}){
   assert.equal(closed,false);const url=new URL(path,ORIGIN);assert.equal(url.origin,ORIGIN);
   assert.ok(['GET','POST'].includes(method));
   const h=new Headers(headers);if(method==='POST'&&!h.has('content-type'))h.set('content-type','application/json');
   const request=new Request(url,{method,headers:h,signal,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
   Object.defineProperty(request,'cookies',{value:{get:()=>undefined}});
   http.push({path:url.pathname+url.search,method,headers:Object.fromEntries(h),body:body===undefined?null:typeof body==='string'?body:JSON.stringify(body)});
   let result;
   if(url.pathname==='/api/auth/member'){assert.equal(method,'GET');assert.equal(url.search,'');assert.equal(h.get('authorization'),null);result=await member.GET(request);}
   else{const match=/^\/api\/circles\/([^/]+)\/discussion(\/preview)?$/.exec(url.pathname);assert.ok(match,'Unexpected platform route');const handler=match[2]?preview:discussion;assert.equal(typeof handler[method],'function');result=await handler[method](request,{params:Promise.resolve({circleId:match[1]})});}
   return httpHook?httpHook({path:url.pathname+url.search,method,request,response:result}):result;
  }
  return{...f,app,calls,http,actors,SUBJECTS,TOKENS,ORIGIN,dispatch,
   select(actor='author',provider='supabase'){assert.ok(Object.hasOwn(actors,actor));assert.ok(['supabase','wallet'].includes(provider));selected={actor,provider};},
   setIdentitySequence(value){identitySequence=[...value];},
   transformRpc(value){rpcHook=value;},transformHttp(value){httpHook=value;},
   async count(){return Number((await f.db.query('SELECT count(*)::int n FROM circle_discussion_post_receipts')).rows[0].n);},
   async messages(){return(await f.db.query('SELECT id,member_id,content FROM seminar_messages WHERE cohort_id=$1 ORDER BY id',[f.circleId])).rows;},
   async leave(){const revision=(await f.db.query('SELECT circle_participation_revision FROM book_cohorts WHERE id=$1',[f.circleId])).rows[0].circle_participation_revision;return rpc(f.db,'soe_circle_leave',[f.authorId,f.circleId,revision,requestId()]);},
   async withdraw(messageId=f.messageId){const state=await rpc(f.db,'soe_circle_message_state',[f.authorId,f.circleId,messageId]);return rpc(f.db,'soe_circle_message_action',[f.authorId,f.circleId,messageId,state.revision,state.contentHash,requestId(),'withdraw',null,null]);},
   async report(messageId=f.messageId){const state=await rpc(f.db,'soe_circle_message_state',[IDS.host,f.circleId,messageId]);return rpc(f.db,'soe_circle_message_action',[IDS.host,f.circleId,messageId,state.revision,state.contentHash,requestId(),'report','safety','PRIVATE_SYNTHETIC_REPORT_NOTE']);},
   async hide(messageId=f.messageId){const detail=await rpc(f.db,'soe_circle_message_review_detail',[f.reviewerId,f.circleId,messageId]);return rpc(f.db,'soe_circle_message_review_decide',[f.reviewerId,f.circleId,messageId,detail.revision,detail.contentHash,requestId(),'hide','safety','A synthetic human review records a conduct concern.',null,detail.message.content.slice(0,25)]);},
   async close(){if(closed)return;closed=true;await f.db.close();},
  };
 }catch(error){await f.db.close();throw error;}
}
