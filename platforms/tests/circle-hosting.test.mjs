import test from 'node:test';
import assert from 'node:assert/strict';
import {lstatSync} from 'node:fs';
const loaderFile=new URL('./load-source.mjs',import.meta.url),st=lstatSync(loaderFile);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.blocks);
const {sourceLoader}=await import('./load-source.mjs');
const load=sourceLoader(),{createCircleHosting}=load('platforms/shared/circle-hosting.ts');
const {getReadingEdition}=load('lib/circles/reading-program.ts'),{getBook}=load('lib/books/catalog.ts');
const origin='https://hosting.invalid',member='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',subject='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',circle='cccccccc-cccc-4ccc-8ccc-cccccccccccc',other='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const clone=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(r=>setTimeout(r,0));
const deferred=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve};};
const listing=(changes={})=>({title:'Synthetic public Circle',description:'A synthetic reading group.',format:'in_person',city:'Fictional City',region:null,venueName:'Public library',venueType:'library',weekday:2,time:'19:00',timezone:'UTC',startDate:'2030-01-01',maxMembers:8,onlineUrl:null,...changes});
function metadata(id='hamlet'){
 const p=getReadingEdition(id),b=getBook(id),e=p.editionId;
 return {bookId:id,title:b.title,author:b.author,edition:{editionId:e,documentUrl:`/api/great-books/edition/${id}?edition=${e}`,downloadUrl:`/api/great-books/edition/${id}/download?edition=${e}`,sourceCatalogUrl:`https://www.gutenberg.org/ebooks/${b.gutenberg_id}`,sourceArchiveUrl:`https://www.gutenberg.org/cache/epub/${b.gutenberg_id}/pg${b.gutenberg_id}-h.zip`,sourceTitle:p.sourceTitle,sourceAuthor:b.author,attribution:'Synthetic bounded metadata fixture',translators:p.translators,editors:p.editors,illustrators:p.illustrators,licenseUrl:'https://www.gutenberg.org/policy/license.html',licenseNotice:'Synthetic metadata only',editionNotes:[],rights:{jurisdiction:'US',status:'public-domain',authority:'Project Gutenberg',outsideUS:'not-assessed',reviewedAt:'2026-01-01'},blockCount:p.blockCount,contents:p.contents}};
}
function detail(revision=1){return {ready:true,circle:{id:circle,title:'Synthetic public Circle',description:null,format:'in_person',format_label:'In person',city:'Fictional City',region:null,venue_name:'Public library',venue_label:'Library',meeting_label:'Tuesday',weekday:2,time:'19:00',timezone:'UTC',start_date:'2030-01-01',first_meeting:'2030-01-01',next_meeting:'2030-01-01',week:1,reading:null,reading_program:null,program_length:12,member_count:1,max_members:8,spots_left:7,status:'forming',host_name:'Synthetic host',going_next:null,hidden:false},revision,viewer:{signed_in:true,is_member:true,is_host:true},ended:false,capabilities:{canJoin:false,canLeave:true,canRsvp:true,canComplete:true,canReadConversation:true},meetings:[{date:'2030-01-01',going:0,my_status:null}],online_url:null};}
function fixture({timeoutMs=150,keys=true,edition=true}={}){
 let scope='owner',currentSubject=subject,currentMember=member,hook=null,proofHook=null,keyHook=null,jsonHook=null,canCreate=true,now=new Date('2029-12-20T12:00:00Z'),keysUsed=0,commits=0;
 const calls=[],listeners=new Set(),receipts=new Map();
 const response=(url,body,status=200)=>({url,status,redirected:false,json:async()=>jsonHook?jsonHook(body):clone(body)});
 const normal=(url,options)=>{
  if(url.endsWith('/start'))return response(url,{memberId:currentMember,canCreate,activeHosted:canCreate?0:3,maxActiveHosted:3});
  if(url.includes('/great-books/text/'))return response(url,metadata(url.split('/').at(-1)));
  if(options.method==='GET')return response(url,detail());
  const v=JSON.parse(options.body),old=receipts.get(v.requestId);
  if(old&&old.body!==options.body)return response(url,{error:'key conflict'},409);
  if(!old){commits++;receipts.set(v.requestId,{body:options.body});}
  return response(url,{memberId:member,requestId:v.requestId,circleId:circle,receipt:{action:'create',joined:true,completed:false,date:null,status:null},state:{revision:1,isMember:true,isHost:true,hidden:false,completed:false,ended:false,...detail().capabilities},replayed:Boolean(old)},old?200:201);
 };
 const transport=lane=>async(url,options)=>{calls.push({lane,url,options});return hook?hook(url,options,lane,()=>normal(url,options)):normal(url,options);};
 const owner={scope:()=>scope,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async credentials(){return proofHook?proofHook():{subject:currentSubject,bearer:'NONISSUED_HOST_TOKEN'};}};
 const config={origin,memberId:member,owner,transport:transport('member'),hostingTransport:transport('hosting'),...(edition?{editionTransport:transport('edition')}:{}),initialOnline:true,timeoutMs,now:()=>now,...(keys?{newRequestId:async()=>{keysUsed++;return keyHook?keyHook():'eeeeeeee-eeee-4eee-8eee-'+String(keysUsed).padStart(12,'0');}}:{})};
 const session=createCircleHosting(config);session.connect();
 return{session,config,calls,response,normal,get keys(){return keysUsed;},get commits(){return commits;},hook(fn){hook=fn;},proof(fn){proofHook=fn;},key(fn){keyHook=fn;},json(fn){jsonHook=fn;},quota(v){canCreate=v;},date(v){now=new Date(v);},member(v){currentMember=v;},subject(v){currentSubject=v;},notify(){scope+='-next';for(const fn of [...listeners])fn();},close(){session.close();}};
}
const posts=f=>f.calls.filter(c=>c.options.method==='POST');
async function review(f,input=listing()){await f.session.check();await f.session.review(input,true);assert.equal(f.session.model().phase,'review');}
async function create(f){f.session.confirm(true);await f.session.create();}
async function lose(f){await review(f);f.hook((u,o,l,normal)=>{const r=normal();if(o.method==='POST')throw Error('Synthetic lost commit');return r;});await create(f);assert.equal(f.session.model().phase,'unknown');f.hook(null);}

test('connect and lifecycle return never fetch; missing key or edition lane disables corresponding action',async()=>{
 for(const options of [{},{keys:false},{edition:false}]){const f=fixture(options);try{assert.equal(f.calls.length,0);f.session.activity(false);f.session.activity(true);assert.equal(f.calls.length,0);await f.session.check();assert.equal(f.session.model().canReview,options.keys!==false);assert.equal(f.session.model().canLoadEdition,options.edition!==false);}finally{f.close();}}
});
test('fresh check and explicit norms review normalize a detached exact public/private listing',async()=>{
 const f=fixture();try{await f.session.check();await f.session.review(listing(),false);assert.equal(f.session.model().phase,'editing');assert.equal(posts(f).length,0);
 const v=listing({title:'  Synthetic   public Circle  '});await f.session.review(v,true);v.title='Mutated outside';const m=f.session.model();assert.equal(m.review.title,'Synthetic public Circle');m.review.title='Mutated snapshot';assert.equal(f.session.model().review.title,'Synthetic public Circle');assert.equal(m.canNavigate,false);assert.equal(m.canCheck,false);assert.equal(m.canConfirm,false);await f.session.create();assert.equal(posts(f).length,0);await create(f);assert.equal(f.session.model().created.current,true);assert.equal(posts(f)[0].lane,'hosting');assert.equal(JSON.parse(posts(f)[0].options.body).expectedMemberId,member);assert.equal(f.calls.at(-1).lane,'member');assert.equal(f.keys,1);assert.equal(f.commits,1);
 }finally{f.close();}
});
for(const format of ['in_person','online','hybrid'])test(`${format} creation keeps the normalized canonical full form`,async()=>{
 const f=fixture();try{const input=listing(format==='online'?{format,city:null,venueName:null,venueType:'online',onlineUrl:'https://meeting.invalid/private'}:format==='hybrid'?{format,onlineUrl:'https://meeting.invalid/private'}:{});await review(f,input);await create(f);const v=JSON.parse(posts(f)[0].options.body);for(const key of Object.keys(input))assert.deepEqual(v[key],input[key]);assert.equal(f.session.model().phase,'created');}finally{f.close();}
});
test('invalid fields and past/far future first attempts never gain review or allocate keys',async()=>{
 const f=fixture();try{await f.session.check();const count=f.calls.length;for(const input of [listing({startDate:'2020-01-01'}),listing({startDate:'2040-01-01'}),listing({format:'online',onlineUrl:'http://meeting.invalid'}),listing({timezone:'Not/AZone'}),listing({title:'x'})]){await f.session.review(input,true);assert.equal(f.session.model().review,null);}assert.equal(f.calls.length,count);assert.equal(f.keys,0);}finally{f.close();}
});
test('quota is freshly rechecked before first send and cannot be inherited from review',async()=>{
 const f=fixture();try{await review(f);f.quota(false);await create(f);assert.equal(posts(f).length,0);assert.equal(f.keys,0);assert.equal(f.session.model().phase,'unavailable');}finally{f.close();}
});
test('known success needs current readback before New Circle draft; starting another is inert',async()=>{
 const f=fixture();try{await review(f);await create(f);assert.equal(f.session.model().canStartAnother,true);const count=f.calls.length;f.session.startAnother();assert.equal(f.session.model().phase,'idle');assert.equal(f.session.model().created,null);assert.equal(f.calls.length,count);await review(f);await create(f);assert.equal(f.keys,2);assert.equal(f.commits,2);}finally{f.close();}
});
test('lost committed creation requires explicit exact review, ignores changed date/quota and never duplicates',async()=>{
 const f=fixture();try{await lose(f);const body=posts(f)[0].options.body,count=f.calls.length;assert.equal(f.session.model().canNavigate,false);await f.session.review(listing({title:'Another Circle'}),true);await f.session.create();f.session.startAnother();await tick();assert.equal(f.calls.length,count);f.quota(false);f.date('2035-01-01');await f.session.check();assert.equal(f.session.model().phase,'unknown');await f.session.reviewRetry();assert.equal(f.session.model().retryReview,true);assert.equal(f.session.model().review.startDate,'2030-01-01');assert.equal(f.session.model().confirmed,false);await create(f);assert.equal(posts(f)[1].options.body,body);assert.equal(f.keys,1);assert.equal(f.commits,1);assert.equal(f.session.model().created.current,true);}finally{f.close();}
});
for(const code of [401,409,429])test(`a refused ${code} exact retry retains earlier uncertainty`,async()=>{
 const f=fixture();try{await lose(f);await f.session.reviewRetry();f.hook((u,o,l,n)=>o.method==='POST'?f.response(u,{error:'refused'},code):n());await create(f);assert.equal(f.session.model().phase,'unknown');assert.equal(f.session.model().canNavigate,false);assert.equal(posts(f)[1].options.body,posts(f)[0].options.body);assert.equal(f.keys,1);}finally{f.close();}
});
test('initial known refusal permits only a new fresh review and new request key',async()=>{
 const f=fixture();try{await review(f);f.hook((u,o,l,n)=>o.method==='POST'?f.response(u,{error:'refused'},409):n());await create(f);assert.equal(f.session.model().phase,'unavailable');assert.equal(f.session.model().canRetry,false);f.hook(null);await review(f);await create(f);assert.equal(f.keys,2);}finally{f.close();}
});
test('canceling exact retry preserves pending while canceling an unsent review sends nothing',async()=>{
 const f=fixture();try{await review(f);f.session.cancel();assert.equal(f.keys,0);assert.equal(posts(f).length,0);await lose(f);await f.session.reviewRetry();f.session.cancel();assert.equal(f.session.model().phase,'unknown');assert.equal(f.session.model().canRetry,true);}finally{f.close();}
});
for(const retire of ['disconnect','inactive','offline','owner notification'])test(`${retire} hides private listing but permits explicit same-owner recovery`,async()=>{
 const f=fixture();try{await lose(f);const exact=posts(f)[0].options.body;if(retire==='disconnect')f.session.disconnect();if(retire==='inactive')f.session.activity(false);if(retire==='offline')f.session.connectivity(false);if(retire==='owner notification')f.notify();assert.equal(f.session.model().review,null);assert.equal(f.session.model().eligibility,null);const count=f.calls.length;if(retire==='disconnect')f.session.connect();if(retire==='inactive')f.session.activity(true);if(retire==='offline')f.session.connectivity(true);assert.equal(f.calls.length,count);await f.session.check();await f.session.reviewRetry();await create(f);assert.equal(posts(f)[1].options.body,exact);assert.equal(f.commits,1);}finally{f.close();}
});
for(const change of ['member','subject'])test(`verified different ${change} destroys old pending and never resends it`,async()=>{
 const f=fixture();try{await lose(f);f[change](other);await f.session.reviewRetry();assert.equal(f.session.model().canRetry,false);assert.equal(f.session.model().phase,'unavailable');assert.equal(posts(f).length,1);assert.match(f.session.model().message,/may already have been created/);}finally{f.close();}
});
test('terminal close discards recovery and all retained methods remain inert',async()=>{
 const f=fixture();await lose(f);f.close();const n=f.calls.length;f.session.connect();f.session.activity(true);f.session.connectivity(true);await f.session.check();await f.session.reviewRetry();f.session.confirm(true);await f.session.create();assert.equal(f.calls.length,n);assert.equal(f.session.model().phase,'closed');assert.match(f.session.model().message,/may still have created/);
});
for(const field of ['memberId','requestId','action','revision','missing owner'])test(`wrong ${field} creation receipt remains unknown`,async()=>{
 const f=fixture();try{await review(f);f.hook(async(u,o,l,n)=>{const r=n();if(o.method!=='POST')return r;const b=await r.json();if(field==='memberId'||field==='requestId')b[field]=other;else if(field==='action')b.receipt.action='join';else if(field==='revision')b.state.revision=0;else delete b.memberId;return f.response(u,b,201);});await create(f);assert.equal(f.session.model().phase,'unknown');assert.equal(f.session.model().created,null);assert.equal(f.session.model().canStartAnother,false);}finally{f.close();}
});
for(const kind of ['stale','not host','failed'])test(`known creation with ${kind} readback stays known without current authority`,async()=>{
 const f=fixture();try{await review(f);f.hook((u,o,l,n)=>{if(l!=='member')return n();const b=detail(kind==='stale'?0:1);if(kind==='not host'){b.viewer.is_host=false;b.capabilities.canComplete=false;}return f.response(u,b,kind==='failed'?503:200);});await create(f);assert.equal(f.session.model().phase,'created');assert.deepEqual(clone(f.session.model().created),{circleId:circle,current:false});assert.equal(f.session.model().canStartAnother,false);assert.equal(f.session.model().canRetry,false);f.hook(null);await f.session.checkCreated();assert.equal(f.session.model().created.current,true);assert.equal(posts(f).length,1);}finally{f.close();}
});
test('pinned edition verification is anonymous, fresh at review, bounded and detached',async()=>{
 const f=fixture();try{await f.session.check();await f.session.loadEdition('hamlet');const p=getReadingEdition('hamlet'),m=f.session.model();assert.equal(m.edition.bookId,'hamlet');m.edition.edition.blockCount=1;assert.equal(f.session.model().edition.edition.blockCount,p.blockCount);const program={version:1,bookId:p.bookId,editionId:p.editionId,sessions:[{from:41,to:43}]};await f.session.review(listing({readingProgram:program}),true);assert.equal(f.session.model().phase,'review');program.sessions[0].to=99;await create(f);assert.equal(JSON.parse(posts(f)[0].options.body).readingProgram.sessions[0].to,43);const calls=f.calls.filter(c=>c.lane==='edition');assert.equal(calls.length,2);for(const c of calls){assert.deepEqual(clone(c.options.headers),{});assert.equal(c.options.method,'GET');assert.equal(c.options.credentials,'omit');assert.equal(c.options.body,undefined);}}finally{f.close();}
});
test('false edition metadata or out-of-range plan cannot enter review',async()=>{
 const f=fixture();try{await f.session.check();const p=getReadingEdition('hamlet');f.hook((u,o,l,n)=>{if(l!=='edition')return n();const b=metadata();b.edition.blockCount++;return f.response(u,b);});await f.session.review(listing({readingProgram:{version:1,bookId:p.bookId,editionId:p.editionId,sessions:[{from:0,to:2}]}}),true);assert.equal(f.session.model().review,null);assert.equal(f.keys,0);f.hook(null);await f.session.check();await f.session.review(listing({readingProgram:{version:1,bookId:p.bookId,editionId:p.editionId,sessions:[{from:0,to:p.blockCount}]}}),true);assert.equal(f.session.model().review,null);}finally{f.close();}
});
for(const stage of ['proof','key','transport','json'])test(`${stage} deadline fences late completion and grants no review or creation`,async()=>{
 const f=fixture({timeoutMs:15}),held=deferred();try{if(stage!=='proof')await review(f);if(stage==='proof')f.proof(()=>held.promise);if(stage==='key')f.key(()=>held.promise);if(stage==='transport')f.hook((u,o,l,n)=>o.method==='POST'?held.promise:n());if(stage==='json')f.hook((u,o,l,n)=>o.method==='POST'?{...n(),json:()=>held.promise}:n());if(stage==='proof')await f.session.check();else await create(f);const phase=f.session.model().phase;assert.equal(phase,stage==='transport'||stage==='json'?'unknown':'unavailable');held.resolve(stage==='proof'?{subject,bearer:'NONISSUED_HOST_TOKEN'}:stage==='key'?'eeeeeeee-eeee-4eee-8eee-000000000099':stage==='transport'?f.response(origin+'/api/circles',{},201):{});await tick();assert.equal(f.session.model().phase,phase);assert.equal(f.session.model().created,null);if(stage==='key')assert.equal(posts(f).length,0);}finally{f.close();}
});
test('observer retirement during sending prevents any key allocation or POST',async()=>{
 const f=fixture();try{await review(f);const off=f.session.subscribe(m=>{if(m.phase==='sending')f.session.activity(false);});await create(f);off();assert.equal(f.keys,0);assert.equal(posts(f).length,0);assert.equal(f.session.model().review,null);}finally{f.close();}
});

test('canonical capacity normalization is visible before confirmation',async()=>{const f=fixture();try{await review(f,listing({maxMembers:2}));assert.equal(f.session.model().review.maxMembers,3);await create(f);assert.equal(JSON.parse(posts(f)[0].options.body).maxMembers,3);}finally{f.close();}});
test('retirement across edition helper continuations never restores hidden metadata',async()=>{
 for(let depth=0;depth<=10;depth++){const f=fixture();try{await f.session.check();f.hook((u,o,l,n)=>{const r=n();if(l==='edition'){let p=Promise.resolve();for(let i=0;i<depth;i++)p=p.then(()=>{});void p.then(()=>f.session.activity(false));}return r;});await f.session.loadEdition('hamlet');await tick();f.session.activity(true);assert.equal(f.session.model().edition,null,`microtask depth ${depth}`);assert.equal(f.session.model().review,null);assert.equal(posts(f).length,0);}finally{f.close();}}
});

test('host-approved creation keeps admission mode in review and the exact request body',async()=>{
 const f=fixture();try{
  await review(f,listing({admissionMode:'host_approval'}));assert.equal(f.session.model().review.admissionMode,'host_approval');
  await create(f);assert.equal(JSON.parse(posts(f)[0].options.body).admissionMode,'host_approval');assert.equal(f.session.model().phase,'created');
 }finally{f.close();}
});
