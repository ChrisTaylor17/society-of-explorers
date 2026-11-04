import { offlineApp } from './offline-app.mjs';
import { createMessageAiDb, IDS, rpc, CONTENT, MESSAGE_AI_SOURCE_HASHES, MESSAGE_AI_FIXTURE_LIMITS } from './message-ai-db.mjs';
export { IDS, CONTENT, MESSAGE_AI_SOURCE_HASHES, MESSAGE_AI_FIXTURE_LIMITS };

// Actual route modules and twelve migration files. Only server authentication,
// PostgREST transport and the remote model are synthetic adapters.
export async function messageAiApp() {
 const f=await createMessageAiDb(),app=offlineApp(),calls=[],providerCalls=[];
 let actor=f.authorId,available=true,provider=async()=>({observations:[],counterevidence:[{excerpt:'without a personal attack',note:'The message distinguishes an idea from a person.'}],questions:['What surrounding context should the human reviewer check?']});
 const names=new Map();
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>actor?{memberId:actor}:null}));
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({rpc:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});
  try {
   if(!/^soe_circle_[a-z_]+$/.test(name))throw Error('Unexpected RPC');
   if(!names.has(name)){
    const result=await f.db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name]);
    if(result.rows.length!==1)throw Error('Missing or ambiguous RPC');names.set(name,result.rows[0].proargnames);
   }
   return {data:await rpc(f.db,name,names.get(name).map(key=>args[key]??null)),error:null};
  }catch(error){return {data:null,error:{code:error.code??'FIXTURE_ERROR'}};}
 }})}));
 app.setMock('@/lib/circles/message-ai-provider',()=>({providerAvailable:()=>available,requestMessageAdvice:async(content,signal)=>{
  providerCalls.push({content,signal});return provider(content,signal);
 }}));
 const routes={
  contributions:app.load('app/api/circles/contributions/route.ts'),
  message:app.load('app/api/circles/[circleId]/messages/[messageId]/route.ts'),
  consent:app.load('app/api/circles/[circleId]/messages/[messageId]/ai-consent/route.ts'),
  queue:app.load('app/api/admin/circles/messages/route.ts'),
  review:app.load('app/api/admin/circles/[circleId]/messages/[messageId]/route.ts'),
  advice:app.load('app/api/admin/circles/[circleId]/messages/[messageId]/advice/route.ts'),
 };
 const messagePath=`/api/circles/${f.circleId}/messages/${f.messageId}`,reviewPath=`/api/admin/circles/${f.circleId}/messages/${f.messageId}`;
 async function dispatch(path,method='GET',body,signal){
  const url=new URL(path,'https://message-ai-fixture.test');
  const request=new Request(url,{method,headers:{origin:url.origin,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),signal});
  const ctx={params:Promise.resolve({circleId:f.circleId,messageId:f.messageId})};
  const route=url.pathname==='/api/circles/contributions'?routes.contributions:url.pathname==='/api/admin/circles/messages'?routes.queue
   :url.pathname===messagePath?routes.message:url.pathname===messagePath+'/ai-consent'?routes.consent
   :url.pathname===reviewPath?routes.review:url.pathname===reviewPath+'/advice'?routes.advice:null;
  if(!route?.[method])throw Error('Unrecognized composed route: '+method+' '+path);
  return route[method](request,ctx);
 }
 try{
  actor=IDS.host;
  const current=await (await dispatch(messagePath)).json();
  const reported=await dispatch(messagePath,'POST',{action:'report',expectedRevision:current.revision,contentHash:current.contentHash,requestId:crypto.randomUUID(),reason:'safety',note:'PRIVATE_REPORT_NOTE: a synthetic allegation for human review only.'});
  if(reported.status!==200)throw Error('Could not seed actual API report: '+reported.status);
  actor=f.authorId;
 }catch(error){await f.db.close();throw error;}
 return {...f,app,calls,providerCalls,dispatch,messagePath,reviewPath,
  setActor:value=>{actor=value;},setAvailable:value=>{available=value;},setProvider:value=>{provider=value;},close:()=>f.db.close()};
}
