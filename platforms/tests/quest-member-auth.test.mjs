import test from 'node:test';import assert from 'node:assert/strict';
import {sourceLoader} from './load-source.mjs';
import {createVerifiedSupabaseCircleOwner,createCircleHost} from '../quest/circle-host.mjs';
const {createQuestMemberAuth}=sourceLoader()('lib/circles/quest-member-auth.ts');
const origin='https://quest-auth-fixture.invalid',subject='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',circle='44444444-4444-4444-8444-444444444444';
const token='NONISSUED_FIXTURE_TOKEN';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture(options={}){
 let sdkCalls=0,userGate=null,jsonGate=null,reply={member:{id:member,supabase_auth_id:subject,email:'FICTIONAL_PRIVATE_EMAIL',unrelated:'PRIVATE_FIXTURE'},auth:{provider:'supabase',subject}},status=200,url=origin+'/api/auth/member',redirected=false;
 const requests=[],listeners=new Set();
 const sdk={async getSession(){sdkCalls++;return{data:{session:{access_token:token,user:{id:subject,email:'FICTIONAL_PRIVATE_EMAIL'},refresh_token:'NONISSUED_REFRESH_FIXTURE'}}};},async getUser(jwt){sdkCalls++;assert.equal(jwt,token);if(userGate)await userGate.promise;return{data:{user:{id:subject,email:'FICTIONAL_PRIVATE_EMAIL'}}};},onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};}};
 const bridge=createQuestMemberAuth(sdk,{origin,request:async(input,init)=>{requests.push({input,init});return{status,url,redirected,json:async()=>{if(jsonGate)await jsonGate.promise;return reply;}};},...options});
 return{sdk,bridge,requests,listeners,calls:()=>sdkCalls,reply:value=>reply=value,status:value=>status=value,url:value=>url=value,redirected:value=>redirected=value,userGate:g=>userGate=g,jsonGate:g=>jsonGate=g};
}
test('bridge construction has no provider or HTTP activity; accepted metadata is cookie-only and strips every profile field',async()=>{
 const f=fixture();assert.equal(f.calls(),0);assert.equal(f.requests.length,0);
 const session=await f.bridge.auth.getSession();assert.deepEqual(JSON.parse(JSON.stringify(session)),{data:{session:{access_token:token,user:{id:subject}}}});
 const user=await f.bridge.auth.getUser(token);assert.deepEqual(JSON.parse(JSON.stringify(user)),{data:{user:{id:subject}}});
 const request=f.requests[0];assert.equal(request.input,origin+'/api/auth/member');assert.equal(request.init.method,'GET');assert.equal(request.init.credentials,'same-origin');assert.equal(request.init.cache,'no-store');assert.equal(request.init.redirect,'error');assert.equal(request.init.referrerPolicy,'no-referrer');assert.equal(request.init.headers,undefined);assert.ok(request.init.signal instanceof AbortSignal);assert.doesNotMatch(request.input,/NONISSUED|11111111/);f.bridge.retire();
});
for(const [label,body]of[
 ['wallet-selected',{member:{id:member,supabase_auth_id:subject},auth:{provider:'wallet',subject:member}}],
 ['different-subject',{member:{id:member,supabase_auth_id:other},auth:{provider:'supabase',subject:other}}],
 ['mismatched-member-link',{member:{id:member,supabase_auth_id:other},auth:{provider:'supabase',subject}}],
 ['malformed-member',{member:{id:'invalid',supabase_auth_id:subject},auth:{provider:'supabase',subject}}],
 ['missing-auth',{member:{id:member,supabase_auth_id:subject}}],
 ['missing-member',{auth:{provider:'supabase',subject}}],
 ['unknown-provider',{member:{id:member,supabase_auth_id:subject},auth:{provider:'other',subject}}],
 ['array',[]],
])test(`selected website identity refuses ${label} despite a valid retained SDK token`,async()=>{const f=fixture();f.reply(body);const r=await f.bridge.auth.getUser(token);assert.equal(r.data.user,null);assert.equal(r.error.message,'Member session could not be confirmed.');assert.doesNotMatch(r.error.message,/11111111|PRIVATE|TOKEN/);f.bridge.retire();});
test('private endpoint HTTP failures, redirects and changed response origins never confer identity',async()=>{
 for(const mutate of [f=>f.status(401),f=>f.status(503),f=>f.status(302),f=>f.redirected(true),f=>f.url('https://other.invalid/api/auth/member'),f=>f.url(origin+'/api/auth/member?subject='+subject)]){
  const f=fixture();mutate(f);assert.equal((await f.bridge.auth.getUser(token)).data.user,null);f.bridge.retire();
 }
});
test('actual verified owner rechecks selected identity on every bearer and clears its Circle scope when wallet selection is discovered',async()=>{
 const f=fixture(),binding=createVerifiedSupabaseCircleOwner(f.bridge.auth);let sends=0;
 const host=createCircleHost({circleId:circle,origin,owner:binding.owner,transport:async()=>{sends++;throw Error('Must not send under wrong provider');}});host.connect();await binding.start();const scope=binding.owner.scope();assert.ok(scope);assert.equal(f.requests.length,1);
 f.reply({member:{id:member,supabase_auth_id:subject},auth:{provider:'wallet',subject:member}});assert.equal(await binding.owner.bearer(scope),null);assert.equal(binding.owner.scope(),null);assert.equal(f.requests.length,2);await host.openArchive();assert.equal(sends,0);host.disconnect();binding.stop();f.bridge.retire();assert.equal(f.listeners.size,0);
});
test('deadline includes pending SDK verification and blocks a late metadata request',async()=>{
 const f=fixture({timeoutMs:5}),hold=gate();f.userGate(hold);const r=await f.bridge.auth.getUser(token);assert.equal(r.data.user,null);assert.equal(f.requests.length,0);hold.resolve();await new Promise(r=>setTimeout(r,0));assert.equal(f.requests.length,0);f.bridge.retire();
});
test('activity invalidation aborts metadata/body wait and late completion cannot restore identity',async()=>{
 const f=fixture(),hold=gate();f.jsonGate(hold);const pending=f.bridge.auth.getUser(token);await new Promise(r=>setTimeout(r,0));assert.equal(f.requests.length,1);f.bridge.invalidate();const r=await pending;assert.equal(r.data.user,null);assert.equal(f.requests[0].init.signal.aborted,true);hold.resolve();await new Promise(r=>setTimeout(r,0));f.bridge.retire();
});
test('a changed caller lifetime fences SDK completion before cookie metadata is sent',async()=>{
 let current=true;const f=fixture({isCurrent:()=>current}),hold=gate();f.userGate(hold);const pending=f.bridge.auth.getUser(token);current=false;hold.resolve();assert.equal((await pending).data.user,null);assert.equal(f.requests.length,0);f.bridge.retire();
});
test('retirement detaches SDK subscription, fences its old callback and prevents any later SDK call',async()=>{
 const f=fixture();let events=0;f.bridge.auth.onAuthStateChange(()=>events++);const old=[...f.listeners][0];f.bridge.retire();old('SIGNED_IN',null);assert.equal(events,0);assert.equal(f.listeners.size,0);const before=f.calls();assert.equal((await f.bridge.auth.getSession()).data.session,null);assert.equal((await f.bridge.auth.getUser(token)).data.user,null);assert.equal(f.calls(),before);assert.equal(f.requests.length,0);
});
