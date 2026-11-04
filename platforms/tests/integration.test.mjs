import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createCircleHost,memberCircleConfig} from '../quest/circle-host.mjs';
import {mountExistingMemberCircle} from '../quest/member-circle-page.mjs';
import {sourceLoader} from './load-source.mjs';
const circle='11111111-1111-4111-8111-111111111111',root='22222222-2222-4222-8222-222222222222',child='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',origin='https://platform-fixture.invalid';
const item=(id=root,extra={})=>({id,member_name:'Fictional Reader',content:'A synthetic human contribution.',created_at:'2026-11-04T10:00:00.123456Z',is_mine:false,visibility:'visible',parentMessageId:null,rootMessageId:id,...extra});
const page=(extra={})=>({kind:'archive',circleId:circle,items:[item()],nextCursor:null,limit:25,...extra});
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture(){
 let scope='nonissued-scope',credentialGate=null,responseGate=null,status=200,body=page();const requests=[],listeners=new Set();
 const config={circleId:circle,origin,owner:{scope:()=>scope,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},bearer:async()=>{if(credentialGate)await credentialGate.promise;return'NONISSUED_FIXTURE';}},transport:async(url,init)=>{requests.push({url,init});if(responseGate)await responseGate.promise;return{status,url,redirected:false,json:async()=>body};}};
 const host=createCircleHost(config);host.connect();
 return{host,config,requests,listeners,setBody:x=>body=x,setStatus:x=>status=x,credentials:g=>credentialGate=g,response:g=>responseGate=g,identity(value){scope=value;for(const fn of listeners)fn();}};
}
test('member bootstrap accepts only an explicit UUID, HTTPS origin, verifying existing client and supplied transport',()=>{
 const auth={getSession(){throw Error('must not call');},getUser(){throw Error('must not call');},onAuthStateChange(){throw Error('must not call');}},base={circleId:circle,origin,auth,transport:()=>{throw Error('must not call');}};
 assert.equal(memberCircleConfig(base).circleId,circle);
 for(const extra of [{circleId:'fictional-person'},{circleId:'11111111-1111-0111-0111-111111111111'},{origin:'http://localhost'},{origin:origin+'/path'},{origin:'https://private@platform-fixture.invalid'},{auth:{getSession(){}}},{transport:undefined},{verificationTimeoutMs:Infinity}])assert.equal(memberCircleConfig({...base,...extra}),null);
});
test('registered native App renders the existing Circle product entry and has no synthetic fallback or implicit provider call',()=>{
 const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const primitive=tag=>p=>React.createElement(tag,{'aria-label':p.accessibilityLabel},p.children);
 const rn={SafeAreaView:primitive('main'),ScrollView:primitive('div'),Text:primitive('span'),View:primitive('div'),Pressable:primitive('button'),TextInput:primitive('textarea'),ActivityIndicator:primitive('span'),StyleSheet:{create:x=>x},AppState:{currentState:'active'},Platform:{OS:'android'}};
 const load=sourceLoader({'react-native':rn}),App=load('platforms/native/App.tsx').default;
 const empty=renderToStaticMarkup(React.createElement(App));assert.match(empty,/Member sign-in is not connected/);assert.doesNotMatch(empty,/Jules|Ada|Synthetic|fixture|Open member circle/);
 const auth={getSession(){throw Error('SSR must not call');},getUser(){throw Error('SSR must not call');},onAuthStateChange(){throw Error('SSR must not call');}};
 const configured=renderToStaticMarkup(React.createElement(App,{memberCircle:{circleId:circle,origin,auth,transport:()=>{throw Error('SSR must not call');}}}));
 assert.match(configured,/Open complete discussion archive/);assert.match(configured,/Check member session/);
});
test('archive host uses current auth and the canonical cursor, then loads older contributions beyond the latest-100 view',async()=>{
 const f=fixture();try{
 const items=Array.from({length:25},(_,i)=>item(`${String(i+1).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`));
 f.setBody(page({items,nextCursor:items.at(-1).id}));await f.host.openArchive();assert.equal(f.host.model().archive.page.items.length,25);
 assert.equal(f.requests[0].url,origin+`/api/circles/${circle}/discussion`);assert.equal(f.requests[0].init.headers.Authorization,'Bearer NONISSUED_FIXTURE');assert.equal(f.requests[0].init.redirect,'error');
 f.setBody(page({items:[item(other,{content:'Older contribution 125'})]}));await f.host.archiveNext();
 assert.match(f.requests[1].url,new RegExp('before='+items.at(-1).id));assert.equal(f.host.model().archive.page.items[0].content,'Older contribution 125');
 }finally{f.host.disconnect();}assert.equal(f.listeners.size,0);
});
test('thread root tombstone and focus outside the current descendant page use the canonical relation projection',async()=>{
 const f=fixture();try{f.setBody({kind:'thread',circleId:circle,limit:25,nextCursor:null,root:item(root,{visibility:'hidden',content:null}),focus:item(child,{rootMessageId:root,parentMessageId:root,content:'Focused reply outside page'}),items:[]});
 await f.host.archiveThread(child);const p=f.host.model().archive.page;assert.equal(p.kind,'thread');assert.equal(p.root.content,null);assert.equal(p.focus.id,child);assert.doesNotMatch(JSON.stringify(p),/PRIVATE/);
 }finally{f.host.disconnect();}
});
test('scope-mismatched archive, forged visible tombstone body and repeated cursor fail closed',async()=>{
 for(const invalid of [page({circleId:other}),page({items:[item(root,{visibility:'hidden',content:'PRIVATE_RETAINED_BODY'})]}),page({nextCursor:root})]){
  const f=fixture();try{f.setBody(invalid);await f.host.openArchive();assert.equal(f.host.model().archive.page,null);assert.equal(f.host.model().archive.phase,'unavailable');}finally{f.host.disconnect();}
 }
});
test('identity retirement during credential acquisition prevents any archive transport',async()=>{
 const f=fixture(),hold=gate();f.credentials(hold);const pending=f.host.openArchive();f.identity(null);hold.resolve();await pending;assert.equal(f.requests.length,0);assert.equal(f.host.model().archive.page,null);f.host.disconnect();
});
test('late archive response cannot restore a view after identity retirement',async()=>{
 const f=fixture(),hold=gate();f.response(hold);const pending=f.host.openArchive();await new Promise(r=>setTimeout(r,0));assert.equal(f.requests.length,1);f.identity(null);hold.resolve();await pending;assert.equal(f.host.model().archive.page,null);f.host.disconnect();
});
test('background and offline clear archive immediately; resuming alone does not refetch',async()=>{
 for(const kind of ['activity','connectivity']){const f=fixture();await f.host.openArchive();assert.ok(f.host.model().archive.page);f.host[kind](false);assert.equal(f.host.model().archive.page,null);f.host[kind](true);assert.equal(f.requests.length,1);assert.equal(f.host.model().archive.page,null);await f.host.openArchive();assert.ok(f.host.model().archive.page);f.host.disconnect();}
});
test('opening archive retires the flat conversation and memory draft; membership denial leaves both empty',async()=>{
 const f=fixture();try{f.setBody({cohort:{id:circle,book_id:'soe-circles-path',title:'Fictional Circle'},messages:[{id:root,member_name:'Reader',created_at:'2026-11-04T10:00:00Z',content:'PRIVATE_LATEST',is_mine:false}]});await f.host.refresh();assert.ok(f.host.model().participation.read.conversation);f.host.edit('PRIVATE_DRAFT');
 f.setStatus(403);f.setBody({error:'unavailable'});await f.host.openArchive();assert.equal(f.host.model().participation.read.conversation,null);assert.equal(f.host.model().participation.write.draft,'');assert.equal(f.host.model().archive.page,null);
 }finally{f.host.disconnect();}
});
test('missing Quest markup is rejected before provider or host subscription work',()=>{
 let calls=0;const auth={getSession(){calls++;},getUser(){calls++;},onAuthStateChange(){calls++;}};
 assert.throws(()=>mountExistingMemberCircle({window:{},document:{getElementById(){return null;}},config:{circleId:circle,origin,auth,transport(){calls++;}}}),/controls unavailable/);assert.equal(calls,0);
});
test('native bridge adapter permits only canonical archive GET modes in addition to its existing narrow post',async()=>{
 const {createNativeMemberPorts}=sourceLoader()('platforms/native/src/circles/native-ports.ts');const calls=[];
 const bridge={capabilities:async()=>({version:1,origin,storageKey:'fixture-key',redirectPolicy:'reject-before-send',storagePolicy:'os-protected'}),begin:async()=>'request-1',send:async(id,r)=>{calls.push(r);return{status:200,url:r.url,body:'{}',redirected:false};},cancel:async()=>{},read:async()=>null,write:async()=>{},remove:async()=>{}};
 const ports=await createNativeMemberPorts(bridge,{origin,storageKey:'fixture-key'}),init={method:'GET',headers:{Authorization:'Bearer NONISSUED_FIXTURE'},cache:'no-store',redirect:'error',credentials:'omit',signal:new AbortController().signal};
 await ports.transport(origin+`/api/circles/${circle}/discussion?message=${root}&after=${child}&limit=25`,init);assert.equal(calls.length,1);
 for(const suffix of ['?limit=26','?limit=025',`?requestId=${child}`,`?before=${child}&before=${root}`,`?message=${root}&before=${child}`,'?memberId=forged','#private'])await assert.rejects(ports.transport(origin+`/api/circles/${circle}/discussion${suffix}`,init));
 await assert.rejects(ports.transport(origin+`/api/circles/${circle}/discussion`,{...init,method:'POST',body:'{}',headers:{...init.headers,'Content-Type':'application/json'}}));assert.equal(calls.length,1);ports.retireStorage();
});
