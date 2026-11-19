/** Browser/headset lifecycle only. Permission is requested exclusively by enter(). */
export function createXRSession({xr,activity,render,status=()=>{}}){
  let session=null,pending=false,disposed=false,stop=null;
  async function supported(){try{return Boolean(!disposed&&xr&&await xr.isSessionSupported('immersive-vr'));}catch{return false;}}
  async function leave(){const current=session;session=null;stop?.();stop=null;activity('inactive');if(current)await current.end().catch(()=>{});status('Immersive view ended. Refresh current access before continuing.');}
  async function enter(){
    if(disposed||pending||session)return false;pending=true;
    try{
      if(!xr)throw Error('unavailable');const next=await xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});
      if(disposed){await next.end();return false;}session=next;
      next.addEventListener('end',()=>{if(session===next){session=null;stop?.();stop=null;activity('inactive');status('Immersive view ended. Refresh current access.');}},{once:true});
      next.addEventListener('visibilitychange',()=>{activity(next.visibilityState==='visible'?'active':'inactive');if(next.visibilityState!=='visible')stop?.clear?.();});
      stop=await render(next);if(disposed||session!==next){stop?.();stop=null;return false;}
      activity(next.visibilityState==='visible'?'active':'inactive');status('Immersive view active. Reading only; writing stays on the regular page.');return true;
    }catch{if(session)await leave();status('Immersive view unavailable. Continue on the regular page.');return false;}
    finally{pending=false;}
  }
  return{supported,enter,leave,async dispose(){disposed=true;await leave();},active:()=>session!==null};
}
