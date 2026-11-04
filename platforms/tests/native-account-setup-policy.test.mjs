import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoader} from './load-source.mjs';
const origin='https://native-account-policy.invalid',generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function fixture(){
 const calls=[];
 const bridge={capabilities:async()=>({version:2,origin,storageKey:'synthetic-account-policy',redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation}),begin:async()=>{calls.push('begin');return'handle';},send:async(id,input)=>{calls.push({id,...input});return{status:200,url:input.url,redirected:false,body:'{}'};},cancel:async()=>{calls.push('cancel');},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>{throw Error('No reset');}};
 return{calls,ports:await sourceLoader()('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey:'synthetic-account-policy'})};
}
const init=(method='GET')=>({method,headers:{Authorization:'Bearer NONISSUED_SYNTHETIC',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{}),redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});
test('actual native ports allow only member GET and explicit member setup POST',async()=>{
 const f=await fixture();
 for(const[path,method]of [['/api/auth/member','GET'],['/api/auth/ensure-member','POST']]){
  const reply=await f.ports.transport(origin+path,init(method));assert.equal(JSON.stringify(await reply.json()),'{}');
 }
 assert.equal(f.calls.filter(c=>c==='begin').length,2);assert.equal(f.calls.filter(c=>typeof c==='object').length,2);
});
test('account methods, queries, suffixes and normalization attacks are denied before native begin',async()=>{
 const f=await fixture();
 for(const[path,method]of [['/api/auth/member','GET'],['/api/auth/ensure-member','POST']]){
  for(const suffix of ['?','#','?subject=forged','/','/../member','/provider'])await assert.rejects(f.ports.transport(origin+path+suffix,init(method)));
  for(const badMethod of ['HEAD','PUT','DELETE',method==='GET'?'POST':'GET'])await assert.rejects(f.ports.transport(origin+path,init(badMethod)));
  for(const url of [' '+origin+path,origin+path+' ',origin+path.replace('/auth/','/auth/./'),'https://other.invalid'+path])await assert.rejects(f.ports.transport(url,init(method)));
 }
 for(const path of ['/api/auth/provider','/api/auth/logout','/api/auth/nonce','/api/auth/siwe','/api/auth/member/extra'])await assert.rejects(f.ports.transport(origin+path,init('POST')));
 assert.deepEqual(f.calls,[]);
});
test('account requests retain cookie, extra-header, redirect and bounded JSON restrictions',async()=>{
 const f=await fixture(),url=origin+'/api/auth/ensure-member',good=init('POST');
 for(const altered of [{...good,credentials:'include'},{...good,redirect:'follow'},{...good,headers:{...good.headers,Cookie:'private=fixture'}},{...good,headers:{...good.headers,authorization:'Bearer duplicate'}},{...good,headers:{...good.headers,'X-Member-Id':'forged'}},{...good,body:'x'.repeat(16385)},{...good,headers:{Authorization:'Bearer NONISSUED_SYNTHETIC','Content-Type':'text/plain'}}])await assert.rejects(f.ports.transport(url,altered));
 assert.deepEqual(f.calls,[]);
});
test('Android account paths are exact GET/POST only; redirect, generation and response limits remain (STATIC)',()=>{
 const p='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/MemberTransport.kt',s=fs.lstatSync(p);assert(!s.isSymbolicLink()&&s.isFile()&&s.blocks);const t=fs.readFileSync(p,'utf8');
 assert.match(t,/url\.encodedPath == "\/api\/auth\/member"\) \{ require\(input\.method == "GET" && url\.encodedQuery == null\)/);
 assert.match(t,/url\.encodedPath == "\/api\/auth\/ensure-member"\) \{ require\(input\.method == "POST" && url\.encodedQuery == null\)/);
 for(const required of ['url.fragment == null','url.toString() == input.url','.followRedirects(false)','.followSslRedirects(false)','.retryOnConnectionFailure(false)','transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)','MAX_RESPONSE = 1048576','size <= 16384'])assert(t.includes(required),required);
});
