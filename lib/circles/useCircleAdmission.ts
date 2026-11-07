'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { memberSessionDto } from '@/lib/auth/memberDto';
import { createClient } from '@/lib/supabase/client';
import { bindCircleAccess } from './browser-access';
import { circleHeaders } from '@/lib/circles/client';
import { membershipRecord } from './membership';
import { admissionTime, canonicalAdmissionUuid, exactAdmissionKeys, isCircleApprovalCode, isCircleRecipientCode,
  parseCircleAdmissionAccess, parseCircleInvitedJoinReceipt, parseCircleInvitationReview,
  type CircleAdmissionAccess, type CircleInvitationCheck, type CircleInvitationRecovery, type CircleInvitationReview } from './admission';

type Intent = { kind:'issue'; review:CircleInvitationReview; recipientCode:string }
  | { kind:'join'; check:CircleInvitationCheck; invitationToken:string; requestId:string }
  | { kind:'revoke'; body:{expectedMemberId:string;requestId:string;expectedRevision:number;expectedInvitationRevision:number} };
type Pending = { kind:'join'; body:CircleInvitationRecovery } | { kind:'revoke'; body:Extract<Intent,{kind:'revoke'}>['body'] };
type View = {active:boolean;busy:boolean;access:CircleAdmissionAccess|null;account:string;shareConsent:boolean;recipientCode:string;hostCode:string;
  approvalText:string;issuedApproval:string;intent:Intent|null;confirmed:boolean;notice:string;uncertain:boolean;canRecover:boolean};
const initial=():View=>({active:false,busy:false,access:null,account:'',shareConsent:false,recipientCode:'',hostCode:'',approvalText:'',issuedApproval:'',intent:null,confirmed:false,
  notice:'Check your current account and salon access before using an invitation.',uncertain:false,canRecover:false});
class Refusal extends Error { constructor(readonly status:number,readonly outcome:string){super('Invitation request refused');} }

/** Raw codes live only in this view. A retired sent join retains just its
 * account-bound, read-only receipt reference. Nothing enters browser storage. */
export function useCircleAdmission(circleId:string) {
 const [view,setView]=useState<View>(initial);
 const ref=useRef({mounted:false,observing:false,active:true,busy:false,generation:0,epoch:0,owner:null as string|null,
  pending:null as Pending|null,controller:null as AbortController|null,view:initial()});
 const core=ref.current,epoch=core.epoch;
 const publish=useCallback((value:Partial<View>)=>{core.view={...core.view,...value};core.epoch++;if(core.mounted)setView(core.view);},[core]);
 useEffect(()=>{
  core.mounted=true;core.active=document.visibilityState==='visible'&&navigator.onLine!==false;
  core.view={...initial(),active:core.active};setView(core.view);
  const retire=()=>{core.generation++;core.epoch++;core.controller?.abort();core.controller=null;core.busy=false;core.active=false;core.owner=null;
   core.view={...initial(),active:false,uncertain:!!core.pending,notice:core.pending
    ?'Private codes and review cleared. A sent request may still finish. Check the same account to recover its result.'
    :'Private codes, recipient names and review cleared. Check your account again to continue.'};if(core.mounted)setView(core.view);};
  const activate=()=>{if(core.mounted&&core.observing&&document.visibilityState==='visible'&&navigator.onLine!==false){core.active=true;publish({active:true});}};
  const dispose=bindCircleAccess({window,document,subscribeAuth(listener){try{const{data}=createClient().auth.onAuthStateChange(listener);core.observing=true;return()=>data.subscription.unsubscribe();}
   catch{retire();return()=>{};}},onInactive:retire,onActive:activate,onIdentity(){retire();activate();}});
  window.addEventListener('offline',retire);window.addEventListener('online',activate);
  return()=>{core.mounted=false;retire();dispose();window.removeEventListener('offline',retire);window.removeEventListener('online',activate);};
 },[circleId,core,publish]);
 const valid=()=>core.mounted&&core.observing&&core.active&&!core.busy&&core.epoch===epoch&&document.visibilityState==='visible'&&navigator.onLine!==false;
 async function run(kind:'load'|'code'|'hostReview'|'joinReview'|'revokeReview'|'confirm'|'recover') {
  const snapshot=core.view,intent=snapshot.intent,oldOwner=core.owner,hadPending=!!core.pending;
  if(!valid() || core.pending && !['load','recover'].includes(kind) && !(kind==='confirm'&&intent?.kind==='revoke'&&core.pending.kind==='revoke'&&intent.body===core.pending.body))return;
  if(kind==='confirm'&&(!intent||!snapshot.confirmed))return;
  if(kind!=='load'&&(!oldOwner||!snapshot.access))return;
  if(kind==='code'&&!snapshot.shareConsent)return;
  if(kind==='hostReview'&&(!snapshot.access?.canIssue||!isCircleRecipientCode(snapshot.hostCode)))return;
  if(kind==='joinReview'&&!isCircleApprovalCode(snapshot.approvalText))return;
  if(kind==='revokeReview'&&!snapshot.access?.canRevoke)return;
  core.busy=true;const generation=++core.generation,controller=new AbortController();core.controller=controller;
  publish({busy:true,confirmed:false,notice:'Checking the current account and invitation…'});
  const current=()=>core.mounted&&core.active&&core.generation===generation&&!controller.signal.aborted;
  const timer=setTimeout(()=>controller.abort(),15000);
  const aborted=new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('Invitation view retired')),{once:true}));
  let sent=false;
  try{await Promise.race([aborted,(async()=>{
   const headers=new Headers(await circleHeaders());if(!current())return;
   const response=await fetch('/api/auth/member',{headers,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
   if(!current())return;if(response.status!==200)throw Error('Current account unavailable');
   const value=await response.json();if(!current())return;
   const member=memberSessionDto(value?.member),auth=value?.auth;
   if(!member||!canonicalAdmissionUuid(member.id)||!auth||!['wallet','supabase'].includes(auth.provider)||typeof auth.subject!=='string'||!auth.subject)throw Error('Invalid account');
   if(kind!=='load'&&member.id!==oldOwner)throw Error('Account changed');
   if(core.pending&&core.pending.body.expectedMemberId!==member.id){core.owner=null;publish({...initial(),active:true,uncertain:true,notice:'An earlier request belongs to a different account. Return to that account to recover it, or explicitly close this private view. Its result has not been loaded.'});return;}
   core.owner=member.id;
   headers.set('content-type','application/json');headers.set('X-Soe-Expected-Member',member.id);
   async function post(path:string,body:unknown,mutation=false){
    if(!current())throw Error('View retired before transmission');if(mutation)sent=true;
    const r=await fetch(`/api/circles/${circleId}/${path}`,{method:'POST',headers,body:JSON.stringify(body),credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
    if(!current())throw Error('View retired after transmission');const data=await r.json();if(!current())throw Error('View retired');
    if(r.status!==200)throw new Refusal(r.status,membershipRecord(data)&&data.outcome==='not_attempted'?'not_attempted':'unknown');
    return data;
   }
   const access=async()=>{const data=await post('admission-access',{expectedMemberId:member.id});const parsed=parseCircleAdmissionAccess(data,member.id,circleId);
    if(!parsed)throw Error('Access unavailable');return parsed;};
   const common={account:member.display_name,uncertain:!!core.pending,canRecover:!!core.pending};
   if(kind==='load'){const checked=await access();publish({...initial(),active:true,...common,access:checked,notice:core.pending?'Current account checked. Recover the earlier request before another change.':'Current account and salon access checked. Codes are shared only when you explicitly choose.'});return;}
   if(kind==='code'){
    const data=await post('recipient-code',{expectedMemberId:member.id,shareConsent:true});
    if(!membershipRecord(data)||!exactAdmissionKeys(data,['memberId','circleId','recipientCode','expiresAt'])||data.memberId!==member.id||data.circleId!==circleId||!isCircleRecipientCode(data.recipientCode)||!admissionTime(data.expiresAt))throw Error('Invalid sharing code');
    publish({recipientCode:data.recipientCode,shareConsent:false,notice:'Your one-hour sharing code is ready. Give it only to this salon’s host. Creating it has not joined anything.'});return;
   }
   if(kind==='hostReview'){
    const data=await post('invitation-review',{expectedMemberId:member.id,recipientCode:snapshot.hostCode});
    const parsed=parseCircleInvitationReview(data,member.id,circleId,membershipRecord(data)?String(data.targetMemberId):'');
    if(!parsed)throw Error('Recipient review unavailable');publish({intent:{kind:'issue',review:parsed,recipientCode:snapshot.hostCode},notice:'Review this recipient and expiry. No approval has been issued.'});return;
   }
   if(kind==='joinReview'){
    const data=await post('invitation-check',{expectedMemberId:member.id,invitationToken:snapshot.approvalText});
    const checked=parseCircleAdmissionAccess(data,member.id,circleId,true) as CircleInvitationCheck|null;
    if(!checked||!checked.canJoin)throw Error('Joining unavailable');
    publish({access:checked,intent:{kind:'join',check:checked,invitationToken:snapshot.approvalText,requestId:crypto.randomUUID()},notice:'The approval matches this account. Review the salon and confirm before joining.'});return;
   }
   if(kind==='revokeReview'){
    const checked=await access();if(!checked.canRevoke)throw Error('Host access unavailable');publish({access:checked,intent:{kind:'revoke',body:{expectedMemberId:member.id,requestId:crypto.randomUUID(),expectedRevision:checked.revision,expectedInvitationRevision:checked.invitationRevision}},notice:'Review revocation. Existing members stay; outstanding approvals will stop working.'});return;
   }
   if(kind==='recover'){
    const pending=core.pending;if(!pending||pending.body.expectedMemberId!==member.id)throw Error('Recovery unavailable');
    if(pending.kind==='revoke'){publish({intent:{kind:'revoke',body:pending.body},notice:'Review the exact revocation retry. It uses the original request and revisions.'});return;}
    const data=await post('invitation-receipt',pending.body),b=pending.body;
    if(!membershipRecord(data)||!exactAdmissionKeys(data,['memberId','circleId','requestId','approvalNonce','proofHash','expectedRevision','recorded'])
      ||data.memberId!==member.id||data.circleId!==circleId||data.requestId!==b.requestId||data.approvalNonce!==b.approvalNonce||data.proofHash!==b.proofHash||data.expectedRevision!==b.expectedRevision||typeof data.recorded!=='boolean')throw Error('Recovery result unavailable');
    if(data.recorded){core.pending=null;publish({...initial(),active:true,notice:'Your earlier join was recorded. Check current salon access; membership may have changed since then.'});}
    else publish({intent:null,notice:'The join receipt is not visible yet. This does not prove failure. No join was retried; check again later.'});return;
   }
   if(kind==='confirm'&&intent){
    if(intent.kind==='issue'){
     const r=intent.review,id=crypto.randomUUID();const data=await post('invitations',{expectedMemberId:member.id,recipientCode:intent.recipientCode,targetMemberId:r.targetMemberId,requestId:id,
      expectedRevision:r.circleRevision,expectedInvitationRevision:r.invitationRevision,expectedTargetLabel:r.targetLabel,expiresAt:r.expiresAt});
     if(!membershipRecord(data)||!exactAdmissionKeys(data,['memberId','requestId','circleId','targetMemberId','targetLabel','invitationRevision','expiresAt','invitationToken'])
       ||data.memberId!==member.id||data.requestId!==id||data.circleId!==circleId||data.targetMemberId!==r.targetMemberId||data.targetLabel!==r.targetLabel||data.invitationRevision!==r.invitationRevision||data.expiresAt!==r.expiresAt||!isCircleApprovalCode(data.invitationToken))throw Error('Approval result unavailable');
     publish({intent:null,hostCode:'',issuedApproval:data.invitationToken,notice:'Approval code ready for the reviewed recipient. It has not joined anyone. Share it privately with that person.'});return;
    }
    if(intent.kind==='join'){
     const b={expectedMemberId:member.id,requestId:intent.requestId,expectedRevision:intent.check.revision,invitationToken:intent.invitationToken};
     core.pending={kind:'join',body:{expectedMemberId:member.id,requestId:b.requestId,expectedRevision:b.expectedRevision,approvalNonce:intent.check.approvalNonce,proofHash:intent.check.proofHash}};
     publish({intent:null,approvalText:'',uncertain:true,canRecover:false});
     const data=await post('join-invited',b,true);if(!parseCircleInvitedJoinReceipt(data,b,circleId))throw Error('Join receipt unavailable');
     core.pending=null;publish({...initial(),active:true,notice:'Your join was recorded. Check current salon access to see your membership and meeting.'});return;
    }
    core.pending={kind:'revoke',body:intent.body};publish({intent:null,uncertain:true,canRecover:false});
    const data=await post('invitations/revoke',intent.body,true);
    if(!membershipRecord(data)||data.memberId!==member.id||data.requestId!==intent.body.requestId||data.circleId!==circleId||typeof data.replayed!=='boolean'
      ||!membershipRecord(data.receipt)||!exactAdmissionKeys(data.receipt,['action','invitationRevision'])||data.receipt.action!=='revokeInvitations'||data.receipt.invitationRevision!==intent.body.expectedInvitationRevision+1)throw Error('Revocation receipt unavailable');
    core.pending=null;publish({...initial(),active:true,notice:'Revocation recorded. Existing members stay. Check access before issuing another approval.'});
   }
  })()]);}catch(error){if(core.mounted&&core.active&&core.generation===generation){
   if(sent&&!hadPending&&error instanceof Refusal&&error.outcome==='not_attempted')core.pending=null;
   publish({access:null,intent:null,confirmed:false,recipientCode:'',hostCode:'',issuedApproval:'',approvalText:'',account:'',shareConsent:false,
    uncertain:!!core.pending,canRecover:false,notice:core.pending?'The result is uncertain. A sent request may still complete. Check the same account, then recover its result.':'The current account or invitation could not be verified. Check access and review again. No admission is being assumed.'});
  }}finally{clearTimeout(timer);if(core.generation===generation){core.busy=false;core.controller=null;publish({busy:false});}}
 }
 return {...view,
  load:()=>void run('load'),generate:()=>void run('code'),reviewHost:()=>void run('hostReview'),reviewJoin:()=>void run('joinReview'),reviewRevoke:()=>void run('revokeReview'),confirm:()=>void run('confirm'),recover:()=>void run('recover'),
  edit:(field:'hostCode'|'approvalText',value:string)=>{if(valid()&&!core.pending&&!core.view.intent)publish({[field]:value,issuedApproval:''});},
  consent:(shareConsent:boolean)=>{if(valid())publish({shareConsent});},check:(confirmed:boolean)=>{if(valid()&&core.view.intent)publish({confirmed});},
  cancel:()=>{if(valid())publish({intent:null,confirmed:false,notice:core.pending?'The earlier request is still uncertain. Nothing was retried.':'Review cancelled. Nothing was sent.'});},
  close:()=>{if(!valid())return;core.generation++;core.pending=null;core.owner=null;publish({...initial(),active:core.active,notice:'Private view closed. Codes and recovery references were discarded. A previously sent request may still complete.'});},
 };
}
