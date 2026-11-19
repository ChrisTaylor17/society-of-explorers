// Actual TS binding/adapter/ports; native UUID/storage are explicit doubles.
// Kotlin checks below are STATIC and do not attest compiled Android behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceLoader} from './load-source.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const circle='11111111-1111-4111-8111-111111111111',epoch='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',requestId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin='https://native-keyed-bridge.invalid',storageKey='synthetic-keyed';
function read(relative){const file=path.join(root,relative),s=fs.lstatSync(file);assert(!s.isSymbolicLink()&&s.isFile()&&(!s.size||s.blocks),'Refuse linked/offloaded source');return fs.readFileSync(file,'utf8');}
function fixture(policy=true,method=true){
 const calls=[];let hold=null,value=requestId,current=epoch,resetCalls=0;
 const module={
  async capabilities(){return{version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:current,...(policy?{requestIdPolicy:'os-random-uuid'}:{})};},
  async begin(){return'synthetic-handle';},async send(){throw Error('No private transport permitted in key test');},async cancel(){},
  async read(){return null;},async write(){},async remove(){},async resetAccountStorage(expected){assert.equal(expected,current);resetCalls++;const previousGeneration=current;current='cccccccc-cccc-4ccc-8ccc-cccccccccccc';return{previousGeneration,generation:current,cleared:true};},
  getConnectivitySnapshot(){return'online';},onConnectivityChange(){return{remove(){}};},
  ...(method?{async newRequestId(generation){assert.equal(this,module);assert.equal(generation,current);calls.push(generation);if(hold)return hold;return value;}}:{}),
 };
 const load=sourceLoader({'react-native':{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>module}}});
 return{...load('platforms/native/src/circles/android-member.ts'),module,calls,setHold:value=>{hold=value;},setValue:next=>{value=next;},resetCalls:()=>resetCalls};
}
test('actual Android binding forwards an explicit native ready-epoch key source without browser crypto or transport',async()=>{
 const f=fixture(),binding=await f.prepareAndroidMemberBinding({origin,storageKey});
 const auth={async getSession(){throw Error('No auth call permitted in key test');},async getUser(){throw Error('No auth call permitted in key test');},onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}};}};
 const config=binding.bind(auth,circle);assert.equal(typeof config.newRequestId,'function');assert.equal(await config.newRequestId(),requestId);assert.deepEqual(f.calls,[epoch]);binding.close();
 await assert.rejects(config.newRequestId(),/unavailable/);assert.equal(f.calls.length,1);
});
test('older read-only Android modules remain preparable but never acquire a fallback request-key source',async()=>{
 for(const [policy,method]of [[false,false],[false,true],[true,false]]){
  const f=fixture(policy,method),binding=await f.prepareAndroidMemberBinding({origin,storageKey});
  const auth={getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
  const config=binding.bind(auth,circle);assert.equal(config.newRequestId,undefined);assert.deepEqual(f.calls,[]);binding.close();
 }
});
test('closing the actual binding retires a held native key response before it can reach a new view',async()=>{
 const f=fixture();let release;f.setHold(new Promise(resolve=>{release=resolve;}));const binding=await f.prepareAndroidMemberBinding({origin,storageKey});
 const auth={getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
 const config=binding.bind(auth,circle),pending=assert.rejects(config.newRequestId(),/unavailable/);await new Promise(resolve=>setImmediate(resolve));binding.close();release(requestId);await pending;assert.deepEqual(f.calls,[epoch]);
});
test('actual ports reject malformed native UUID results without a fallback or a private transport call',async()=>{
 for(const value of [null,undefined,123,'','not-a-uuid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-extra']){
  const f=fixture();f.setValue(value);const binding=await f.prepareAndroidMemberBinding({origin,storageKey});
  const auth={getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
  const config=binding.bind(auth,circle);await assert.rejects(config.newRequestId(),/unavailable/);assert.deepEqual(f.calls,[epoch]);binding.close();
 }
});
test('actual key-factory deadline rejects a held native result and its late completion grants no new authority',async()=>{
 const f=fixture();let release;f.setHold(new Promise(resolve=>{release=resolve;}));const binding=await f.prepareAndroidMemberBinding({origin,storageKey,timeoutMs:30});
 const auth={getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
 const config=binding.bind(auth,circle);await assert.rejects(config.newRequestId(),/unavailable/);release(requestId);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.calls,[epoch]);binding.close();
});
test('actual namespace reset retires a held key before its old-epoch reply can reach the bound account view',async()=>{
 const f=fixture();let release;f.setHold(new Promise(resolve=>{release=resolve;}));const binding=await f.prepareAndroidMemberBinding({origin,storageKey});
 const auth={getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})};
 const config=binding.bind(auth,circle),pending=assert.rejects(config.newRequestId(),/unavailable/);await new Promise(resolve=>setImmediate(resolve));await binding.resetAccountStorage();release(requestId);await pending;
 assert.deepEqual(f.calls,[epoch]);assert.equal(f.resetCalls(),1);await assert.rejects(config.newRequestId(),/unavailable/);assert.equal(f.calls.length,1);
});
test('actual Android source uses generation-fenced OS UUIDs and only the three new keyed endpoint shapes (STATIC)',()=>{
 const base='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/';
 const module=read(base+'NativeSoeMemberModule.kt'),transport=read(base+'MemberTransport.kt');
 assert(module.includes('putString("requestIdPolicy", "os-random-uuid")'));
 assert.match(module,/override fun newRequestId\(generation: String, promise: Promise\)[\s\S]*?store\.withGeneration\(generation\) \{ reply\.resolve\(UUID\.randomUUID\(\)\.toString\(\)\) \}/);
 assert(!module.includes('Math.random'));
 assert(transport.includes('/discussion/preview'));assert(transport.includes('preview != null'));
 assert.match(transport,/preview != null\) \{ require\(uuid\(preview\.groupValues\[1\]\) && input\.method == "POST" && url\.encodedQuery == null\)/);
 assert.match(transport,/discussion != null && input\.method == "POST"\) \{ require\(uuid\(discussion\.groupValues\[1\]\) && url\.encodedQuery == null\)/);
 assert(transport.includes('"requestId" in query) { require(query.size == 1); setOf("requestId") }'));
 for(const required of ['.followRedirects(false)','.followSslRedirects(false)','.retryOnConnectionFailure(false)',
  'transmission.sent.compareAndSet(false, true)','MAX_RESPONSE = 1048576','size <= 16384'])assert(transport.includes(required));
});
