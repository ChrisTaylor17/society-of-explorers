import test from 'node:test';
import assert from 'node:assert/strict';
import {admissionApp,IDS,requestId} from './support/circle-admission-app.mjs';
import {sourceLoader} from '../../../platforms/tests/load-source.mjs';

test('native controller/ports create once, recover and execute real admission routes/SQL',async()=>{
 const f=await admissionApp(),load=sourceLoader();let session;
 try{
  const origin='https://offline.invalid',member=IDS.newcomer,reader=IDS.reader,generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let actor=member,lost=true;const sent=[];
  const owner={scope:()=> 'synthetic-native-owner',credentials:async()=>({bearer:'NONISSUED_SYNTHETIC_NATIVE',subject:actor}),subscribe:()=>()=>{}};
  const bridge={capabilities:async()=>({version:2,origin,storageKey:'native-admission-route-qa',redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,hostingPolicy:'circle-host-v1',circleAdmissionPolicy:'member-bound-circle-admission-v1'}),
   begin:async()=>requestId(),cancel:async()=>{},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>({previousGeneration:generation,generation,cleared:true}),
   async send(_id,input){
    const path=new URL(input.url).pathname;sent.push({path,method:input.method,body:input.body});f.setActor(actor);
    if(path==='/api/auth/member')return {status:200,url:input.url,redirected:false,body:JSON.stringify({member:{id:actor,display_name:'Synthetic native member',supabase_auth_id:actor},auth:{provider:'supabase',subject:actor}})};
    const body=input.body?JSON.parse(input.body):undefined;
    const response=/\/(admission-access|recipient-code|invitation-review|invitations|invitation-check|join-invited|invitation-receipt|invitations\/revoke)$/.test(path)?await f.dispatchAdmission(path,{method:input.method,body}):await f.dispatch(path,input.method,body);
    if(path==='/api/circles'&&input.method==='POST'&&lost){lost=false;throw Error('Synthetic post-commit loss');}
    return {status:response.status,url:input.url,redirected:false,body:await response.text()};
   }};
  const ports=await load('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey:'native-admission-route-qa'});
  session=load('platforms/shared/circle-hosting.ts').createCircleHosting({origin,memberId:member,owner,transport:ports.transport,hostingTransport:ports.hostingTransport,newRequestId:async()=>requestId(),initialOnline:true});
  session.connect();await session.check();assert.equal(session.model().phase,'editing');
  await session.review({title:'Native admission integration salon',description:null,format:'online',city:null,region:null,venueName:null,venueType:'online',weekday:2,time:'19:00',timezone:'UTC',startDate:new Date(Date.now()+2*86400000).toISOString().slice(0,10),maxMembers:8,onlineUrl:'https://meeting.fixture.invalid/native-private',admissionMode:'host_approval'},true);
  assert.equal(session.model().review.admissionMode,'host_approval');session.confirm(true);await session.create();assert.equal(session.model().phase,'unknown');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM book_cohorts WHERE created_by=$1',[member])).rows[0].n,1);
  await session.check();await session.reviewRetry();assert.equal(session.model().review.admissionMode,'host_approval');session.confirm(true);await session.create();assert.equal(session.model().phase,'created');
  const creates=sent.filter(r=>r.path==='/api/circles'&&r.method==='POST');assert.equal(creates.length,2);assert.equal(creates[0].body,creates[1].body);const circle=session.model().created.circleId;
  assert.equal((await f.db.query('SELECT circle_admission_mode FROM book_cohorts WHERE id=$1',[circle])).rows[0].circle_admission_mode,'host_approval');
  const wire=load('lib/circles/admission-wire.ts');
  async function call(action,value){const r=await ports.admissionTransport(origin+'/api/circles/'+circle+'/'+action,{method:'POST',headers:{Authorization:'Bearer NONISSUED_SYNTHETIC_NATIVE','Content-Type':'application/json'},body:wire.circleAdmissionMutationBody(action,value),credentials:'omit',cache:'no-store',redirect:'error',signal:new AbortController().signal});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;}
  actor=reader;const sharing=await call('recipient-code',{expectedMemberId:reader,shareConsent:true});actor=member;
  const review=await call('invitation-review',{expectedMemberId:member,recipientCode:sharing.recipientCode});
  const issued=await call('invitations',{expectedMemberId:member,recipientCode:sharing.recipientCode,targetMemberId:reader,requestId:requestId(),expectedRevision:review.circleRevision,expectedInvitationRevision:review.invitationRevision,expectedTargetLabel:review.targetLabel,expiresAt:review.expiresAt});
  actor=reader;const checked=await call('invitation-check',{expectedMemberId:reader,invitationToken:issued.invitationToken});
  const join={expectedMemberId:reader,requestId:requestId(),expectedRevision:checked.revision,invitationToken:issued.invitationToken};await call('join-invited',join);
  const receipt=await call('invitation-receipt',{expectedMemberId:reader,requestId:join.requestId,expectedRevision:join.expectedRevision,approvalNonce:checked.approvalNonce,proofHash:checked.proofHash});assert.equal(receipt.recorded,true);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM book_cohort_members WHERE cohort_id=$1',[circle])).rows[0].n,2);
 }finally{session?.close();await f.close();}
});
