import test from 'node:test';
import assert from 'node:assert/strict';
import {lstatSync} from 'node:fs';
const info=lstatSync(new URL('./load-source.mjs',import.meta.url));assert(info.isFile()&&!info.isSymbolicLink()&&info.blocks);
const {sourceLoader}=await import('./load-source.mjs');
const {createPublicProfile}=sourceLoader()('platforms/shared/public-profile.ts');
const id='11000000-0000-4000-8000-000000000001',other='11000000-0000-4000-8000-000000000002',origin='https://public-profile.invalid';
const clone=v=>JSON.parse(JSON.stringify(v)),deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
const profile={id,display_name:'Published name',bio:'Authored bio',discipline:'History',skills:['Reading','Listening'],project_description:'A public project',seeking:'Collaborators',philosophy:'Public philosophy'};
function fixture(extra={}){let scope='owner-A',hook=null,bearers=0;const listeners=new Set(),calls=[];
 const owner={scope:()=>scope,bearer(){bearers++;throw Error('No private credentials allowed');},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
 const response=(body={profile},status=200,url=origin+'/api/explorer/'+id)=>({url,status,redirected:false,json:async()=>clone(body)});
 const transport=async(url,init)=>{calls.push({url,init});return hook?hook(url,init):response();};
 const config={owner,origin,memberId:id,publicProfileTransport:transport,initialOnline:true,timeoutMs:50,...extra};
 const session=createPublicProfile(config);session.connect();
 return{session,calls,response,config,owner,hook(fn){hook=fn;},change(notify=true,same=false){if(!same)scope='owner-B';if(notify)for(const fn of [...listeners])fn();},get bearers(){return bearers;},get listeners(){return listeners.size;}};
}
test('connect is inert; explicit load carries exact anonymous reference and all authored fields',async()=>{const f=fixture();assert.equal(f.calls.length,0);await f.session.load();assert.deepEqual(clone(f.session.model().profile),profile);const {url,init}=f.calls[0];assert.equal(url,origin+'/api/explorer/'+id);assert.deepEqual(Object.keys(init).sort(),['cache','credentials','headers','method','redirect','signal']);assert.deepEqual(clone(init.headers),{});assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(f.bearers,0);f.session.close();});
test('missing anonymous capability offers no load and never falls back to member bearer',async()=>{const f=fixture({publicProfileTransport:undefined});await f.session.load();assert.equal(f.session.model().canLoad,false);assert.equal(f.calls.length,0);assert.equal(f.bearers,0);f.session.close();});
test('projection is cloned and deliberately nullable authored fields remain not shared',async()=>{const f=fixture();f.hook(()=>f.response({profile:{...profile,bio:null,skills:[]}}));await f.session.load();const first=f.session.model();assert.equal(first.profile.bio,null);first.profile.skills.push('Injected');assert.deepEqual(clone(f.session.model().profile.skills),[]);f.session.close();});
test('refresh clears old details before awaiting; 404 respects fresh unpublication',async()=>{const f=fixture();await f.session.load();const d=deferred();f.hook(()=>d.promise);const read=f.session.load();assert.equal(f.session.model().profile,null);assert.equal(f.session.model().busy,true);assert.equal(f.session.model().canNavigate,false);d.resolve(f.response({error:'Public profile unavailable.'},404));await read;assert.equal(f.session.model().phase,'missing');assert.equal(f.session.model().profile,null);assert.equal(f.session.model().canLoad,true);f.session.close();});
for(const [name,make]of [
 ['malformed unavailable reply',f=>f.response({},404)],
 ['wrong member',f=>f.response({profile:{...profile,id:other}})],
 ['secret additional field',f=>f.response({profile:{...profile,email:'never expose'}})],
 ['invented visibility',f=>f.response({profile:{...profile,visibility:{bio:true}}})],
 ['malformed envelope',f=>f.response({profile,other:'value'})],
 ['redirected',f=>({...f.response(),redirected:true})],
 ['wrong response URL',f=>f.response({profile},200,origin+'/api/explorer/'+other)],
 ['server failure',f=>f.response({profile},503)],
 ['credentials challenge',f=>f.response({profile},401)]
])test(name+' clears prior details and needs explicit retry',async()=>{const f=fixture();await f.session.load();f.hook(()=>make(f));await f.session.load();assert.equal(f.session.model().phase,'unavailable');assert.equal(f.session.model().profile,null);assert.equal(f.calls.length,2);assert.equal(f.bearers,0);f.session.close();});
for(const transition of ['offline','inactive','disconnect','close','owner','same-owner'])test(transition+' retires held replies and returning never loads automatically',async()=>{const f=fixture(),d=deferred();f.hook(()=>d.promise);const read=f.session.load();if(transition==='offline')f.session.connectivity(false);else if(transition==='inactive')f.session.activity(false);else if(transition==='owner')f.change();else if(transition==='same-owner')f.change(true,true);else f.session[transition]();d.resolve(f.response());await read;assert.equal(f.session.model().profile,null);f.session.activity(true);f.session.connectivity(true);f.session.connect();assert.equal(f.calls.length,1);if(['owner','same-owner','close'].includes(transition)){await f.session.load();assert.equal(f.calls.length,1);assert.equal(f.session.model().phase,'closed');}f.session.close();assert.equal(f.listeners,0);});
test('silent owner change after response hides fields without credential acquisition',async()=>{const f=fixture();f.hook(()=>({ ...f.response(),json:async()=>{f.change(false);return{profile};}}));await f.session.load();assert.equal(f.session.model().profile,null);assert.equal(f.session.model().canLoad,false);assert.equal(f.bearers,0);f.session.close();});
test('deadline includes JSON decoding, late decode cannot restore retired details',async()=>{const f=fixture({timeoutMs:10}),d=deferred();f.hook(()=>({...f.response(),json:()=>d.promise}));await f.session.load();assert.equal(f.session.model().phase,'unavailable');d.resolve({profile});await new Promise(r=>setTimeout(r,0));assert.equal(f.session.model().profile,null);f.session.close();});
test('a listener retiring on loading prevents even anonymous transmission',async()=>{const f=fixture();f.session.subscribe(m=>{if(m.busy)f.session.close();});await f.session.load();assert.equal(f.calls.length,0);assert.equal(f.session.model().profile,null);});
test('immediate owner retirement during subscription leaves no observer or active view',()=>{let listeners=0;const owner={scope:()=> 'scope',bearer:async()=>{throw Error('no');},subscribe(fn){listeners++;fn();return()=>listeners--;}};const s=createPublicProfile({owner,origin,memberId:id,initialOnline:true});s.connect();assert.equal(listeners,0);assert.equal(s.model().connected,false);assert.equal(s.model().phase,'closed');});
test('invalid or inferred profile identifiers refuse construction',()=>{for(const memberId of ['name','',id.toUpperCase().replace('11000000','AA000000'),id+'?circle=private',null])assert.throws(()=>fixture({memberId}));});

test('retirement settles immediately even when the transport ignores cancellation forever',async()=>{const f=fixture({timeoutMs:60000});f.hook(()=>new Promise(()=>{}));const read=f.session.load();f.session.close();await Promise.race([read,new Promise((_,reject)=>setTimeout(()=>reject(Error('Retirement failed to settle')),100))]);assert.equal(f.session.model().phase,'closed');});
