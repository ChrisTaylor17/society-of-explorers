import {hashBody,PLAN} from './plan-client.mjs';
const fields=['instanceId','planId','invitationId','messagingEpoch'];
const binding=x=>Object.fromEntries(fields.map(k=>[k,x[k]]));
const domain=x=>`plan-messages-v1:${x.instanceId}:${x.planId}:${x.invitationId}`;
const integer=x=>Number.isSafeInteger(x)&&x>0;
const contextValid=(x,actor)=>x&&/^[a-f0-9]{32}$/.test(x.instanceId)&&x.planId===PLAN&&typeof x.invitationId==='string'&&integer(x.messagingEpoch)&&integer(x.messageRevision)&&x.revisionDomain===domain(x)&&x.viewerId===actor&&typeof x.ownConsent==='boolean'&&typeof x.mutualConsent==='boolean';
export function createMessageClient(core,{storage=null,newKey=()=>crypto.randomUUID()}={}){
 const listeners=new Set(),pending=new Map(),closed=new Map(),memory=new Map(),barriers=new Map();let generation=0,authScope=-1,lastActor=null,exitIntent=null;
 let state={phase:'signed-out',context:null,target:null,messages:[],pending:null,stopPending:null,receipt:null,busy:false,stopping:false,composerGeneration:0,message:'Both accepted participants must separately enable local plan messages.'};
 const storeKey='synthetic-message-recovery-v1',barrierKey='synthetic-message-barriers-v1',closedKey='synthetic-message-closed-v1';
 try{for(const p of JSON.parse(storage?.getItem(storeKey)??'[]'))if(['ada','jules','mina'].includes(p.actorId)&&['message-send','message-consent','message-revoke'].includes(p.endpoint)&&/^[A-Za-z0-9._:-]{1,100}$/.test(p.key)&&/^[a-f0-9]{64}$/.test(p.payloadHash)&&/^[a-f0-9]{32}$/.test(p.instanceId)&&p.planId===PLAN&&typeof p.invitationId==='string'&&integer(p.messagingEpoch))pending.set(p.actorId+':'+(p.endpoint==='message-revoke'?'stop':'positive'),{...Object.fromEntries(['actorId',...fields,'endpoint','key','payloadHash'].map(k=>[k,p[k]])),canRetry:false});}catch{}
 try{for(const [k,v]of JSON.parse(storage?.getItem(barrierKey)??'[]'))if(typeof k==='string'&&Number.isSafeInteger(v.floor)&&Number.isSafeInteger(v.denied)&&Number.isSafeInteger(v.retired)&&typeof v.terminal==='boolean')barriers.set(k,v);}catch{}
 try{for(const p of JSON.parse(storage?.getItem(closedKey)??'[]'))if(['ada','jules','mina'].includes(p.actorId)&&['message-send','message-consent','message-revoke'].includes(p.endpoint)&&/^[A-Za-z0-9._:-]{1,100}$/.test(p.key)&&/^[a-f0-9]{64}$/.test(p.payloadHash)&&/^[a-f0-9]{32}$/.test(p.instanceId)&&p.planId===PLAN&&typeof p.invitationId==='string'&&integer(p.messagingEpoch))closed.set(p.actorId+':'+p.key,Object.fromEntries(['actorId',...fields,'endpoint','key','payloadHash'].map(k=>[k,p[k]])));}catch{}
 const key=(actor,lane)=>actor+':'+lane;
 const auth=()=>core.auth();
 const current=(g,a)=>generation===g&&auth().scope===a.scope&&auth().actor===a.actor&&auth().authenticated;
 const barrier=c=>{const k=auth().actor+':'+domain(c);if(!barriers.has(k))barriers.set(k,{floor:0,denied:0,retired:0,terminal:false});return barriers.get(k);};
 const minimal=p=>Object.fromEntries(['actorId',...fields,'endpoint','key','payloadHash'].map(k=>[k,p[k]]));
 const save=()=>{try{storage?.setItem(storeKey,JSON.stringify([...pending.values()].map(minimal)));storage?.setItem(closedKey,JSON.stringify([...closed.values()].map(minimal)));storage?.setItem(barrierKey,JSON.stringify([...barriers]));}catch{state.message+=' Keep this tab open; recovery storage is unavailable.';}};
 const view=()=>structuredClone(state);
 const emit=()=>{const actor=auth().actor;state.pending=pending.get(key(actor,'positive'))??null;state.stopPending=pending.get(key(actor,'stop'))??null;state.closed=[...closed.values()].filter(p=>p.actorId===actor);for(const f of listeners)f(view());};
 const clear=({draft=false}={})=>{if(draft)state.composerGeneration++;generation++;state.context=null;state.messages=[];state.busy=false;state.stopping=false;};
 function retire(c,{terminal=false,deny=false}={}){if(!c)return;const b=barrier(c);if(deny)b.denied=Math.max(b.denied,b.floor,c.messageRevision??0);else b.retired=Math.max(b.retired,c.messagingEpoch);b.terminal ||=terminal;
  for(const lane of ['positive','stop']){const p=pending.get(key(auth().actor,lane));if(!deny&&p&&domain(p)===domain(c)&&(terminal||p.messagingEpoch<=b.retired)){pending.delete(key(auth().actor,lane));closed.set(p.actorId+':'+p.key,minimal(p));memory.delete(p.key);}}save();}
 const accepted=()=>{const v=core.view();return !v.busy&&!v.pending&&v.phase==='ready'&&v.plan?.data.invitationStatus==='accepted';};
 const invitation=()=>core.view().plan?.data.invitationId;
 core.subscribe(()=>{const a=auth();if(a.scope!==authScope||a.actor!==lastActor){clear({draft:true});memory.clear();exitIntent=null;for(const p of pending.values())p.canRetry=false;save();state.stopping=false;state.target=null;if(a.actor!==lastActor)state.receipt=null;authScope=a.scope;lastActor=a.actor;state.phase=a.authenticated?'unchecked':'signed-out';state.message='Sign in and refresh current messaging context.';emit();}else{if(exitIntent&&core.view().receipt?.endpoint===exitIntent.endpoint){retire(exitIntent.context,{terminal:true});state.target=null;exitIntent=null;}if(!accepted()){const v=core.view();clear({draft:!v.busy||!['checking','sending'].includes(v.phase)});state.phase='unavailable';emit();}}});
 core.onIntent(({actor,endpoint,body})=>{if(state.target&&((endpoint==='leave'&&body.invitationId===state.target.invitationId)||(endpoint==='block'&&body.otherId===core.view().plan?.data.other.personId)))exitIntent={actor,endpoint,context:{...state.target}};clear({draft:['leave','block','delete-account'].includes(endpoint)});memory.clear();state.phase='unavailable';state.message=['leave','block','delete-account'].includes(endpoint)?'Exit requested. Earlier message outcomes may still need original-key lookup.':'Plan state changing; refresh messages before acting.';emit();});
 function contextAllowed(c){const b=barrier(c);return !b.terminal&&c.messagingEpoch>b.retired&&c.messageRevision>=b.floor&&c.messageRevision>b.denied;}
 function deny(result,c){clear({draft:true});memory.clear();if(result.http===409){retire(c);state.message='Message context changed. Old intent will not be retargeted.';}else if(result.http===403){if(['plan_held','plan_cancelled'].includes(result.body?.error))retire(c,{terminal:result.body.error==='plan_cancelled'});else retire(c,{deny:true});state.message='Messages unavailable. Refresh current context; leave and block remain separate.';}else state.message='Message state unavailable. No current text access is confirmed.';state.phase='unavailable';emit();}
 async function refresh(afterSeq=0){
  const a=auth();if(!a.authenticated||!accepted())return;
  const id=invitation(),g=++generation;state.context=null;state.messages=[];state.busy=true;state.phase='checking';emit();
  try{
   const r=await core.authRequest('/api/plans/'+PLAN+'/messaging-context?invitationId='+encodeURIComponent(id));if(!current(g,a))return;
   const c=r.body?.data;if(r.http!==200||!contextValid(c,a.actor)||c.invitationId!==id){deny(r,state.target);return;}
   if(!contextAllowed(c)){state.composerGeneration++;state.phase='unavailable';state.message='Older or retired context refused. No text was restored.';return;}
   const planKey=a.actor+':plan-invitations-v1:'+c.instanceId+':'+c.planId,planFloor=barriers.get(planKey)?.floor??0;
   if(!integer(r.body.version)||r.body.version<Math.max(planFloor,core.view().membership?.version??0)){state.composerGeneration++;state.phase='unavailable';state.message='Older plan state refused. Original message history remains available.';return;}
   barriers.set(planKey,{floor:r.body.version,denied:0,retired:0,terminal:false});
   barrier(c).floor=Math.max(barrier(c).floor,c.messageRevision);state.target={...binding(c),messageRevision:c.messageRevision};state.context=c;save();
   for(const lane of ['positive','stop']){
    const old=pending.get(key(a.actor,lane));
    if(old&&old.instanceId===c.instanceId&&old.planId===c.planId&&old.invitationId!==c.invitationId)retire(old,{terminal:true});
   }
   const ownPending=pending.get(key(a.actor,'positive')),stop=pending.get(key(a.actor,'stop'));
   if(ownPending||stop){state.phase='unknown';state.message='Check original message receipts. Stop, leave and block remain available.';return;}
   if(!c.mutualConsent){state.phase='waiting';state.message='Waiting for two separate messaging choices. No message text is available.';return;}
   const {planId:requestPlan,...queryContext}=binding(c);const q=new URLSearchParams({...queryContext,afterSeq:String(afterSeq),limit:'50'}),read=await core.authRequest('/api/plans/'+PLAN+'/messages?'+q);if(!current(g,a))return;
   const d=read.body?.data;
   if(read.http!==200||!d||d.viewerId!==a.actor||fields.some(k=>d[k]!==c[k])||d.revisionDomain!==domain(c)||!integer(d.messageRevision)||d.messageRevision<c.messageRevision||!contextAllowed(d)||!Array.isArray(d.messages)){deny(read,c);return;}
   if(d.messages.some(m=>m.invitationId!==id||m.epoch!==c.messagingEpoch||!integer(m.seq)||typeof m.text!=='string'||!['ada','jules','mina','rhea'].includes(m.senderId))){deny({http:500},c);return;}
   barrier(c).floor=Math.max(barrier(c).floor,d.messageRevision);state.messages=d.messages;state.nextAfterSeq=d.nextAfterSeq;state.hasMore=d.hasMore;state.context={...c,messageRevision:d.messageRevision};state.target={...binding(c),messageRevision:d.messageRevision};state.phase='ready';state.message='Current local text fetched. This is not a read or delivery receipt.';save();
  }catch{if(current(g,a)){clear({draft:true});state.phase='offline';state.message='Local messages unavailable; no text access is confirmed.';emit();}}
  finally{if(current(g,a)){state.busy=false;emit();}}
 }
 function receiptValid(r,p){const d=r?.data;return r?.status==='committed'&&integer(r.messageRevision)&&r.revisionDomain===domain(p)&&d?.operation===p.endpoint&&fields.every(k=>d[k]===p[k])&&d.outcome===({'message-send':'stored','message-consent':'consented','message-revoke':'revoked'})[p.endpoint]&&(p.endpoint!=='message-send'||(integer(d.seq)&&typeof d.messageId==='string'))&&!Object.hasOwn(d,'text');}
 async function receive(r,p,g,a){
  if(!current(g,a))return;
  const lane=p.endpoint==='message-revoke'?'stop':'positive';
  if(r.http===200&&receiptValid(r.body,p)){
   if(pending.get(key(a.actor,lane))?.key===p.key)pending.delete(key(a.actor,lane));memory.delete(p.key);state.receipt={endpoint:p.endpoint,outcome:r.body.data.outcome,seq:r.body.data.seq??null,historical:true,...binding(p)};
   if(lane==='stop')retire(p);state.busy=false;state.stopping=false;save();emit();await refresh();
  }else if([400,403,409,413,429].includes(r.http)){
   // An original request may still have arrived. Keep minimal history, do not
   // invent cancellation or switch key/context after an absent lookup.
   p.canRetry=false;state.busy=false;state.stopping=false;save();deny(r,p);
  }else{state.busy=false;state.stopping=false;state.phase='unknown';state.message='Outcome unknown. Check the original key; stop and leave remain available.';emit();}
 }
 async function transmit(p,body,g,a){try{await receive(await core.authRequest('/api/writes/'+p.endpoint,{body:{personId:a.actor,idempotencyKey:p.key,payloadHash:p.payloadHash,body}}),p,g,a);}catch{if(current(g,a)){state.busy=false;state.stopping=false;state.phase='unknown';state.message='Response lost. Check the original key; stop and leave remain available.';emit();}}}
 async function start(endpoint,text){
  const a=auth(),stop=endpoint==='message-revoke',c=stop?state.target:state.context;
  if(!a.authenticated||!c||(!stop&&(state.busy||!accepted()||pending.has(key(a.actor,'positive'))||pending.has(key(a.actor,'stop'))||!contextAllowed(c)))||(stop&&(state.stopping||pending.has(key(a.actor,'stop')))))return;
  if(endpoint==='message-send'&&(!c.mutualConsent||state.phase!=='ready'))return;
  const body={...binding(c),...(endpoint==='message-send'?{text}:{})};const g=++generation;state.composerGeneration++;state.messages=[];state.context=null;if(stop)memory.clear();state.phase='sending';if(stop)state.stopping=true;else state.busy=true;emit();
  const payloadHash=await hashBody(body);if(!current(g,a))return;
  const p={actorId:a.actor,...binding(c),endpoint,key:newKey(),payloadHash,canRetry:false};pending.set(key(a.actor,stop?'stop':'positive'),p);if(endpoint==='message-send')memory.set(p.key,text);save();emit();await transmit(p,body,g,a);
 }
 async function reconcile(lane='positive'){
  const a=auth(),p=pending.get(key(a.actor,lane));if(!a.authenticated||!p)return;
  const g=++generation;state.messages=[];state.context=null;state.busy=true;emit();
  try{const r=await core.authRequest('/api/lookup',{body:{personId:a.actor,endpoint:p.endpoint,key:p.key,payloadHash:p.payloadHash,instanceId:p.instanceId}});if(!current(g,a))return;
   if(r.http===200&&r.body.status==='recorded')return await receive({http:200,body:r.body.result},p,g,a);
   if(r.http===200&&r.body.status==='absent'){p.canRetry=true;state.phase='unknown';state.message='No receipt found yet. Retry needs the original context and exact text; absence is not cancellation.';}
   else if(r.body?.error==='fixture_changed'){p.canRetry=false;state.phase='orphaned';state.message='This intent belongs to another fixture. It cannot be resolved or retried here.';}
   else{p.canRetry=false;state.phase='unknown';state.message='Receipt unavailable. Reauthenticate as its owner.';}
  }catch{if(current(g,a)){state.phase='unknown';state.message='Receipt check unavailable.';}}
  finally{if(current(g,a)){state.busy=false;save();emit();}}
 }
 async function retry(lane='positive',text){const a=auth(),p=pending.get(key(a.actor,lane));if(!a.authenticated||!p?.canRetry||state.busy||state.stopping||(lane==='positive'&&pending.has(key(a.actor,'stop'))))return;
  // Reserve before hashing: a safety intent must invalidate this continuation,
  // including its mismatch feedback. Digest completion cannot mint authority.
  const g=++generation,body={...binding(p),...(p.endpoint==='message-send'?{text:text??memory.get(p.key)}:{})},digest=await hashBody(body);
  if(!current(g,a)||pending.get(key(a.actor,lane))!==p||!p.canRetry)return;
  if(digest!==p.payloadHash){state.message='Re-enter the exact original synthetic text; its hash must match.';emit();return;}
  p.canRetry=false;state.composerGeneration++;state.messages=[];state.context=null;state.busy=true;emit();await transmit(p,body,g,a);
 }
 async function checkClosed(originalKey){const a=auth(),p=closed.get(a.actor+':'+originalKey);if(!a.authenticated||!p)return;clear();const checkGeneration=generation;state.phase='checking';emit();try{const r=await core.authRequest('/api/lookup',{body:{personId:a.actor,endpoint:p.endpoint,key:p.key,payloadHash:p.payloadHash,instanceId:p.instanceId}});if(!current(checkGeneration,a))return;if(r.http===200&&r.body.status==='recorded'&&receiptValid(r.body.result,p)){state.receipt={endpoint:p.endpoint,outcome:r.body.result.data.outcome,seq:r.body.result.data.seq??null,historical:true,...binding(p)};state.message='Historical stored fact recovered. Closed context stays closed.';}else state.message=r.body?.error==='fixture_changed'?'Historical intent belongs to another fixture; outcome cannot be checked here.':'No stored receipt confirmed. This does not prove cancellation or erase earlier copies.';state.phase='unavailable';emit();}catch{if(current(checkGeneration,a)){state.phase='offline';state.message='Historical receipt unavailable.';emit();}}}
 return {view,subscribe(f){listeners.add(f);f(view());return()=>listeners.delete(f);},refresh,next:()=>refresh(state.nextAfterSeq??0),enable:()=>start('message-consent'),send:text=>start('message-send',text),revoke:()=>start('message-revoke'),reconcile,retry,checkClosed,clear(){clear({draft:true});memory.clear();emit();}};
}
