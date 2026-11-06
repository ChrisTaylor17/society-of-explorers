import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {sourceLoader} from './load-source.mjs';
const origin='https://native-auth-member.invalid',providerOrigin='https://native-auth-provider.invalid',storageKey='native-auth-policy',publishableKey='sb_publishable_'+'A'.repeat(32),generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nextGeneration='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const deferred=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)};};
async function fixture(options={}){
 const calls=[],values=new Map();let epoch=generation,sendHook=options.sendHook,beginHook=options.beginHook;
 const check=g=>{assert.equal(g,epoch);};
 const bridge={capabilities:async()=>({version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:epoch,authPolicy:'supabase-password-v1',providerOrigin,publishableKey,...options.caps}),
  begin:async g=>{check(g);calls.push(['begin',g]);return beginHook?beginHook():'a-native-handle';},
  send:async(id,request)=>{calls.push(['member',id,request]);return{status:200,url:request.url,body:'{}',redirected:false};},
  sendAuth:async(id,request)=>{calls.push(['auth',id,request]);return sendHook?sendHook(request):{status:200,url:request.url,body:'{}',redirected:false};},
  cancel:async id=>{calls.push(['cancel',id]);},read:async(s,g)=>{check(g);return values.get(s)??null;},write:async(s,v,g)=>{check(g);values.set(s,v);},remove:async(s,g)=>{check(g);values.delete(s);},
  resetAccountStorage:async g=>{check(g);calls.push(['reset',g]);epoch=nextGeneration;values.clear();return{previousGeneration:g,generation:epoch,cleared:true};},
  getConnectivitySnapshot:()=> 'online',onConnectivityChange:()=>({remove(){}}),
 };
 const load=sourceLoader({'react-native':{Platform:{OS:options.os??'android'},TurboModuleRegistry:{get:()=>bridge}}}),create=load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts;
 const config={origin,storageKey,providerOrigin,publishableKey,timeoutMs:options.timeoutMs??100};
 return{bridge,calls,values,config,create,load,ports:options.skip?null:await create(bridge,config),setSend:fn=>{sendHook=fn;},setBegin:fn=>{beginHook=fn;}};
}
const jwt = claims => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.synthetic';
const scopedBearer = jwt({ sub: '73111111-1111-4111-8111-111111111111', session_id: '44444444-4444-4444-8444-444444444444' });
function request(operation='password',signal=new AbortController().signal){
 const endpoint={password:'/auth/v1/token?grant_type=password',refresh:'/auth/v1/token?grant_type=refresh_token',user:'/auth/v1/user',logout:'/auth/v1/logout?scope=local'}[operation];
 const method=operation==='user'?'GET':'POST',headers={apikey:publishableKey,'X-Supabase-Api-Version':'2024-01-01','X-Client-Info':'supabase-auth-js/2.99.3',Authorization:'Bearer '+(operation==='logout'?scopedBearer:operation==='user'?'NONISSUED_AUTH_TOKEN':publishableKey),...(method==='POST'?{'Content-Type':'application/json;charset=UTF-8'}:{})};
 const body=operation==='password'?JSON.stringify({email:'synthetic@example.invalid',password:'SYNTHETIC_PASSWORD',gotrue_meta_security:{}}):operation==='refresh'?JSON.stringify({refresh_token:'NONISSUED_REFRESH_TOKEN'}):undefined;
 return[providerOrigin+endpoint,{method,headers,signal,...(body===undefined?{}:{body})}];
}
test('actual native auth ports forward only four bounded provider operations and preserve member routes',async()=>{
 const f=await fixture();for(const operation of ['password','refresh','user','logout']){const[url,init]=request(operation),response=await f.ports.fetch(url,init);assert.equal(response.url,url);assert.equal(response.redirected,false);assert.deepEqual(await response.json(),{});}
 const auth=f.calls.filter(c=>c[0]==='auth');assert.equal(auth.length,4);assert.equal(auth[0][2].bearer,undefined);assert.equal(auth[1][2].bearer,undefined);assert.equal(auth[2][2].bearer,'NONISSUED_AUTH_TOKEN');assert.equal(auth[3][2].body,undefined);
 const init={method:'GET',headers:{Authorization:'Bearer NONISSUED_MEMBER'},signal:new AbortController().signal,cache:'no-store',redirect:'error',credentials:'omit'};
 assert.equal((await f.ports.member.transport(origin+'/api/auth/member',init)).status,200);await assert.rejects(f.ports.member.transport(providerOrigin+'/auth/v1/user',init));
 assert.equal(f.calls.filter(c=>c[0]==='member').length,1);f.ports.retire();
});
test('provider path, method, normalization and unsafe header/body inputs fail before allocation',async()=>{
 const f=await fixture(),[url,good]=request();
 for(const bad of [url+'#',url+'&x=1',url+'&grant_type=password',url.replace('grant_type','%67rant_type'),url.replace('/token','/./token'),url.replace(providerOrigin,origin),' '+url,url.replace('password','pkce'),providerOrigin+'/auth/v1/signup',providerOrigin+'/auth/v1/logout?scope=global'])await assert.rejects(f.ports.fetch(bad,good));
 for(const changed of [{method:'GET'},{credentials:'include'},{redirect:'follow'},{cache:'default'},{signal:null},{headers:{...good.headers,Cookie:'PRIVATE'}},{headers:{...good.headers,apikey:'sb_secret_PRIVATE'}},{headers:{...good.headers,Authorization:'Bearer NONISSUED_AUTH_TOKEN'}},{headers:{...good.headers,'X-Supabase-Api-Version':'forged'}},{headers:{...good.headers,'X-Client-Info':'PRIVATE\nHEADER'}},{body:'x'.repeat(16385)},{body:'{}'},{body:JSON.stringify({email:'x@y.invalid',password:'x',phone:'forged'})},{body:JSON.stringify({email:'x@y.invalid',password:'x',gotrue_meta_security:{captcha_token:'forged'}})},{body:JSON.stringify({email:'x@y.invalid',password:'x\n'})}])await assert.rejects(f.ports.fetch(url,{...good,...changed}));
 for(const operation of ['user','logout']){const[u,init]=request(operation);await assert.rejects(f.ports.fetch(u,{...init,body:'{}'}));await assert.rejects(f.ports.fetch(u,{...init,headers:{...init.headers,Authorization:'Bearer '+publishableKey}}));}
 const [logout, local] = request('logout');
 await assert.rejects(f.ports.fetch(logout.replace('local', 'global'), local));
 for (const bearer of ['NONISSUED_AUTH_TOKEN', jwt({sub:'73111111-1111-4111-8111-111111111111'}),
   jwt({sub:'73111111-1111-4111-8111-111111111111',session_id:'00000000-0000-0000-0000-000000000000'}),
   jwt({sub:'73111111-1111-4111-8111-111111111111',session_id:'44444444-4444-4444-8444-444444444444',Session_Id:''})]) {
   await assert.rejects(f.ports.fetch(logout, {...local,headers:{...local.headers,Authorization:'Bearer '+bearer}}));
 }
 assert.deepEqual(f.calls,[]);f.ports.retire();
});
test('missing or mismatched provider capabilities and service/legacy keys cannot create auth ports',async()=>{
 for(const caps of [{authPolicy:undefined},{providerOrigin:'https://other.invalid'},{publishableKey:'sb_secret_PRIVATE'},{storageGeneration:'invalid'},{version:1}]){const f=await fixture({skip:true,caps});await assert.rejects(f.create(f.bridge,f.config));assert.deepEqual(f.calls,[]);}
 const f=await fixture({skip:true});for(const key of ['sb_secret_'+'A'.repeat(32),'eyJhbGciOiJIUzI1NiJ9.legacy.signature','sb_publishable_short'])await assert.rejects(f.create(f.bridge,{...f.config,publishableKey:key}));await assert.rejects(f.create({...f.bridge,sendAuth:undefined},f.config));
});
test('local retirement aborts auth and member work, denies cached response/storage, and still permits one durable reset',async()=>{
 const f=await fixture();await f.ports.storage.setItem(storageKey,'SYNTHETIC_SESSION');const response=await f.ports.fetch(...request());
 const gate=deferred(),memberGate=deferred();f.setSend(()=>gate.promise);f.bridge.send=()=>memberGate.promise;const pending=f.ports.fetch(...request('user')),memberPending=f.ports.member.transport(origin+'/api/auth/member',{method:'GET',headers:{Authorization:'Bearer NONISSUED_MEMBER'},signal:new AbortController().signal,cache:'no-store',redirect:'error',credentials:'omit'});await new Promise(r=>setTimeout(r,5));let retired=0;f.ports.onRetired(()=>retired++);f.ports.retire();await Promise.all([assert.rejects(pending),assert.rejects(memberPending)]);await assert.rejects(response.json());await assert.rejects(f.ports.storage.getItem(storageKey));
 assert.equal(retired,1);assert.equal(f.values.size,1);await f.ports.resetAccountStorage();assert.equal(f.values.size,0);assert.equal(f.calls.filter(c=>c[0]==='reset').length,1);await assert.rejects(f.ports.resetAccountStorage());gate.resolve({status:200,url:request('user')[0],body:'{}',redirected:false});memberGate.resolve({status:200,url:origin+'/api/auth/member',body:'{}',redirected:false});
});
test('deadline and abort cancel late allocated handles once and never send after retirement',async()=>{
 for(const mode of ['deadline','abort']){
  const gate=deferred(),f=await fixture({beginHook:()=>gate.promise,timeoutMs:15}),abort=new AbortController(),pending=f.ports.fetch(...request('user',abort.signal));
  if(mode==='abort'){await new Promise(r=>setTimeout(r,2));abort.abort();}await assert.rejects(pending);gate.resolve('late-native-handle');await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(f.calls.filter(c=>c[0]==='cancel'),[['cancel','late-native-handle']]);assert.equal(f.calls.filter(c=>c[0]==='auth').length,0);f.ports.retire();
 }
});
test('invalid handles, redirected/wrong-origin/oversized replies are rejected and a failed request never retries',async()=>{
 const f=await fixture();f.setBegin(()=> 'bad handle');await assert.rejects(f.ports.fetch(...request()));assert.equal(f.calls.filter(c=>c[0]==='auth').length,0);f.setBegin(()=> 'valid-handle');
 for(const altered of [{status:302},{redirected:true},{url:origin+'/auth/v1/user'},{body:'x'.repeat(1048577)}]){f.setSend(req=>({status:200,url:req.url,body:'{}',redirected:false,...altered}));await assert.rejects(f.ports.fetch(...request('user')));}
 f.setSend(req=>({status:503,url:req.url,body:'{}',redirected:false}));const before=f.calls.filter(c=>c[0]==='auth').length;assert.equal((await f.ports.fetch(...request())).status,503);assert.equal(f.calls.filter(c=>c[0]==='auth').length,before+1);f.ports.retire();
});
test('namespace reset retires another auth wrapper and fences a previously obtained JSON reply',async()=>{
 const f=await fixture(),other=await f.create(f.bridge,f.config),response=await other.fetch(...request('user'));let count=0;other.onRetired(()=>count++);await f.ports.resetAccountStorage();assert.equal(count,1);await assert.rejects(response.json());await assert.rejects(other.storage.setItem(storageKey,'STALE'));assert.equal(f.values.size,0);
});
test('Android app-owned preparation uses trusted native policy and fails closed for legacy or non-Android modules',async()=>{
 const f=await fixture({skip:true}),prepared=await f.load('platforms/native/src/circles/android-member.ts').prepareAndroidAuthPorts();assert.equal(prepared.publishableKey,publishableKey);assert.equal(prepared.ports.providerOrigin,providerOrigin);assert.equal(prepared.connectivity.snapshot(),'online');assert.deepEqual(f.calls,[]);prepared.ports.retire();
 for(const options of [{os:'ios'},{caps:{authPolicy:undefined}}]){const f=await fixture({skip:true,...options});await assert.rejects(f.load('platforms/native/src/circles/android-member.ts').prepareAndroidAuthPorts());assert.deepEqual(f.calls,[]);}
});
function read(p){const s=fs.lstatSync(p);assert(!s.isSymbolicLink()&&s.isFile()&&(!s.size||s.blocks));return fs.readFileSync(p,'utf8');}
test('actual public build policy preserves old configuration and accepts only complete public provider policy',()=>{
 const p='platforms/native/android/member-config.cjs';read(p);const{memberConfig}=createRequire(import.meta.url)('../../'+p);
 assert.deepEqual(memberConfig(origin,storageKey),{origin,storageKey});assert.deepEqual(memberConfig(origin,storageKey,providerOrigin,publishableKey),{origin,storageKey,providerOrigin,publishableKey,authPolicy:'supabase-password-v1'});
 for(const [o,k]of [[providerOrigin,''],['',publishableKey],[providerOrigin,'sb_secret_'+'A'.repeat(32)],[providerOrigin,'eyJ.legacy.jwt'],[providerOrigin+'/',publishableKey],['https://user:pass@provider.invalid',publishableKey]])assert.throws(()=>memberConfig(origin,storageKey,o,k));
});
test('Android provider transport shares epoch/single-send bounds and exact independent auth policy (STATIC only)',()=>{
 const base='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/',transport=read(base+'MemberTransport.kt'),config=read(base+'MemberConfig.kt'),moduleSource=read(base+'NativeSoeMemberModule.kt');
 for(const value of ['/auth/v1/token?grant_type=password','/auth/v1/token?grant_type=refresh_token','/auth/v1/user','/auth/v1/logout?scope=local','origin == config.providerOrigin','input.bearer == null','config.publishableKey','private fun transmit(','handle.consumed = true','store.withGeneration(generation)','transmission.sent.compareAndSet(false, true)','.followRedirects(false)','.retryOnConnectionFailure(false)','.cookieJar(CookieJar.NO_COOKIES)','MAX_RESPONSE = 1048576'])assert(transport.includes(value),value);
 for(const value of ['providerOrigin + "|" + publishableKey','sb_publishable_[A-Za-z0-9_-]{20,200}','SOE_PROVIDER_ORIGIN','SOE_PUBLISHABLE_KEY'])assert(config.includes(value),value);
 assert(moduleSource.includes('override fun sendAuth('));assert(moduleSource.includes('putString("authPolicy", "supabase-password-v1")'));assert(!transport.includes('/auth/v1/signup'));assert(!transport.includes('scope=global'));
});
