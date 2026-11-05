import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sourceLoader } from './load-source.mjs';

const origin='https://native-message-review.invalid',generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const circle='11111111-1111-4111-8111-111111111111',message='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333',sessionId='44444444-4444-4444-8444-444444444444',pageToken='55555555-5555-4555-8555-555555555555';
const policy='assigned-message-review-v1',base=`/api/admin/circles/${circle}/messages/${message}`,hash='a'.repeat(64);
const decision={expectedRevision:0,contentHash:hash,requestId,action:'hide',reason:'safety',summary:'A specific conduct finding supported by the reviewed evidence.',evidenceReportId:null,evidenceExcerpt:'exact evidence'};
const start={action:'start',expectedRevision:0,contentHash:hash},ack={action:'ack',sessionId,pageToken},advice={expectedRevision:0,contentHash:hash};
let sequence=0;
async function fixture({capability=policy,method=true,factory='ports',responseHook}={}) {
  const calls=[],storageKey=`native-review-policy-${++sequence}`;
  const caps={version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,
    ...(capability===null?{}:{messageReviewPolicy:capability}),requestIdPolicy:'os-random-uuid',messageAiConsentPolicy:'author-message-ai-consent-v1',profilePolicy:'owner-profile-v1',hostingPolicy:'circle-host-v1'};
  const respond=async(lane,id,input)=>{calls.push({lane,id,...input});const value={status:200,url:input.url,redirected:false,body:'{}'};return responseHook?responseHook(value):value;};
  const bridge={capabilities:async()=>caps,begin:async value=>{calls.push({begin:value});return'handle';},send:(id,input)=>respond('member',id,input),
    ...(method?{sendReview:method===true?(id,input)=>respond('reviewer',id,input):method}:{}),newRequestId:async()=>requestId,
    cancel:async id=>{calls.push({cancel:id});},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>{throw Error('No reset');},
    getConnectivitySnapshot:()=> 'online',onConnectivityChange:()=>({remove(){}})};
  const load=sourceLoader({'react-native':{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>null}}});
  if(factory==='android')return{calls,adapter:load('platforms/native/src/circles/android-member.ts').createAndroidMemberAdapter(bridge)};
  if(factory==='binding')return{calls,binding:await load('platforms/native/src/circles/native-member-binding.ts').prepareNativeMemberBinding({bridge,origin,storageKey})};
  if(factory==='auth') {
    const providerOrigin='https://native-review-auth.invalid',publishableKey='sb_publishable_NONISSUED_REVIEWER_0000000000';
    Object.assign(caps,{authPolicy:'supabase-password-v1',providerOrigin,publishableKey});bridge.sendAuth=async()=>{throw Error('No provider operation');};
    return{calls,ports:await load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(bridge,{origin,storageKey,providerOrigin,publishableKey})};
  }
  return{calls,ports:await load('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey})};
}
const init=(method='GET',body=decision)=>({method,headers:{Authorization:'Bearer NONISSUED_REVIEWER',...(method==='POST'?{'Content-Type':'application/json'}:{})},
  ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});
const operations=[['/api/admin/circles/messages',init()],['/api/admin/circles/messages?after='+message,init()],[base,init()],
  [base+'/coverage?sessionId='+sessionId,init()],[base+`/coverage?sessionId=${sessionId}&page=42949673`,init()],
  [base,init('POST')],[base,init('POST',{...decision,action:'restore',reason:'resolved',evidenceReportId:null,evidenceExcerpt:null})],
  [base+'/coverage',init('POST',start)],[base+'/coverage',init('POST',ack)],
  [base+'/coverage/decision',init('POST',{...decision,sessionId})],[base+'/advice',init('POST',advice)]];
test('dedicated reviewer port forwards every exact operation only through sendReview',async()=>{
  const f=await fixture();assert.equal(typeof f.ports.reviewerTransport,'function');
  for(const[path,options]of operations)await f.ports.reviewerTransport(origin+path,options);
  const sent=f.calls.filter(x=>x.lane);assert.equal(sent.length,operations.length);assert(sent.every(x=>x.lane==='reviewer'&&x.bearer==='NONISSUED_REVIEWER'));
  assert.equal(f.calls.filter(x=>x.begin).length,operations.length);assert(sent.every((x,i)=>x.url===origin+operations[i][0]&&x.body===operations[i][1].body));
});
test('ordinary member and other lanes refuse reviewer routes even with reviewer capability',async()=>{
  const f=await fixture();
  for(const[path,options]of operations)for(const port of [f.ports.transport,f.ports.profileTransport,f.ports.hostingTransport])await assert.rejects(port(origin+path,options));
  for(const path of ['/api/auth/member','/api/circles/contributions',`/api/circles/${circle}/messages/${message}/ai-consent`,'/api/admin/circles/reports','/api/admin/users'])await assert.rejects(f.ports.reviewerTransport(origin+path,init()));
  assert.deepEqual(f.calls,[]);
});
test('reviewer feature requires exact capability and dedicated callable bridge method in both factories',async()=>{
  for(const options of [{capability:null},{capability:'assigned-message-review-v0'},{method:false},{method:'not-callable'}]){
    for(const factory of ['ports','auth']){
      const f=await fixture({...options,factory});assert.equal((factory==='auth'?f.ports.member:f.ports).reviewerTransport,undefined);assert.deepEqual(f.calls,[]);
      if(factory==='auth')f.ports.retire();
    }
  }
});
test('reviewer path, query and header aliases fail before native allocation',async()=>{
  const f=await fixture(),badPaths=[base+'?',base+'#',base+'/',base+'?sessionId='+sessionId,base.replace(circle,'A'+circle.slice(1)),base.replace('/messages/','/messages/./'),
    '/api/admin/circles/messages?limit=25','/api/admin/circles/messages?after='+message+'&after='+message,'/api/admin/circles/messages?%61fter='+message,
    base+'/coverage',base+'/coverage?sessionId='+sessionId+'&page=0',base+'/coverage?sessionId='+sessionId+'&page=01',base+'/coverage?sessionId='+sessionId+'&page=42949674',
    base+'/coverage?sessionId='+sessionId+'&page=1&page=1',base+'/coverage?page=1&sessionId='+sessionId,base+'/coverage?sessionId='+sessionId+'&memberId='+circle,base+'/advice',base+'/coverage/decision'];
  for(const path of badPaths)await assert.rejects(f.ports.reviewerTransport(origin+path,init()));
  for(const url of [' '+origin+base,origin+base+' ','https://other.invalid'+base])await assert.rejects(f.ports.reviewerTransport(url,init()));
  for(const method of ['PUT','DELETE','HEAD'])await assert.rejects(f.ports.reviewerTransport(origin+base,init(method)));
  const good=init();for(const altered of [{...good,credentials:'include'},{...good,redirect:'follow'},{...good,body:'{}'},
    {...good,headers:{...good.headers,Cookie:'fixture=private'}},{...good,headers:{...good.headers,authorization:'Bearer duplicate'}},
    {...good,headers:{...good.headers,'Content-Type':'application/json'}}])await assert.rejects(f.ports.reviewerTransport(origin+base,altered));
  assert.deepEqual(f.calls,[]);
});
test('reviewer decisions enforce exact reason/evidence and canonical bounded bytes',async()=>{
  const f=await fixture();
  const bodies=[{}, {...decision,actorId:circle}, {...decision,expectedRevision:'0'}, {...decision,expectedRevision:0.5}, {...decision,expectedRevision:-1},
    {...decision,expectedRevision:Number.MAX_SAFE_INTEGER+1},{...decision,contentHash:'A'.repeat(64)}, {...decision,requestId:'A'+requestId.slice(1)},
    {...decision,action:'restore'}, {...decision,reason:'resolved'}, {...decision,summary:'too short'}, {...decision,summary:' '+decision.summary},
    {...decision,summary:'a'.repeat(1001)}, {...decision,evidenceExcerpt:'tiny'},{...decision,evidenceExcerpt:' '+decision.evidenceExcerpt},{...decision,evidenceReportId:'not-a-uuid'},
    {...decision,summary:'broken\ud800text with a long enough summary'},JSON.stringify(decision)+' ',JSON.stringify(decision).replace('"expectedRevision":0','"expectedRevision":0,"expectedRevision":0'),
    JSON.stringify(decision).replace('"expectedRevision":0','"expectedRevision":0e0'),'{broken','x'.repeat(12001)];
  for(const body of bodies)await assert.rejects(f.ports.reviewerTransport(origin+base,init('POST',body)));
  await assert.rejects(f.ports.reviewerTransport(origin+base+'/coverage/decision',init('POST',decision)));
  await assert.rejects(f.ports.reviewerTransport(origin+base,init('POST',{...decision,sessionId})));
  assert.deepEqual(f.calls,[]);
});
test('coverage and advice accept no actor, report notes, message text or hidden decision fields',async()=>{
  const f=await fixture();
  for(const body of [{...start,sessionId},{...ack,expectedRevision:0},{...ack,pageToken:'A'+pageToken.slice(1)},{...start,contentHash:null}])await assert.rejects(f.ports.reviewerTransport(origin+base+'/coverage',init('POST',body)));
  for(const body of [{...advice,content:'PRIVATE_MESSAGE'}, {...advice,reporterNotes:'PRIVATE_NOTE'}, {...advice,actor:circle}, {...advice,sessionId}, {...advice,provider:'anthropic'}, {...advice,allowed:true}])await assert.rejects(f.ports.reviewerTransport(origin+base+'/advice',init('POST',body)));
  assert.deepEqual(f.calls,[]);
});
test('native adapter and existing/owned account factories preserve dedicated reviewer forwarding and retirement',async()=>{
  const android=await fixture({factory:'android'});await android.adapter.bridge.sendReview('direct-handle',{url:origin+base,method:'GET',bearer:'NONISSUED_REVIEWER'});assert.equal(android.calls[0].lane,'reviewer');
  const existing=await fixture({factory:'binding'}),auth={getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
  const bound=existing.binding.bind(auth,circle);await bound.reviewerTransport(origin+base,init());existing.binding.close();await assert.rejects(bound.reviewerTransport(origin+base,init()));
  const owned=await fixture({factory:'auth'});const response=await owned.ports.member.reviewerTransport(origin+base,init());owned.ports.retire();await assert.rejects(response.json());await assert.rejects(owned.ports.member.reviewerTransport(origin+base,init()));
  assert.equal(existing.calls.filter(x=>x.lane).length,1);assert.equal(owned.calls.filter(x=>x.lane).length,1);
});
test('redirected, wrong-origin and retired reviewer replies fail without a retry',async()=>{
  for(const responseHook of [r=>({...r,redirected:true}),r=>({...r,status:302}),r=>({...r,url:'https://other.invalid'+base})]){
    const f=await fixture({responseHook});await assert.rejects(f.ports.reviewerTransport(origin+base,init()));assert.equal(f.calls.filter(x=>x.lane).length,1);
  }
  const f=await fixture(),response=await f.ports.reviewerTransport(origin+base,init());f.ports.retireStorage();await assert.rejects(response.json());await assert.rejects(f.ports.reviewerTransport(origin+base,init()));assert.equal(f.calls.filter(x=>x.lane).length,1);
});
test('Android reviewer entry and exact independent validator preserve member isolation (STATIC SOURCE only)',()=>{
  const read=p=>{const s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.blocks);return fs.readFileSync(p,'utf8');};
  const prefix='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/',transport=read(prefix+'MemberTransport.kt'),nativeModule=read(prefix+'NativeSoeMemberModule.kt');
  assert(nativeModule.includes('putString("messageReviewPolicy", "assigned-message-review-v1")'));assert(nativeModule.includes('override fun sendReview('));assert(nativeModule.includes('transport().sendReview(id, MemberTransport.input(request)'));
  const entry=transport.split('fun sendReview(')[1]?.split('fun sendAuth(')[0];assert(entry?.includes('validateReview(input); transmit('));
  const regular=transport.split('private fun validate(input: Input) {')[1]?.split('private fun validateMessageAiConsentBody')[0];assert(regular);assert(!regular.includes('/api/admin/'));
  const review=transport.split('private fun validateReview(input: Input) {')[1]?.split('private fun validateAuth')[0];assert(review);
  for(const required of ['/api/admin/circles/messages','/coverage/decision|/coverage|/advice','reviewUuid(target.groupValues[1]) && reviewUuid(target.groupValues[2])','url.encodedQuery == null','1..42949673','input.body == null','size <= 12000',
    'setOf("expectedRevision", "contentHash", "requestId", "action", "reason", "summary", "evidenceReportId", "evidenceExcerpt")','setOf("action", "sessionId", "pageToken")','setOf("expectedRevision", "contentHash")','setOf("action", "expectedRevision", "contentHash")','reviewText(summary, 20, 1000)','reviewText(excerpt, 5, 500)','require(body == canonical)'])assert(review.includes(required),required);
  for(const required of ['.followRedirects(false)','.followSslRedirects(false)','.retryOnConnectionFailure(false)','transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)'])assert(transport.includes(required),required);
});
