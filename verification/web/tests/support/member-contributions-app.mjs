// Actual canonical account/contribution/message handlers over the current strict
// Circle SQL chain. Identities, tokens and HTTP delivery are explicit doubles.
import assert from 'node:assert/strict';
import {lstat,stat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ROOT=new URL('../../../../',import.meta.url);
export async function contributionSource(name){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false,'Refuse linked source '+name);assert.ok(info.isFile()&&(!info.size||info.blocks),'Refuse offloaded source '+name);return readFile(file);}
await contributionSource('verification/web/tests/support/review-coverage-db.mjs');await contributionSource('verification/web/tests/support/offline-app.mjs');
const {createReviewCoverageDb,rpc,IDS,requestId,COVERAGE_SOURCE_HASHES,COVERAGE_FIXTURE_LIMITS}=await import('./review-coverage-db.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export {rpc,IDS,requestId,COVERAGE_SOURCE_HASHES,COVERAGE_FIXTURE_LIMITS};
export const ORIGIN='https://member-contributions.test';
export const SUBJECTS=Object.freeze({author:'73111111-1111-4111-8111-111111111111',other:'73222222-2222-4222-8222-222222222222',outsider:'73333333-3333-4333-8333-333333333333'});
export const TOKENS=Object.freeze({author:'NONISSUED_CONTRIBUTIONS_AUTHOR',other:'NONISSUED_CONTRIBUTIONS_OTHER',outsider:'NONISSUED_CONTRIBUTIONS_OUTSIDER'});
export const CONTRIBUTION_APP_SOURCES=Object.freeze(['app/api/auth/member/route.ts','app/api/circles/contributions/route.ts','app/api/circles/[circleId]/messages/[messageId]/route.ts',
 'lib/circles/message-moderation-server.ts','lib/circles/message-moderation.ts','lib/circles/report.ts','lib/circles/review-coverage.ts','lib/http/routeError.ts','lib/auth/memberDto.ts','lib/auth/provider.ts','lib/ids/uuid.ts',
 'verification/web/tests/support/offline-app.mjs','tests/security/fakes.ts','verification/web/tests/support/member-contributions-app.mjs']);
export async function contributionAppHashes(){return{...COVERAGE_SOURCE_HASHES,...Object.fromEntries(await Promise.all(CONTRIBUTION_APP_SOURCES.map(async name=>[name,createHash('sha256').update(await contributionSource(name)).digest('hex')])))};}
export async function createMemberContributionsApp({actor='author'}={}){
 const f=await createReviewCoverageDb({reportCount:0}),app=offlineApp(),calls=[],http=[],names=new Map(),actors={author:f.authorId,other:IDS.host,outsider:IDS.outsider};
 let selected={actor,provider:'supabase'},closed=false,rpcHook=null,httpHook=null;
 assert.ok(Object.hasOwn(actors,actor));
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async req=>{const bearer=req.headers.get('authorization'),who=bearer?Object.keys(TOKENS).find(key=>bearer==='Bearer '+TOKENS[key]):selected?.actor;if(!who)return null;const provider=bearer?'supabase':selected.provider;return{memberId:actors[who],member:{id:actors[who],supabase_auth_id:SUBJECTS[who],display_name:'Synthetic contribution member'},auth:{provider,subject:provider==='supabase'?SUBJECTS[who]:actors[who]}};}}));
 const allowed=['soe_circle_message_contributions','soe_circle_message_state','soe_circle_message_action'];
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({rpc:async(name,args)=>{
  assert.ok(allowed.includes(name),'Unexpected contributions RPC '+name);const call={name,args:structuredClone(args),status:'pending'};calls.push(call);let result;
  try{if(!names.has(name)){const rows=(await f.db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name])).rows;assert.equal(rows.length,1);names.set(name,rows[0].proargnames);}const keys=names.get(name);assert.deepEqual(Object.keys(args).sort(),[...keys].sort());result={data:await rpc(f.db,name,keys.map(key=>args[key])),error:null};call.status='ok';}
  catch(error){call.status=error.code??'FIXTURE_ERROR';result={data:null,error:{code:call.status}};}return rpcHook?rpcHook(name,args,result):result;
 }})}));
 try{
  for(const name of CONTRIBUTION_APP_SOURCES)await contributionSource(name);
  const member=app.load('app/api/auth/member/route.ts'),list=app.load('app/api/circles/contributions/route.ts'),message=app.load('app/api/circles/[circleId]/messages/[messageId]/route.ts');
  async function dispatch(path,{method='GET',headers={},body,signal}={}){
   assert.equal(closed,false);const url=new URL(path,ORIGIN);assert.equal(url.origin,ORIGIN);assert.ok(['GET','POST'].includes(method));const h=new Headers(headers);if(method==='POST'&&!h.has('content-type'))h.set('content-type','application/json');
   const request=new Request(url,{method,headers:h,signal,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});Object.defineProperty(request,'cookies',{value:{get:()=>undefined}});http.push({path:url.pathname+url.search,method,body:body===undefined?null:typeof body==='string'?body:JSON.stringify(body)});let response;
   if(url.pathname==='/api/auth/member'){assert.equal(method,'GET');assert.equal(url.search,'');response=await member.GET(request);}
   else if(url.pathname==='/api/circles/contributions'){assert.equal(method,'GET');response=await list.GET(request);}
   else{const match=/^\/api\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(url.pathname);assert.ok(match,'Unexpected contribution route');response=await message[method](request,{params:Promise.resolve({circleId:match[1],messageId:match[2]})});}
   return httpHook?httpHook({path:url.pathname+url.search,method,request,response}):response;
  }
  async function post({circleId=f.circleId,who='author',content='Another synthetic own contribution.'}={}){return(await rpc(f.db,'soe_circle_discussion_post',[actors[who],circleId,requestId(),content,null,null,null,'PRIVATE_AUTHOR_LABEL'])).message;}
  return{...f,app,actors,calls,http,SUBJECTS,TOKENS,ORIGIN,dispatch,post,
   select(who='author',provider='supabase'){if(who===null){selected=null;return;}assert.ok(Object.hasOwn(actors,who));assert.ok(['supabase','wallet'].includes(provider));selected={actor:who,provider};},
   transformRpc(fn){rpcHook=fn;},transformHttp(fn){httpHook=fn;},
   async addCircle({title='Second synthetic contributions Circle'}={}){const {day,weekday}=(await f.db.query("SELECT to_char(CURRENT_DATE+1,'YYYY-MM-DD') AS day,extract(dow FROM CURRENT_DATE+1)::int AS weekday")).rows[0];const {circleId}=await rpc(f.db,'soe_circle_create',[actors.other,requestId(),{title,description:'A second synthetic Circle for owned messages.',format:'in_person',city:'Synthetic City',region:null,venueName:'Synthetic public library',venueType:'library',weekday,time:'19:00',timezone:'UTC',startDate:day,maxMembers:8,onlineUrl:null}]);const revision=(await f.db.query('SELECT circle_participation_revision FROM book_cohorts WHERE id=$1',[circleId])).rows[0].circle_participation_revision;await rpc(f.db,'soe_circle_join',[actors.author,circleId,revision,requestId()]);await f.db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)',[circleId,f.reviewerId]);return circleId;},
   async leave(who='author',circleId=f.circleId){const revision=(await f.db.query('SELECT circle_participation_revision FROM book_cohorts WHERE id=$1',[circleId])).rows[0].circle_participation_revision;return rpc(f.db,'soe_circle_leave',[actors[who],circleId,revision,requestId()]);},
   async quarantine(circleId=f.circleId){const detail=await rpc(f.db,'soe_circle_review_detail',[f.reviewerId,circleId]);return rpc(f.db,'soe_circle_review_decide',[f.reviewerId,circleId,detail.revision,requestId(),'hide','safety','A synthetic human review recorded a Circle restriction.',null,detail.circle.title.slice(0,20)]);},
   state({who='author',circleId=f.circleId,messageId=f.messageId}={}){return rpc(f.db,'soe_circle_message_state',[actors[who],circleId,messageId]);},
   async hide({circleId=f.circleId,messageId=f.messageId}={}){const detail=await rpc(f.db,'soe_circle_message_review_detail',[f.reviewerId,circleId,messageId]);return rpc(f.db,'soe_circle_message_review_decide',[f.reviewerId,circleId,messageId,detail.revision,detail.contentHash,requestId(),'hide','safety','A synthetic human reviewer recorded an author-facing explanation.',null,detail.message.content.slice(0,25)]);},
   async withdraw({circleId=f.circleId,messageId=f.messageId}={}){const state=await rpc(f.db,'soe_circle_message_state',[actors.author,circleId,messageId]);return rpc(f.db,'soe_circle_message_action',[actors.author,circleId,messageId,state.revision,state.contentHash,requestId(),'withdraw',null,null]);},
   async counts(){return(await f.db.query('SELECT (SELECT count(*)::int FROM circle_message_receipts) receipts,(SELECT count(*)::int FROM circle_message_reports) reports,(SELECT count(*)::int FROM circle_message_states) states')).rows[0];},
   async close(){if(closed)return;closed=true;await f.db.close();},
  };
 }catch(error){await f.db.close();throw error;}
}
