import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoader} from './load-source.mjs';
const origin='https://native-admission.invalid',generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nextGeneration='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const member='cccccccc-cccc-4ccc-8ccc-cccccccccccc',circle='dddddddd-dddd-4ddd-8ddd-dddddddddddd',key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const token='NONISSUED_SYNTHETIC_MEMBER',recipientCode='soe-cr1.e30.'+'A'.repeat(43),invitationToken='soe-ci1.e30.'+'A'.repeat(43),base='/api/circles/'+circle+'/';let sequence=0;
const objects={
 'admission-access':{expectedMemberId:member},'recipient-code':{expectedMemberId:member,shareConsent:true},
 'invitation-review':{expectedMemberId:member,recipientCode},
 invitations:{expectedMemberId:member,recipientCode,targetMemberId:member,requestId:key,expectedRevision:0,expectedInvitationRevision:1,expectedTargetLabel:'Synthetic reader',expiresAt:'2030-01-01T00:00:00.000Z'},
 'invitation-check':{expectedMemberId:member,invitationToken},'join-invited':{expectedMemberId:member,requestId:key,expectedRevision:0,invitationToken},
 'invitation-receipt':{expectedMemberId:member,requestId:key,expectedRevision:0,approvalNonce:key,proofHash:'a'.repeat(64)},
 'invitations/revoke':{expectedMemberId:member,requestId:key,expectedRevision:0,expectedInvitationRevision:1},
};
const init=body=>({method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body,redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});
async function fixture(options={}){
 const load=sourceLoader(),wire=load('lib/circles/admission-wire.ts'),calls=[],storageKey='admission-'+(++sequence);
 const caps={version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,hostingPolicy:'circle-host-v1',profilePolicy:'owner-profile-v1',attendancePolicy:'circle-rsvp-v1',publicPolicy:'circle-discovery-v1',readingPolicy:'pinned-passage-v1',circleAdmissionPolicy:wire.CIRCLE_ADMISSION_POLICY,...options.caps};
 const bridge={capabilities:async()=>caps,begin:async()=>{calls.push({begin:true});return options.begin?options.begin():'request-'+calls.length;},send:async(id,input)=>{calls.push({id,...input});return options.reply?options.reply(input):{status:200,url:input.url,redirected:false,body:'{}'};},sendPublic:async()=>{throw Error('Unexpected public send');},sendAuth:async()=>{throw Error('Unexpected auth send');},cancel:async id=>calls.push({cancel:id}),read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>({previousGeneration:generation,generation:nextGeneration,cleared:true})};
 const config={origin,storageKey,timeoutMs:options.timeoutMs??200};const ports=await load('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,config);
 return{wire,calls,caps,bridge,ports,load,config};
}
test('a recognized admission capability exposes one narrow port; older/wrong capabilities grant nothing',async()=>{
 for(const policy of [undefined,'true','member-bound-circle-admission-v2']){const f=await fixture({caps:{circleAdmissionPolicy:policy}});assert.equal(f.ports.admissionTransport,undefined);assert.equal(typeof f.ports.transport,'function');assert.deepEqual(f.calls,[]);}
 assert.equal(typeof(await fixture()).ports.admissionTransport,'function');
});
test('all eight canonical admission POSTs transmit once on the existing private engine',async()=>{
 const f=await fixture();for(const[action,value]of Object.entries(objects))await f.ports.admissionTransport(origin+base+action,init(f.wire.circleAdmissionMutationBody(action,value)));
 const sent=f.calls.filter(v=>v.url);assert.equal(sent.length,8);assert.equal(f.calls.filter(v=>v.begin).length,8);assert(sent.every(v=>v.bearer===token&&v.method==='POST'));
});
test('other existing ports reject every admission endpoint before native allocation',async()=>{
 const f=await fixture();for(const action of Object.keys(objects))for(const lane of ['transport','hostingTransport','profileTransport','attendanceTransport','publicTransport','passageTransport']){
  await assert.rejects(f.ports[lane](origin+base+action,init(f.wire.circleAdmissionMutationBody(action,objects[action]))));
 }assert.deepEqual(f.calls,[]);
});
test('aliases, redirects, headers, byte bounds, false consent and noncanonical JSON fail before begin',async()=>{
 const f=await fixture(),action='recipient-code',body=f.wire.circleAdmissionMutationBody(action,objects[action]),url=origin+base+action;
 const variants=[['http://native-admission.invalid'+base+action,init(body)],[url+'?',init(body)],[url+'#code=x',init(body)],[url.replace('/recipient-code','/%72ecipient-code'),init(body)],[url.replace(circle,circle.toUpperCase()),init(body)],[url+'/',init(body)],['https://foreign.invalid'+base+action,init(body)],
  [url,{...init(body),method:'GET'}],[url,{...init(body),credentials:'include'}],[url,{...init(body),redirect:'follow'}],[url,{...init(body),headers:{...init(body).headers,Cookie:'x'}}],[url,{...init(body),headers:{'Content-Type':'application/json'}}],
  [url,init(JSON.stringify({...objects[action],shareConsent:false}))],[url,init('{"shareConsent":true,"expectedMemberId":"'+member+'"}')],[url,init('{"expectedMemberId":"'+member+'","shareConsent":true,"shareConsent":true}')],[url,init(body+' ')],[url,init('x'.repeat(4097))],
  [origin+base+'invitation-review',init(JSON.stringify({expectedMemberId:member,targetMemberId:member}))],
  [origin+base+'invitation-check',init(JSON.stringify({expectedMemberId:member,invitationToken:recipientCode}))]];
 for(const[u,input]of variants)await assert.rejects(f.ports.admissionTransport(u,input));assert.deepEqual(f.calls,[]);
});
test('new private create mode is denied on an older bridge and accepted only with admission capability',async()=>{
 const fields={expectedMemberId:member,requestId:key,title:'Native private salon',description:null,format:'in_person',city:'Boston',region:null,venueName:'Public library',venueType:'library',weekday:2,time:'19:00',timezone:'UTC',startDate:'2030-01-01',maxMembers:8,onlineUrl:null,admissionMode:'host_approval'};
 const old=await fixture({caps:{circleAdmissionPolicy:undefined}});const hosting=old.load('lib/circles/hosting.ts'),body=hosting.circleCreateMutationBody(fields);await assert.rejects(old.ports.hostingTransport(origin+'/api/circles',init(body)));assert.deepEqual(old.calls,[]);
 const current=await fixture();await current.ports.hostingTransport(origin+'/api/circles',init(body));assert.equal(current.calls.filter(c=>c.url).length,1);
});
test('native account reset and owned-auth retirement fence retained admission JSON',async()=>{
 const f=await fixture(),url=origin+base+'admission-access',body=f.wire.circleAdmissionMutationBody('admission-access',objects['admission-access']);
 const result=await f.ports.admissionTransport(url,init(body));await f.ports.resetAccountStorage();await assert.rejects(result.json());await assert.rejects(f.ports.admissionTransport(url,init(body)));
 const g=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin:'https://synthetic-provider.invalid',publishableKey:'sb_publishable_NONISSUED_SYNTHETIC_PUBLIC'}});
 const owned=await g.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(g.bridge,{...g.config,providerOrigin:g.caps.providerOrigin,publishableKey:g.caps.publishableKey});
 const read=await owned.member.admissionTransport(url,init(body));owned.retire();await assert.rejects(read.json());await assert.rejects(owned.member.admissionTransport(url,init(body)));
});
test('late native allocation is cancelled without sending and lost replies never resend',async()=>{
 let release;const held=new Promise(resolve=>release=resolve),f=await fixture({begin:()=>held,timeoutMs:200}),controller=new AbortController(),body=f.wire.circleAdmissionMutationBody('join-invited',objects['join-invited']);
 const pending=f.ports.admissionTransport(origin+base+'join-invited',{...init(body),signal:controller.signal}),rejected=assert.rejects(pending);await new Promise(r=>setTimeout(r,0));controller.abort();await rejected;release('late-admission');await new Promise(r=>setTimeout(r,0));assert.equal(f.calls.filter(c=>c.url).length,0);assert.deepEqual(f.calls.filter(c=>c.cancel),[{cancel:'late-admission'}]);
 for(const reply of [()=>{throw Error('Synthetic lost result');},input=>({status:302,url:input.url,redirected:true,body:'{}'})]){const g=await fixture({reply});await assert.rejects(g.ports.admissionTransport(origin+base+'join-invited',init(body)));assert.equal(g.calls.filter(c=>c.url).length,1);}
});
test('Kotlin admission envelope/capability source is present (STATIC ONLY, not an Android build)',()=>{
 const root='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/',source=fs.readFileSync(root+'MemberTransport.kt','utf8');
 const block=source.split('private fun validateAdmissionBody(')[1]?.split('private fun validateCreationBody(')[0];assert(block);
 for(const text of ['size <= 4096','value.keys().asSequence().toSet() == fields.toSet()','value.get("shareConsent") == true','require(body == canonical)','raw == raw.lowercase()','attendanceDay(raw.take(10))','9007199254740991L'])assert(block.includes(text),text);
 for(const action of Object.keys(objects))assert(block.includes('"'+action+'"'),action);
 assert(fs.readFileSync(root+'NativeSoeMemberModule.kt','utf8').includes('putString("circleAdmissionPolicy", "member-bound-circle-admission-v1")'));
});

test('both registered platform adapters forward the optional admission port',async()=>{
 for(const os of ['android','ios']){
  const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin:'https://synthetic-provider.invalid',publishableKey:'sb_publishable_NONISSUED_SYNTHETIC_PUBLIC'}});
  const nativeModule={...f.bridge,getConnectivitySnapshot:()=> 'online',onConnectivityChange:()=>({remove(){}})};
  const load=sourceLoader({'react-native':{Platform:{OS:os},TurboModuleRegistry:{get:()=>nativeModule}}});
  const prepared=os==='android'?await load('platforms/native/src/circles/android-member.ts').prepareAndroidAuthPorts():await load('platforms/native/src/circles/installed-member.ts').prepareInstalledAuthPorts();
  const body=f.wire.circleAdmissionMutationBody('admission-access',objects['admission-access']);
  await prepared.ports.member.admissionTransport(origin+base+'admission-access',init(body));assert.equal(f.calls.filter(v=>v.url).length,1);
 }
});
