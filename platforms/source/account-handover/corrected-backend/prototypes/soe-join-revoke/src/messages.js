import {randomBytes} from 'node:crypto';
export const MESSAGE_CONTRACT='plan-messages-v1';
export const MESSAGE_WRITES=new Set(['message-consent','message-revoke','message-send']);
export const MESSAGE_COLLECTIONS=['messageMeta','messageThreads','messageRows'];
export const MAX_MESSAGE_BYTES=8192;
export const validText=x=>typeof x==='string'&&x.isWellFormed()&&x.length>=1&&x.length<=1000&&x.trim().length>0&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
export const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
export const positive=x=>Number.isSafeInteger(x)&&x>0;
const denied=()=>({status:'rejected',error:'messages_unavailable'});
export function validMessageBody(endpoint,b){return exact(b,['instanceId','planId','invitationId','messagingEpoch',...(endpoint==='message-send'?['text']:[])])&&['instanceId','planId','invitationId'].every(k=>typeof b[k]==='string'&&/^[A-Za-z0-9._:-]{1,100}$/.test(b[k]))&&positive(b.messagingEpoch)&&(endpoint!=='message-send'||validText(b.text));}

export function createMessaging({collections:c,now,blocked,unavailable}) {
 const {people,plans,invitations,messageMeta,messageThreads:threads,messageRows:rows,idempotency,holds}=c;
 const meta=()=>messageMeta.get('config');
 const domain=t=>`${MESSAGE_CONTRACT}:${meta().instanceId}:${t.planId}:${t.invitationId}`;
 const held=()=>new Set([...(holds?.values()??[])].filter(h=>h.state==='held').map(h=>h.planId));
 const terminal=t=>{const p=plans.get(t.planId),i=invitations.get(t.invitationId);return !p||p.closed||i?.status!=='accepted'||people.get(t.hostId)?.deletedAt||people.get(t.guestId)?.deletedAt||blocked(t.hostId,t.guestId)||unavailable(t.planId)?.error==='plan_cancelled';};
 function rotate(t,end=false){
  if(t.terminal)return;
  t.consentHost=false;t.consentGuest=false;
  if(t.epoch===Number.MAX_SAFE_INTEGER||t.revision===Number.MAX_SAFE_INTEGER){t.terminal=true;return;}
  t.epoch++;t.revision++;t.terminal=end;
 }
 function afterCore(endpoint,beforeHeld){
  if(endpoint==='accept')for(const i of invitations.values())if(i.status==='accepted'&&!threads.has(i.id)){
   const p=plans.get(i.planId);threads.set(i.id,{planId:p.id,invitationId:i.id,hostId:p.hostId,guestId:i.requesterId,epoch:1,revision:1,lastSeq:0,terminal:false,consentHost:false,consentGuest:false});
  }
  const currentHeld=held();
  for(const t of threads.values())if(!t.terminal){if(terminal(t))rotate(t,true);else if(currentHeld.has(t.planId)&&!beforeHeld.has(t.planId))rotate(t);}
 }
 function authorize(person,b,{mutual=false,revoke=false,epoch=true}={}){
  const p=plans.get(b.planId),i=invitations.get(b.invitationId),t=threads.get(b.invitationId);
  const active=[...invitations.values()].find(row=>row.planId===b.planId&&row.status==='accepted');
  if(!p||!i||!t||active?.id!==i.id||i.planId!==p.id||![p.hostId,i.requesterId].includes(person.id))return {error:denied()};
  const limited=unavailable(p.id);if(limited?.error==='plan_cancelled')return {error:limited};
  if(t.terminal||terminal(t))return {error:denied()};if(limited&&!revoke)return {error:limited};
  if(b.instanceId!==undefined&&b.instanceId!==meta().instanceId)return {error:{status:'conflict',error:'fixture_changed'}};
  if(epoch&&b.messagingEpoch!==t.epoch)return {error:{status:'conflict',error:'context_changed'}};
  if(mutual&&!(t.consentHost&&t.consentGuest))return {error:denied()};
  return {t,p};
 }
 function context(person,planId,invitationId){
  const a=authorize(person,{planId,invitationId},{epoch:false});if(a.error)return a.error;const {t,p}=a;
  return {status:'ok',version:p.version,data:{instanceId:meta().instanceId,planId,invitationId,messagingEpoch:t.epoch,messageRevision:t.revision,revisionDomain:domain(t),viewerId:person.id,ownConsent:person.id===t.hostId?t.consentHost:t.consentGuest,mutualConsent:t.consentHost&&t.consentGuest}};
 }
 function read(person,b){
  if(!exact(b,['instanceId','planId','invitationId','messagingEpoch','afterSeq','limit'])||!Number.isSafeInteger(b.afterSeq)||b.afterSeq<0||!Number.isSafeInteger(b.limit)||b.limit<1||b.limit>50)return {status:'rejected',error:'invalid_message_query'};
  const a=authorize(person,b,{mutual:true});if(a.error)return a.error;const {t,p}=a;
  const matching=[...rows.values()].filter(r=>r.invitationId===t.invitationId&&r.epoch===t.epoch&&r.seq>b.afterSeq).sort((x,y)=>x.seq-y.seq),page=matching.slice(0,b.limit);
  return {status:'ok',version:p.version,data:{instanceId:meta().instanceId,planId:p.id,invitationId:t.invitationId,messagingEpoch:t.epoch,messageRevision:t.revision,revisionDomain:domain(t),viewerId:person.id,messages:page.map(({rateAt,...r})=>structuredClone(r)),nextAfterSeq:page.at(-1)?.seq??b.afterSeq,hasMore:matching.length>page.length}};
 }
 function apply(person,endpoint,b){
  if(!validMessageBody(endpoint,b))return {status:'rejected',error:'invalid_message'};
  const a=authorize(person,b,{mutual:endpoint==='message-send',revoke:endpoint==='message-revoke'});if(a.error)return a.error;const {t,p}=a;
  if(t.revision===Number.MAX_SAFE_INTEGER&&endpoint!=='message-revoke')return denied();
  const at=new Date(now()).toISOString();let extra={},outcome;
  if(endpoint==='message-revoke'){rotate(t);outcome='revoked';}
  else if(endpoint==='message-consent'){
   const field=person.id===t.hostId?'consentHost':'consentGuest';if(t[field])return {status:'rejected',error:'already_consented'};
   const count=[...idempotency].filter(([k])=>k.startsWith(person.id+'\u0000message-consent\u0000')).length;if(count>=100)return {status:'rejected',code:'message-limit',error:'local_message_limit'};
   t[field]=true;t.revision++;outcome='consented';
  }else{
   const actorRows=[...rows.values()].filter(r=>r.senderId===person.id),clock=Math.max(meta().clock,now());
   if(t.lastSeq>=100||actorRows.length>=200||actorRows.filter(r=>r.rateAt>clock-60000).length>=10)return {status:'rejected',code:'message-limit',error:'local_message_limit'};
   meta().clock=clock;let messageId;do{messageId='msg-'+randomBytes(16).toString('hex');}while(rows.has(messageId));const seq=t.lastSeq+1;
   rows.set(messageId,{messageId,invitationId:t.invitationId,epoch:t.epoch,seq,senderId:person.id,text:b.text,committedAt:at,rateAt:clock});t.lastSeq=seq;t.revision++;extra={messageId,seq};outcome='stored';
  }
  return {status:'committed',version:p.version,messageRevision:t.revision,revisionDomain:domain(t),data:{operation:endpoint,outcome,instanceId:meta().instanceId,planId:p.id,invitationId:t.invitationId,messagingEpoch:b.messagingEpoch,committedAt:at,...extra}};
 }
 return {context,read,apply,afterCore,held,instanceId:()=>meta().instanceId};
}
