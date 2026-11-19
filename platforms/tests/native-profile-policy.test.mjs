import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoader} from './load-source.mjs';

const origin='https://native-profile-policy.invalid',providerOrigin='https://profile-provider.invalid';
const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nextGeneration='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const memberId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',publishableKey='sb_publishable_NONISSUED_SYNTHETIC_PUBLIC';
const bearer='NONISSUED_SYNTHETIC_PROFILE';
const ownerUrl=origin+'/api/members/profile',publicUrl=origin+'/api/explorer/'+memberId;
let serial=0;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const turn=()=>new Promise(r=>setTimeout(r,0));
const init=(privateRead=false)=>({method:'GET',headers:privateRead?{Authorization:'Bearer '+bearer}:{},redirect:'error',credentials:'omit',cache:'no-store',signal:new AbortController().signal});
const patch=()=>({displayName:'Synthetic Explorer',bio:'An authored bio',discipline:'History',skills:['Reading','Questions'],projectDescription:'A project',seeking:'A study group',philosophy:'Keep learning',visibility:'private'});
const body=()=>({expectedMemberId:memberId,expectedRevision:0,patch:patch()});
const post=(value=body())=>({...init(true),method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:typeof value==='string'?value:JSON.stringify(value)});
async function fixture(options={}){
 const calls=[],storageKey='synthetic-profile-'+(++serial),load=sourceLoader();
 const caps={version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,publicPolicy:'circle-discovery-v1',readingPolicy:'pinned-passage-v1',profilePolicy:'owner-profile-v1',publicProfilePolicy:'published-profile-v1',...options.caps};
 const deliver=async(lane,id,input)=>{calls.push({lane,id,...input});return options.reply?options.reply(lane,input):{status:200,url:input.url,redirected:false,body:'{}'};};
 const bridge={capabilities:async()=>caps,begin:async value=>{calls.push({begin:value});return options.begin?options.begin():`handle-${calls.length}`;},send:(id,input)=>deliver('member',id,input),sendPublic:(id,input)=>deliver('public',id,input),sendAuth:(id,input)=>deliver('auth',id,input),cancel:async id=>{calls.push({cancel:id});},read:async()=>null,write:async()=>{},remove:async()=>{},resetAccountStorage:async()=>({previousGeneration:generation,generation:nextGeneration,cleared:true})};
 if(options.noPublic)delete bridge.sendPublic;
 const ports=await load('platforms/native/src/circles/native-ports.ts').createNativeMemberPorts(bridge,{origin,storageKey,timeoutMs:options.timeoutMs??200});
 return{calls,bridge,caps,load,ports,config:{origin,storageKey}};
}

test('profile capabilities are optional and independent of existing member/discovery/passage channels',async()=>{
 for(const caps of [{profilePolicy:undefined,publicProfilePolicy:undefined},{profilePolicy:'unknown',publicProfilePolicy:'unknown'}]){
  const f=await fixture({caps});assert.equal(f.ports.profileTransport,undefined);assert.equal(f.ports.publicProfileTransport,undefined);
  await f.ports.transport(origin+'/api/auth/member',init(true));await f.ports.publicTransport(origin+'/api/circles',init());assert.equal(typeof f.ports.passageTransport,'function');
 }
 const privateOnly=await fixture({caps:{publicProfilePolicy:undefined}});assert.equal(typeof privateOnly.ports.profileTransport,'function');assert.equal(privateOnly.ports.publicProfileTransport,undefined);
 const publicOnly=await fixture({caps:{profilePolicy:undefined}});assert.equal(publicOnly.ports.profileTransport,undefined);assert.equal(typeof publicOnly.ports.publicProfileTransport,'function');
 const missing=await fixture({noPublic:true});assert.equal(missing.ports.publicProfileTransport,undefined);assert.equal(typeof missing.ports.profileTransport,'function');
});

test('private channel sends exact owner GET and canonical normalized full CAS POST once',async()=>{
 const f=await fixture();await f.ports.profileTransport(ownerUrl,init(true));
 for(const visibility of ['private','public']){const value=body();value.patch.visibility=visibility;value.patch.bio='Quotes "and" \\ paths\nNext\tline\rReturn';value.expectedRevision=Number.MAX_SAFE_INTEGER;await f.ports.profileTransport(ownerUrl,post(value));}
 const sent=f.calls.filter(c=>c.lane);assert.equal(sent.length,3);assert.equal(f.calls.filter(c=>c.begin).length,3);
 for(const c of sent){assert.equal(c.lane,'member');assert.equal(c.bearer,bearer);assert.equal(c.url,ownerUrl);assert(!('apikey' in c));}
 assert(!('body' in sent[0]));assert.equal(sent[1].body,JSON.stringify({...body(),expectedRevision:Number.MAX_SAFE_INTEGER,patch:{...patch(),bio:'Quotes "and" \\ paths\nNext\tline\rReturn'}}));
});

test('profile POST rejects partial/extra/protected fields, nonnormalized text and ambiguous JSON before handle allocation',async()=>{
 const f=await fixture(),bad=[];
 const change=fn=>{const value=body();fn(value);bad.push(JSON.stringify(value));};
 change(v=>{delete v.patch.bio;});change(v=>{delete v.patch.visibility;});change(v=>{v.patch.email='private@example.invalid';});change(v=>{v.memberId=memberId;});
 change(v=>{v.patch.displayName='  Explorer';});change(v=>{v.patch.skills=[' Reading'];});change(v=>{v.patch.visibility='unknown';});change(v=>{v.expectedMemberId=memberId.toUpperCase();});
 for(const revision of [-1,1.5,Number.MAX_SAFE_INTEGER+1,'0',null])change(v=>{v.expectedRevision=revision;});
 for(const value of ['',' '.repeat(3),'\ud800','a\u0000b','x'.repeat(201)])change(v=>{v.patch.displayName=value;});
 change(v=>{v.patch.skills=Array(41).fill('skill');});change(v=>{v.patch.skills=['x'.repeat(101)];});change(v=>{v.patch.bio='x'.repeat(2001);});
 bad.push(JSON.stringify(body(),null,2),JSON.stringify(body()).replace('"expectedRevision":0','"expectedRevision":0,"expectedRevision":0'),JSON.stringify(body()).replace('"bio":','"bio":"ignored","bio":'),JSON.stringify(body()).replace('"expectedRevision":0','"expectedRevision":-0'),JSON.stringify(body()).replace('Synthetic','\\u0053ynthetic'),JSON.stringify({patch:patch(),expectedRevision:0,expectedMemberId:memberId}),'null','[]','{','x'.repeat(65537));
 for(const value of bad)await assert.rejects(f.ports.profileTransport(ownerUrl,post(value)));
 assert.deepEqual(f.calls,[]);
});

test('full valid multibyte profile exceeds old 16 KiB bound but keeps all other route limits unchanged',async()=>{
 const f=await fixture(),value=body();value.patch={displayName:'界'.repeat(200),bio:'界'.repeat(2000),discipline:'界'.repeat(100),skills:Array(40).fill('界'.repeat(100)),projectDescription:'界'.repeat(2000),seeking:'界'.repeat(1000),philosophy:'界'.repeat(2000),visibility:'public'};
 const request=post(value);assert(Buffer.byteLength(request.body)>16384);assert(Buffer.byteLength(request.body)<=65536);
 await f.ports.profileTransport(ownerUrl,request);assert.equal(f.calls.filter(c=>c.lane).length,1);
 await assert.rejects(f.ports.transport(origin+'/api/circles/'+memberId+'/discussion',request));assert.equal(f.calls.filter(c=>c.begin).length,1);
});

test('private profile denies queries, alternate paths, methods, headers and normalized destinations',async()=>{
 const f=await fixture();
 for(const url of [ownerUrl+'?',ownerUrl+'?memberId='+memberId,ownerUrl+'/',ownerUrl+'#',ownerUrl.replace('/members/','/members/./'),' '+ownerUrl,ownerUrl.replace(origin,'https://other.invalid')])await assert.rejects(f.ports.profileTransport(url,init(true)));
 for(const value of [{method:'HEAD'},{method:'PUT'},{body:'{}'},{credentials:'include'},{redirect:'follow'},{cache:'default'},{headers:{}},{headers:{Authorization:'Bearer '+bearer,Cookie:'private'}},{headers:{Authorization:'Bearer '+bearer,apikey:publishableKey}},{headers:{Authorization:'Bearer '+bearer,authorization:'Bearer '+bearer}},{headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'}}])await assert.rejects(f.ports.profileTransport(ownerUrl,{...init(true),...value}));
 await assert.rejects(f.ports.profileTransport(ownerUrl,{...post(),headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json; charset=utf-8'}}));assert.deepEqual(f.calls,[]);
});

test('published-profile reads are exact lowercase UUID anonymous GET without body or identity headers',async()=>{
 const f=await fixture();await f.ports.publicProfileTransport(publicUrl,init());assert.deepEqual(f.calls.filter(c=>c.lane),[{lane:'public',id:'handle-1',url:publicUrl,method:'GET'}]);
 const before=f.calls.length;
 for(const url of [publicUrl+'?',publicUrl+'?memberId='+memberId,publicUrl+'/',publicUrl+'#',publicUrl.replace(memberId,memberId.toUpperCase()),publicUrl.replace(memberId,'not-an-id')])await assert.rejects(f.ports.publicProfileTransport(url,init()));
 for(const value of [{method:'POST'},{method:'HEAD'},{body:'{}'},{headers:{Authorization:'Bearer '+bearer}},{headers:{Cookie:'secret'}},{headers:{apikey:publishableKey}},{headers:{Accept:'application/json'}},{credentials:'include'},{redirect:'follow'},{cache:'default'}])await assert.rejects(f.ports.publicProfileTransport(publicUrl,{...init(),...value}));assert.equal(f.calls.length,before);
});

test('profile and existing member/discovery/passage lanes cannot be substituted for one another',async()=>{
 const f=await fixture(),pin=f.load('lib/books/passages.ts').passageCatalog()[0],passage=origin+'/api/great-books/passage?'+new URLSearchParams({book:pin.bookId,edition:pin.editionId,block:'0'});
 for(const transport of [f.ports.transport,f.ports.publicTransport,f.ports.passageTransport])for(const url of [ownerUrl,publicUrl])await assert.rejects(transport(url,transport===f.ports.transport?init(true):init()));
 for(const url of [origin+'/api/auth/member',origin+'/api/circles',passage,publicUrl])await assert.rejects(f.ports.profileTransport(url,init(true)));
 for(const url of [ownerUrl,origin+'/api/circles',passage])await assert.rejects(f.ports.publicProfileTransport(url,init()));assert.deepEqual(f.calls,[]);
});

test('account reset retires pending private saves and public reads in the same native generation',async()=>{
 const held=deferred(),f=await fixture({reply:()=>held.promise});
 const pending=[f.ports.profileTransport(ownerUrl,post()),f.ports.publicProfileTransport(publicUrl,init())],rejected=Promise.all(pending.map(p=>assert.rejects(p)));
 await turn();await f.ports.resetAccountStorage();await rejected;assert.equal(f.calls.filter(c=>c.lane).length,2);assert.equal(f.calls.filter(c=>c.cancel).length,2);
 held.resolve({status:200,url:ownerUrl,redirected:false,body:'{}'});await assert.rejects(f.ports.profileTransport(ownerUrl,post()));await assert.rejects(f.ports.publicProfileTransport(publicUrl,init()));
});

test('retained profile JSON cannot be read after request abort or account retirement',async()=>{
 for(const channel of ['profileTransport','publicProfileTransport']){
  const f=await fixture(),controller=new AbortController(),url=channel==='profileTransport'?ownerUrl:publicUrl,options={...init(channel==='profileTransport'),signal:controller.signal};
  const response=await f.ports[channel](url,options);controller.abort();await assert.rejects(response.json());
  const retained=await f.ports[channel](url,init(channel==='profileTransport'));await f.ports.resetAccountStorage();await assert.rejects(retained.json());
 }
});

test('profile abort/deadline cancels late handles without any send or automatic retry',async()=>{
 for(const mode of ['abort','deadline']){
  const allocation=deferred(),f=await fixture({begin:()=>allocation.promise,timeoutMs:20}),controller=new AbortController();
  const pending=f.ports.profileTransport(ownerUrl,{...post(),signal:controller.signal}),rejected=assert.rejects(pending);await turn();if(mode==='abort')controller.abort();await rejected;
  allocation.resolve('late-profile');await turn();assert.equal(f.calls.filter(c=>c.lane).length,0);assert.deepEqual(f.calls.filter(c=>c.cancel),[{cancel:'late-profile'}]);
 }
});

test('lost, redirected, oversized or wrong-destination save replies never trigger another transmission',async()=>{
 for(const change of [{status:302},{redirected:true},{url:publicUrl},{body:'x'.repeat(1048577)},null]){
  const f=await fixture({reply:(_lane,input)=>{if(change===null)throw Error('Synthetic lost save reply');return{status:200,url:input.url,redirected:false,body:'{}',...change};}});
  await assert.rejects(f.ports.profileTransport(ownerUrl,post()));assert.equal(f.calls.filter(c=>c.lane).length,1);assert.equal(f.calls.filter(c=>c.begin).length,1);
 }
});

test('owned auth composition exposes both optional channels and retires in-flight and retained profile data',async()=>{
 for(const channel of ['profileTransport','publicProfileTransport']){
  const url=channel==='profileTransport'?ownerUrl:publicUrl,options=init(channel==='profileTransport');
  const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey}}),ports=await f.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(f.bridge,{...f.config,providerOrigin,publishableKey});
  const retained=await ports.member[channel](url,options);ports.retire();await assert.rejects(retained.json());await assert.rejects(ports.member[channel](url,options));
  const held=deferred(),g=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey},reply:()=>held.promise}),owned=await g.load('platforms/native/src/auth/native-auth-ports.ts').createNativeAuthPorts(g.bridge,{...g.config,providerOrigin,publishableKey});
  const pending=owned.member[channel](url,options),rejected=assert.rejects(pending);await turn();owned.retire();await rejected;assert.equal(g.calls.filter(c=>c.cancel).length,1);held.resolve({status:200,url,redirected:false,body:'{}'});
 }
});

test('Android owned factory forwards trusted profile capabilities using existing member and anonymous methods',async()=>{
 const f=await fixture({caps:{authPolicy:'supabase-password-v1',providerOrigin,publishableKey}}),nativeModule={...f.bridge,getConnectivitySnapshot:()=> 'online',onConnectivityChange:()=>({remove(){}})};
 const load=sourceLoader({'react-native':{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>nativeModule}}}),prepared=await load('platforms/native/src/circles/android-member.ts').prepareAndroidAuthPorts();
 await prepared.ports.member.profileTransport(ownerUrl,init(true));await prepared.ports.member.publicProfileTransport(publicUrl,init());assert.equal(f.calls.filter(c=>c.lane==='member').length,1);assert.equal(f.calls.filter(c=>c.lane==='public').length,1);assert.equal(f.calls.filter(c=>c.lane==='auth').length,0);
});

test('Android profile wire policy preserves canonical full CAS, anonymous publication path and generation engine (STATIC SOURCE ONLY)',()=>{
 const read=p=>{const s=fs.lstatSync(p);assert(!s.isSymbolicLink()&&s.isFile()&&(!s.size||s.blocks));return fs.readFileSync(p,'utf8');};
 const base='platforms/native/android/app/src/main/java/com/anonymous/soesyntheticdemo/member/',transport=read(base+'MemberTransport.kt'),nativeModule=read(base+'NativeSoeMemberModule.kt'),spec=read('platforms/native/specs/NativeSoeMember.ts');
 const profile=transport.split('private fun validateProfileBody(')[1]?.split('companion object')[0];assert(profile);
 for(const required of ['body.toByteArray(Charsets.UTF_8).size <= 65536','value.length() == 3','member == member.lowercase()','version in 0..9007199254740991L','patch.length() == 8','listOf("displayName", "bio", "discipline", "skills", "projectDescription", "seeking", "philosophy", "visibility")','entry.length() <= 40','profileText(skill, 100, true, true)','require(body ==','value == value.trim','profileQuote'])assert(profile.includes(required),required);
 for(const required of ['url.encodedPath == "/api/members/profile"','validateProfileBody(input.body ?: throw IllegalArgumentException())','65536 else 16384','/api/explorer/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','validatePublic(input); transmit(id, input.url, "GET", null, emptyMap()','.cookieJar(CookieJar.NO_COOKIES)','.followRedirects(false)','.retryOnConnectionFailure(false)','transmission.sent.compareAndSet(false, true)','store.withGeneration(generation)','MAX_RESPONSE = 1048576'])assert(transport.includes(required),required);
 for(const [cap,value] of [['profilePolicy','owner-profile-v1'],['publicProfilePolicy','published-profile-v1']]){assert(nativeModule.includes(`putString("${cap}", "${value}")`));assert(spec.includes(cap+'?: string'));}
});
