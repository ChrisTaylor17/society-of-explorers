import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineApp} from './support/offline-app.mjs';
const ADA='11111111-1111-4111-8111-111111111111',JULES='22222222-2222-4222-8222-222222222222';
const SUBJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const row=(extra={})=>({id:ADA,display_name:'Ada',supabase_auth_id:SUBJECT,...extra});
function setup({members=[],user={id:SUBJECT,email:'reader@example.invalid'},error=null}={}){
 const app=offlineApp(),db=app.fakes.resetDb({members});db.strictSingle=true;
 const selected=[],originalFrom=db.from.bind(db);let authReads=0,adminCalls=0;
 db.from=table=>{const q=originalFrom(table),select=q.select.bind(q);q.select=(columns,...rest)=>{selected.push({table,columns});return select(columns,...rest);};return q;};
 app.setMock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>{authReads++;return {data:{user},error};}}})}));
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>{adminCalls++;return db;}}));
 return {...app,db,selected,get authReads(){return authReads;},get adminCalls(){return adminCalls;}};
}
const request=(body={},headers={})=>new Request('https://soe.invalid/api/auth/ensure-member',{method:'POST',headers:{'content-type':'application/json',origin:'https://soe.invalid',...headers},body:JSON.stringify(body)});
function autoId(db,id=JULES){const from=db.from.bind(db);db.from=t=>{const q=from(t),insert=q.insert.bind(q);q.insert=p=>insert({id,...p});return q;};}
test('unauthenticated setup never consumes a body or accesses admin data',async()=>{
 const app=setup({user:null});let read=false;const req={headers:new Headers(),url:'https://soe.invalid/x',get body(){read=true;throw Error('body read');}};
 assert.equal((await app.load('app/api/auth/ensure-member/route.ts').POST(req)).status,401);assert.equal(read,false);assert.equal(app.adminCalls,0);
});
test('cross-site setup is refused before authentication',async()=>{
 const app=setup();assert.equal((await app.load('app/api/auth/ensure-member/route.ts').POST(request({}, {origin:'https://other.invalid'}))).status,403);assert.equal(app.authReads,0);assert.equal(app.adminCalls,0);
});
test('forged auth subject is refused before member queries',async()=>{
 const app=setup();assert.equal((await app.load('app/api/auth/ensure-member/route.ts').POST(request({supabaseAuthId:OTHER}))).status,403);assert.equal(app.db.log.length,0);
});
test('existing subject returns whitelist, preserves unsubscribe and performs no subscription writes',async()=>{
 const app=setup({members:[row({service_secret:'private',stripe_customer_id:'private'})]});app.db.tables.daily_email_subscriptions=[{id:'sub',member_id:ADA,unsubscribed_at:'2026-01-01T00:00:00Z'}];
 const response=await app.load('app/api/auth/ensure-member/route.ts').POST(request({email:'forged@example.invalid'})),body=await response.json();assert.equal(response.status,200);assert.equal(body.member.id,ADA);assert.equal(body.created,false);assert.equal(body.member.service_secret,undefined);assert.equal(body.member.stripe_customer_id,undefined);
 assert.equal(app.db.tables.daily_email_subscriptions[0].unsubscribed_at,'2026-01-01T00:00:00Z');assert.ok(app.db.log.every(q=>q.table==='members'&&q.op==='select'));assert.ok(app.selected.every(q=>q.columns&&q.columns!=='*'));
});
test('email or display-name collisions never claim or reassign existing accounts',async()=>{
 const app=setup({members:[row({supabase_auth_id:OTHER,email:'reader@example.invalid'}),{id:JULES,display_name:'reader@example.invalid',wallet_address:'0xabc'}]});autoId(app.db,'33333333-3333-4333-8333-333333333333');app.db.auth={admin:{listUsers(){throw Error('must not enumerate');}}};
 const response=await app.load('app/api/auth/ensure-member/route.ts').POST(request({displayName:'Reader',email:'reader@example.invalid'})),body=await response.json();assert.equal(response.status,200);assert.equal(body.created,true);assert.equal(body.member.id,'33333333-3333-4333-8333-333333333333');
 assert.equal(app.db.rows('members')[0].supabase_auth_id,OTHER);assert.equal(app.db.rows('members')[1].supabase_auth_id,undefined);assert.equal(app.db.rows('members')[2].supabase_auth_id,SUBJECT);assert.equal(app.db.rows('daily_email_subscriptions').length,0);assert.ok(!app.db.log.some(q=>q.op==='update'||q.table!=='members'));
});
test('duplicate current-subject records fail closed without choosing or inserting',async()=>{
 const app=setup({members:[row(),row({id:JULES})]});assert.equal((await app.load('app/api/auth/ensure-member/route.ts').POST(request())).status,503);assert.ok(!app.db.log.some(q=>q.op!=='select'));
});
test('concurrent unique conflict recovers only by the same verified subject',async()=>{
 const app=setup(),from=app.db.from.bind(app.db);let raced=false;app.db.from=t=>{const q=from(t);q.insert=()=>{raced=true;app.db.rows('members').push(row());return {select:()=>({single:async()=>({data:null,error:{code:'23505'}})})};};return q;};
 const response=await app.load('app/api/auth/ensure-member/route.ts').POST(request()),body=await response.json();assert.equal(response.status,200);assert.equal(body.created,false);assert.equal(body.member.id,ADA);assert.equal(raced,true);assert.ok(app.db.log.every(q=>q.filters.some(f=>f[1]==='supabase_auth_id'&&f[2]===SUBJECT)));
});
test('unrelated unique conflict cannot recover by colliding email or member ID',async()=>{
 const app=setup({members:[row({supabase_auth_id:OTHER})]}),from=app.db.from.bind(app.db);app.db.from=t=>{const q=from(t);q.insert=()=>({select:()=>({single:async()=>({data:null,error:{code:'23505'}})})});return q;};assert.equal((await app.load('app/api/auth/ensure-member/route.ts').POST(request())).status,503);
});
test('bounded setup JSON rejects invalid shapes, huge streams and malformed UTF-8 before mutation',async()=>{
 for(const body of [{extra:'no'},{displayName:'x'.repeat(201)},[],{supabaseAuthId:4}]){const app=setup();assert.equal((await app.load('app/api/auth/ensure-member/route.ts').POST(request(body))).status,400);assert.equal(app.db.log.length,0);}
 for(const bytes of [new Uint8Array(4097).fill(32),new Uint8Array([0xc0,0x80])]){const app=setup(),req=new Request('https://soe.invalid/x',{method:'POST',headers:{'content-type':'application/json'},body:bytes});assert.equal((await app.load('app/api/auth/ensure-member/route.ts').POST(req)).status,400);assert.equal(app.db.log.length,0);}
});
test('signed wallet expiry and tamper protections survive server-only restoration',async()=>{
 const app=setup(),wallet=app.load('lib/auth/walletSession.ts'),signed=await wallet.createWalletSessionValue(ADA);assert.equal(await wallet.verifyWalletSessionValue(signed),ADA);assert.equal(await wallet.verifyWalletSessionValue(signed.replace(ADA,JULES)),null);assert.equal(await wallet.verifyWalletSessionValue(signed+'.extra'),null);assert.equal(await wallet.verifyWalletSessionValue(await wallet.createWalletSessionValue(ADA,Date.now()-31*86400_000)),null);
});
async function actorRequest(app,{cookieUser=null,cookieError=null,bearer=null,bearerUser=null,bearerError=null,walletMember=ADA,selected=undefined}={}){
 app.setMock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:cookieUser},error:cookieError})}})}));let suppliedToken=null;
 app.setMock('@supabase/supabase-js',()=>({createClient:(_url,_key,options)=>{assert.equal(options.auth.persistSession,false);return {auth:{getUser:async token=>{suppliedToken=token;return {data:{user:bearerUser},error:bearerError};}}};}}));
 const wallet=await app.load('lib/auth/walletSession.ts').createWalletSessionValue(walletMember),headers=new Headers();if(bearer!==null)headers.set('authorization',bearer);const req={headers,cookies:{get:name=>name==='soe_wallet_id'?{value:wallet}:name==='soe_auth_provider'&&selected!==undefined?{value:selected}:undefined}};const result=await app.load('lib/getAuthenticatedMember.ts').getAuthenticatedMember(req);return {result,suppliedToken,req};
}
test('explicit verified bearer wins over conflicting browser and wallet cookies',async()=>{
 const app=setup({members:[row(),row({id:JULES,supabase_auth_id:OTHER})]}),{result,suppliedToken}=await actorRequest(app,{cookieUser:{id:SUBJECT},bearer:'Bearer synthetic-token',bearerUser:{id:OTHER}});assert.equal(result.memberId,JULES);assert.equal(suppliedToken,'synthetic-token');
});
test('invalid, malformed or unprovisioned bearer never falls through to valid cookies',async()=>{
 for(const data of [{bearer:'Bearer invalid',bearerError:{name:'AuthError'}},{bearer:'Basic invalid'},{bearer:'Bearer token',bearerUser:{id:OTHER}}]){const app=setup({members:[row()]});assert.equal((await actorRequest(app,{cookieUser:{id:SUBJECT},...data})).result,null);}
});
test('unprovisioned cookie identity and auth outages cannot switch silently to a wallet',async()=>{
 for(const data of [{cookieUser:{id:OTHER}},{cookieError:{name:'AuthRetryableFetchError'}}]){const app=setup({members:[row()]});assert.equal((await actorRequest(app,data)).result,null);}
});
test('definite absent Supabase session permits signed wallet, never raw UUID hint',async()=>{
 const app=setup({members:[row({supabase_auth_id:null})]});assert.equal((await actorRequest(app,{cookieError:{name:'AuthSessionMissingError'}})).result.memberId,ADA);assert.equal(await app.load('lib/getAuthenticatedMember.ts').getAuthenticatedMember({headers:new Headers(),cookies:{get:()=>({value:ADA})}}),null);
});
test('member endpoint verifies session and returns only the owner profile DTO',async()=>{
 const app=setup({members:[row({service_secret:'private'})]}),{req}=await actorRequest(app,{cookieUser:{id:SUBJECT}}),response=await app.load('app/api/auth/member/route.ts').GET(req),body=await response.json();assert.equal(response.status,200);assert.equal(body.member.id,ADA);assert.equal(body.member.service_secret,undefined);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('vary'),/Cookie/);
});
test('SIWE returns only member ID even when its database fixture has private fields',async()=>{
 const address='0xabcdef0000000000000000000000000000000001',app=setup({members:[row({wallet_address:address,service_secret:'private',email:'private@example.invalid'})]});app.setMock('@/lib/supabase/server',()=>({createServiceClient:()=>app.db}));app.setMock('siwe',()=>({SiweMessage:class{async verify(){return {success:true,data:{address}};}}}));
 const nonce=await app.load('lib/auth/siweNonce.ts').signNonce('syntheticNonce1'),req=app.fakes.makeReq({message:'synthetic',signature:'0xsig',address},{cookies:{soe_siwe_nonce:nonce},headers:{host:'localhost'}}),response=await app.load('app/api/auth/siwe/route.ts').POST(req),body=await response.json();assert.equal(response.status,200);assert.deepEqual(body.member,{id:ADA});assert.ok(response.cookies.jar.get('soe_wallet_id'));assert.ok(app.selected.every(q=>q.columns!=='*'));
});
test('login and callback share return-path protections while preserving safe discussion context',()=>{
 const app=setup(),policy=app.load('lib/auth/redirectPath.ts'),form=app.load('lib/auth/loginForm.ts');for(const value of ['//other.invalid','/\\other.invalid','/%2fother.invalid','/%5cother.invalid','/\t/other.invalid','https://other.invalid']){assert.equal(policy.getSafeAuthRedirectPath(value),'/dashboard');assert.equal(form.getSafeNextPath(value),'/dashboard');}const good='/circles/abc/discussion?message=123&after=456';assert.equal(policy.getSafeAuthRedirectPath(good),good);assert.equal(form.getSafeNextPath(good),good);
});
test('private attachments have bounded inert filenames and hardened headers',()=>{
 const app=setup(),helper=app.load('lib/http/routeError.ts'),response=helper.privateAttachmentJson({},{filename:'../'+'private-'.repeat(40)+'.json'}),filename=response.headers.get('content-disposition').match(/filename="([^"]*)"/)[1];assert.ok(filename.length<=96);assert.ok(filename.endsWith('.json'));assert.ok(!filename.includes('/'));assert.equal(response.headers.get('cross-origin-opener-policy'),'same-origin');assert.equal(response.headers.get('x-download-options'),'noopen');assert.match(response.headers.get('permissions-policy'),/camera=\(\)/);
});
test('profile DTO bounds profile data and strips unrelated security/billing columns',()=>{
 const app=setup(),dto=JSON.parse(JSON.stringify(app.load('lib/auth/memberDto.ts').memberSessionDto(row({display_name:'😀'.repeat(250),skills:['A',42],coherence_data:{note:'x'.repeat(40000)},password_hash:'private',wallet_address:'private'}))));assert.equal([...dto.display_name].length,200);assert.deepEqual(dto.skills,['A']);assert.equal(dto.coherence_data,null);assert.equal(dto.password_hash,undefined);assert.equal(dto.wallet_address,undefined);
});
function browserSession({user=null,responses=[]}={}){
 const app=setup(),calls=[];app.context.window={localStorage:{getItem:()=>JULES,removeItem(){},setItem(){}}};app.context.document={cookie:'soe_wallet_id='+JULES};
 const sdk={auth:{getUser:async()=>({data:{user},error:null})},from(){throw Error('anonymous member table access forbidden');}};
 app.setMock('@/lib/supabase/client',()=>({createClient:()=>sdk}));app.setMock('@supabase/supabase-js',()=>({isAuthSessionMissingError:()=>false}));
 app.context.fetch=async(url,options)=>{calls.push({url,options});const response=responses.shift();if(!response)throw Error('unexpected request');return new Response(JSON.stringify(response.body),{status:response.status});};
 return {...app,calls};
}
test('browser session ignores forged wallet hint and uses canonical private endpoint identity',async()=>{
 const app=browserSession({responses:[{status:200,body:{member:row()}}]}),session=await app.load('lib/auth/getSession.ts').getMemberSession();assert.equal(session.member.id,ADA);assert.deepEqual(app.calls.map(call=>call.url),['/api/auth/member']);assert.equal(app.calls[0].options.cache,'no-store');
});
test('unverified wallet hint cannot create a member or produce a browser session',async()=>{
 const app=browserSession({responses:[{status:401,body:{error:'Unauthorized'}}]});assert.equal(await app.load('lib/auth/getSession.ts').getMemberSession(),null);assert.equal(app.calls.length,1);
});
test('verified new sign-in uses subject-bound provisioning once without transmitting an email',async()=>{
 const app=browserSession({user:{id:SUBJECT,email:'reader@example.invalid',user_metadata:{name:'Reader'}},responses:[{status:401,body:{}},{status:200,body:{member:row()}}]});assert.equal((await app.load('lib/auth/getSession.ts').getMemberSession()).member.id,ADA);assert.equal(app.calls.length,2);const body=JSON.parse(app.calls[1].options.body);assert.deepEqual(body,{supabaseAuthId:SUBJECT,displayName:'Reader'});
});
test('unavailable or malformed session response never triggers provisioning or raw-hint fallback',async()=>{
 for(const response of [{status:503,body:{}},{status:200,body:{member:{id:'invalid'}}}]){const app=browserSession({user:{id:SUBJECT},responses:[response]});assert.equal(await app.load('lib/auth/getSession.ts').getMemberSession(),null);assert.equal(app.calls.length,1);}
});
test('selected wallet stays active even with an old valid Supabase cookie',async()=>{
 const app=setup({members:[row(),row({id:JULES,supabase_auth_id:OTHER})]}),{result,req}=await actorRequest(app,{cookieUser:{id:OTHER},selected:'wallet'});assert.equal(result.memberId,ADA);assert.equal(result.auth.provider,'wallet');assert.equal(result.auth.subject,ADA);const response=await app.load('app/api/auth/member/route.ts').GET(req);assert.deepEqual((await response.json()).auth,{provider:'wallet',subject:ADA});
});
test('selected Supabase never falls back to retained wallet when signed out or unavailable',async()=>{
 for(const cookieError of [null,{name:'AuthSessionMissingError'},{name:'AuthRetryableFetchError'}]){const app=setup({members:[row()]});assert.equal((await actorRequest(app,{selected:'supabase',cookieError})).result,null);}
});
test('selection cookie alone and unknown provider choices cannot authorize any account',async()=>{
 for(const selected of ['wallet','other']){const app=setup({members:[row({id:JULES,supabase_auth_id:OTHER})]});assert.equal((await actorRequest(app,{selected,cookieUser:{id:OTHER}})).result,null);}
});
test('provider selection requires same-origin verified exact subject and sets httpOnly choice',async()=>{
 const app=setup(),route=app.load('app/api/auth/provider/route.ts');for(const [body,headers,status]of [[{provider:'wallet',expectedSubject:SUBJECT},{},400],[{provider:'supabase',expectedSubject:OTHER},{},409],[{provider:'supabase',expectedSubject:SUBJECT},{origin:'https://other.invalid'},403]]){const response=await route.POST(request(body,headers));assert.equal(response.status,status);assert.equal(response.cookies.jar.size,0);}
 const response=await route.POST(request({provider:'supabase',expectedSubject:SUBJECT}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{selected:'supabase',subject:SUBJECT});const cookie=response.cookies.jar.get('soe_auth_provider');assert.equal(cookie.value,'supabase');assert.equal(cookie.opts.httpOnly,true);assert.equal(app.db.log.length,0);
});
test('provisioning cannot switch a selected wallet to a retained Supabase identity',async()=>{
 const app=setup(),req=request();req.cookies={get:name=>name==='soe_auth_provider'?{value:'wallet'}:undefined};assert.equal((await app.load('app/api/auth/ensure-member/route.ts').POST(req)).status,409);assert.equal(app.db.log.length,0);
});
test('successful SIWE proof selects wallet alongside its signed session cookie',async()=>{
 const address='0xabcdef0000000000000000000000000000000001',app=setup({members:[row({wallet_address:address})]});app.setMock('@/lib/supabase/server',()=>({createServiceClient:()=>app.db}));app.setMock('siwe',()=>({SiweMessage:class{async verify(){return {success:true,data:{address}};}}}));const nonce=await app.load('lib/auth/siweNonce.ts').signNonce('syntheticNonce1'),response=await app.load('app/api/auth/siwe/route.ts').POST(app.fakes.makeReq({message:'synthetic',signature:'0xsig',address},{cookies:{soe_siwe_nonce:nonce},headers:{host:'localhost'}}));assert.equal(response.status,200);assert.equal(response.cookies.jar.get('soe_auth_provider').value,'wallet');assert.equal(response.cookies.jar.get('soe_auth_provider').opts.httpOnly,true);assert.ok(response.cookies.jar.get('soe_wallet_id'));
});
test('browser confirms provider only for a verified subject and matching private acknowledgement',async()=>{
 for(const [status,body,expected]of [[200,{selected:'supabase',subject:SUBJECT},true],[200,{selected:'supabase',subject:OTHER},false],[503,{},false]]){const app=setup();let sent;app.context.fetch=async(url,options)=>{sent={url,body:JSON.parse(options.body)};return new Response(JSON.stringify(body),{status});};const client={auth:{getUser:async()=>({data:{user:{id:SUBJECT}},error:null})}};assert.equal(await app.load('lib/auth/providerSelection.ts').confirmSupabaseProvider(client),expected);assert.deepEqual(sent,{url:'/api/auth/provider',body:{provider:'supabase',expectedSubject:SUBJECT}});}
});
test('provider retirement notifications carry no identity and unsubscribe detaches listeners',()=>{
 const app=setup(),target=new EventTarget(),stored=[];target.localStorage={setItem:(key,value)=>stored.push({key,value})};app.context.window=target;app.context.Event=Event;
 const helper=app.load('lib/auth/providerSelection.ts');let retired=0;const stop=helper.subscribeAuthProviderChanges(()=>retired++);helper.notifyAuthProviderChanged();assert.equal(retired,1);assert.equal(stored[0].key,'soe.auth.provider.changed');assert.doesNotMatch(JSON.stringify(stored),new RegExp(SUBJECT+'|'+ADA+'|token|credential','i'));stop();helper.notifyAuthProviderChanged();assert.equal(retired,1);
});
test('OAuth exchange carries provider cookies through completion and preserves validated next context',async()=>{
 const app=setup(),sample=app.load('lib/http/routeError.ts').privateJson({}),N=sample.constructor;N.redirect=url=>new N(null,{status:307,headers:{location:String(url)}});app.setMock('next/server',()=>({NextResponse:N}));let exchanged;
 app.setMock('@supabase/ssr',()=>({createServerClient:(_url,_key,options)=>({auth:{exchangeCodeForSession:async code=>{exchanged=code;options.cookies.setAll([{name:'sb-fixture-auth-token',value:'synthetic-only',options:{httpOnly:true}}]);return {error:null};}}})}));
 const next='/circles/abc/discussion?message=123&after=456',req=app.fakes.makeReq(undefined,{url:'https://soe.invalid/auth/callback?code=synthetic-code&next='+encodeURIComponent(next)}),response=await app.load('app/auth/callback/route.ts').GET(req),location=new URL(response.headers.get('location'));
 assert.equal(exchanged,'synthetic-code');assert.equal(location.pathname,'/auth/complete');assert.equal(location.searchParams.get('next'),next);assert.equal(location.searchParams.has('code'),false);assert.equal(response.cookies.jar.get('soe_auth_provider').value,'supabase');assert.ok(response.cookies.jar.get('sb-fixture-auth-token'));assert.equal(response.headers.get('referrer-policy'),'no-referrer');
});
function tokenFixture({selected=[{provider:'supabase',subject:SUBJECT}],tokenSubject=SUBJECT,token='synthetic-token'}={}){
 const app=setup();app.context.window={};let sdkReads=0,suppliedToken;
 app.setMock('@/lib/supabase/client',()=>({createClient:()=>({auth:{getSession:async()=>{sdkReads++;return {data:{session:{access_token:token}},error:null};},getUser:async value=>{suppliedToken=value;return {data:{user:{id:tokenSubject}},error:null};}}})}));
 app.context.fetch=async()=>{const auth=selected.shift();return new Response(JSON.stringify(auth?{member:row(),auth}:{}),{status:auth?200:503});};
 return {...app,get sdkReads(){return sdkReads;},get suppliedToken(){return suppliedToken;}};
}
test('wallet-selected requests never acquire or attach retained Supabase credentials',async()=>{
 const app=tokenFixture({selected:[{provider:'wallet',subject:ADA}]});assert.equal(await app.load('lib/auth/getSession.ts').getSupabaseAccessToken(),null);assert.equal(app.sdkReads,0);
});
test('Supabase bearer requires exact verified subject plus unchanged selected authority',async()=>{
 const proof={provider:'supabase',subject:SUBJECT},app=tokenFixture({selected:[proof,proof]});assert.equal(await app.load('lib/auth/getSession.ts').getSupabaseAccessToken(),'synthetic-token');assert.equal(app.suppliedToken,'synthetic-token');
});
test('SDK mismatch, changed selection and unavailable authority cannot fall back to cookie headers',async()=>{
 const proof={provider:'supabase',subject:SUBJECT};for(const config of [{selected:[proof],tokenSubject:OTHER},{selected:[proof,{provider:'wallet',subject:ADA}]},{selected:[]}]){const app=tokenFixture(config);await assert.rejects(app.load('lib/circles/client.ts').circleHeaders(true),/Selected sign-in|Member authority/);}
});
test('signed-out public Circle detail composes actual client headers, auth endpoint, HTTP route and SQL without creating a member',async t=>{
 const {participationApp,IDS}=await import('./support/participation-app.mjs'),a=await participationApp();t.after(()=>a.close());a.setActor(null);a.app.context.window={};let sdkCalls=0;const fetches=[];
 a.app.setMock('@/lib/supabase/client',()=>({createClient:()=>{sdkCalls++;throw Error('retained SDK must not be used for guest');}}));
 a.app.context.fetch=async url=>{fetches.push(url);assert.equal(url,'/api/auth/member');return a.app.load('app/api/auth/member/route.ts').GET(a.request(undefined,url));};
 const before=(await a.db.query('SELECT count(*)::int n FROM members')).rows[0].n,headers=await a.app.load('lib/circles/client.ts').circleHeaders();assert.deepEqual(JSON.parse(JSON.stringify(headers)),{});assert.equal(sdkCalls,0);
 const detail=await a.dispatch('/api/circles/'+IDS.circle,'GET',undefined,headers),body=await detail.json();assert.equal(detail.status,200);assert.equal(body.circle.id,IDS.circle);assert.equal(body.viewer.signed_in,false);assert.equal(body.online_url,null);
 const denied=await a.dispatch('/api/circles/'+IDS.circle+'/join','POST',{requestId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',expectedRevision:body.revision},headers);assert.equal(denied.status,401);assert.equal((await a.db.query('SELECT count(*)::int n FROM members')).rows[0].n,before);assert.deepEqual(fetches,['/api/auth/member']);
});
test('unrecognized 401 and malformed authority responses remain errors without SDK fallback',async()=>{
 const app=setup();app.context.window={};app.context.fetch=async()=>new Response(JSON.stringify({error:'proxy authentication required'}),{status:401});app.setMock('@/lib/supabase/client',()=>({createClient:()=>{throw Error('SDK must not be used');}}));await assert.rejects(app.load('lib/circles/client.ts').circleHeaders(),/Member authority unavailable/);
});
