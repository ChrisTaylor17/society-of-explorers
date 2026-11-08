import test from 'node:test';
import assert from 'node:assert/strict';
import {admissionApp,IDS,requestId} from './support/circle-admission-app.mjs';
import {sourceLoader} from '../../../platforms/tests/load-source.mjs';

async function fixture(){
 const app=await admissionApp(),load=sourceLoader(),origin='https://offline.invalid';
 const created=await app.create(),circle=created.circleId,host=IDS.newcomer,recipient=IDS.reader;
 let actor=recipient,lost=null,hold=null;
 const calls=[],listeners=new Set(),sessions=[];
 const owner={scope:()=> 'synthetic-invitation-owner',credentials:async()=>({bearer:'NONISSUED_SYNTHETIC_INVITATION',subject:actor}),
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
 const lane=async(url,init)=>{
  const path=new URL(url).pathname;calls.push({path,method:init.method,body:init.body});
  const sendingActor=actor;app.setActor(sendingActor);
  if(path==='/api/auth/member')return {url,redirected:false,status:200,json:async()=>({member:{id:sendingActor,display_name:'Synthetic '+(sendingActor===host?'Host':'Recipient'),supabase_auth_id:sendingActor},auth:{provider:'supabase',subject:sendingActor}})};
  const response=await app.dispatchAdmission(path,{method:init.method,body:JSON.parse(init.body)});
  const data=await response.json();
  if(hold?.path===path){const waiting=hold;hold=null;waiting.enter();await waiting.promise;}
  if(lost===path){lost=null;throw Error('Synthetic post-commit reply loss');}
  return {url,redirected:false,status:response.status,json:async()=>data};
 };
 const make=memberId=>{
  const session=load('platforms/shared/circle-admission.ts').createCircleAdmission({origin,circleId:circle,memberId,owner,transport:lane,admissionTransport:lane,newRequestId:async()=>requestId(),initialOnline:true,timeoutMs:1000});
  sessions.push(session);session.connect();return session;
 };
 async function prepare(){
  actor=recipient;const reader=make(recipient);await reader.check();
  await reader.generate();assert.equal(calls.filter(v=>v.path.endsWith('/recipient-code')).length,0,'code requires consent');
  reader.consent(true);await reader.generate();const code=reader.model().recipientCode;assert.match(code,/^soe-cr1\./);
  actor=host;const hosting=make(host);await hosting.check();hosting.edit('hostCode',code);await hosting.reviewHost();
  assert.equal(hosting.model().review.kind,'issue');assert.equal(hosting.model().review.recipient.targetMemberId,recipient);
  await hosting.send();assert.equal(hosting.model().issuedApproval,'','issue requires confirmation');
  hosting.confirm(true);await hosting.send();const token=hosting.model().issuedApproval;assert.match(token,/^soe-ci1\./);
  actor=recipient;reader.edit('approvalText',token);await reader.reviewJoin();assert.equal(reader.model().review.kind,'join');
  return {reader,hosting,token};
 }
 return {app,circle,host,recipient,calls,make,prepare,
  actor(value,notify=false){actor=value;if(notify)for(const fn of [...listeners])fn();},
  lose(action){lost='/api/circles/'+circle+'/'+action;},
  hold(action){let release,enter;const entered=new Promise(r=>{enter=r;});hold={path:'/api/circles/'+circle+'/'+action,promise:new Promise(r=>{release=r;}),enter};return{entered,release};},
  async close(){for(const session of sessions)session.close();await app.close();}};
}
test('native admission controller uses real sharing/review/approval/join routes and SQL with separate confirmations',async()=>{
 const f=await fixture();try{
  const {reader}=await f.prepare();
  assert.equal(f.calls.filter(v=>v.path.endsWith('/join-invited')).length,0);
  await reader.send();assert.equal(f.calls.filter(v=>v.path.endsWith('/join-invited')).length,0);
  reader.confirm(true);await reader.send();assert.match(reader.model().message,/join was recorded/);
  assert.equal(reader.model().uncertain,false);assert.equal(reader.model().approvalText,'');assert.equal(reader.model().review,null);
  assert.equal((await f.app.db.query('SELECT count(*)::int n FROM book_cohort_members WHERE cohort_id=$1',[f.circle])).rows[0].n,2);
  assert(f.calls.every(c=>!c.path.includes('soe-ci1')&&!c.path.includes('soe-cr1')));
 }finally{await f.close();}
});
test('lost native join reply survives retirement with only read-only receipt recovery; another account cannot load it',async()=>{
 const f=await fixture();try{
  const {reader}=await f.prepare();f.lose('join-invited');reader.confirm(true);await reader.send();
  assert.equal(reader.model().uncertain,true);assert.equal(reader.model().access,null);
  reader.activity(false);reader.disconnect();assert.equal(reader.model().recipientCode,'');assert.equal(reader.model().approvalText,'');assert.equal(reader.model().review,null);
  reader.connect();reader.activity(true);f.actor(f.host,true);await reader.check();
  assert.equal(reader.model().access,null);assert.equal(reader.model().account,'');assert.equal(reader.model().canRecover,false);
  assert.equal(f.calls.filter(c=>c.path.endsWith('/invitation-receipt')).length,0);
  f.actor(f.recipient,true);await reader.check();assert.equal(reader.model().canRecover,true);await reader.recover();
  assert.match(reader.model().message,/earlier join was recorded/);assert.equal(reader.model().uncertain,false);
  assert.equal(f.calls.filter(c=>c.path.endsWith('/join-invited')).length,1);
  const receipt=JSON.parse(f.calls.find(c=>c.path.endsWith('/invitation-receipt')).body);
  assert.deepEqual(Object.keys(receipt),['expectedMemberId','requestId','expectedRevision','approvalNonce','proofHash']);
  assert.equal(JSON.stringify(receipt).includes('soe-ci1'),false);
 }finally{await f.close();}
});
test('interrupted native revocation retries the exact body and advances once while preserving members',async()=>{
 const f=await fixture();try{
  const {reader,hosting}=await f.prepare();reader.confirm(true);await reader.send();
  f.actor(f.host);await hosting.check();await hosting.reviewRevoke();hosting.confirm(true);f.lose('invitations/revoke');await hosting.send();
  assert.equal(hosting.model().uncertain,true);hosting.activity(false);hosting.activity(true);await hosting.check();await hosting.recover();
  assert.equal(hosting.model().review.kind,'revoke');assert.equal(hosting.model().review.retry,true);hosting.confirm(true);await hosting.send();assert.equal(hosting.model().uncertain,false);
  const sends=f.calls.filter(c=>c.path.endsWith('/invitations/revoke'));assert.equal(sends.length,2);assert.equal(sends[0].body,sends[1].body);
  const body=JSON.parse(sends[0].body),row=(await f.app.db.query('SELECT circle_invitation_revision r FROM book_cohorts WHERE id=$1',[f.circle])).rows[0];
  assert.equal(Number(row.r),body.expectedInvitationRevision+1);
  assert.equal((await f.app.db.query('SELECT count(*)::int n FROM book_cohort_members WHERE cohort_id=$1',[f.circle])).rows[0].n,2);
 }finally{await f.close();}
});
test('backgrounding while a join reply is held never republishes the reply or retries the mutation',async()=>{
 const f=await fixture();try{
  const {reader}=await f.prepare(),held=f.hold('join-invited');reader.confirm(true);const sending=reader.send();await held.entered;
  reader.activity(false);held.release();await sending;assert.equal(reader.model().access,null);assert.equal(reader.model().review,null);assert.equal(reader.model().uncertain,true);
  reader.activity(true);await reader.check();await reader.recover();assert.match(reader.model().message,/earlier join was recorded/);
  assert.equal(f.calls.filter(c=>c.path.endsWith('/join-invited')).length,1);
 }finally{await f.close();}
});
test('terminal close clears a retained result reference and prevents any further operation',async()=>{
 const f=await fixture();try{
  const {reader}=await f.prepare();f.lose('join-invited');reader.confirm(true);await reader.send();reader.close();
  const count=f.calls.length;reader.connect();reader.activity(true);reader.connectivity(true);await reader.check();await reader.recover();
  assert.equal(reader.model().closed,true);assert.equal(reader.model().uncertain,false);assert.equal(reader.model().canCheck,false);assert.equal(f.calls.length,count);
 }finally{await f.close();}
});
