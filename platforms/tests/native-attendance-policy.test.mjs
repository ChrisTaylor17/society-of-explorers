import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoader} from './load-source.mjs';

const origin='https://native-attendance.invalid',providerOrigin='https://attendance-provider.invalid';
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nextGeneration='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const memberId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',circleId='dddddddd-dddd-4ddd-8ddd-dddddddddddd',requestId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const publishableKey='sb_publishable_NONISSUED_SYNTHETIC_PUBLIC',bearer='NONISSUED_SYNTHETIC_ATTENDANCE',url=origin+'/api/circles/'+circleId+'/rsvp';
let serial=0;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const turn=()=>new Promise(r=>setTimeout(r,0));
const init=(privateRead=true)=>({method:'GET',headers:privateRead?{Authorization:'Bearer '+bearer}:{},redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});
const value=(changes={})=>({expectedMemberId:memberId,requestId,expectedRevision:0,date:'2028-02-29',status:'going',...changes});
const post=v=>({...init(),method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:typeof v==='string'?v:JSON.stringify(v)});
async function fixture(options={}){
 const calls=[],storageKey='synthetic-attendance-'+(++serial),load=sourceLoader();
 const caps={version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,publicPolicy:'circle-discovery-v1',readingPolicy:'pinned-passage-v1',profilePolicy:'owner-profile-v1',publicProfilePolicy:'published-profile-v1',savedReadingPolicy:'owner-reading-v1',attendancePolicy:'circle-rsvp-v1',...options.caps};
 const deliver=async(lane,id,input)=>{calls.push({lane,id,...input});return options.reply?options.reply(lane,input):{status:200,url:input.url,redirected:false,body:'{}'};};
 const bridge={capabilities:async()=>caps,begin:async v=>{calls.push({begin:v});return options.begin?options.begin():`handle-${calls.length}`;},send:(id,input)=>deliver('member',id,input),sendPublic:(id,input)=>deliver('public',id,input),sendAuth:(id,input)=>deliver('auth',id,input),cancel:async id=>{calls.push({cancel:id});},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>({previousGeneration:generation,generation:nextGeneration,cleared:true})};
 const ports=await load('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey,timeoutMs:options.timeoutMs??200});
 return{calls,bridge,caps,load,ports,config:{origin,storageKey}};
}

test('attendance capability is optional and does not alter existing member or anonymous lanes',async()=>{
 for(const attendancePolicy of [undefined,'unknown']){
  const f=await fixture({caps:{attendancePolicy}});assert.equal(f.ports.attendanceTransport,undefined);
  for(const key of ['transport','publicTransport','passageTransport','profileTransport','publicProfileTransport','savedReadingTransport'])assert.equal(typeof f.ports[key],'function');
  await f.ports.transport(origin+'/api/auth/member',init());
 }
 const only=await fixture({caps:{publicPolicy:undefined,readingPolicy:undefined,profilePolicy:undefined,publicProfilePolicy:undefined,savedReadingPolicy:undefined}});
 assert.equal(typeof only.ports.attendanceTransport,'function');assert.equal(only.ports.publicTransport,undefined);assert.deepEqual(only.calls,[]);
});

test('exact owner-bound attendance wire allows both responses and real calendar dates once per invocation',async()=>{
 const f=await fixture(),contract=f.load('lib/circles/membership.ts');
 for(const date of ['0000-02-29','2000-02-29','2028-02-29','2099-12-31'])for(const status of ['going','not_going']){
  const v=value({date,status,expectedRevision:Number.MAX_SAFE_INTEGER});
  assert.equal(contract.circleAttendanceMutationBody(contract.parseCircleAttendanceMutation(v)),JSON.stringify(v));
  await f.ports.attendanceTransport(url,post(v));
 }
 const sent=f.calls.filter(c=>c.lane);assert.equal(sent.length,8);assert.equal(f.calls.filter(c=>c.begin).length,8);
 for(const call of sent){assert.equal(call.lane,'member');assert.equal(call.bearer,bearer);assert.equal(call.method,'POST');assert.equal(call.url,url);assert.equal(Object.keys(call).join(','),'lane,id,url,method,bearer,body');}
});

test('attendance rejects noncanonical routes and all queries before allocating a native request',async()=>{
 const f=await fixture();
 for(const target of [url+'?',url+'?date=2028-02-29',url+'?requestId='+requestId,url+'/',url+'#',url.replace(circleId,circleId.toUpperCase()),url.replace('/rsvp','/%72svp'),url.replace('/rsvp','/./rsvp'),' '+url,url.replace(origin,'https://other.invalid'),url.replace('https://','http://')])await assert.rejects(f.ports.attendanceTransport(target,post(value())),target);
 assert.deepEqual(f.calls,[]);
});

test('attendance rejects missing owner, malformed identity, extra fields and a third response state',async()=>{
 const f=await fixture(),bad=[];
 const change=fn=>{const v=value();fn(v);bad.push(v);};
 for(const key of Object.keys(value()))change(v=>{delete v[key];});
 for(const key of ['memberId','circleId','action','completed'])change(v=>{v[key]=key;});
 for(const key of ['expectedMemberId','requestId'])for(const invalid of [memberId.toUpperCase(),'invalid',null,42])change(v=>{v[key]=invalid;});
 for(const status of [null,'remove','maybe','Going',true,0])change(v=>{v.status=status;});
 for(const v of bad)await assert.rejects(f.ports.attendanceTransport(url,post(v)));assert.deepEqual(f.calls,[]);
});

test('attendance validates Gregorian dates and safe numeric revisions without wire coercion',async()=>{
 const f=await fixture();
 for(const date of ['1900-02-29','2027-02-29','2028-04-31','2028-00-01','2028-13-01','2028-01-00','2028-2-29','2028-02-29T00:00:00Z','2028-02-29 ',null,42])await assert.rejects(f.ports.attendanceTransport(url,post(value({date}))));
 for(const expectedRevision of [-1,0.5,Number.MAX_SAFE_INTEGER+1,'0',null,true])await assert.rejects(f.ports.attendanceTransport(url,post(value({expectedRevision}))));assert.deepEqual(f.calls,[]);
});

test('attendance JSON is exact compact ordered bytes and limited to256UTF8 bytes',async()=>{
 const f=await fixture(),v=value(),body=JSON.stringify(v);
 for(const invalid of [JSON.stringify(v,null,2),JSON.stringify({requestId,expectedMemberId:memberId,expectedRevision:0,date:v.date,status:v.status}),body.replace('"expectedRevision":0','"expectedRevision":0,"expectedRevision":0'),body.replace('"expectedRevision":0','"expectedRevision":-0'),body.replace('"expectedRevision":0','"expectedRevision":0.0'),body.replace('"expectedRevision":0','"expectedRevision":0e0'),body.replace('"going"','"\\u0067oing"'),body+' ','null','[]','{',' '.repeat(257)+body,value({status:'é'.repeat(130)})])await assert.rejects(f.ports.attendanceTransport(url,post(invalid)));
 assert.deepEqual(f.calls,[]);
 await f.ports.transport(origin+'/api/circles/'+circleId+'/discussion',post('x'.repeat(16384)));
 await assert.rejects(f.ports.transport(origin+'/api/circles/'+circleId+'/discussion',post('x'.repeat(16385))));assert.equal(f.calls.filter(c=>c.begin).length,1);
});

test('attendance accepts only explicit POST with bearer, JSON and omit/error/no-store request policy',async()=>{
 const f=await fixture();
 for(const change of [{method:'GET'},{method:'HEAD'},{method:'DELETE'},{body:undefined},{headers:{}},{headers:{Authorization:'Bearer '+bearer}},{headers:{Cookie:'secret',Authorization:'Bearer '+bearer,'Content-Type':'application/json'}},{headers:{apikey:publishableKey,Authorization:'Bearer '+bearer,'Content-Type':'application/json'}},{headers:{authorization:'Bearer '+bearer,Authorization:'Bearer '+bearer,'Content-Type':'application/json'}},{headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json; charset=utf-8'}},{credentials:'include'},{redirect:'follow'},{cache:'default'}])await assert.rejects(f.ports.attendanceTransport(url,{...post(value()),...change}));
 assert.deepEqual(f.calls,[]);
});

test('attendance is isolated from all ordinary private, profile, saved-reading and anonymous routes',async()=>{
 const f=await fixture();
 for(const key of ['transport','profileTransport','savedReadingTransport','publicTransport','passageTransport','publicProfileTransport'])await assert.rejects(f.ports[key](url,post(value())));
 for(const target of [origin+'/api/auth/member',origin+'/api/auth/ensure-member',origin+'/api/members/profile',origin+'/api/great-books/progress',origin+'/api/circles',origin+'/api/circles/'+circleId,origin+'/api/circles/'+circleId+'/join',origin+'/api/circles/'+circleId+'/leave',origin+'/api/explorer/'+memberId])await assert.rejects(f.ports.attendanceTransport(target,post(value())));
 assert.deepEqual(f.calls,[]);
 await f.ports.publicTransport(origin+'/api/circles',init(false));assert.deepEqual(Object.keys(f.calls.find(c=>c.lane)),['lane','id','url','method']);
});

test('account generation reset aborts attendance and retires retained replies and later reuse',async()=>{
 const f=await fixture(),retained=await f.ports.attendanceTransport(url,post(value()));await f.ports.resetAccountStorage();await assert.rejects(retained.json());await assert.rejects(f.ports.attendanceTransport(url,post(value())));
 const held=deferred(),g=await fixture({reply:()=>held.promise});
 const pending=g.ports.attendanceTransport(url,post(value())),rejected=assert.rejects(pending);await turn();await g.ports.resetAccountStorage();await rejected;
 assert.equal(g.calls.filter(c=>c.lane).length,1);assert.equal(g.calls.filter(c=>c.cancel).length,1);held.resolve({status:200,url,redirected:false,body:'{}'});
});

test('attendance abort/deadline cancels late allocation without a late transmission',async()=>{
 for(const mode of ['abort','deadline']){
  const allocation=deferred(),f=await fixture({begin:()=>allocation.promise,timeoutMs:20}),controller=new AbortController();
  const pending=f.ports.attendanceTransport(url,{...post(value()),signal:controller.signal}),rejected=assert.rejects(pending);await turn();if(mode==='abort')controller.abort();await rejected;
  allocation.resolve('late-attendance');await turn();assert.equal(f.calls.filter(c=>c.lane).length,0);assert.deepEqual(f.calls.filter(c=>c.cancel),[{cancel:'late-attendance'}]);
 }
 const f=await fixture(),controller=new AbortController(),response=await f.ports.attendanceTransport(url,{...post(value()),signal:controller.signal});controller.abort();await assert.rejects(response.json());
});

test('lost or invalid attendance replies cannot cause an automatic resend',async()=>{
 for(const change of [{status:302},{redirected:true},{url:url+'?'},{body:'x'.repeat(1048577)},null]){
  const f=await fixture({reply:(_lane,input)=>{if(change===null)throw Error('Synthetic lost attendance reply');return{status:200,url:input.url,redirected:false,body:'{}',...change};}});
  await assert.rejects(f.ports.attendanceTransport(url,post(value())));assert.equal(f.calls.filter(c=>c.lane).length,1);assert.equal(f.calls.filter(c=>c.begin).length,1);
 }
});

test('owned auth composition retires pending attendance and retained response JSON',async()=>{
 const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey}}),ports=await f.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(f.bridge,{...f.config,providerOrigin,publishableKey});
 const retained=await ports.member.attendanceTransport(url,post(value()));ports.retire();await assert.rejects(retained.json());await assert.rejects(ports.member.attendanceTransport(url,post(value())));
 const held=deferred(),g=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey},reply:()=>held.promise}),owned=await g.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(g.bridge,{...g.config,providerOrigin,publishableKey});
 const pending=owned.member.attendanceTransport(url,post(value())),rejected=assert.rejects(pending);await turn();owned.retire();await rejected;assert.equal(g.calls.filter(c=>c.cancel).length,1);held.resolve({status:200,url,redirected:false,body:'{}'});
});

test('Android owned factory forwards the optional attendance policy through the existing native send method',async()=>{
 for(const attendancePolicy of ['circle-rsvp-v1',undefined]){
  const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey,attendancePolicy}}),nativeModule={...f.bridge,getConnectivitySnapshot:()=> 'online',onConnectivityChange:()=>({remove(){}})};
  const load=sourceLoader({'react-native':{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>nativeModule}}}),prepared=await load('platforms/native/src/circles/android-member.ts').prepareAndroidAuthPorts();
  if(attendancePolicy){await prepared.ports.member.attendanceTransport(url,post(value()));assert.equal(f.calls.filter(c=>c.lane==='member').length,1);assert.equal(f.calls.filter(c=>c.lane==='auth'||c.lane==='public').length,0);}
  else assert.equal(prepared.ports.member.attendanceTransport,undefined);
 }
});

test('Android attendance policy independently bounds its wire and shares the generation/single-send engine (STATIC SOURCE ONLY)',()=>{
 const read=p=>{const s=fs.lstatSync(p);assert(!s.isSymbolicLink()&&s.isFile()&&(!s.size||s.blocks));return fs.readFileSync(p,'utf8');};
 const base='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/',transport=read(base+'MemberTransport.kt'),nativeModule=read(base+'NativeSoeMemberModule.kt'),spec=read('platforms/native/specs/NativeSoeMember.ts');
 const attendance=transport.split('private fun validateAttendanceBody(')[1]?.split('private fun savedReadingBook(')[0];assert(attendance);
 for(const required of ['body.toByteArray(Charsets.UTF_8).size <= 256','setOf("expectedMemberId", "requestId", "expectedRevision", "date", "status")','member == member.lowercase()','requestId == requestId.lowercase()','version in 0..9007199254740991L','attendanceDay(date)','status in setOf("going", "not_going")','require(body ==','year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)','return day in 1..days'])assert(attendance.includes(required),required);
 for(const required of ['Regex("/api/circles/([0-9a-f-]{36})/rsvp")','uuid(attendance.groupValues[1]) && input.method == "POST" && url.encodedQuery == null','validateAttendanceBody(input.body ?: throw IllegalArgumentException())','.cookieJar(CookieJar.NO_COOKIES)','.followRedirects(false)','.retryOnConnectionFailure(false)','transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)','MAX_RESPONSE = 1048576'])assert(transport.includes(required),required);
 assert(nativeModule.includes('putString("attendancePolicy", "circle-rsvp-v1")'));assert(spec.includes('attendancePolicy?: string'));
});
