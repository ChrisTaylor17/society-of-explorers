import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {participationApp, IDS} from './support/participation-app.mjs';
import {creationInput, rpc, asRole, requestId} from './support/participation-db.mjs';

const source=name=>readFile(new URL('../../../'+name,import.meta.url),'utf8');
const denied=code=>error=>error.code===code;

test('member-bound admission SQL closes raw/legacy grants and preserves explicit receipt recovery',async t=>{
 const f=await participationApp(),db=f.db;
 try{
  await db.exec('ALTER TABLE public.members ADD COLUMN supabase_auth_id uuid UNIQUE, ADD COLUMN wallet_address text; UPDATE public.members SET supabase_auth_id=id;');
  for(const name of ['account-deletion-requests-apply.sql','account-erasure-access-apply.sql'])
   await db.exec(await source('docs/sql/'+name));
  const revision=async id=>Number((await db.query('SELECT circle_participation_revision n FROM book_cohorts WHERE id=$1',[id])).rows[0].n);
  const members=async id=>(await db.query('SELECT member_id FROM book_cohort_members WHERE cohort_id=$1 ORDER BY member_id',[id])).rows.map(x=>x.member_id);
  const host=IDS.newcomer,recipient=IDS.reader,outsider=IDS.newcomer2;
  await t.test('calibrate pre-change raw service membership authority',async()=>{
   await asRole(db,'service_role',tx=>tx.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[IDS.circle,outsider]));
   assert.ok((await members(IDS.circle)).includes(outsider));
   await db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2',[IDS.circle,outsider]);
  });
  try{await db.exec(await source('docs/sql/circle-admission-apply.sql'));}catch(e){await db.exec('ROLLBACK');throw e;}
  const privateUrl='https://meeting.example.invalid/PRIVATE_SYNTHETIC_ROOM';
  const input=await creationInput(db,{format:'online',city:null,region:null,venueName:null,venueType:'online',onlineUrl:privateUrl,admissionMode:'host_approval'});
  const created=await rpc(db,'soe_circle_create',[host,requestId(),input]);
  const circle=created.circleId;
  assert.deepEqual(await members(circle),[host]);
  let invitation;
  const redeem=({actor=recipient,hostId=host,epoch=1,nonce=requestId(),hash='a'.repeat(64),expiry=new Date(Date.now()+3600000).toISOString(),key=requestId(),expected}={})=>
   revision(circle).then(current=>rpc(db,'soe_circle_join_invited',[actor,circle,expected??current,key,hostId,epoch,nonce,hash,expiry]));
  await t.test('private creation, forwarding boundary and raw/legacy SQL bypass refusals',async()=>{
   const row=(await db.query('SELECT circle_admission_mode mode,circle_invitation_revision version FROM book_cohorts WHERE id=$1',[circle])).rows[0];
   assert.equal(row.mode,'host_approval');assert.equal(Number(row.version),1);
   f.setActor(recipient);
   const response=await f.dispatch('/api/circles/'+circle);assert.equal(response.status,200);
   const detail=await response.json();assert.equal(detail.capabilities.canJoin,false);assert.equal(detail.online_url,null);
   assert.equal(JSON.stringify(detail).includes(privateUrl),false);
   await assert.rejects(rpc(db,'soe_circle_join',[recipient,circle,await revision(circle),requestId()]),denied('PT403'));
   await assert.rejects(asRole(db,'service_role',tx=>tx.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[circle,recipient])),denied('42501'));
   await assert.rejects(asRole(db,'service_role',tx=>tx.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2) ON CONFLICT(cohort_id,member_id) DO UPDATE SET member_id=excluded.member_id',[circle,recipient])),denied('42501'));
   await assert.rejects(asRole(db,'service_role',tx=>tx.query('UPDATE book_cohort_members SET member_id=$1 WHERE cohort_id=$2',[recipient,circle])),denied('42501'));
   await assert.rejects(asRole(db,'service_role',tx=>tx.query("UPDATE book_cohorts SET circle_admission_mode='open' WHERE id=$1",[circle])),denied('42501'));
   await assert.rejects(asRole(db,'service_role',tx=>tx.query('UPDATE book_cohorts SET circle_invitation_revision=2 WHERE id=$1',[circle])),denied('42501'));
   for(const role of ['anon','authenticated']){
    await assert.rejects(rpc(db,'soe_circle_invitation_review',[host,circle,recipient],role),denied('42501'));
    await assert.rejects(rpc(db,'soe_circle_join_invited',[recipient,circle,await revision(circle),requestId(),host,1,requestId(),'a'.repeat(64),new Date(Date.now()+3600000).toISOString()],role),denied('42501'));
   }
   assert.deepEqual(await members(circle),[host]);
  });
  await t.test('only current host can review a target; wrong host/version/expiry attestations refuse',async()=>{
   await assert.rejects(rpc(db,'soe_circle_invitation_review',[outsider,circle,recipient]),denied('PT404'));
   const proof=await rpc(db,'soe_circle_invitation_review',[host,circle,recipient]);
   assert.equal(proof.memberId,host);assert.equal(proof.targetMemberId,recipient);assert.equal(proof.invitationRevision,1);
   assert.equal(proof.targetLabel.includes('@'),false);assert.deepEqual(Object.keys(proof).sort(),['memberId','circleId','circleRevision','invitationRevision','targetMemberId','targetLabel'].sort());
   await assert.rejects(redeem({hostId:outsider}),denied('PT403'));
   await assert.rejects(redeem({epoch:2}),denied('PT403'));
   await assert.rejects(redeem({expiry:new Date(Date.now()-1000).toISOString()}),denied('PT403'));
   await assert.rejects(redeem({expiry:new Date(Date.now()+172800000).toISOString()}),denied('PT403'));
   assert.deepEqual(await members(circle),[host]);
  });
  await t.test('one reviewed invitation joins once; current access differs from an old receipt after leaving',async()=>{
   invitation={key:requestId(),nonce:requestId(),hash:'b'.repeat(64),expected:await revision(circle),expiry:new Date(Date.now()+3600000).toISOString()};
   const result=await redeem(invitation);assert.equal(result.receipt.action,'join');assert.equal(result.state.isMember,true);assert.equal(result.replayed,false);
   f.setActor(recipient);const detail=await(await f.dispatch('/api/circles/'+circle)).json();
   assert.equal(detail.online_url,privateUrl);assert.equal(detail.capabilities.canReadConversation,true);
   const retried=await redeem(invitation);assert.equal(retried.replayed,true);assert.equal(retried.state.isMember,true);
   await assert.rejects(redeem({...invitation,hash:'c'.repeat(64)}),denied('PT409'));
   await rpc(db,'soe_circle_leave',[recipient,circle,await revision(circle),requestId()]);
   const before=await members(circle);assert.equal(before.includes(recipient),false);
   await assert.rejects(redeem({...invitation,key:requestId(),expected:await revision(circle)}),denied('PT409'));
   const old=await redeem(invitation);assert.equal(old.receipt.joined,true);assert.equal(old.replayed,true);assert.equal(old.state.isMember,false);
   assert.deepEqual(await members(circle),before);
   const payload=(await db.query('SELECT payload::text p FROM circle_participation_receipts WHERE actor_member_id=$1 AND request_id=$2',[recipient,invitation.key])).rows[0].p;
   assert.equal(payload.includes('invitationToken'),false);assert.equal(payload.includes(host),false);
  });
  await t.test('host revocation fences old invitations without evicting a member or redoing a retry',async()=>{
   const key=requestId(),before=await revision(circle);
   const result=await rpc(db,'soe_circle_invitation_revoke',[host,circle,before,1,key]);
   assert.equal(result.receipt.action,'revokeInvitations');assert.equal(result.invitationRevision,2);
   const retried=await rpc(db,'soe_circle_invitation_revoke',[host,circle,before,1,key]);
   assert.equal(retried.replayed,true);assert.equal(retried.invitationRevision,2);
   await assert.rejects(redeem({actor:outsider,epoch:1}),denied('PT403'));
   await assert.rejects(rpc(db,'soe_circle_invitation_revoke',[outsider,circle,await revision(circle),2,requestId()]),denied('PT403'));
   const joined=await redeem({actor:outsider,epoch:2});assert.equal(joined.state.isMember,true);
   await rpc(db,'soe_circle_invitation_revoke',[host,circle,await revision(circle),2,requestId()]);
   assert.ok((await members(circle)).includes(outsider));
  });
  await t.test('open Circle creation/join/leave remains usable through the controlled functions',async()=>{
   const open=await rpc(db,'soe_circle_create',[recipient,requestId(),await creationInput(db)]);
   const joined=await rpc(db,'soe_circle_join',[host,open.circleId,await revision(open.circleId),requestId()]);
   assert.equal(joined.state.isMember,true);
   await rpc(db,'soe_circle_leave',[host,open.circleId,await revision(open.circleId),requestId()]);
   assert.equal((await members(open.circleId)).includes(host),false);
  });
  await t.test('ordinary book salons retain their join path after raw grants close and cannot reach Circles',async()=>{
   f.setActor(recipient);
   const response=await f.dispatch('/api/book-salons/join','POST',{cohortId:IDS.salon});
   assert.equal(response.status,200);assert.deepEqual(await response.json(),{joined:true});
   assert.ok((await members(IDS.salon)).includes(recipient));
   await assert.rejects(rpc(db,'soe_circle_legacy_salon_join',[recipient,circle]),denied('PT403'));
   for(const role of ['anon','authenticated'])await assert.rejects(rpc(db,'soe_circle_legacy_salon_join',[outsider,IDS.salon],role),denied('42501'));
   assert.equal((await members(circle)).includes(recipient),false);
  });
  await t.test('an account-removal guard stops invitation review and redemption for a captured host',async()=>{
   const request=requestId();
   await asRole(db,'service_role',async tx=>tx.query("SELECT public.soe_account_deletion_request('supabase',$1,$2,$3,30)",[host,request,'f'.repeat(64)]));
   await db.query('SELECT soe_account_deletion_private.start_erasure($1,$2,$3)',[request,host,host]);
   await assert.rejects(rpc(db,'soe_circle_invitation_review',[host,circle,recipient]),denied('PT403'));
   await assert.rejects(redeem({epoch:3}),denied('PT403'));
   await assert.rejects(rpc(db,'soe_circle_legacy_salon_join',[host,IDS.salon]),denied('PT403'));
   assert.equal((await members(circle)).includes(recipient),false);
  });
  await t.test('rollback closes new private admissions and preserves receipts, members and open operations',async()=>{
   const before=await members(circle),receipts=(await db.query('SELECT count(*)::int n FROM circle_participation_receipts')).rows[0].n;
   await db.exec(await source('docs/sql/circle-admission-rollback.sql'));
   await assert.rejects(redeem({epoch:3}),denied('PT503'));
   const old=await redeem(invitation);assert.equal(old.replayed,true);assert.equal(old.state.isMember,false);
   await assert.rejects(rpc(db,'soe_circle_create',[IDS.author,requestId(),await creationInput(db,{admissionMode:'host_approval'})]),denied('PT503'));
   const open=await rpc(db,'soe_circle_create',[IDS.author,requestId(),await creationInput(db)]);assert.equal(open.state.isMember,true);
   assert.deepEqual(await members(circle),before);
   assert.equal((await db.query('SELECT count(*)::int n FROM circle_participation_receipts')).rows[0].n,receipts+1);
  });
 }finally{await f.close();}
});
