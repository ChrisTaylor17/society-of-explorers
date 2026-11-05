import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoader} from './load-source.mjs';

const origin='https://native-passage-policy.invalid',providerOrigin='https://passage-provider.invalid';
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nextGeneration='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const publishableKey='sb_publishable_NONISSUED_SYNTHETIC_PUBLIC';
let serial=0;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const turn=()=>new Promise(r=>setTimeout(r,0));
const init=()=>({method:'GET',headers:{},redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});
const locator=(pin,block=0)=>origin+'/api/great-books/passage?'+new URLSearchParams({book:pin.bookId,edition:pin.editionId,block:String(block)});
async function fixture(options={}){
 const calls=[],storageKey='synthetic-passage-'+(++serial),load=sourceLoader();
 const caps={version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,publicPolicy:'circle-discovery-v1',readingPolicy:'pinned-passage-v1',...options.caps};
 const deliver=async(lane,id,input)=>{calls.push({lane,id,...input});return options.reply?options.reply(lane,input):{status:200,url:input.url,redirected:false,body:'{}'};};
 const bridge={capabilities:async()=>caps,begin:async value=>{calls.push({begin:value});return options.begin?options.begin():`handle-${calls.length}`;},send:(id,input)=>deliver('member',id,input),sendPublic:(id,input)=>deliver('public',id,input),sendAuth:(id,input)=>deliver('auth',id,input),cancel:async id=>{calls.push({cancel:id});},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>({previousGeneration:generation,generation:nextGeneration,cleared:true})};
 if(options.noPublic)delete bridge.sendPublic;
 const ports=await load('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey,timeoutMs:options.timeoutMs??200});
 return{calls,bridge,caps,load,ports,pins:load('lib/books/passages.ts').passageCatalog(),config:{origin,storageKey}};
}

test('passage capability is optional and independent of unchanged discovery capability',async()=>{
 for(const caps of [{readingPolicy:undefined},{readingPolicy:'unknown'}]){
  const f=await fixture({caps});assert.equal(f.ports.passageTransport,undefined);await f.ports.publicTransport(origin+'/api/circles',init());assert.equal(f.calls.filter(c=>c.lane).length,1);
 }
 const noEngine=await fixture({noPublic:true});assert.equal(noEngine.ports.passageTransport,undefined);assert.equal(noEngine.ports.publicTransport,undefined);
 const readingOnly=await fixture({caps:{publicPolicy:undefined}});assert.equal(readingOnly.ports.publicTransport,undefined);await readingOnly.ports.passageTransport(locator(readingOnly.pins[0]),init());
});

test('every pinned edition permits only its bounded first and final block with no credential fields',async()=>{
 const f=await fixture();assert(f.pins.length>0);
 for(const pin of f.pins)for(const block of [0,pin.blockCount-1]){
  const response=await f.ports.passageTransport(locator(pin,block),init());assert.equal(JSON.stringify(await response.json()),'{}');
 }
 const sent=f.calls.filter(c=>c.lane);assert.equal(sent.length,f.pins.length*2);assert.equal(f.calls.filter(c=>c.begin).length,sent.length);
 for(const call of sent){assert.equal(call.lane,'public');assert.equal(call.method,'GET');assert.deepEqual(Object.keys(call),['lane','id','url','method']);}
});

test('passage query rejects wrong pins, out-of-range blocks, offsets, identities and noncanonical forms before allocation',async()=>{
 const f=await fixture(),pin=f.pins[0],query=new URL(locator(pin)).search.slice(1),base=origin+'/api/great-books/passage';
 const bad=['','?','?'+query+'&start=0&end=1','?'+query+'&circle=11111111-1111-4111-8111-111111111111','?'+query+'&memberId=synthetic','?'+query+'&authorization=private',
  '?'+query+'&block=0','?'+query.replace('book=','%62ook='),'?'+query.replace(pin.bookId,'%'+pin.bookId.charCodeAt(0).toString(16)+pin.bookId.slice(1)),
  '?'+query.replace('block=0','block=00'),'?'+query.replace('block=0','block=1.0'),'?'+query.replace('block=0','block=1e0'),'?'+query.replace('block=0','block=-1'),
  '?'+query.replace('block=0','block=+1'),'?'+query.replace('block=0','block=%30'),'?'+query.replace('block=0','block='),
  '?'+query.replace('block=0','block=1000000'),'?'+query.replace('block=0','block='+pin.blockCount),
  '?'+query.replace(pin.bookId,'unknown-book'),'?'+query.replace(pin.editionId,pin.editionId.slice(0,-1)+(pin.editionId.endsWith('0')?'1':'0')),
  '?'+new URLSearchParams({edition:pin.editionId,book:pin.bookId,block:'0'}), '?book='+pin.bookId+'&edition='+pin.editionId];
 for(const suffix of bad)await assert.rejects(f.ports.passageTransport(base+suffix,init()),suffix);
 assert.deepEqual(f.calls,[]);
});

test('passage public transport rejects headers, bodies, writes, normalized URLs and cross-channel routes',async()=>{
 const f=await fixture(),url=locator(f.pins[0]);
 for(const headers of [{Authorization:'Bearer NONISSUED_SYNTHETIC'},{apikey:publishableKey},{Cookie:'session=synthetic'},{'Content-Type':'application/json'},{Accept:'application/json'}])await assert.rejects(f.ports.passageTransport(url,{...init(),headers}));
 for(const changed of [{method:'POST'},{method:'HEAD'},{method:'DELETE'},{body:'{}'},{credentials:'include'},{redirect:'follow'},{cache:'default'}])await assert.rejects(f.ports.passageTransport(url,{...init(),...changed}));
 for(const changed of [' '+url,url+' ',url+'#',url.replace('/passage?','/passage/?'),url.replace('/great-books/','/great-books/./'),url.replace(origin,'https://other.invalid')])await assert.rejects(f.ports.passageTransport(changed,init()));
 for(const path of ['/api/circles','/api/auth/member','/api/circles/mine'])await assert.rejects(f.ports.passageTransport(origin+path,init()));
 await assert.rejects(f.ports.publicTransport(url,init()));await assert.rejects(f.ports.transport(url,{...init(),headers:{Authorization:'Bearer NONISSUED_SYNTHETIC'}}));assert.deepEqual(f.calls,[]);
});

test('passage abort and deadline cancel late handles and never start a later send',async()=>{
 for(const mode of ['abort','deadline']){
  const allocation=deferred(),f=await fixture({begin:()=>allocation.promise,timeoutMs:20}),controller=new AbortController();
  const pending=f.ports.passageTransport(locator(f.pins[0]),{...init(),signal:controller.signal});const rejected=assert.rejects(pending);
  await turn();if(mode==='abort')controller.abort();await rejected;allocation.resolve('late-passage');await turn();
  assert.equal(f.calls.filter(c=>c.lane).length,0);assert.deepEqual(f.calls.filter(c=>c.cancel),[{cancel:'late-passage'}]);
 }
});

test('shared account reset retires in-flight passage, discovery and member requests',async()=>{
 const held=deferred(),f=await fixture({reply:()=>held.promise});
 const pending=[f.ports.passageTransport(locator(f.pins[0]),init()),f.ports.publicTransport(origin+'/api/circles',init()),f.ports.transport(origin+'/api/auth/member',{...init(),headers:{Authorization:'Bearer NONISSUED_SYNTHETIC'}})];
 const rejected=Promise.all(pending.map(p=>assert.rejects(p)));await turn();await f.ports.resetAccountStorage();await rejected;
 assert.equal(f.calls.filter(c=>c.lane).length,3);assert.equal(f.calls.filter(c=>c.cancel).length,3);
 held.resolve({status:200,url:locator(f.pins[0]),redirected:false,body:'{}'});await assert.rejects(f.ports.passageTransport(locator(f.pins[0]),init()));
});

test('passage replies reject redirection, changed destination, oversized bodies and stale retained JSON without retries',async()=>{
 for(const change of [{status:302},{url:origin+'/api/great-books/passage'},{redirected:true},{body:'x'.repeat(1048577)}]){
  const f=await fixture({reply:(_lane,input)=>({status:200,url:input.url,redirected:false,body:'{}',...change})});
  await assert.rejects(f.ports.passageTransport(locator(f.pins[0]),init()));assert.equal(f.calls.filter(c=>c.lane).length,1);
 }
 const lost=await fixture({reply:()=>{throw Error('Synthetic lost reply');}});await assert.rejects(lost.ports.passageTransport(locator(lost.pins[0]),init()));assert.equal(lost.calls.filter(c=>c.lane).length,1);
 const f=await fixture(),controller=new AbortController(),response=await f.ports.passageTransport(locator(f.pins[0]),{...init(),signal:controller.signal});controller.abort();await assert.rejects(response.json());
 const g=await fixture(),retained=await g.ports.passageTransport(locator(g.pins[0]),init());await g.ports.resetAccountStorage();await assert.rejects(retained.json());
});

test('owned auth composition preserves optional passage transport and retires its requests and bodies',async()=>{
 const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey}}),ports=await f.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(f.bridge,{...f.config,providerOrigin,publishableKey});
 const retained=await ports.member.passageTransport(locator(f.pins[0]),init());ports.retire();await assert.rejects(retained.json());await assert.rejects(ports.member.passageTransport(locator(f.pins[0]),init()));
 const held=deferred(),g=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey},reply:()=>held.promise}),owned=await g.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(g.bridge,{...g.config,providerOrigin,publishableKey});
 const pending=owned.member.passageTransport(locator(g.pins[0]),init()),rejected=assert.rejects(pending);await turn();owned.retire();await rejected;assert.equal(g.calls.filter(c=>c.cancel).length,1);
 held.resolve({status:200,url:locator(g.pins[0]),redirected:false,body:'{}'});
});

test('Android owned factory forwards trusted reading capability through the existing anonymous native method',async()=>{
 const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey}}),nativeModule={...f.bridge,getConnectivitySnapshot:()=> 'online',onConnectivityChange:()=>({remove(){}})};
 const load=sourceLoader({'react-native':{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>nativeModule}}}),prepared=await load('platforms/native/src/circles/android-member.ts').prepareAndroidAuthPorts();
 await prepared.ports.member.passageTransport(locator(f.pins[0]),init());assert.equal(f.calls.filter(c=>c.lane==='public').length,1);assert.equal(f.calls.filter(c=>c.lane==='auth'||c.lane==='member').length,0);
});

test('Android passage wire policy is bounded and shares anonymous generation/single-send engine (STATIC SOURCE ONLY)',()=>{
 const read=p=>{const s=fs.lstatSync(p);assert(!s.isSymbolicLink()&&s.isFile()&&(!s.size||s.blocks));return fs.readFileSync(p,'utf8');};
 const base='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/',transport=read(base+'MemberTransport.kt'),nativeModule=read(base+'NativeSoeMemberModule.kt'),spec=read('platforms/native/specs/NativeSoeMember.ts');
 const passage=transport.split('private fun validatePassageQuery(')[1]?.split('private fun validate(input: Input)')[0];assert(passage);
 for(const required of ['encoded.length <= 400','listOf("book", "edition", "block")','parts.size == order.size','pair.size == 2 && pair[0] == order[index]','URLEncoder.encode(value, "UTF-8") == pair[1]','pg-[1-9][0-9]{0,9}-[a-f0-9]{64}','query["block"]!!.toInt() in 0..100000'])assert(passage.includes(required),required);
 for(const required of ['url.encodedPath == "/api/great-books/passage"','validatePassageQuery(url.encodedQuery); return','require(url.encodedPath == "/api/circles")','validatePublic(input); transmit(id, input.url, "GET", null, emptyMap()','names == setOf("url", "method")','.cookieJar(CookieJar.NO_COOKIES)','.followRedirects(false)','.retryOnConnectionFailure(false)','transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)','MAX_RESPONSE = 1048576'])assert(transport.includes(required),required);
 assert(nativeModule.includes('putString("readingPolicy", "pinned-passage-v1")'));assert(spec.includes('readingPolicy?: string'));
});
