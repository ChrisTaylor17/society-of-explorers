import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sourceLoader } from './load-source.mjs';

const origin='https://native-author-consent.invalid', generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const circle='11111111-1111-4111-8111-111111111111', message='22222222-2222-4222-8222-222222222222';
const url=`${origin}/api/circles/${circle}/messages/${message}/ai-consent`;
const policy='anthropic-message-review-v1', consentPolicy='author-message-ai-consent-v1';
const choice={expectedConsentRevision:0,contentHash:'a'.repeat(64),policy,allowed:true};
let sequence=0;
async function fixture(capability=consentPolicy, factory='ports') {
  const calls=[],storageKey=`synthetic-author-consent-${++sequence}`;
  const caps={version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,
    ...(capability==null?{}:{messageAiConsentPolicy:capability}),profilePolicy:'owner-profile-v1',savedReadingPolicy:'owner-reading-v1',attendancePolicy:'circle-rsvp-v1',hostingPolicy:'circle-host-v1'};
  const bridge={capabilities:async()=>caps,begin:async()=>{calls.push('begin');return'handle';},send:async(id,input)=>{calls.push({id,...input});return{status:200,url:input.url,redirected:false,body:'{}'};},
    cancel:async()=>{calls.push('cancel');},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>{throw Error('No reset');}};
  const load=sourceLoader();
  if(factory==='binding') return {calls,binding:await load('platforms/native/src/circles/native-member-binding.ts').prepareNativeMemberBinding({bridge,origin,storageKey})};
  if(factory==='auth') {
    const providerOrigin='https://synthetic-auth.invalid',publishableKey='sb_publishable_NONISSUED_SYNTHETIC_0000000000';
    Object.assign(caps,{authPolicy:'supabase-password-v1',providerOrigin,publishableKey});bridge.sendAuth=async()=>{throw Error('No provider operation');};
    return{calls,ports:await load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(bridge,{origin,storageKey,providerOrigin,publishableKey})};
  }
  return {calls,ports:await load('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey})};
}
const init=(method='GET',body=choice)=>({method,headers:{Authorization:'Bearer NONISSUED_SYNTHETIC',...(method==='POST'?{'Content-Type':'application/json'}:{})},
  ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});

test('native consent capability enables only exact consent reads and canonical per-message choices',async()=>{
  const f=await fixture();assert.equal(f.ports.aiConsent,true);
  await f.ports.transport(url,init());
  for(const allowed of [true,false]) await f.ports.transport(url,init('POST',{...choice,allowed}));
  const sent=f.calls.filter(x=>typeof x==='object');assert.equal(sent.length,3);
  assert.equal(sent[0].body,undefined);assert.equal(sent[1].body,JSON.stringify(choice));assert.equal(sent[2].body,JSON.stringify({...choice,allowed:false}));
  assert(sent.every(x=>x.url===url&&x.bearer==='NONISSUED_SYNTHETIC'));
});
test('absent or different native consent capability disables UI configuration and refuses forwarding',async()=>{
  for(const capability of [null,'author-message-ai-consent-v0','anthropic-message-review-v1']) {
    const f=await fixture(capability);assert.equal(f.ports.aiConsent,false);
    await assert.rejects(f.ports.transport(url,init()));await assert.rejects(f.ports.transport(url,init('POST')));assert.deepEqual(f.calls,[]);
  }
});
test('native consent refuses route aliases, other authority, query, headers, methods and body on GET before allocation',async()=>{
  const f=await fixture();
  for(const bad of [url+'?',url+'?allowed=true',url+'#',url+'/',url.replace(circle,'A'+circle.slice(1)),url.replace('/messages/','/messages/./'),url.replace('/ai-consent','/advice'),url.replace(origin,'https://other.invalid'),url.replace('/api/circles/','/api/admin/circles/')]) await assert.rejects(f.ports.transport(bad,init()));
  for(const method of ['PUT','DELETE','HEAD']) await assert.rejects(f.ports.transport(url,init(method)));
  const good=init();
  for(const bad of [{...good,body:'{}'},{...good,credentials:'include'},{...good,redirect:'follow'},{...good,cache:'default'},
    {...good,headers:{...good.headers,Cookie:'fixture=private'}},{...good,headers:{...good.headers,'Content-Type':'application/json'}},
    {...good,headers:{...good.headers,authorization:'Bearer duplicate'}}]) await assert.rejects(f.ports.transport(url,bad));
  assert.deepEqual(f.calls,[]);
});
test('native consent refuses private text, coercion, duplicates and noncanonical choice bytes before allocation',async()=>{
  const f=await fixture();
  const bodies=[{}, {...choice,content:'DO_NOT_SEND_MESSAGE_TEXT'}, {...choice,reporterNotes:'DO_NOT_SEND_NOTES'}, {...choice,authorId:message},
    {...choice,expectedConsentRevision:-1},{...choice,expectedConsentRevision:0.5},{...choice,expectedConsentRevision:Number.MAX_SAFE_INTEGER+1},
    {...choice,expectedConsentRevision:'0'},{...choice,allowed:1},{...choice,allowed:'true'}, {...choice,policy:'openai-message-review-v1'},
    {...choice,contentHash:'A'.repeat(64)}, {...choice,contentHash:'a'.repeat(63)},JSON.stringify(choice)+' ',
    JSON.stringify(choice).replace('"expectedConsentRevision":0','"expectedConsentRevision":0,"expectedConsentRevision":0'),
    JSON.stringify(choice).replace('"expectedConsentRevision":0','"expectedConsentRevision":0e0'),
    JSON.stringify({allowed:true,policy,contentHash:choice.contentHash,expectedConsentRevision:0}),'x'.repeat(513),'{bad'];
  for(const body of bodies) await assert.rejects(f.ports.transport(url,init('POST',body)));
  for(const port of ['profileTransport','savedReadingTransport','attendanceTransport','hostingTransport']) await assert.rejects(f.ports[port](url,init('POST')));
  assert.deepEqual(f.calls,[]);
});
test('owned-auth and existing-member factories propagate the verified consent capability only',async()=>{
  for(const capability of [consentPolicy,null]) {
    const expected=capability===consentPolicy, owned=await fixture(capability,'auth');assert.equal(owned.ports.member.aiConsent,expected);assert.deepEqual(owned.calls,[]);
    const existing=await fixture(capability,'binding');
    const auth={getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
    assert.equal(existing.binding.bind(auth,circle).aiConsent,expected);assert.deepEqual(existing.calls,[]);existing.binding.close();owned.ports.retire();
  }
});
test('retired native consent request cannot allocate and a retained response cannot disclose its body',async()=>{
  const f=await fixture(),reply=await f.ports.transport(url,init());f.ports.retireStorage();const before=f.calls.length;
  await assert.rejects(reply.json());await assert.rejects(f.ports.transport(url,init('POST')));assert.equal(f.calls.length,before);
});
test('Android consent guard and capability independently match the bounded wire (STATIC SOURCE, not compilation)',()=>{
  function read(p){const s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.blocks);return fs.readFileSync(p,'utf8');}
  const base='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/';
  const transport=read(base+'MemberTransport.kt'),nativeModule=read(base+'NativeSoeMemberModule.kt');
  assert(nativeModule.includes('putString("messageAiConsentPolicy", "author-message-ai-consent-v1")'));
  assert(transport.includes('val messageAiConsent = Regex("/api/circles/([0-9a-f-]{36})/messages/([0-9a-f-]{36})/ai-consent").matchEntire(url.encodedPath)'));
  const path=transport.split('else if (messageAiConsent != null) {')[1]?.split('else {')[0];assert(path);
  assert(path.includes('uuid(messageAiConsent.groupValues[1]) && uuid(messageAiConsent.groupValues[2]) && url.encodedQuery == null'));
  assert(path.includes('if (input.method == "POST") validateMessageAiConsentBody(input.body ?: throw IllegalArgumentException())'));
  const body=transport.split('private fun validateMessageAiConsentBody(body: String) {')[1]?.split('/**')[0];assert(body);
  for(const required of ['size <= 512','setOf("expectedConsentRevision", "contentHash", "policy", "allowed")','revision is Int || revision is Long','version in 0..9007199254740991L','Regex("[a-f0-9]{64}").matches(hash)','policy == "anthropic-message-review-v1" && allowed is Boolean','require(body == ']) assert(body.includes(required),required);
  for(const required of ['url.fragment == null','url.toString() == input.url','.followRedirects(false)','.followSslRedirects(false)','.retryOnConnectionFailure(false)','transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)','if (input.method == "GET") require(input.body == null)']) assert(transport.includes(required),required);
});
