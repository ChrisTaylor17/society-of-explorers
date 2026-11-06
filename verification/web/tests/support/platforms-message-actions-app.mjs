// Current strict SQL and actual canonical message handlers. Synthetic identities,
// nonissued credentials and in-process HTTP replace only external boundaries.
import assert from 'node:assert/strict';
import {lstat,stat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ROOT=new URL('../../../../',import.meta.url);
export async function safetySource(name){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false);assert.ok(!info.size||info.blocks,'Refuse offloaded safety source '+name);return readFile(file);}
await safetySource('verification/web/tests/support/review-coverage-db.mjs');await safetySource('verification/web/tests/support/offline-app.mjs');
const {createReviewCoverageDb,rpc,IDS,requestId,COVERAGE_SOURCE_HASHES,COVERAGE_FIXTURE_LIMITS}=await import('./review-coverage-db.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export const ORIGIN='https://platforms-message-actions.test';
export const SUBJECTS=Object.freeze({author:'73111111-1111-4111-8111-111111111111',reporter:'73222222-2222-4222-8222-222222222222',outsider:'73333333-3333-4333-8333-333333333333'});
export const TOKENS=Object.freeze({author:'NONISSUED_SAFETY_AUTHOR',reporter:'NONISSUED_SAFETY_REPORTER',outsider:'NONISSUED_SAFETY_OUTSIDER'});
export {requestId,IDS,rpc,COVERAGE_SOURCE_HASHES,COVERAGE_FIXTURE_LIMITS};
export const SAFETY_APP_SOURCES=Object.freeze([
 'app/api/auth/member/route.ts','app/api/circles/[circleId]/discussion/route.ts','app/api/circles/[circleId]/messages/[messageId]/route.ts',
 'lib/circles/thread-server.ts','lib/circles/thread.ts','lib/circles/moderation-server.ts','lib/circles/message-moderation-server.ts','lib/circles/message-moderation.ts',
 'lib/circles/report.ts','lib/circles/review-coverage.ts','lib/http/routeError.ts','lib/auth/memberDto.ts','lib/auth/provider.ts','lib/ids/uuid.ts',
 'verification/web/tests/support/offline-app.mjs','tests/security/fakes.ts','verification/web/tests/support/platforms-message-actions-app.mjs',
]);
export async function safetyAppHashes(){return{...COVERAGE_SOURCE_HASHES,...Object.fromEntries(await Promise.all(SAFETY_APP_SOURCES.map(async name=>[name,createHash('sha256').update(await safetySource(name)).digest('hex')])))};}
export async function createPlatformsMessageActionsApp({actor='author',profileAware=false}={}){
 const f=profileAware
  ? await (await import('./public-profile-app.mjs')).createPublicProfileApp()
  : await createReviewCoverageDb({reportCount:0});
 const app=offlineApp(),calls=[],http=[],names=new Map(),actors={author:f.authorId,reporter:IDS.host,outsider:f.reviewerId};
 let selected={actor,provider:'supabase'},closed=false,rpcHook=null,httpHook=null;
 assert.ok(Object.hasOwn(actors,actor));
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async req=>{
  const bearer=req.headers.get('authorization'),who=bearer?Object.keys(TOKENS).find(key=>bearer==='Bearer '+TOKENS[key]):selected?.actor;
  if(!who)return null;const provider=bearer?'supabase':selected.provider;
  return{memberId:actors[who],member:{id:actors[who],supabase_auth_id:SUBJECTS[who],display_name:'Synthetic safety member'},auth:{provider,subject:provider==='supabase'?SUBJECTS[who]:actors[who]}};
 }}));
 const allowed=[profileAware?'soe_circle_discussion_read_profiles':'soe_circle_discussion_read',profileAware?'soe_circle_discussion_thread_profiles':'soe_circle_discussion_thread',profileAware?'soe_circle_message_state_profiles':'soe_circle_message_state','soe_circle_message_action'];
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({rpc:async(name,args)=>{
  assert.ok(allowed.includes(name),'Unexpected safety RPC '+name);const call={name,args:structuredClone(args),status:'pending'};calls.push(call);let result;
  try{
   if(!names.has(name)){const rows=(await f.db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name])).rows;assert.equal(rows.length,1);names.set(name,rows[0].proargnames);}
   const keys=names.get(name);assert.deepEqual(Object.keys(args).sort(),[...keys].sort());result={data:await rpc(f.db,name,keys.map(key=>args[key])),error:null};call.status='ok';
  }catch(error){call.status=error.code??'FIXTURE_ERROR';result={data:null,error:{code:call.status}};}
  // Deliberate lost-response hooks run only AFTER the actual SQL transaction.
  return rpcHook?rpcHook(name,args,result):result;
 }})}));
 try{
  for(const name of SAFETY_APP_SOURCES)await safetySource(name);
  const member=app.load('app/api/auth/member/route.ts'),discussion=app.load('app/api/circles/[circleId]/discussion/route.ts'),safety=app.load('app/api/circles/[circleId]/messages/[messageId]/route.ts');
  async function dispatch(path,{method='GET',headers={},body,signal}={}){
   assert.equal(closed,false);const url=new URL(path,ORIGIN);assert.equal(url.origin,ORIGIN);assert.ok(['GET','POST'].includes(method));
   const h=new Headers(headers);if(method==='POST'&&!h.has('content-type'))h.set('content-type','application/json');
   const request=new Request(url,{method,headers:h,signal,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});Object.defineProperty(request,'cookies',{value:{get:()=>undefined}});
   http.push({path:url.pathname+url.search,method,headers:Object.fromEntries(h),body:body===undefined?null:typeof body==='string'?body:JSON.stringify(body)});let response;
   if(url.pathname==='/api/auth/member'){assert.equal(method,'GET');assert.equal(url.search,'');assert.equal(h.get('authorization'),null);response=await member.GET(request);}
   else{
    const archive=/^\/api\/circles\/([^/]+)\/discussion$/.exec(url.pathname),action=/^\/api\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(url.pathname);assert.ok(archive||action,'Unexpected safety route');
    if(archive){assert.equal(method,'GET');response=await discussion.GET(request,{params:Promise.resolve({circleId:archive[1]})});}
    else response=await safety[method](request,{params:Promise.resolve({circleId:action[1],messageId:action[2]})});
   }
   return httpHook?httpHook({path:url.pathname+url.search,method,request,response}):response;
  }
  return{...f,app,actors,calls,http,SUBJECTS,TOKENS,ORIGIN,dispatch,
   select(who='author',provider='supabase'){assert.ok(Object.hasOwn(actors,who));assert.ok(['supabase','wallet'].includes(provider));selected={actor:who,provider};},
   transformRpc(fn){rpcHook=fn;},transformHttp(fn){httpHook=fn;},
   async counts(){const row=(await f.db.query('SELECT (SELECT count(*)::int FROM circle_message_receipts) receipts,(SELECT count(*)::int FROM circle_message_reports) reports,(SELECT count(*)::int FROM circle_message_states) states')).rows[0];return row;},
   state(who='author'){return rpc(f.db,'soe_circle_message_state',[actors[who],f.circleId,f.messageId]);},
   async leave(who='author'){const revision=(await f.db.query('SELECT circle_participation_revision FROM book_cohorts WHERE id=$1',[f.circleId])).rows[0].circle_participation_revision;return rpc(f.db,'soe_circle_leave',[actors[who],f.circleId,revision,requestId()]);},
   async hide(){const detail=await rpc(f.db,'soe_circle_message_review_detail',[f.reviewerId,f.circleId,f.messageId]);return rpc(f.db,'soe_circle_message_review_decide',[f.reviewerId,f.circleId,f.messageId,detail.revision,detail.contentHash,requestId(),'hide','safety','A synthetic human reviewer recorded an author-facing explanation.',null,detail.message.content.slice(0,25)]);},
   async withdraw(){const state=await rpc(f.db,'soe_circle_message_state',[f.authorId,f.circleId,f.messageId]);return rpc(f.db,'soe_circle_message_action',[f.authorId,f.circleId,f.messageId,state.revision,state.contentHash,requestId(),'withdraw',null,null]);},
   async report(){const state=await rpc(f.db,'soe_circle_message_state',[actors.reporter,f.circleId,f.messageId]);return rpc(f.db,'soe_circle_message_action',[actors.reporter,f.circleId,f.messageId,state.revision,state.contentHash,requestId(),'report','safety','A separate synthetic conduct report.']);},
   async close(){if(closed)return;closed=true;await f.db.close();},
  };
 }catch(error){await f.db.close();throw error;}
}
