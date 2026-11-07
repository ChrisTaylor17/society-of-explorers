import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {admissionApp,IDS,requestId} from './support/circle-admission-app.mjs';
import {participationApp} from './support/participation-app.mjs';
import {creationInput} from './support/participation-db.mjs';

test('a host-approved creation on the older database refuses instead of becoming an open Circle',async()=>{
 const f=await participationApp();try{
  f.setActor(IDS.newcomer);
  const before=(await f.db.query('SELECT count(*)::int n FROM book_cohorts')).rows[0].n;
  const response=await f.dispatch('/api/circles','POST',{expectedMemberId:IDS.newcomer,requestId:requestId(),...await creationInput(f.db,{admissionMode:'host_approval'})});
  assert.equal(response.status,400);assert.equal((await response.json()).outcome,'not_attempted');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM book_cohorts')).rows[0].n,before);
 }finally{await f.close();}
});

test('actual admission HTTP routes bind host approval to one account and preserve uncertain join recovery',async t=>{
 const f=await admissionApp();
 try{
  const host=IDS.newcomer,recipient=IDS.reader,outsider=IDS.newcomer2;
  const created=await f.create({host}),circle=created.circleId;
  const path=suffix=>'/api/circles/'+circle+'/'+suffix;
  const post=(suffix,body,headers={})=>f.dispatchAdmission(path(suffix),{body,headers});
  const reviewBody={expectedMemberId:host,targetMemberId:recipient};
  let reviewed,invitation,join;
  const counts=async()=>(await f.db.query('SELECT count(*)::int n FROM book_cohort_members WHERE cohort_id=$1',[circle])).rows[0].n;
  const originalRpc=f.admin.rpc;
  await t.test('origin, account and exact-schema refusals precede private RPC work',async()=>{
   const before=f.calls.length;
   assert.equal((await post('invitation-review',reviewBody,{origin:'https://forged-origin.invalid'})).status,403);
   assert.equal(f.calls.length,before);
   f.setActor(null);assert.equal((await post('invitation-review',reviewBody)).status,401);assert.equal(f.calls.length,before);
   f.setActor(outsider);assert.equal((await post('invitation-review',reviewBody)).status,409);assert.equal(f.calls.length,before);
   f.setActor(host);assert.equal((await post('invitation-review',{...reviewBody,actingHost:host})).status,400);assert.equal(f.calls.length,before);
  });
  await t.test('host review discloses only the requested member label and a bounded expiry',async()=>{
   f.setActor(host);const response=await post('invitation-review',reviewBody);assert.equal(response.status,200);
   assert.match(response.headers.get('cache-control'),/no-store/);
   reviewed=await response.json();assert.equal(reviewed.memberId,host);assert.equal(reviewed.targetMemberId,recipient);
   assert.equal(reviewed.circleId,circle);assert.equal(reviewed.invitationRevision,1);assert.ok(Date.parse(reviewed.expiresAt)>Date.now());
   assert.equal(reviewed.targetLabel.includes('@'),false);assert.equal(JSON.stringify(reviewed).includes('PRIVATE_SYNTHETIC_ROOM'),false);
  });
  function issueInput(overrides={}){return{expectedMemberId:host,targetMemberId:recipient,requestId:requestId(),expectedRevision:reviewed.circleRevision,
   expectedInvitationRevision:reviewed.invitationRevision,expectedTargetLabel:reviewed.targetLabel,expiresAt:reviewed.expiresAt,...overrides};}
  await t.test('changed target/expiry and a sign-out while review is held issue no token',async()=>{
   const changed=await post('invitations',issueInput({expectedTargetLabel:'A different reviewed person'}));assert.equal(changed.status,409);assert.equal('invitationToken' in await changed.json(),false);
   assert.equal((await post('invitations',issueInput({expiresAt:new Date(Date.now()+2*86400000).toISOString()}))).status,409);
   f.admin.rpc=async(name,args)=>{const result=await originalRpc(name,args);if(name==='soe_circle_invitation_review')f.setActor(null);return result;};
   const stale=await post('invitations',issueInput());assert.equal(stale.status,401);assert.equal('invitationToken' in await stale.json(),false);
   f.admin.rpc=originalRpc;f.setActor(host);
  });
  await t.test('a reviewed host issues a recipient-bound token without inserting a member',async()=>{
   reviewed=await(await post('invitation-review',reviewBody)).json();
   const response=await post('invitations',issueInput({expiresAt:new Date(Date.now()+3500).toISOString()}));assert.equal(response.status,200);
   invitation=await response.json();assert.match(invitation.invitationToken,/^soe-ci1\./);assert.match(response.headers.get('cache-control'),/no-store/);
   assert.equal(invitation.targetMemberId,recipient);assert.equal(invitation.memberId,host);assert.equal(await counts(),1);
   join={expectedMemberId:recipient,requestId:requestId(),expectedRevision:await f.revision(circle),invitationToken:invitation.invitationToken};
  });
  await t.test('forwarded, tampered and wrong-salon tokens never reach the membership RPC',async()=>{
   f.setActor(outsider);let before=f.calls.length;
   assert.equal((await post('join-invited',{...join,expectedMemberId:outsider})).status,403);assert.equal(f.calls.length,before);
   f.setActor(recipient);before=f.calls.length;
   const parts=invitation.invitationToken.split('.');const data=JSON.parse(Buffer.from(parts[1],'base64url').toString());data.memberId=outsider;
   const tampered=parts[0]+'.'+Buffer.from(JSON.stringify(data)).toString('base64url')+'.'+parts[2];
   assert.equal((await post('join-invited',{...join,invitationToken:tampered})).status,403);
   assert.equal((await f.dispatchAdmission('/api/circles/'+IDS.circle+'/join-invited',{body:join})).status,403);
   assert.equal(f.calls.length,before);assert.equal(await counts(),1);
  });
  await t.test('current and legacy HTTP join aliases cannot bypass a host-approved invitation',async()=>{
   f.setActor(recipient);const revision=await f.revision(circle);
   const direct=await f.dispatch('/api/circles/'+circle+'/join','POST',{requestId:requestId(),expectedRevision:revision});assert.equal(direct.status,403);
   const legacy=await f.dispatch('/api/book-salons/join','POST',{cohortId:circle,requestId:requestId(),expectedRevision:revision});assert.equal(legacy.status,403);
   assert.equal(await counts(),1);const detail=await(await f.dispatch('/api/circles/'+circle)).json();assert.equal(detail.online_url,null);
  });
  await t.test('a committed lost reply remains unknown and an exact retry reveals current membership',async()=>{
   f.setActor(recipient);let lost=true;
   f.admin.rpc=async(name,args)=>{const result=await originalRpc(name,args);if(name==='soe_circle_join_invited'&&lost){lost=false;throw Error('Synthetic reply lost after commit');}return result;};
   const uncertain=await post('join-invited',join);assert.equal(uncertain.status,503);assert.equal((await uncertain.json()).outcome,'unknown');assert.equal(await counts(),2);
   f.admin.rpc=originalRpc;const retried=await post('join-invited',join);assert.equal(retried.status,200);const result=await retried.json();
   assert.equal(result.memberId,recipient);assert.equal(result.replayed,true);assert.equal(result.state.isMember,true);
   const detail=await(await f.dispatch('/api/circles/'+circle)).json();assert.equal(detail.online_url,'https://meeting.example.invalid/PRIVATE_SYNTHETIC_ROOM');
   const discussion=await f.dispatchAdmission(path('discussion'),{method:'GET'});assert.equal(discussion.status,200);
  });
  await t.test('expired exact retry settles an old join after leaving without granting a new membership',async()=>{
   const leave=await f.dispatch('/api/circles/'+circle+'/leave','POST',{requestId:requestId(),expectedRevision:await f.revision(circle)});assert.equal(leave.status,200);assert.equal(await counts(),1);
   await delay(Math.max(0,Date.parse(invitation.expiresAt)-Date.now()+30));
   const retried=await post('join-invited',join);assert.equal(retried.status,200);const result=await retried.json();
   assert.equal(result.receipt.joined,true);assert.equal(result.state.isMember,false);assert.equal(result.replayed,true);assert.equal(await counts(),1);
   const fresh=await post('join-invited',{...join,requestId:requestId(),expectedRevision:await f.revision(circle)});assert.equal(fresh.status,403);assert.equal(await counts(),1);
   const discussion=await f.dispatchAdmission(path('discussion'),{method:'GET'});assert.equal(discussion.status,403);
  });
  await t.test('host revocation fences a newly issued token at the actual join route',async()=>{
   f.setActor(host);reviewed=await(await post('invitation-review',reviewBody)).json();
   const issued=await post('invitations',issueInput());assert.equal(issued.status,200);const next=await issued.json();
   const body={expectedMemberId:host,requestId:requestId(),expectedRevision:await f.revision(circle),expectedInvitationRevision:1};
   const response=await post('invitations/revoke',body);assert.equal(response.status,200);const revoked=await response.json();assert.equal(revoked.invitationRevision,2);
   const replay=await post('invitations/revoke',body);assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
   f.setActor(recipient);const refused=await post('join-invited',{...join,invitationToken:next.invitationToken,requestId:requestId(),expectedRevision:await f.revision(circle)});
   assert.equal(refused.status,403);assert.equal(await counts(),1);
  });
  await t.test('signed-out post-commit response stays unknown and recovery uses the same key',async()=>{
   f.setActor(host);reviewed=await(await post('invitation-review',reviewBody)).json();
   const next=await(await post('invitations',issueInput())).json();
   f.setActor(recipient);const body={...join,invitationToken:next.invitationToken,requestId:requestId(),expectedRevision:await f.revision(circle)};
   f.admin.rpc=async(name,args)=>{const result=await originalRpc(name,args);if(name==='soe_circle_join_invited')f.setActor(null);return result;};
   const response=await post('join-invited',body);assert.equal(response.status,401);assert.equal((await response.json()).outcome,'unknown');assert.equal(await counts(),2);
   f.admin.rpc=originalRpc;f.setActor(recipient);const recovered=await post('join-invited',body);assert.equal(recovered.status,200);assert.equal((await recovered.json()).replayed,true);
  });
  await t.test('malformed successful receipts remain unknown instead of confirming admission',async()=>{
   f.setActor(recipient);const left=await f.dispatch('/api/circles/'+circle+'/leave','POST',{requestId:requestId(),expectedRevision:await f.revision(circle)});assert.equal(left.status,200);
   f.setActor(host);reviewed=await(await post('invitation-review',reviewBody)).json();
   const next=await(await post('invitations',issueInput())).json();
   f.setActor(recipient);const body={...join,invitationToken:next.invitationToken,requestId:requestId(),expectedRevision:await f.revision(circle)};
   f.admin.rpc=async(name,args)=>{const result=await originalRpc(name,args);return name==='soe_circle_join_invited'&&!result.error?{data:{...result.data,memberId:outsider},error:null}:result;};
   const response=await post('join-invited',body);assert.equal(response.status,503);assert.equal((await response.json()).outcome,'unknown');assert.equal(await counts(),2);
   f.admin.rpc=originalRpc;const recovery=await post('join-invited',body);assert.equal(recovery.status,200);assert.equal((await recovery.json()).replayed,true);
  });
  await t.test('missing signing configuration refuses issuance without a membership write',async()=>{
   f.setActor(host);const otherBody={expectedMemberId:host,targetMemberId:outsider};
   const response=await post('invitation-review',otherBody);assert.equal(response.status,200);const other=await response.json();
   const originalSecret=f.app.context.process.env.NEXTAUTH_SECRET;f.app.context.process.env.NEXTAUTH_SECRET='';
   try{
    const result=await post('invitations',{expectedMemberId:host,targetMemberId:outsider,requestId:requestId(),expectedRevision:other.circleRevision,
     expectedInvitationRevision:other.invitationRevision,expectedTargetLabel:other.targetLabel,expiresAt:other.expiresAt});
    assert.equal(result.status,503);const data=await result.json();assert.equal(data.outcome,'not_attempted');assert.equal('invitationToken' in data,false);assert.equal(await counts(),2);
   }finally{f.app.context.process.env.NEXTAUTH_SECRET=originalSecret;}
  });
 }finally{await f.close();}
});
