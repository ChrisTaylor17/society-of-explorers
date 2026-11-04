export const PLAN = 'plan-riverside';
export const ACTORS = ['ada', 'jules', 'mina'];
const stable = x => Array.isArray(x) ? `[${x.map(stable).join(',')}]` : x && typeof x === 'object' ? `{${Object.keys(x).sort().map(k => JSON.stringify(k)+':'+stable(x[k])).join(',')}}` : JSON.stringify(x);
export async function hashBody(body) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(body))))].map(x => x.toString(16).padStart(2,'0')).join('');
}
const validMember = x => x?.status === 'ok' && Number.isSafeInteger(x.version) && x.version > 0 &&
  x.data?.planId === PLAN && ['host','none','invited','accepted','withdrawn','declined'].includes(x.data.status) &&
  typeof x.data.canLeave === 'boolean' && (x.data.invitationId === null || typeof x.data.invitationId === 'string');
const validLeave = (x,p) => x?.status === 'committed' && Number.isSafeInteger(x.version) && x.version > 0 &&
  x.data?.operation === 'leave' && x.data.planId === PLAN && x.data.invitationId === p.body.invitationId &&
  ['left','withdrawn'].includes(x.data.outcome) && typeof x.data.limit === 'string';

export function createPlanClient({baseUrl='',fetcher=fetch,storage=null,newKey=()=>crypto.randomUUID(),timeoutMs=7000}={}) {
  const storageKey='synthetic-leave-pending-v1', pendingByActor=new Map(), floors=new Map(), listeners=new Set();
  let token=null, generation=0, sessionScope=0;
  const intentListeners=new Set();
  let state={actor:null,sessionIssue:null,phase:'signed-out',busy:false,plan:null,membership:null,pending:null,receipt:null,message:'Choose a fictional person. This is a local synthetic fixture.'};
  try {
    const rows=JSON.parse(storage?.getItem(storageKey)??'[]');
    if(Array.isArray(rows)) for(const p of rows) if(ACTORS.includes(p?.actor) && p.endpoint==='leave' && typeof p.key==='string' && p.key.length>0 && p.key.length<=200 && /^[a-f0-9]{64}$/.test(p.hash) && p.body?.planId===PLAN && typeof p.body.invitationId==='string' && Object.keys(p.body).length===2) pendingByActor.set(p.actor,{actor:p.actor,endpoint:p.endpoint,key:p.key,hash:p.hash,body:p.body,canRetry:false});
  } catch { /* Malformed tab-local recovery records never authorize a write. */ }
  const view=()=>structuredClone({...state,authenticated:Boolean(token)});
  const persist=()=>{try{storage?.setItem(storageKey,JSON.stringify([...pendingByActor.values()].filter(p=>p.endpoint==='leave')));}catch{state.message+=' Keep this tab open: recovery storage is unavailable.';}};
  const emit=()=>{state.pending=state.actor?pendingByActor.get(state.actor)??null:null;for(const f of listeners)f(view());};
  const fence=()=>{generation++;state.plan=null;state.membership=null;return generation;};
  const current=(g,actor)=>g===generation && actor===state.actor;
  function rejectSession(rejectedToken) {
    // Session authority is independent of the plan's resource version. Retire
    // the exact denied token and every read using it, even on a later refresh.
    // A delayed denial from an older token cannot retire a new sign-in.
    if(!rejectedToken||token!==rejectedToken)return;
    fence();token=null;sessionScope++;state.busy=false;state.sessionIssue={actor:state.actor,reason:'expired-or-replaced'};
    const pending=pendingByActor.get(state.actor);
    if(pending){pending.canRetry=false;persist();}
    state.phase=pending?'unknown':'unavailable';
    state.message='Session rejected. It expired or was replaced by another sign-in. Unsent text was cleared. Sign in again as the same person to check current access and original receipts; no action was retried.';
    emit();
  }
  async function request(path,{body,auth=true}={}) {
    const requestToken=auth?token:null;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetcher(baseUrl+path,{method:body===undefined?'GET':'POST',redirect:'error',cache:'no-store',signal:controller.signal,
        headers:{accept:'application/json',...(requestToken?{authorization:'Bearer '+requestToken}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(response.status===401)rejectSession(requestToken);
      const value=await response.json();
      // The existing lookup contract presents session expiry as 404 rather
      // than 401. Do not confuse ordinary held/blocked plan denials with it.
      if(value?.status==='expired-session'||(path==='/api/lookup'&&response.status===404&&value?.status==='unavailable'&&value.blocker==='Session expired.'))rejectSession(requestToken);
      return {http:response.status,body:value};
    } finally {clearTimeout(timer);}
  }
  async function refresh() {
    if(!token||!state.actor)return;
    const actor=state.actor,g=fence();state.busy=true;state.phase='checking';emit();
    try {
      const member=await request('/api/membership/'+PLAN);if(!current(g,actor))return;
      if(member.http!==200||!validMember(member.body)) {state.phase='unavailable';state.message='Membership unavailable. Sign in again if the session expired.';return;}
      const plan=await request('/api/plans/'+PLAN);if(!current(g,actor))return;
      const floor=floors.get(actor)??0;
      if(member.body.version<floor || (plan.http===200 && (plan.body.status!=='ok'||plan.body.version!==member.body.version||!plan.body.data?.other))) {
        state.phase='unavailable';state.message='State changed or an older reply arrived. Refresh before acting.';return;
      }
      floors.set(actor,Math.max(floor,member.body.version));state.membership=member.body;
      // During an uncertain action, even an otherwise valid response cannot
      // re-expose contact or enable a second membership change.
      if(pendingByActor.has(actor)){state.phase='unknown';state.message='An action is unconfirmed. Check its original receipt first.';return;}
      state.plan=plan.http===200?plan.body:null;state.phase=state.plan?'ready':'restricted';
      state.message=state.plan?'Current local state checked.':'Plan view unavailable. You can still leave your own active participation.';
    } catch {if(current(g,actor)){state.phase='offline';state.message='Local backend unavailable. No current access is confirmed.';}}
    finally{if(current(g,actor)){state.busy=false;emit();}}
  }
  async function signIn(actor) {
    if(!ACTORS.includes(actor))return;
    const sessionIssue=state.sessionIssue?.actor===actor?state.sessionIssue:null;
    const g=fence();token=null;sessionScope++;state={...state,actor,sessionIssue,phase:'signing-in',busy:true,receipt:actor===state.actor?state.receipt:null,message:'Signing into the local synthetic fixture.'};emit();
    try {
      const r=await request('/api/session',{auth:false,body:{magicName:actor,passcode:'synthetic-'+actor}});if(!current(g,actor))return;
      if(r.http!==200||r.body.status!=='ok'||r.body.person?.id!==actor||typeof r.body.token!=='string'){state.phase='unavailable';state.message='Synthetic sign-in failed.';state.busy=false;emit();return;}
      token=r.body.token;state.sessionIssue=null;await refresh();
    }catch{if(current(g,actor)){state.phase='offline';state.busy=false;state.message='Local sign-in unavailable.';emit();}}
  }
  function signOut(){fence();token=null;sessionScope++;state={actor:null,sessionIssue:null,phase:'signed-out',busy:false,plan:null,membership:null,pending:null,receipt:null,message:'Signed out. Unconfirmed leave keys remain isolated to their original fictional actor in this tab.'};emit();}
  async function finish(r,p,g,actor) {
    if(!current(g,actor))return;
    if(r.http===200&&r.body.status==='committed'&&(p.endpoint!=='leave'||validLeave(r.body,p))) {
      pendingByActor.delete(actor);persist();floors.set(actor,Math.max(floors.get(actor)??0,r.body.version??0));
      state.receipt={endpoint:p.endpoint,version:r.body.version,outcome:p.endpoint==='leave'?r.body.data.outcome:'stored',historical:true};
      state.message='Historical receipt stored. Checking current membership.';state.busy=false;await refresh();
    } else if([400,403,409,413,429].includes(r.http) && ['rejected','conflict'].includes(r.body?.status)) {
      pendingByActor.delete(actor);persist();state.phase='denied';state.message='Action denied. No new participation or contact access is confirmed.';state.busy=false;emit();
    } else {state.phase='unknown';state.message='Outcome unconfirmed. Check the original receipt before retrying.';state.busy=false;persist();emit();}
  }
  async function send(p,g,actor) {
    try {await finish(await request('/api/writes/'+p.endpoint,{body:{personId:actor,idempotencyKey:p.key,payloadHash:p.hash,body:p.body}}),p,g,actor);}
    catch{if(current(g,actor)){state.phase='unknown';state.busy=false;state.message='Response lost. Check the original receipt before retrying.';persist();emit();}}
  }
  async function act(endpoint,body) {
    if(!token||!state.actor||state.busy||pendingByActor.has(state.actor)||!['ready','restricted'].includes(state.phase))return;
    if(!['join','accept','grant','revoke','leave','block','report'].includes(endpoint))return;
    if(endpoint==='leave'&&(!state.membership?.data.canLeave||body.invitationId!==state.membership.data.invitationId))return;
    for(const listener of intentListeners)listener({actor:state.actor,endpoint,body:structuredClone(body)});
    const actor=state.actor,g=fence(),p={actor,endpoint,key:newKey(),body:structuredClone(body),hash:'',canRetry:false};
    state.busy=true;state.receipt=null;state.phase='sending';emit();
    p.hash=await hashBody(p.body);if(!current(g,actor))return;
    pendingByActor.set(actor,p);persist();emit();await send(p,g,actor);
  }
  async function reconcile() {
    const actor=state.actor,p=pendingByActor.get(actor);if(!token||!p||state.busy)return;
    const g=fence();state.busy=true;state.phase='checking';emit();
    try {
      const r=await request('/api/lookup',{body:{personId:actor,endpoint:p.endpoint,key:p.key,payloadHash:p.hash}});if(!current(g,actor))return;
      if(r.http===200&&r.body.status==='recorded')return await finish({http:200,body:r.body.result},p,g,actor);
      if(r.http===200&&r.body.status==='absent'){p.canRetry=true;state.message='No stored receipt found. Retry uses the original key and exact participation.';}
      else state.message='Receipt unavailable. Reauthenticate as the same actor and check again.';
      state.busy=false;state.phase='unknown';persist();emit();
    }catch{if(current(g,actor)){state.busy=false;state.phase='unknown';state.message='Receipt check offline; do not create a new action.';emit();}}
  }
  async function retry(){const actor=state.actor,p=pendingByActor.get(actor);if(!token||!p?.canRetry||state.busy)return;const g=fence();p.canRetry=false;state.busy=true;state.phase='sending';emit();await send(p,g,actor);}
  async function reauthenticate(){const actor=state.sessionIssue?.actor;if(actor&&actor===state.actor&&!state.busy)return signIn(actor);}
  return {auth:()=>({actor:state.actor,scope:sessionScope,authenticated:Boolean(token)}),authRequest:(path,options)=>token?request(path,options):Promise.resolve({http:401,body:{status:'expired-session'}}),onIntent(f){intentListeners.add(f);return()=>intentListeners.delete(f);},view,subscribe(f){listeners.add(f);f(view());return()=>listeners.delete(f);},signIn,signOut,reauthenticate,refresh,act,reconcile,retry};
}
