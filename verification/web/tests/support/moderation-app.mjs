import { offlineApp } from './offline-app.mjs';
import { createDb, rpc, IDS } from './moderation-db.mjs';
export { IDS };
export async function moderationApp() {
 const db=await createDb(),app=offlineApp();let actor=IDS.reviewer;
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>actor?{memberId:actor,member:{id:actor}}:null}));
 const columns=new Map();
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({rpc:async(name,args)=>{
  try{
   if(!/^soe_circle_[a-z_]+$/.test(name))throw Error('Unknown fixture RPC');
   let names=columns.get(name);if(!names){const p=await db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name]);names=p.rows[0].proargnames;columns.set(name,names);}
   return{data:await rpc(db,name,names.map(key=>args[key]??null)),error:null};
  }catch(error){return{data:null,error:{code:error.code||'FIXTURE_ERROR',message:'Synthetic database error'}};}
 }})}));
 const context={params:Promise.resolve({circleId:IDS.circle})};
 const request=(body,path='/api/circles/report',headers={})=>app.fakes.makeReq(body,{url:'https://offline.invalid'+path,headers:{origin:'https://offline.invalid',...headers}});
 const routes={report:app.load('app/api/circles/report/route.ts'),queue:app.load('app/api/admin/circles/reports/route.ts'),detail:app.load('app/api/admin/circles/reports/[circleId]/route.ts'),hosts:app.load('app/api/circles/review/route.ts')};
 return{db,app,routes,context,request,setActor:value=>{actor=value;},close:()=>db.close()};
}
