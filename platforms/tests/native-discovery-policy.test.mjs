import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoader} from './load-source.mjs';

const origin='https://native-discovery-policy.invalid',providerOrigin='https://provider-policy.invalid';
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nextGeneration='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const circle='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const publishableKey='sb_publishable_NONISSUED_SYNTHETIC_PUBLIC';
let serial=0;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const turn=()=>new Promise(r=>setTimeout(r,0));
const init=(member=false,method='GET',body)=>({method,headers:{...(member?{Authorization:'Bearer NONISSUED_SYNTHETIC'}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body}),redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});
async function fixture(options={}){
 const calls=[],storageKey='synthetic-discovery-'+(++serial),caps={version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,publicPolicy:'circle-discovery-v1',...options.caps};
 const deliver=async(lane,id,input)=>{calls.push({lane,id,...input});return options.reply?options.reply(lane,input):{status:200,url:input.url,redirected:false,body:'{}'};};
 const bridge={capabilities:async()=>caps,begin:async value=>{calls.push({begin:value});return options.begin?options.begin():`handle-${calls.length}`;},send:(id,input)=>deliver('member',id,input),sendPublic:(id,input)=>deliver('public',id,input),sendAuth:(id,input)=>deliver('auth',id,input),cancel:async id=>{calls.push({cancel:id});},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>({previousGeneration:generation,generation:nextGeneration,cleared:true})};
 if(options.noPublic)delete bridge.sendPublic;
 const load=sourceLoader(),ports=await load('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey,timeoutMs:options.timeoutMs??200});
 return{calls,bridge,caps,load,ports,config:{origin,storageKey}};
}

test('legacy native capability stays valid and public channel requires both policy and method',async()=>{
 for(const options of [{caps:{publicPolicy:undefined}},{caps:{publicPolicy:'unknown'}},{noPublic:true}]){
  const f=await fixture(options);assert.equal(f.ports.publicTransport,undefined);
  await f.ports.transport(origin+'/api/auth/member',init(true));assert.equal(f.calls.filter(c=>c.lane==='member').length,1);
 }
});

test('public discovery canonical pages and full pinned reading context send no credentials',async()=>{
 const f=await fixture(),{READING_EDITIONS}=f.load('lib/circles/reading-program.ts'),edition=READING_EDITIONS[0];
 const queries=['','?q=Plato+Tuesday&city=Montr%C3%A9al&format=online&open=1&sort=title&limit=2&cursor=abc_-123',`?book=${edition.bookId}&edition=${edition.editionId}&from=0&to=1`,'?q=%F0%9F%93%96','?cursor='+('a'.repeat(4096))];
 for(const query of queries)await f.ports.publicTransport(origin+'/api/circles'+query,init());
 assert.equal(f.calls.filter(c=>c.begin).length,queries.length);
 const sent=f.calls.filter(c=>c.lane);assert.equal(sent.length,queries.length);
 for(const call of sent){assert.equal(call.lane,'public');assert.deepEqual(Object.keys(call),['lane','id','url','method']);assert.equal(call.method,'GET');}
});

test('public discovery rejects malformed, noncanonical, duplicate and unbounded query before allocation',async()=>{
 const f=await fixture(),bad=['?','#','/','/../circles','?q=','?q=two%20words','?q=two++words','?q=+word','?q='+('x'.repeat(161)),'?city='+('x'.repeat(81)),'?q=x&q=y','?%71=x','?q=%78','?city=x&q=y','?sort=next','?format=hybrid','?open=0','?limit=25','?limit=0','?limit=26','?limit=02','?cursor=','?cursor='+('x'.repeat(4097)),'?cursor=a%3D','?unknown=1','?book=apology','?book=apology&edition=unverified','?from=0&to=1','?q=%ED%A0%80','?q=line%0Abreak'];
 for(const suffix of bad)await assert.rejects(f.ports.publicTransport(origin+'/api/circles'+suffix,init()),suffix);
 for(const url of [' '+origin+'/api/circles',origin+'/api/circles ',origin+'/api/./circles','https://other.invalid/api/circles'])await assert.rejects(f.ports.publicTransport(url,init()));
 assert.deepEqual(f.calls,[]);
});

test('public lane rejects every credential/header, body, write method and authenticated route',async()=>{
 const f=await fixture(),url=origin+'/api/circles';
 for(const headers of [{Authorization:'Bearer NONISSUED_SYNTHETIC'},{apikey:publishableKey},{Cookie:'session=synthetic'},{'Content-Type':'application/json'},{Accept:'application/json'}])await assert.rejects(f.ports.publicTransport(url,{...init(),headers}));
 for(const changed of [{method:'POST'},{method:'HEAD'},{method:'DELETE'},{body:'{}'},{credentials:'include'},{redirect:'follow'},{cache:'default'}])await assert.rejects(f.ports.publicTransport(url,{...init(),...changed}));
 for(const path of ['/api/auth/member','/api/circles/mine',`/api/circles/${circle}`,`/api/circles/${circle}/membership`,`/api/circles/${circle}/join`])await assert.rejects(f.ports.publicTransport(origin+path,init()));
 await assert.rejects(f.ports.transport(url,init(true)));assert.deepEqual(f.calls,[]);
});

test('authenticated directory reads stay exact and mine is default25 after-only',async()=>{
 const f=await fixture();
 for(const path of ['/api/circles/mine','/api/circles/mine?after='+circle,`/api/circles/${circle}`,`/api/circles/${circle}/membership`])await f.ports.transport(origin+path,init(true));
 assert.equal(f.calls.filter(c=>c.lane==='member').length,4);
 for(const path of ['/api/circles/mine?','/api/circles/mine?limit=25','/api/circles/mine?after='+circle+'&after='+circle,'/api/circles/mine?%61fter='+circle,`/api/circles/${circle}?`, `/api/circles/${circle}/membership?extra=1`,`/api/circles/${circle}/join`])await assert.rejects(f.ports.transport(origin+path,init(true)));
 for(const path of ['/api/circles/mine',`/api/circles/${circle}`,`/api/circles/${circle}/membership`])await assert.rejects(f.ports.transport(origin+path,init(true,'POST','{}')));
 assert.equal(f.calls.filter(c=>c.begin).length,4);
});

test('join/leave permit only exact canonical request ID and current safe revision envelope',async()=>{
 const f=await fixture();
 for(const action of ['join','leave'])for(const body of [JSON.stringify({requestId,expectedRevision:0}),JSON.stringify({expectedRevision:Number.MAX_SAFE_INTEGER,requestId})])await f.ports.transport(`${origin}/api/circles/${circle}/${action}`,init(true,'POST',body));
 const wrong=[{}, {requestId}, {expectedRevision:0},{requestId,expectedRevision:-1},{requestId,expectedRevision:0.5},{requestId,expectedRevision:Number.MAX_SAFE_INTEGER+1},{requestId:'bad',expectedRevision:1},{requestId,expectedRevision:'1'},{requestId,expectedRevision:1,memberId:circle}];
 for(const value of wrong)await assert.rejects(f.ports.transport(`${origin}/api/circles/${circle}/join`,init(true,'POST',JSON.stringify(value))));
 for(const body of [`{"requestId":"${requestId}","requestId":"${requestId}","expectedRevision":0}`,`{"requestId":"${requestId}","expectedRevision":1e0}`,JSON.stringify({requestId,expectedRevision:1},null,2),'[]','null','x'])await assert.rejects(f.ports.transport(`${origin}/api/circles/${circle}/leave`,init(true,'POST',body)));
 for(const path of [`/${circle}/join?`,`/${circle}/leave?after=${circle}`,`/${circle}/complete`,`/${circle}/rsvp`])await assert.rejects(f.ports.transport(origin+'/api/circles'+path,init(true,'POST',JSON.stringify({requestId,expectedRevision:1}))));
 assert.equal(f.calls.filter(c=>c.begin).length,4);assert.equal(f.calls.filter(c=>c.lane==='member').length,4);
});

test('public abort and deadline cancel late allocation without any transmission',async()=>{
 for(const mode of ['abort','deadline']){
  const allocation=deferred(),f=await fixture({begin:()=>allocation.promise,timeoutMs:20}),controller=new AbortController();
  const pending=f.ports.publicTransport(origin+'/api/circles',{...init(),signal:controller.signal});const rejected=assert.rejects(pending);
  await turn();if(mode==='abort')controller.abort();await rejected;allocation.resolve('late-handle');await turn();
  assert.equal(f.calls.filter(c=>c.lane).length,0);assert.deepEqual(f.calls.filter(c=>c.cancel),[{cancel:'late-handle'}]);
 }
});

test('account reset cancels public and member work together and retires retained public JSON',async()=>{
 const held=deferred(),f=await fixture({reply:()=>held.promise});
 const publicPending=f.ports.publicTransport(origin+'/api/circles',init()),memberPending=f.ports.transport(origin+'/api/circles/mine',init(true));
 const rejected=Promise.all([assert.rejects(publicPending),assert.rejects(memberPending)]);await turn();await f.ports.resetAccountStorage();await rejected;
 assert.equal(f.calls.filter(c=>c.cancel).length,2);
 held.resolve({status:200,url:origin+'/api/circles',redirected:false,body:'{}'});
 await assert.rejects(f.ports.publicTransport(origin+'/api/circles',init()));
 const g=await fixture(),reply=await g.ports.publicTransport(origin+'/api/circles',init());await g.ports.resetAccountStorage();await assert.rejects(reply.json());
});

test('public replies enforce bounded body, exact destination, no redirects and JSON lifetime',async()=>{
 for(const change of [{status:302},{url:origin+'/api/circles?cursor=other'},{redirected:true},{body:'x'.repeat(1048577)}]){
  const f=await fixture({reply:(_lane,input)=>({status:200,url:input.url,redirected:false,body:'{}',...change})});
  await assert.rejects(f.ports.publicTransport(origin+'/api/circles',init()));assert.equal(f.calls.filter(c=>c.lane).length,1);
 }
 const f=await fixture(),controller=new AbortController(),reply=await f.ports.publicTransport(origin+'/api/circles',{...init(),signal:controller.signal});controller.abort();await assert.rejects(reply.json());
});

test('owned auth composition forwards separate public capability and retires both channels',async()=>{
 const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey}}),ports=await f.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(f.bridge,{...f.config,providerOrigin,publishableKey});
 const reply=await ports.member.publicTransport(origin+'/api/circles',init());assert.equal(f.calls.filter(c=>c.lane==='public').length,1);
 ports.retire();await assert.rejects(reply.json());await assert.rejects(ports.member.publicTransport(origin+'/api/circles',init()));await assert.rejects(ports.member.transport(origin+'/api/circles/mine',init(true)));
});

test('Android adapter forwards the optional public method and owned factory includes it',async()=>{
 const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey}}),nativeModule={...f.bridge,getConnectivitySnapshot:()=> 'online',onConnectivityChange:()=>({remove(){}})};
 const load=sourceLoader({'react-native':{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>nativeModule}}}),adapter=load('platforms/native/src/circles/android-member.ts');
 const prepared=await adapter.prepareAndroidAuthPorts();await prepared.ports.member.publicTransport(origin+'/api/circles',init());
 assert.equal(prepared.connectivity.snapshot(),'online');assert.equal(f.calls.filter(c=>c.lane==='public').length,1);
});

test('Android public/member routes retain independent credential boundary and shared engine (STATIC SOURCE ONLY)',()=>{
 const read=p=>{const s=fs.lstatSync(p);assert(!s.isSymbolicLink()&&s.isFile()&&(!s.size||s.blocks));return fs.readFileSync(p,'utf8');};
 const base='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/',transport=read(base+'MemberTransport.kt'),nativeModule=read(base+'NativeSoeMemberModule.kt'),spec=read('platforms/native/specs/NativeSoeMember.ts');
 for(const required of ['fun sendPublic(', 'validatePublic(input); transmit(id, input.url, "GET", null, emptyMap()', 'url.encodedPath == "/api/circles"','query.keys.toList() == order.filter { it in query }','URLEncoder.encode(value, "UTF-8") == pair[1]','names == setOf("url", "method")','version in 0..9007199254740991L','parsed.length() == 2','/api/circles/mine','/(join|leave)','(?:/membership)?','.cookieJar(CookieJar.NO_COOKIES)','.followRedirects(false)','.retryOnConnectionFailure(false)','transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)','MAX_RESPONSE = 1048576'])assert(transport.includes(required),required);
 assert(nativeModule.includes('putString("publicPolicy", "circle-discovery-v1")'));assert(nativeModule.includes('override fun sendPublic('));assert(spec.includes('sendPublic(id: string, request: PublicRequest)'));
});
