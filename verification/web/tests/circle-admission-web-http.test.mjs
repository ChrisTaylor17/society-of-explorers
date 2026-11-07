import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {admissionApp,IDS,requestId} from './support/circle-admission-app.mjs';

test('owner-shared recipient codes and token-free receipts use actual routes and SQL',async()=>{
 const f=await admissionApp();try{
  const host=IDS.newcomer,member=IDS.reader,other=IDS.newcomer2,circle=(await f.create({host})).circleId;
  const post=(name,body)=>f.dispatchAdmission('/api/circles/'+circle+'/'+name,{body});
  const count=async()=>(await f.db.query('SELECT count(*)::int n FROM book_cohort_members WHERE cohort_id=$1',[circle])).rows[0].n;
  f.setActor(member);assert.equal((await post('recipient-code',{expectedMemberId:member,shareConsent:false})).status,400);
  const generated=await(await post('recipient-code',{expectedMemberId:member,shareConsent:true})).json();assert.equal(generated.memberId,member);assert.equal(generated.circleId,circle);assert.match(generated.recipientCode,/^soe-cr1\./);
  const before=f.calls.length;f.setActor(host);
  assert.equal((await post('invitation-review',{expectedMemberId:host,targetMemberId:member})).status,400);
  assert.equal((await post('invitation-review',{expectedMemberId:host,recipientCode:generated.recipientCode.slice(0,-2)+'aa'})).status,403);assert.equal(f.calls.length,before);
  assert.equal((await f.dispatchAdmission('/api/circles/'+IDS.circle+'/invitation-review',{body:{expectedMemberId:host,recipientCode:generated.recipientCode}})).status,403);
  const review=await(await post('invitation-review',{expectedMemberId:host,recipientCode:generated.recipientCode})).json();assert.equal(review.targetMemberId,member);
  const issued=await post('invitations',{expectedMemberId:host,recipientCode:generated.recipientCode,targetMemberId:member,requestId:requestId(),
   expectedRevision:review.circleRevision,expectedInvitationRevision:review.invitationRevision,expectedTargetLabel:review.targetLabel,expiresAt:review.expiresAt});
  assert.equal(issued.status,200);const approval=await issued.json();f.setActor(member);
  const access=await post('admission-access',{expectedMemberId:member});assert.equal(access.status,200);assert.equal((await access.json()).canIssue,false);
  const check=await post('invitation-check',{expectedMemberId:member,invitationToken:approval.invitationToken});assert.equal(check.status,200);
  const ready=await check.json();assert.equal(ready.canJoin,true);assert.equal(ready.memberId,member);assert.equal(JSON.stringify(ready).includes('PRIVATE_SYNTHETIC_ROOM'),false);
  const join={expectedMemberId:member,requestId:requestId(),expectedRevision:ready.revision,invitationToken:approval.invitationToken};
  const recovery={expectedMemberId:member,requestId:join.requestId,expectedRevision:join.expectedRevision,approvalNonce:ready.approvalNonce,proofHash:ready.proofHash};
  const missing=await post('invitation-receipt',recovery);assert.equal(missing.status,200);assert.equal((await missing.json()).recorded,false);assert.equal(await count(),1);
  const original=f.admin.rpc;f.admin.rpc=async(name,args)=>{const result=await original(name,args);if(name==='soe_circle_join_invited')throw Error('synthetic post-commit loss');return result;};
  const lost=await post('join-invited',join);assert.equal(lost.status,503);assert.equal((await lost.json()).outcome,'unknown');f.admin.rpc=original;assert.equal(await count(),2);
  const secret=f.app.context.process.env.NEXTAUTH_SECRET;f.app.context.process.env.NEXTAUTH_SECRET='';
  try{
   const found=await post('invitation-receipt',recovery);assert.equal(found.status,200);assert.equal((await found.json()).recorded,true);assert.match(found.headers.get('cache-control'),/no-store/);assert.equal(await count(),2);
   assert.equal((await post('invitation-receipt',{...recovery,proofHash:'0'.repeat(64)})).status,409);
   f.setActor(other);assert.equal((await post('invitation-receipt',recovery)).status,409);
   const foreign=await post('invitation-receipt',{...recovery,expectedMemberId:other});assert.equal(foreign.status,200);assert.equal((await foreign.json()).recorded,false);
   f.setActor(null);assert.equal((await post('invitation-receipt',recovery)).status,401);
  }finally{f.app.context.process.env.NEXTAUTH_SECRET=secret;}
  f.setActor(member);assert.equal((await f.dispatch('/api/circles/'+circle+'/leave','POST',{requestId:requestId(),expectedRevision:await f.revision(circle)})).status,200);
  assert.equal((await(await post('invitation-receipt',recovery)).json()).recorded,true);assert.equal(await count(),1);
  assert.equal(f.calls.filter(x=>x.table==='circle_participation_receipts').every(x=>x.mode==='select'&&x.columns==='actor_member_id,request_id,cohort_id,payload,receipt'&&x.filters.length===3),true);
 }finally{await f.close();}
});

test('recipient consent expiry during async host review refuses both labels and issuance',async()=>{
 const f=await admissionApp();try{
  const host=IDS.newcomer,member=IDS.reader,circle=(await f.create({host})).circleId;
  const post=(name,body)=>f.dispatchAdmission('/api/circles/'+circle+'/'+name,{body});
  f.setActor(member);const generated=await(await post('recipient-code',{expectedMemberId:member,shareConsent:true})).json();f.setActor(host);
  const input={expectedMemberId:host,recipientCode:generated.recipientCode},review=await(await post('invitation-review',input)).json();
  const original=f.admin.rpc,realNow=Date.now();
  f.admin.rpc=async(name,args)=>{const result=await original(name,args);if(name==='soe_circle_invitation_review')vm.runInContext('Date.now=()=>'+(realNow+2*3600000),f.app.context);return result;};
  let response=await post('invitation-review',input);assert.equal(response.status,403);assert.equal('targetLabel' in await response.json(),false);
  vm.runInContext('Date.now=()=>'+realNow,f.app.context);
  response=await post('invitations',{...input,targetMemberId:member,requestId:requestId(),expectedRevision:review.circleRevision,
   expectedInvitationRevision:review.invitationRevision,expectedTargetLabel:review.targetLabel,expiresAt:review.expiresAt});
  assert.equal(response.status,403);assert.equal('invitationToken' in await response.json(),false);
 }finally{await f.close();}
});
