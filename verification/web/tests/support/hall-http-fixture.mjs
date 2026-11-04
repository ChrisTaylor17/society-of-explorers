import assert from 'node:assert/strict';
import { offlineApp } from './offline-app.mjs';

export const hallId = n => `fa110000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const hallRow = (n=1, extra={}) => ({ id:hallId(n), thinker_id:'socrates', title:'Synthetic public creation',
  description:null, philosophical_note:null, is_public:true, ...extra });
export const plain = value => JSON.parse(JSON.stringify(value));
export function hallHttpFixture({data=[hallRow()],error=null,execute,adminThrows=false}={}) {
  const app=offlineApp(),calls=[],timers=[];let signal;
  let authCalls=0,adminCalls=0;
  for(const name of ['@/lib/getAuthenticatedMember','@/lib/auth/getSession','@/lib/supabase/server'])app.setMock(name,()=>{
    authCalls++;throw Error('Hall must not import or execute authentication');
  });
  app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>{
    adminCalls++;
    if(adminThrows)throw Error('PRIVATE_ADMIN_CONFIGURATION');
    return {from(table){
      calls.push({method:'from',table});
      const query={
        select(fields){calls.push({method:'select',fields});return query;},
        eq(field,value){calls.push({method:'eq',field,value});return query;},
        order(field,options){calls.push({method:'order',field,options:structuredClone(options)});return query;},
        limit(value){calls.push({method:'limit',value});return query;},
        abortSignal(value){signal=value;calls.push({method:'abortSignal'});return query;},
        then(resolve,reject){return Promise.resolve().then(()=>execute?execute():{data,error}).then(resolve,reject);},
      };return query;
    }};
  }}));
  app.context.setTimeout=(fn,ms)=>{assert.equal(ms,5000);const timer={fn,ms,cleared:false};timers.push(timer);return timer;};
  app.context.clearTimeout=timer=>{timer.cleared=true;};
  const route=app.load('app/api/hall/route.ts');
  return {app,route,calls,timers,get signal(){return signal;},get authCalls(){return authCalls;},get adminCalls(){return adminCalls;},
    get:(url='https://soe.invalid/api/hall',options={})=>route.GET(new Request(url,options))};
}
