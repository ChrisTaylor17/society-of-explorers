import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const safe=p=>{const s=fs.lstatSync(p);assert.ok(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks));return fs.readFileSync(p,'utf8');};
safe('platforms/tests/load-source.mjs');
const {sourceLoader}=await import('./load-source.mjs');
const origin='https://native-hosting.invalid',providerOrigin='https://hosting-provider.invalid',generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nextGeneration='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const memberId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',circleId='dddddddd-dddd-4ddd-8ddd-dddddddddddd',requestId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',publishableKey='sb_publishable_NONISSUED_SYNTHETIC_PUBLIC',bearer='NONISSUED_SYNTHETIC_HOST';
const createUrl=origin+'/api/circles',completeUrl=createUrl+'/'+circleId+'/complete',startUrl=createUrl+'/start',editionUrl=origin+'/api/great-books/text/hamlet';
let serial=0;const turn=()=>new Promise(r=>setTimeout(r,0));
const deferred=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve};};
const init=(privateRead=true)=>({method:'GET',headers:privateRead?{Authorization:'Bearer '+bearer}:{},redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});
const input=(changes={})=>({expectedMemberId:memberId,requestId,title:'Synthetic public Circle',description:null,format:'in_person',city:'Synthetic City',region:null,venueName:'Public library',venueType:'library',weekday:2,time:'19:00',timezone:'UTC',startDate:'2030-01-01',maxMembers:8,onlineUrl:null,...changes});
const completion=(changes={})=>({expectedMemberId:memberId,requestId,expectedRevision:0,...changes});
const post=v=>({...init(),method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:typeof v==='string'?v:JSON.stringify(v)});
async function fixture(options={}){
 const calls=[],storageKey='synthetic-hosting-'+(++serial),load=sourceLoader();
 const caps={version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,publicPolicy:'circle-discovery-v1',readingPolicy:'pinned-passage-v1',profilePolicy:'owner-profile-v1',publicProfilePolicy:'published-profile-v1',savedReadingPolicy:'owner-reading-v1',attendancePolicy:'circle-rsvp-v1',hostingPolicy:'circle-host-v1',...options.caps};
 const deliver=async(lane,id,input)=>{calls.push({lane,id,...input});return options.reply?options.reply(lane,input):{status:200,url:input.url,redirected:false,body:'{}'};};
 const bridge={capabilities:async()=>caps,begin:async value=>{calls.push({begin:value});return options.begin?options.begin():`handle-${calls.length}`;},send:(id,input)=>deliver('member',id,input),sendPublic:(id,input)=>deliver('public',id,input),sendAuth:(id,input)=>deliver('auth',id,input),cancel:async id=>{calls.push({cancel:id});},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>({previousGeneration:generation,generation:nextGeneration,cleared:true})};
 if(options.noPublic)delete bridge.sendPublic;
 const ports=await load('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey,timeoutMs:options.timeoutMs??200});
 return{calls,bridge,caps,load,ports,config:{origin,storageKey}};
}
test('host capability is optional; old bridge lanes do not acquire hosting or metadata access',async()=>{
 for(const hostingPolicy of [undefined,'unknown']){const f=await fixture({caps:{hostingPolicy}});assert.equal(f.ports.hostingTransport,undefined);assert.equal(f.ports.editionTransport,undefined);for(const key of ['transport','publicTransport','passageTransport','profileTransport','publicProfileTransport','savedReadingTransport','attendanceTransport'])assert.equal(typeof f.ports[key],'function');assert.deepEqual(f.calls,[]);}
 const f=await fixture({noPublic:true});assert.equal(typeof f.ports.hostingTransport,'function');assert.equal(f.ports.editionTransport,undefined);
});
test('hosting exact GET and normalized full create/completion bodies each transmit once',async()=>{
 const f=await fixture();await f.ports.hostingTransport(startUrl,init());
 for(const format of ['in_person','online','hybrid']){const v=input(format==='online'?{format,venueName:null,venueType:'online',onlineUrl:'https://meeting.invalid/private'}:format==='hybrid'?{format,onlineUrl:'https://meeting.invalid/private'}:{});await f.ports.hostingTransport(createUrl,post(v));}
 await f.ports.hostingTransport(completeUrl,post(completion({expectedRevision:Number.MAX_SAFE_INTEGER})));
 const sent=f.calls.filter(c=>c.lane);assert.equal(sent.length,5);assert(sent.every(c=>c.lane==='member'&&c.bearer===bearer));assert.equal(f.calls.filter(c=>c.begin).length,5);
});
test('all eight pinned edition metadata paths are anonymous, exact, and independent of discovery capability',async()=>{
 const f=await fixture({caps:{publicPolicy:undefined}}),pins=f.load('lib/circles/reading-program.ts').READING_EDITIONS;
 for(const p of pins)await f.ports.editionTransport(origin+'/api/great-books/text/'+p.bookId,init(false));
 assert.equal(pins.length,8);assert.equal(f.calls.filter(c=>c.lane==='public').length,8);for(const c of f.calls.filter(c=>c.lane))assert.deepEqual(Object.keys(c),['lane','id','url','method']);
});
test('creation supports twelve exact pinned ranges and bounded full multibyte fields',async()=>{
 const f=await fixture(),p=f.load('lib/circles/reading-program.ts').getReadingEdition('hamlet');
 const v=input({title:'界'.repeat(120),description:'界'.repeat(600),city:'界'.repeat(80),region:'界'.repeat(40),venueName:'界'.repeat(120),readingProgram:{version:1,bookId:p.bookId,editionId:p.editionId,sessions:Array.from({length:12},(_,n)=>({from:n,to:p.blockCount-1}))}});
 assert(Buffer.byteLength(JSON.stringify(v))>3000);await f.ports.hostingTransport(createUrl,post(v));assert.equal(f.calls.filter(c=>c.lane).length,1);
 for(const program of [{...v.readingProgram,sessions:[]},{...v.readingProgram,sessions:Array(13).fill({from:0,to:1})},{...v.readingProgram,editionId:'changed'},{...v.readingProgram,sessions:[{from:0,to:p.blockCount}]},{...v.readingProgram,sessions:[{from:2,to:1}]}])await assert.rejects(f.ports.hostingTransport(createUrl,post({...v,readingProgram:program})));
 assert.equal(f.calls.filter(c=>c.lane).length,1);
});
test('strict create parser rejects missing/extra/coerced/unnormalized fields before allocation',async()=>{
 const f=await fixture(),missing=input();delete missing.onlineUrl;
 for(const v of [missing,input({extra:true}),input({expectedMemberId:memberId.toUpperCase()}),input({requestId:'bad'}),input({weekday:'2'}),input({maxMembers:2}),input({maxMembers:8.1}),input({title:'  Synthetic public Circle'}),input({description:''}),input({format:['online']}),input({startDate:'2030-02-30'}),input({timezone:'__proto__'}),input({onlineUrl:'https://unneeded.invalid/'}),input({format:'online',venueName:null,venueType:'online',onlineUrl:'http://meeting.invalid/'})])await assert.rejects(f.ports.hostingTransport(createUrl,post(v)));
 assert.deepEqual(f.calls,[]);
});
test('strict completion requires canonical owner/key/safe revision and exactly three fields',async()=>{
 const f=await fixture();for(const v of [completion({expectedMemberId:memberId.toUpperCase()}),completion({requestId:'bad'}),completion({expectedRevision:-1}),completion({expectedRevision:'0'}),completion({expectedRevision:0.5}),completion({expectedRevision:Number.MAX_SAFE_INTEGER+1}),completion({extra:true}),{requestId,expectedRevision:0}])await assert.rejects(f.ports.hostingTransport(completeUrl,post(v)));assert.deepEqual(f.calls,[]);
});
test('canonical JSON order/encoding/duplicate-key and UTF8 limits reject before native allocation',async()=>{
 const f=await fixture(),v=input(),body=JSON.stringify(v),complete=JSON.stringify(completion());
 for(const invalid of [JSON.stringify(v,null,2),JSON.stringify({...v,expectedMemberId:undefined}),body.replace('"weekday":2','"weekday":2,"weekday":2'),body.replace('"weekday":2','"weekday":2.0'),body.replace('"title":"Synthetic','"title":"\\u0053ynthetic'),body+' ',body+' '.repeat(12001),JSON.stringify(input({description:'界'.repeat(5000)}))])await assert.rejects(f.ports.hostingTransport(createUrl,post(invalid)));
 for(const invalid of [complete+' ',JSON.stringify({requestId,expectedMemberId:memberId,expectedRevision:0}),complete.replace(':0',':-0'),complete.replace(':0',':0e0'),complete+' '.repeat(161)])await assert.rejects(f.ports.hostingTransport(completeUrl,post(invalid)));
 assert.deepEqual(f.calls,[]);await f.ports.transport(origin+'/api/circles/'+circleId+'/discussion',post('x'.repeat(16384)));await assert.rejects(f.ports.transport(origin+'/api/circles/'+circleId+'/discussion',post('x'.repeat(16385))));
});
test('historical normalized create date remains wire-valid for exact SQL replay',async()=>{const f=await fixture();await f.ports.hostingTransport(createUrl,post(input({startDate:'2020-01-01'})));assert.equal(f.calls.filter(c=>c.lane).length,1);});
test('hosting routes and metadata reject alternate origin, query, encoding, path, and method',async()=>{
 const f=await fixture();for(const u of [createUrl+'?',createUrl+'?x=1',completeUrl+'?',completeUrl.replace(circleId,circleId.toUpperCase()),createUrl+'/',origin+'/api/circles/%73tart',origin+'/api/circles/'+circleId+'/complete/','https://other.invalid/api/circles'])await assert.rejects(f.ports.hostingTransport(u,post(input())));
 for(const u of [editionUrl+'?',editionUrl+'?edition=x',editionUrl+'/',origin+'/api/great-books/text/Hamlet',origin+'/api/great-books/text/unknown',origin+'/api/great-books/text/%68amlet',origin+'/api/great-books/edition/hamlet'])await assert.rejects(f.ports.editionTransport(u,init(false)));
 for(const [u,o] of [[startUrl,post(input())],[createUrl,init()],[completeUrl,init()],[editionUrl,post(input())]])await assert.rejects((u===editionUrl?f.ports.editionTransport:f.ports.hostingTransport)(u,o));assert.deepEqual(f.calls,[]);
});
test('anonymous metadata refuses every credential/header/body and private hosting requires bearer JSON',async()=>{
 const f=await fixture();for(const headers of [{Authorization:'Bearer '+bearer},{Cookie:'secret'},{apikey:publishableKey},{'Content-Type':'application/json'}])await assert.rejects(f.ports.editionTransport(editionUrl,{...init(false),headers}));await assert.rejects(f.ports.editionTransport(editionUrl,{...init(false),body:''}));
 for(const change of [{headers:{}},{headers:{Authorization:'Bearer '+bearer}},{headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json',Cookie:'secret'}},{headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json; charset=utf-8'}},{redirect:'follow'},{credentials:'include'},{cache:'default'}])await assert.rejects(f.ports.hostingTransport(createUrl,{...post(input()),...change}));assert.deepEqual(f.calls,[]);
});
test('all existing lanes reject hosting mutations and anonymous metadata; host lanes reject unrelated routes',async()=>{
 const f=await fixture();for(const key of ['transport','publicTransport','passageTransport','profileTransport','publicProfileTransport','savedReadingTransport','attendanceTransport'])for(const [u,o] of [[startUrl,init()],[createUrl,post(input())],[completeUrl,post(completion())],[editionUrl,init(false)]])await assert.rejects(f.ports[key](u,o));
 for(const [u,o] of [[origin+'/api/auth/member',init()],[origin+'/api/circles/'+circleId,init()],[origin+'/api/circles/'+circleId+'/join',post(completion())],[origin+'/api/members/profile',init()],[origin+'/api/great-books/progress',init()]])await assert.rejects(f.ports.hostingTransport(u,o));await assert.rejects(f.ports.editionTransport(createUrl,init(false)));assert.deepEqual(f.calls,[]);
});
test('generation reset retires both host and anonymous metadata response bodies and future requests',async()=>{
 const f=await fixture(),a=await f.ports.hostingTransport(startUrl,init()),b=await f.ports.editionTransport(editionUrl,init(false));await f.ports.resetAccountStorage();await assert.rejects(a.json());await assert.rejects(b.json());await assert.rejects(f.ports.hostingTransport(createUrl,post(input())));await assert.rejects(f.ports.editionTransport(editionUrl,init(false)));
});
test('late allocation abort/deadline cancels once and sends neither private nor anonymous request',async()=>{
 for(const lane of ['hosting','edition'])for(const mode of ['abort','deadline']){const held=deferred(),f=await fixture({begin:()=>held.promise,timeoutMs:15}),controller=new AbortController(),transport=lane==='hosting'?f.ports.hostingTransport:f.ports.editionTransport;
 const pending=transport(lane==='hosting'?createUrl:editionUrl,{...(lane==='hosting'?post(input()):init(false)),signal:controller.signal}),rejected=assert.rejects(pending);await turn();if(mode==='abort')controller.abort();await rejected;held.resolve('late-hosting');await turn();assert.equal(f.calls.filter(c=>c.lane).length,0);assert.deepEqual(f.calls.filter(c=>c.cancel),[{cancel:'late-hosting'}]);}
});
test('lost/malformed host reply cannot cause automatic resend',async()=>{
 for(const change of [{status:302},{redirected:true},{url:createUrl+'?'},{body:'x'.repeat(1048577)},null]){const f=await fixture({reply:(_lane,input)=>{if(change===null)throw Error('Synthetic lost creation');return{status:200,url:input.url,redirected:false,body:'{}',...change};}});await assert.rejects(f.ports.hostingTransport(createUrl,post(input())));assert.equal(f.calls.filter(c=>c.lane).length,1);assert.equal(f.calls.filter(c=>c.begin).length,1);}
});
test('owned auth retirement fences both optional lanes and retained JSON',async()=>{
 const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey}}),owned=await f.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(f.bridge,{...f.config,providerOrigin,publishableKey});
 const a=await owned.member.hostingTransport(startUrl,init()),b=await owned.member.editionTransport(editionUrl,init(false));owned.retire();await assert.rejects(a.json());await assert.rejects(b.json());await assert.rejects(owned.member.hostingTransport(createUrl,post(input())));await assert.rejects(owned.member.editionTransport(editionUrl,init(false)));
});
test('Android owned adapter forwards optional hosting and edition through existing methods',async()=>{
 for(const hostingPolicy of ['circle-host-v1',undefined]){const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey,hostingPolicy}}),nativeModule={...f.bridge,getConnectivitySnapshot:()=> 'online',onConnectivityChange:()=>({remove(){}})},load=sourceLoader({'react-native':{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>nativeModule}}}),prepared=await load('platforms/native/src/circles/android-member.ts').prepareAndroidAuthPorts();
 if(hostingPolicy){await prepared.ports.member.hostingTransport(startUrl,init());await prepared.ports.member.editionTransport(editionUrl,init(false));assert.deepEqual(f.calls.filter(c=>c.lane).map(c=>c.lane),['member','public']);}else{assert.equal(prepared.ports.member.hostingTransport,undefined);assert.equal(prepared.ports.member.editionTransport,undefined);}}
});
test('Android hosting wire bounds and shared generation/single-send engine are present (STATIC SOURCE ONLY)',()=>{
 const base='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/',t=safe(base+'MemberTransport.kt'),mod=safe(base+'NativeSoeMemberModule.kt'),spec=safe('platforms/native/specs/NativeSoeMember.ts');
 const creation=t.split('private fun validateCreationBody(')[1]?.split('private fun savedReadingBook(')[0],completion=t.split('private fun validateCompletionBody(')[1]?.split('private fun validateCreationBody(')[0];assert(creation&&completion);
 for(const required of ['body.toByteArray(Charsets.UTF_8).size <= 12000','member == member.lowercase()','key == key.lowercase()','attendanceDay(startDate)','sessions.length() in 1..12','beginning in 0..99999L','require(body == canonical + "}")'])assert(creation.includes(required),required);
 for(const required of ['body.toByteArray(Charsets.UTF_8).size <= 160','setOf("expectedMemberId", "requestId", "expectedRevision")','version in 0..9007199254740991L','require(body =='])assert(completion.includes(required),required);
 for(const required of ['"/api/circles/start"','validateCreationBody(input.body ?: throw IllegalArgumentException())','validateCompletionBody(input.body ?: throw IllegalArgumentException())','/api/great-books/text/([a-z-]+)','.cookieJar(CookieJar.NO_COOKIES)','.followRedirects(false)','.retryOnConnectionFailure(false)','transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)','MAX_RESPONSE = 1048576'])assert(t.includes(required),required);
 assert(mod.includes('putString("hostingPolicy", "circle-host-v1")'));assert(spec.includes('hostingPolicy?: string'));
});
