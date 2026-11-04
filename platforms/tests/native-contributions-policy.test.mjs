import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoader} from './load-source.mjs';
const origin='https://native-contributions-policy.invalid',generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',after='11111111-1111-4111-8111-111111111111';
async function fixture(){
 const calls=[];
 const bridge={capabilities:async()=>({version:2,origin,storageKey:'synthetic-contributions-policy',redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation}),begin:async()=>{calls.push('begin');return'handle';},send:async(id,input)=>{calls.push({id,...input});return{status:200,url:input.url,redirected:false,body:'{}'};},cancel:async()=>{calls.push('cancel');},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>{throw Error('No reset');}};
 return{calls,ports:await sourceLoader()('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey:'synthetic-contributions-policy'})};
}
const init=(method='GET')=>({method,headers:{Authorization:'Bearer NONISSUED_SYNTHETIC',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{}),redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});
test('actual native ports permit only default-size contributions GET and one UUID continuation',async()=>{
 const f=await fixture();for(const suffix of ['',`?after=${after}`]){const reply=await f.ports.transport(origin+'/api/circles/contributions'+suffix,init());assert.equal(JSON.stringify(await reply.json()),'{}');}
 assert.equal(f.calls.filter(c=>c==='begin').length,2);assert.equal(f.calls.filter(c=>typeof c==='object').length,2);
});
test('contributions limit, duplicate/unknown/encoded parameters and noncanonical paths are refused before native forwarding',async()=>{
 const f=await fixture(),path='/api/circles/contributions';
 for(const suffix of ['?','#','?limit=25','?after=','?after=nope',`?after=${after}&after=${after}`,`?after=${after}&limit=25`,`?after=${after}&memberId=${after}`,`?%61fter=${after}`,`?after=%31${after.slice(1)}`,'/','/../contributions','/withdraw'])await assert.rejects(f.ports.transport(origin+path+suffix,init()));
 for(const url of [' '+origin+path,origin+path+' ',origin+'/api/circles/./contributions','https://other.invalid'+path])await assert.rejects(f.ports.transport(url,init()));
 for(const method of ['POST','PUT','DELETE','HEAD'])await assert.rejects(f.ports.transport(origin+path,init(method)));assert.deepEqual(f.calls,[]);
});
test('contributions GET retains cookie-free exact headers, no body and redirect rejection',async()=>{
 const f=await fixture(),url=origin+'/api/circles/contributions',good=init();
 for(const altered of [{...good,credentials:'include'},{...good,redirect:'follow'},{...good,body:'{}'},{...good,headers:{...good.headers,Cookie:'private=fixture'}},{...good,headers:{...good.headers,authorization:'Bearer duplicate'}},{...good,headers:{...good.headers,'Content-Type':'application/json'}}])await assert.rejects(f.ports.transport(url,altered));assert.deepEqual(f.calls,[]);
});
test('Android contributions GET uses only unique after UUID and preserves strict private transport (STATIC)',()=>{
 const p='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/MemberTransport.kt',s=fs.lstatSync(p);assert(!s.isSymbolicLink()&&s.isFile()&&s.blocks);const t=fs.readFileSync(p,'utf8'),block=t.split('else if (url.encodedPath == "/api/circles/contributions") {')[1]?.split('else if (legacy != null)')[0];assert(block);
 for(const required of ['require(input.method == "GET")','pieces.size == 2 && pieces[0] !in query','query.keys.all { it == "after" }','query["after"]?.let { require(uuid(it)) }'])assert(block.includes(required),required);
 for(const required of ['url.fragment == null','url.toString() == input.url','.followRedirects(false)','.followSslRedirects(false)','.retryOnConnectionFailure(false)','transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)','MAX_RESPONSE = 1048576'])assert(t.includes(required),required);
});
