import {LOCAL_RECOVERY_CONTRACT} from './local-recovery.js';
export const RECOVERY_PREFIX='/api/local-recovery/';
export const MAX_RECOVERY_BYTES=1024;
const HEADERS=Object.freeze({'cache-control':'no-store','pragma':'no-cache','vary':'Authorization','x-content-type-options':'nosniff'});
const code=x=>x?.status==='ok'?200:x?.status==='expired-session'?401:x?.status==='rejected'?403:x?.status==='conflict'?409:x?.status==='unavailable'?404:503;

/** Parsed-request boundary, also used by the actual HTTP router. No socket is
 * created here. A missing/disabled local contract never falls back to fixtures. */
export async function dispatchRecovery(world,{method,path,authorization='',body}){
  const reply=(status,value)=>({status,headers:{...HEADERS},body:value});
  if(world.localRecoveryContract!==LOCAL_RECOVERY_CONTRACT)return reply(404,{status:'unavailable',blocker:'Local recovery disabled.'});
  const methods=new Map([['/api/local-recovery/session','GET'],['/api/local-recovery/participation','POST'],['/api/local-recovery/logout','POST']]);
  const expected=methods.get(path);
  if(!expected)return reply(404,{status:'unavailable',blocker:'No recovery route.'});
  if(method!==expected)return {...reply(405,{status:'rejected',error:'method_not_allowed'}),headers:{...HEADERS,allow:expected}};
  const token=/^Bearer ([a-f0-9]{64})$/.exec(authorization)?.[1];
  if(!token)return reply(401,{status:'expired-session'});
  if(method==='GET'&&body!==undefined)return reply(400,{status:'rejected',error:'unexpected_recovery_body'});
  if(method==='POST'){
    let encoded;try{encoded=JSON.stringify(body);}catch{return reply(400,{status:'rejected',error:'invalid_recovery_body'});}
    if(typeof encoded!=='string')return reply(400,{status:'rejected',error:'invalid_recovery_body'});
    if(Buffer.byteLength(encoded,'utf8')>MAX_RECOVERY_BYTES)return reply(413,{status:'rejected',error:'recovery_too_large'});
  }
  try{
    const value=await(path.endsWith('/session')?world.currentRecoverySession(token):path.endsWith('/participation')?world.recoverParticipation(token,body):world.endRecoverySession(token,body));
    return reply(code(value),value);
  }catch{return reply(503,{status:'unavailable',blocker:'Recovery could not be confirmed. No automatic retry was performed.'});}
}
