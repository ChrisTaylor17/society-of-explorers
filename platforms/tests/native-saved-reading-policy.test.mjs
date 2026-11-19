import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoader} from './load-source.mjs';

const origin='https://native-saved-reading.invalid',providerOrigin='https://saved-reading-provider.invalid';
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nextGeneration='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const memberId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',publishableKey='sb_publishable_NONISSUED_SYNTHETIC_PUBLIC';
const bearer='NONISSUED_SYNTHETIC_READING',url=origin+'/api/great-books/progress';
let serial=0;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const turn=()=>new Promise(r=>setTimeout(r,0));
const init=(privateRead=true)=>({method:'GET',headers:privateRead?{Authorization:'Bearer '+bearer}:{},redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});
const save=(pin,blockIndex=0,completed=false)=>({expectedMemberId:memberId,expectedRevision:0,bookId:pin.bookId,action:'save',editionId:pin.editionId,blockIndex,completed});
const remove=pin=>({expectedMemberId:memberId,expectedRevision:0,bookId:pin.bookId,action:'remove'});
const post=value=>({...init(),method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:typeof value==='string'?value:JSON.stringify(value)});
async function fixture(options={}){
 const calls=[],storageKey='synthetic-saved-reading-'+(++serial),load=sourceLoader();
 const caps={version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,publicPolicy:'circle-discovery-v1',readingPolicy:'pinned-passage-v1',profilePolicy:'owner-profile-v1',publicProfilePolicy:'published-profile-v1',savedReadingPolicy:'owner-reading-v1',...options.caps};
 const deliver=async(lane,id,input)=>{calls.push({lane,id,...input});return options.reply?options.reply(lane,input):{status:200,url:input.url,redirected:false,body:'{}'};};
 const bridge={capabilities:async()=>caps,begin:async value=>{calls.push({begin:value});return options.begin?options.begin():`handle-${calls.length}`;},send:(id,input)=>deliver('member',id,input),sendPublic:(id,input)=>deliver('public',id,input),sendAuth:(id,input)=>deliver('auth',id,input),cancel:async id=>{calls.push({cancel:id});},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>({previousGeneration:generation,generation:nextGeneration,cleared:true})};
 const ports=await load('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey,timeoutMs:options.timeoutMs??200});
 return{calls,bridge,caps,load,ports,pins:load('lib/books/passages.ts').passageCatalog(),config:{origin,storageKey}};
}

test('saved-reading capability is optional and leaves existing private and anonymous capabilities independent',async()=>{
 for(const savedReadingPolicy of [undefined,'unknown']){
  const f=await fixture({caps:{savedReadingPolicy}});assert.equal(f.ports.savedReadingTransport,undefined);
  for(const key of ['transport','publicTransport','passageTransport','profileTransport','publicProfileTransport'])assert.equal(typeof f.ports[key],'function');
  await f.ports.transport(origin+'/api/auth/member',init());
 }
 const only=await fixture({caps:{publicPolicy:undefined,readingPolicy:undefined,profilePolicy:undefined,publicProfilePolicy:undefined}});assert.equal(typeof only.ports.savedReadingTransport,'function');assert.equal(only.ports.passageTransport,undefined);
});

test('all pinned books allow exact collection or single-book GET and canonical save/remove CAS bodies',async()=>{
 const f=await fixture();assert.equal(f.pins.length,8);await f.ports.savedReadingTransport(url,init());
 for(const pin of f.pins){await f.ports.savedReadingTransport(url+'?bookId='+pin.bookId,init());for(const completed of [false,true])await f.ports.savedReadingTransport(url,post(save(pin,pin.blockCount-1,completed)));await f.ports.savedReadingTransport(url,post(remove(pin)));}
 const sent=f.calls.filter(c=>c.lane);assert.equal(sent.length,33);assert.equal(f.calls.filter(c=>c.begin).length,33);
 for(const call of sent){assert.equal(call.lane,'member');assert.equal(call.bearer,bearer);assert(!('apikey' in call));if(call.method==='GET')assert(!('body' in call));}
 assert.equal(sent[2].body,JSON.stringify(save(f.pins[0],f.pins[0].blockCount-1,false)));
});

test('saved-reading GET rejects aliases, duplicates, unknown keys and noncanonical book queries before allocation',async()=>{
 const f=await fixture(),pin=f.pins[0];
 for(const suffix of ['?','?bookId=','?bookId=unknown','?bookId='+pin.bookId.toUpperCase(),'?bookId='+pin.bookId+'&bookId='+pin.bookId,'?bookId='+pin.bookId+'&memberId='+memberId,'?memberId='+memberId,'?book='+pin.bookId,'?limit=8','?%62ookId='+pin.bookId,'?bookId=%'+pin.bookId.charCodeAt(0).toString(16)+pin.bookId.slice(1)])await assert.rejects(f.ports.savedReadingTransport(url+suffix,init()),suffix);
 assert.deepEqual(f.calls,[]);
});

test('strict save/remove bodies reject legacy upsert, forged shapes, wrong pins, invalid bounds and missing completion',async()=>{
 const f=await fixture(),pin=f.pins[0],bad=[];
 const change=fn=>{const value=save(pin);fn(value);bad.push(value);};
 for(const key of ['expectedMemberId','expectedRevision','bookId','action','editionId','blockIndex','completed'])change(v=>{delete v[key];});
 change(v=>{v.memberId=memberId;});change(v=>{v.sectionId='0';});change(v=>{v.expectedMemberId=memberId.toUpperCase();});change(v=>{v.bookId='unknown';});change(v=>{v.action='upsert';});change(v=>{v.completed='true';});
 for(const value of [-1,0.5,Number.MAX_SAFE_INTEGER+1,'0',null])change(v=>{v.expectedRevision=value;});
 for(const value of [-1,0.5,pin.blockCount,Number.MAX_SAFE_INTEGER,'0',null])change(v=>{v.blockIndex=value;});
 change(v=>{v.editionId='old-edition';});change(v=>{v.editionId=pin.editionId.slice(0,-1)+(pin.editionId.endsWith('0')?'1':'0');});
 bad.push({bookId:pin.bookId,editionId:pin.editionId,blockIndex:0,completed:false},{...remove(pin),completed:false},{...remove(pin),editionId:pin.editionId},{...remove(pin),blockIndex:0});
 for(const value of bad)await assert.rejects(f.ports.savedReadingTransport(url,post(value)));
 assert.deepEqual(f.calls,[]);
});

test('mutation bytes are fixed-order compact JSON with a private4KiB bound and unchanged existing route bounds',async()=>{
 const f=await fixture(),pin=f.pins[0],value=save(pin);
 for(const body of [JSON.stringify(value,null,2),JSON.stringify({...value,action:undefined}),JSON.stringify({bookId:pin.bookId,expectedMemberId:memberId,expectedRevision:0,action:'remove'}),JSON.stringify(value).replace('"expectedRevision":0','"expectedRevision":0,"expectedRevision":0'),JSON.stringify(value).replace('"expectedRevision":0','"expectedRevision":-0'),JSON.stringify(value).replace('"blockIndex":0','"blockIndex":0.0'),JSON.stringify(value).replace('"action":"save"','"action":"\\u0073ave"'),'null','[]','{',' '.repeat(4097)+JSON.stringify(value)])await assert.rejects(f.ports.savedReadingTransport(url,post(body)));
 assert.deepEqual(f.calls,[]);
 const larger='{'+ ' '.repeat(4096)+'}';await f.ports.transport(origin+'/api/circles/'+memberId+'/discussion',post(larger));
 await assert.rejects(f.ports.transport(origin+'/api/circles/'+memberId+'/discussion',post('x'.repeat(16385))));assert.equal(f.calls.filter(c=>c.begin).length,1);
});

test('saved-reading refuses body/query combinations, methods, unsafe headers and alternate destinations',async()=>{
 const f=await fixture(),pin=f.pins[0];
 for(const target of [url+'/',url+'#',url.replace('/great-books/','/great-books/./'),' '+url,url.replace(origin,'https://other.invalid')])await assert.rejects(f.ports.savedReadingTransport(target,init()));
 await assert.rejects(f.ports.savedReadingTransport(url+'?bookId='+pin.bookId,post(save(pin))));
 for(const change of [{method:'HEAD'},{method:'DELETE'},{body:'{}'},{headers:{}},{headers:{Cookie:'secret',Authorization:'Bearer '+bearer}},{headers:{apikey:publishableKey,Authorization:'Bearer '+bearer}},{headers:{authorization:'Bearer '+bearer,Authorization:'Bearer '+bearer}},{headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'}},{credentials:'include'},{redirect:'follow'},{cache:'default'}])await assert.rejects(f.ports.savedReadingTransport(url,{...init(),...change}));
 await assert.rejects(f.ports.savedReadingTransport(url,{...post(save(pin)),headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json; charset=utf-8'}}));assert.deepEqual(f.calls,[]);
});

test('saved-reading cannot use anonymous passage/discovery/public-profile or ordinary member/profile lanes',async()=>{
 const f=await fixture(),pin=f.pins[0],passage=origin+'/api/great-books/passage?'+new URLSearchParams({book:pin.bookId,edition:pin.editionId,block:'0'});
 for(const key of ['transport','profileTransport','publicTransport','passageTransport','publicProfileTransport'])await assert.rejects(f.ports[key](url,init(key==='transport'||key==='profileTransport')));
 for(const target of [origin+'/api/auth/member',origin+'/api/members/profile',origin+'/api/circles',passage,origin+'/api/explorer/'+memberId])await assert.rejects(f.ports.savedReadingTransport(target,init()));assert.deepEqual(f.calls,[]);
 await f.ports.passageTransport(passage,init(false));assert.deepEqual(Object.keys(f.calls.find(c=>c.lane)),['lane','id','url','method']);
});

test('native generation reset retires concurrent save/remove attempts and prevents later reuse',async()=>{
 const held=deferred(),f=await fixture({reply:()=>held.promise}),pin=f.pins[0];
 const pending=[f.ports.savedReadingTransport(url,post(save(pin))),f.ports.savedReadingTransport(url,post(remove(pin)))],rejected=Promise.all(pending.map(p=>assert.rejects(p)));
 await turn();await f.ports.resetAccountStorage();await rejected;assert.equal(f.calls.filter(c=>c.lane).length,2);assert.equal(f.calls.filter(c=>c.cancel).length,2);
 held.resolve({status:200,url,redirected:false,body:'{}'});await assert.rejects(f.ports.savedReadingTransport(url,init()));
});

test('retained private saved-reading JSON cannot be read after request abort or account retirement',async()=>{
 const f=await fixture(),controller=new AbortController(),response=await f.ports.savedReadingTransport(url,{...init(),signal:controller.signal});controller.abort();await assert.rejects(response.json());
 const retained=await f.ports.savedReadingTransport(url,init());await f.ports.resetAccountStorage();await assert.rejects(retained.json());
});

test('saved-reading abort and deadline cancel late native handles without any later send',async()=>{
 for(const mode of ['abort','deadline']){
  const allocation=deferred(),f=await fixture({begin:()=>allocation.promise,timeoutMs:20}),controller=new AbortController();
  const pending=f.ports.savedReadingTransport(url,{...post(save(f.pins[0])),signal:controller.signal}),rejected=assert.rejects(pending);await turn();if(mode==='abort')controller.abort();await rejected;
  allocation.resolve('late-saved-reading');await turn();assert.equal(f.calls.filter(c=>c.lane).length,0);assert.deepEqual(f.calls.filter(c=>c.cancel),[{cancel:'late-saved-reading'}]);
 }
});

test('lost, redirected, oversized or wrong-destination mutation replies never automatically resend',async()=>{
 for(const change of [{status:302},{redirected:true},{url:url+'?bookId=hamlet'},{body:'x'.repeat(1048577)},null]){
  const f=await fixture({reply:(_lane,input)=>{if(change===null)throw Error('Synthetic lost save reply');return{status:200,url:input.url,redirected:false,body:'{}',...change};}});
  await assert.rejects(f.ports.savedReadingTransport(url,post(remove(f.pins[0]))));assert.equal(f.calls.filter(c=>c.lane).length,1);assert.equal(f.calls.filter(c=>c.begin).length,1);
 }
});

test('owned auth composition wraps saved-reading retirement for pending and retained responses',async()=>{
 const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey}}),ports=await f.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(f.bridge,{...f.config,providerOrigin,publishableKey});
 const retained=await ports.member.savedReadingTransport(url,init());ports.retire();await assert.rejects(retained.json());await assert.rejects(ports.member.savedReadingTransport(url,init()));
 const held=deferred(),g=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey},reply:()=>held.promise}),owned=await g.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(g.bridge,{...g.config,providerOrigin,publishableKey});
 const pending=owned.member.savedReadingTransport(url,init()),rejected=assert.rejects(pending);await turn();owned.retire();await rejected;assert.equal(g.calls.filter(c=>c.cancel).length,1);held.resolve({status:200,url,redirected:false,body:'{}'});
});

test('Android owned factory forwards only trusted saved-reading capability through existing member method',async()=>{
 const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey}}),nativeModule={...f.bridge,getConnectivitySnapshot:()=> 'online',onConnectivityChange:()=>({remove(){}})};
 const load=sourceLoader({'react-native':{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>nativeModule}}}),prepared=await load('platforms/native/src/circles/android-member.ts').prepareAndroidAuthPorts();
 await prepared.ports.member.savedReadingTransport(url,init());assert.equal(f.calls.filter(c=>c.lane==='member').length,1);assert.equal(f.calls.filter(c=>c.lane==='auth'||c.lane==='public').length,0);
});

test('Android saved-reading wire policy is exact and shares generation/single-send engine (STATIC SOURCE ONLY)',()=>{
 const read=p=>{const s=fs.lstatSync(p);assert(!s.isSymbolicLink()&&s.isFile()&&(!s.size||s.blocks));return fs.readFileSync(p,'utf8');};
 const base='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/',transport=read(base+'MemberTransport.kt'),nativeModule=read(base+'NativeSoeMemberModule.kt'),spec=read('platforms/native/specs/NativeSoeMember.ts');
 const saved=transport.split('private fun validateSavedReadingBody(')[1]?.split('private fun validateProfileBody(')[0];assert(saved);
 for(const required of ['body.toByteArray(Charsets.UTF_8).size <= 4096','member == member.lowercase()','version in 0..9007199254740991L','action == "save" || action == "remove"','value.length() == 7','value.length() == 4','position in 0..99999L','completed is Boolean','require(body == canonical)'])assert(saved.includes(required),required);
 for(const required of ['url.encodedPath == "/api/great-books/progress"','query.startsWith("bookId=") && savedReadingBook(query.removePrefix("bookId="))','validateSavedReadingBody(input.body ?: throw IllegalArgumentException())','.cookieJar(CookieJar.NO_COOKIES)','.followRedirects(false)','.retryOnConnectionFailure(false)','transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)','MAX_RESPONSE = 1048576'])assert(transport.includes(required),required);
 const pins=sourceLoader()('lib/books/passages.ts').passageCatalog();for(const pin of pins)assert(transport.includes('"'+pin.bookId+'"'));
 assert(nativeModule.includes('putString("savedReadingPolicy", "owner-reading-v1")'));assert(spec.includes('savedReadingPolicy?: string'));
});
