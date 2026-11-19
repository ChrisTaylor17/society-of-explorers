import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineApp} from './support/offline-app.mjs';
import {A,B} from './support/member-profile-fixture.mjs';
import {profileRequest as request,createMemberProfileFixture as fixture} from './support/member-profile-http-fixture.mjs';
const body=(patch={},owner=A,revision=0)=>({expectedMemberId:owner,expectedRevision:revision,patch});
test('actual owner GET is private and excludes raw identity/billing/tier; query/header cannot select another member',async t=>{
 const f=await fixture(t),response=await f.route.GET(request(null,{method:'GET'}));assert.equal(response.status,200);const value=await response.json();assert.equal(value.memberId,A);assert.equal(value.visibility,'private');assert.equal(value.revision,0);assert.equal(value.profile.bio,'KEEP_OMITTED_BIO');assert.deepEqual(Object.keys(value).sort(),['memberId','revision','visibility','profile'].sort());assert.doesNotMatch(JSON.stringify(value),/PRIVATE_SYNTHETIC_EMAIL|protected-tier|supabase_auth_id|exp_tokens/);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('vary'),/Cookie/);assert.equal(f.calls[0].owner,A);
});
test('actual POST binds verified owner and revision through actual SQL and preserves omitted fields',async t=>{
 const f=await fixture(t),response=await f.route.POST(request(body({displayName:'Human edit',visibility:'public'})));assert.equal(response.status,200);const value=await response.json();assert.equal(value.memberId,A);assert.equal(value.revision,1);assert.equal(value.visibility,'public');assert.equal(value.profile.bio,'KEEP_OMITTED_BIO');assert.equal(value.profile.displayName,'Human edit');assert.equal(f.calls[0].args.p_actor,A);assert.equal((await f.db.query('SELECT display_name FROM members WHERE id=$1',[B])).rows[0].display_name,'Existing B');
});
test('A draft cannot save to B after account selection changes even when both revisions are zero',async t=>{
 const f=await fixture(t);f.setActor(B);const before=(await f.db.query('SELECT * FROM members ORDER BY id')).rows;const response=await f.route.POST(request(body({bio:'A_STALE_DRAFT'},A,0)));assert.equal(response.status,409);assert.equal(f.calls.length,0);assert.deepEqual((await f.db.query('SELECT * FROM members ORDER BY id')).rows,before);
});
test('stale revision is a known conflict and cannot overwrite a newer legacy writer',async t=>{
 const f=await fixture(t);await f.db.query("UPDATE members SET bio='NEWER_LEGACY_EDIT' WHERE id=$1",[A]);const response=await f.route.POST(request(body({bio:'STALE'})));assert.equal(response.status,409);assert.equal((await f.db.query('SELECT bio FROM members WHERE id=$1',[A])).rows[0].bio,'NEWER_LEGACY_EDIT');
});
test('unauthenticated GET/POST and cross-site writes perform no owner query or mutation',async t=>{
 const f=await fixture(t);f.setActor(null);assert.equal((await f.route.GET(request(null,{method:'GET'}))).status,401);assert.equal((await f.route.POST(request(body({bio:'bad'})))).status,401);f.setActor(A);for(const headers of [{origin:'https://other.invalid'},{origin:'null'},{'sec-fetch-site':'cross-site'}])assert.equal((await f.route.POST(request(body({bio:'bad'}),{headers}))).status,403);assert.equal(f.calls.length,0);
});
test('strict body rejects protected keys, legacy shape, omitted authority, invalid field types and out-of-bounds values',async t=>{
 const f=await fixture(t);for(const value of [{memberId:B,bio:'legacy'},body({tier:'paid'}),body({supabase_auth_id:B}),body({profile_revision:9}),body({email:'bad'}),body({bio:null}),body({skills:[null]}),body({bio:'x'.repeat(2001)}),body({displayName:' '}),body({}),{...body({bio:'bad'}),extra:true},{...body({bio:'bad'}),expectedRevision:'0'}])assert.equal((await f.route.POST(request(value))).status,400);assert.equal(f.calls.length,0);
});
test('64KiB actual-byte budget defeats lying content length; invalid UTF8/JSON/media types never mutate',async t=>{
 const f=await fixture(t);for(const options of [{raw:'x'.repeat(70000),headers:{'content-length':'1'}},{raw:'{'},{raw:new Uint8Array([0xc0,0xaf])},{headers:{'content-type':'text/plain'}},{headers:{'content-length':'70000'}},{headers:{'content-length':'-1'}}])assert.equal((await f.route.POST(request(body({bio:'bad'}),options))).status,400);assert.equal(f.calls.length,0);
});
test('full valid field maxima including multibyte text fit the bounded request and return strict DTO',async t=>{
 const f=await fixture(t);const patch={displayName:'😀'.repeat(100),bio:'😀'.repeat(1000),discipline:'x'.repeat(100),skills:Array(40).fill('😀'.repeat(50)),projectDescription:'😀'.repeat(1000),seeking:'😀'.repeat(500),philosophy:'😀'.repeat(1000)};const response=await f.route.POST(request(body(patch)));assert.equal(response.status,200);assert.equal((await response.json()).profile.skills.length,40);
});
test('missing live schema/RPC and wrong-owner replies fail closed with generic private503',async t=>{
 const missing=await fixture(t,{install:false});for(const response of [await missing.route.GET(request(null,{method:'GET'})),await missing.route.POST(request(body({bio:'must not write'})))]){assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PRIVATE_SQL_DETAILS|42703|42883/);}
 const f=await fixture(t);f.returnWrongOwner();const response=await f.route.GET(request(null,{method:'GET'}));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/Existing B|22222222/);
});
test('lost reply after SQL commit remains unavailable; fresh manual owner GET reveals saved revision without retry',async t=>{
 const f=await fixture(t);f.loseAfterCommit();const response=await f.route.POST(request(body({bio:'COMMITTED_BUT_UNKNOWN'})));assert.equal(response.status,503);assert.equal(f.calls.filter(call=>call.kind==='write').length,1);const reloaded=await(await f.route.GET(request(null,{method:'GET'}))).json();assert.equal(reloaded.profile.bio,'COMMITTED_BUT_UNKNOWN');assert.equal(reloaded.revision,1);assert.equal(f.calls.filter(call=>call.kind==='write').length,1);
});
test('legacy blank display name becomes editable Explorer and protected data remains omitted',async t=>{
 const f=await fixture(t);await f.db.query("UPDATE members SET display_name='' WHERE id=$1",[A]);const response=await f.route.GET(request(null,{method:'GET'}));assert.equal(response.status,200);assert.equal((await response.json()).profile.displayName,'Explorer');
});
test('body deadline cancels a stalled stream and refuses before any SQL mutation',async t=>{
 const f=await fixture(t);let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});const start=Date.now(),response=await f.route.POST(request(null,{raw:stream}));assert.equal(response.status,400);assert.ok(Date.now()-start>=4900&&Date.now()-start<8000);assert.equal(cancelled,true);assert.equal(f.calls.length,0);
});
test('actual shared pure contract requires explicit public flag and whitelists authored fields',()=>{
 const {load}=offlineApp(),p=load('lib/members/profile.ts');const row={id:A,display_name:'Authored Name',bio:null,discipline:null,skills:null,project_description:null,seeking:null,philosophy:null,profile_visibility:'public',profile_revision:0,email:'PRIVATE',tier:'paid',exp_tokens:999,supabase_auth_id:B};const parsed=p.parsePublicMemberProfile(row);assert.ok(parsed);assert.deepEqual(Object.keys(parsed).sort(),['id','display_name','bio','discipline','skills','project_description','seeking','philosophy'].sort());for(const visibility of [undefined,null,'private',true,'PUBLIC'])assert.equal(p.parsePublicMemberProfile({...row,profile_visibility:visibility}),null);
 const owner=p.ownerProfileFromRow(row);assert.ok(owner);assert.equal(p.parseOwnerProfile({...owner,tier:'protected'}),null);assert.equal(p.parseProfileMutation(body({bio:'bad\u0000'})),null);assert.equal(p.parseProfileMutation(body({skills:new Array(2)})),null);assert.equal(p.parseProfileMutation(body({bio:'\ud800'})),null);assert.equal(p.parseOwnerProfile({...owner,revision:Number.MAX_SAFE_INTEGER+1}),null);
});
