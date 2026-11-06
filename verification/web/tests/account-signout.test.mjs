import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';import {offlineApp} from './support/offline-app.mjs';
const KEY='dddddddd-dddd-4ddd-8ddd-dddddddddddd',ADA='11111111-1111-4111-8111-111111111111';
const PREVIOUS='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', OTHER='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PROVIDER='https://fixture-provider.invalid', COOKIE='sb-fixture-provider-auth-token';
const jwt=claims=>['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify(claims)).toString('base64url'),'SYNTHETIC'].join('.');
const token=jwt({sub:ADA,session_id:SESSION}), otherToken=jwt({sub:ADA,session_id:OTHER});
const sessionJson=access_token=>JSON.stringify({access_token,refresh_token:'NEVER_FORWARD_SYNTHETIC_REFRESH'});
const encodedCookie=access=>`base64-${Buffer.from(sessionJson(access)).toString('base64url')}`;
class Storage{constructor(values={}){this.values=new Map(Object.entries(values));}get length(){return this.values.size;}key(i){return [...this.values.keys()][i]??null;}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,v);}removeItem(k){this.values.delete(k);}}
function request(body={scope:'browser',requestId:KEY},headers={},jar=new Map()){
 const wireHeaders=new Headers({'content-type':'application/json',origin:'https://soe.invalid',cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')});
 new Headers(headers).forEach((value,name)=>wireHeaders.set(name,value));
 const req=new Request('https://soe.invalid/api/auth/logout',{method:'POST',headers:wireHeaders,body:JSON.stringify(body)});req.cookies={get:name=>jar.has(name)?{value:jar.get(name)}:undefined,getAll:()=>[...jar].map(([name,value])=>({name,value}))};req.nextUrl=new URL(req.url);return req;
}
function fixture(){const app=offlineApp();let providerCalls=0;app.setMock('@/lib/supabase/server',()=>({createClient:async()=>{providerCalls++;throw Error('provider must not be called');}}));return {...app,get providerCalls(){return providerCalls;}};}
function providerSelection() {
 return new Map([['soe_auth_intent',PREVIOUS],['soe_auth_provider','supabase'],
  ['soe_auth_selection_v1',`v1.${PREVIOUS}.supabase.${ADA}`],[COOKIE,encodedCookie(token)]]);
}
function browser({applyCookies=true,dropOnce=false,readbackError=false,receiptOverride=null,selected=undefined,provider=undefined}={}){
 const app=fixture(),jar=new Map([['soe_wallet_id','synthetic-only'],['soe_auth_provider','wallet'],['sb-project-auth-token.0','synthetic-only'],['unrelated','keep'],...(selected??[])]);const target=new EventTarget();target.isSecureContext=true;target.crypto=webcrypto;target.location={protocol:'https:'};app.context.document={get cookie(){return [...jar].map(([k,v])=>k+'='+v).join('; ');},set cookie(value){const[k,v]=value.split(';')[0].split('=');jar.set(k,v);}};target.localStorage=new Storage({soe_wallet_id:ADA,'sb-project-auth-token':'synthetic-only','sb-project-auth-token-code-verifier':'synthetic-only','unrelated-draft':'keep'});target.sessionStorage=new Storage({'sb-access-token':'synthetic-only','unrelated-session':'keep'});app.context.window=target;app.context.Event=Event;const calls=[];let retirements=0;target.addEventListener('soe:auth-provider-changed',()=>retirements++);
 app.context.process.env.NEXT_PUBLIC_SUPABASE_URL=PROVIDER;
 app.context.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='NONISSUED_FIXTURE';
 app.context.fetch=async(url,options={})=>{calls.push({url,options});if(url==='/api/auth/logout/provider'){
  const response=await app.load('app/api/auth/logout/provider/route.ts').POST(request(JSON.parse(options.body),options.headers,jar));
  assert.equal(response.cookies.jar.size,0);
  return response;
 }if(url==='/api/auth/logout'){
  const response=await app.load('app/api/auth/logout/route.ts').POST(request(JSON.parse(options.body),options.headers,jar));
  if(applyCookies)for(const[name,{value,opts}]of response.cookies.jar){if(opts.maxAge===0)jar.delete(name);else jar.set(name,value);}
  if(dropOnce){dropOnce=false;throw Error('synthetic lost acknowledgement');}return receiptOverride?new Response(JSON.stringify(receiptOverride),{status:200}):response;
 }if(url==='/api/auth/member'){
  if(readbackError)throw Error('synthetic unavailable readback');
  if(!applyCookies)return new Response(JSON.stringify({member:{id:ADA}}),{status:200});
  return app.load('app/api/auth/member/route.ts').GET(request({}, {},jar));
 }if(url===PROVIDER+'/auth/v1/logout?scope=local'&&provider)return provider(options);
 throw Error('unexpected fixture path');};
 return {...app,jar,target,calls,get retirements(){return retirements;}};
}

test('logout clears only owned auth cookies, preserves unrelated cookies and sets an httpOnly refusal marker without provider calls',async()=>{
 const app=fixture(),jar=new Map([['soe_wallet_id','private'],['soe_siwe_nonce','private'],['sb-project-auth-token','private'],['sb-project-auth-token.0','private'],['sb-project-auth-token.1','private'],['sb-project-auth-token-code-verifier','private'],['sb-project-auth-token-code-verifier.0','private'],['unrelated','keep'],['sb-application-draft','keep']]);
 const response=await app.load('app/api/auth/logout/route.ts').POST(request(undefined,{},jar));assert.equal(response.status,200);assert.deepEqual(await response.json(),{outcome:'signed_out',scope:'browser',requestId:KEY,remoteRevocation:'not_confirmed'});
 for(const name of jar.keys())if(name==='unrelated'||name==='sb-application-draft')assert.equal(response.cookies.jar.has(name),false);else{assert.equal(response.cookies.jar.get(name).opts.maxAge,0);assert.equal(response.cookies.jar.get(name).opts.httpOnly,true);}
 assert.equal(response.cookies.jar.get('soe_auth_provider').value,'signed_out');assert.equal(response.cookies.jar.get('soe_auth_provider').opts.httpOnly,true);assert.equal(app.providerCalls,0);assert.match(response.headers.get('cache-control'),/no-store/);
});
test('cross-origin and unproven origin requests cannot clear cookies or invoke providers',async()=>{
 for(const headers of [{origin:'https://other.invalid'},{origin:'null'},{origin:'https://soe.invalid','sec-fetch-site':'cross-site'},{origin:''}]){const app=fixture(),response=await app.load('app/api/auth/logout/route.ts').POST(request(undefined,headers));assert.equal(response.status,403);assert.equal(response.cookies.jar.size,0);assert.equal(app.providerCalls,0);}
});
test('invalid, oversized and unsupported logout bodies cannot set a success receipt or cookies',async()=>{
 for(const body of [{},{scope:'all',requestId:KEY},{scope:'browser',requestId:'bad'},{scope:'browser',requestId:KEY,extra:true},{scope:'browser',requestId:KEY,padding:'x'.repeat(5000)}]){const app=fixture(),response=await app.load('app/api/auth/logout/route.ts').POST(request(body));assert.equal(response.status,400);assert.equal(response.cookies.jar.size,0);}
});
test('signed-out marker refuses retained cookies and bearer tokens before any provider verification',async()=>{
 const app=fixture(),jar=new Map([['soe_auth_provider','signed_out'],['soe_wallet_id','synthetic-only'],['sb-project-auth-token','synthetic-only']]),req=request({}, {authorization:'Bearer retained-synthetic-token'},jar);
 assert.equal(await app.load('lib/getAuthenticatedMember.ts').getAuthenticatedMember(req),null);const response=await app.load('app/api/auth/member/route.ts').GET(req);assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'Unauthorized',session:'signed_out',browserSignedOut:true});assert.equal(app.providerCalls,0);
 assert.equal((await app.load('app/api/auth/ensure-member/route.ts').POST(req)).status,401);assert.equal(app.providerCalls,0);
});
test('middleware refuses signed-out marker despite retained provider cookies and preserves safe sign-in return',()=>{
 const app=fixture(),sample=app.load('lib/http/routeError.ts').privateJson({}),N=sample.constructor;N.redirect=url=>new N(null,{status:307,headers:{location:String(url)}});N.next=()=>new N(null,{status:200});app.setMock('next/server',()=>({NextResponse:N}));const req=request({}, {},new Map([['soe_auth_provider','signed_out'],['sb-project-auth-token','synthetic-only']]));req.nextUrl=new URL('https://soe.invalid/dashboard?tab=profile');const response=app.load('proxy.ts').proxy(req),location=new URL(response.headers.get('location'));assert.equal(response.status,307);assert.equal(location.pathname,'/login');assert.equal(location.searchParams.get('next'),'/dashboard?tab=profile');
});
test('middleware preserves the wallet retry on protected reload and strips stale login hints', () => {
  const app = fixture(), sample = app.load('lib/http/routeError.ts').privateJson({}), N = sample.constructor;
  N.redirect = url => new N(null, { status: 307, headers: { location: String(url) } });
  N.next = () => new N(null, { status: 200 });
  app.setMock('next/server', () => ({ NextResponse: N }));
  const { proxy } = app.load('proxy.ts');
  const cookies = new Map([['soe_auth_provider', 'signed_out'], ['soe_wallet_id', 'synthetic-wallet']]);
  const get = (url, jar) => proxy({ url, nextUrl: new URL(url), cookies: request({}, {}, jar).cookies });
  const reload = get('https://soe.invalid/dashboard?tab=profile', cookies);
  assert.equal(reload.status, 307);
  assert.match(reload.headers.get('cache-control'), /no-store/);
  const login = new URL(reload.headers.get('location'));
  assert.equal(login.searchParams.get('walletSignOut'), 'pending');
  assert.equal(login.searchParams.get('next'), '/dashboard?tab=profile');
  assert.equal(get(login.href, cookies).status, 200);
  assert.equal(get('https://soe.invalid/login', cookies).status, 307);
  cookies.delete('soe_wallet_id');
  const cleared = new URL(get(login.href, cookies).headers.get('location'));
  assert.equal(cleared.searchParams.has('walletSignOut'), false);
  assert.equal(cleared.searchParams.get('next'), '/dashboard?tab=profile');
});
test('browser logout verifies accepted marker through fresh cookie-only readback before reporting success',async()=>{
 const app=browser(),result=await app.load('lib/auth/browserSignOut.ts').signOutBrowser(KEY);assert.equal(result.confirmed,true);assert.equal(result.providerSession,'not_applicable');assert.deepEqual(app.calls.map(c=>c.url),['/api/auth/logout','/api/auth/member']);assert.ok(app.calls.every(c=>c.options.credentials==='same-origin'&&c.options.cache==='no-store'&&!c.options.headers?.Authorization));assert.equal(app.jar.get('soe_auth_provider'),'signed_out');assert.equal(app.jar.has('soe_wallet_id'),false);assert.equal(app.jar.get('unrelated'),'keep');
});
test('retirement is immediate and cache cleanup preserves unrelated drafts before a held logout response',async()=>{
 const app=browser();let release;const original=app.context.fetch;app.context.fetch=(...args)=>args[0]==='/api/auth/logout'?new Promise(resolve=>{release=()=>original(...args).then(resolve);}):original(...args);
 const pending=app.load('lib/auth/browserSignOut.ts').signOutBrowser(KEY);assert.equal(app.retirements,1);assert.equal(app.target.localStorage.getItem('soe_wallet_id'),null);assert.equal(app.target.localStorage.getItem('unrelated-draft'),'keep');assert.equal(app.target.sessionStorage.getItem('unrelated-session'),'keep');await release();assert.equal((await pending).confirmed,true);
});
test('lost commit acknowledgement stays unknown; manual retry with the same key safely confirms',async()=>{
 const app=browser({dropOnce:true}),helper=app.load('lib/auth/browserSignOut.ts');assert.equal((await helper.signOutBrowser(KEY)).confirmed,false);assert.equal(app.calls.length,1);assert.equal(app.jar.get('soe_auth_provider'),'signed_out');assert.equal((await helper.signOutBrowser(KEY)).confirmed,true);assert.deepEqual(app.calls.filter(c=>c.url==='/api/auth/logout').map(c=>JSON.parse(c.options.body).requestId),[KEY,KEY]);
});
test('blocked cookie persistence, wrong receipt scope/key and unavailable readback never claim success',async()=>{
 for(const config of [{applyCookies:false},{readbackError:true},{receiptOverride:{outcome:'signed_out',scope:'all',requestId:KEY}},{receiptOverride:{outcome:'signed_out',scope:'browser',requestId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}}]){const app=browser(config),result=await app.load('lib/auth/browserSignOut.ts').signOutBrowser(KEY);assert.equal(result.confirmed,false);}
});
test('provider failure still clears browser access and reports revocation as unconfirmed',async()=>{
 const app=browser({selected:providerSelection(),provider:()=>new Response(null,{status:503})});
 const result=await app.load('lib/auth/browserSignOut.ts').signOutBrowser(KEY);
 assert.equal(result.confirmed,true);assert.equal(result.providerSession,'unconfirmed');
 assert.equal(app.jar.get('soe_auth_provider'),'signed_out');assert.equal(app.jar.has(COOKIE),false);
 assert.deepEqual(app.calls.map(c=>c.url),['/api/auth/logout/provider',PROVIDER+'/auth/v1/logout?scope=local','/api/auth/logout','/api/auth/member']);
});

test('a newer choice before a delayed cookie-clear dispatch makes the server refuse it',async()=>{
 const app=browser();let release;const original=app.context.fetch;
 app.context.fetch=(...args)=>args[0]==='/api/auth/logout'?new Promise(resolve=>{release=async()=>{
  const response=await original(...args);assert.equal(response.status,409);assert.equal(response.cookies.jar.size,0);resolve(response);
 };}):original(...args);
 const action=app.load('lib/auth/browserSignOut.ts').signOutBrowser(KEY);
 app.jar.set('soe_auth_intent',KEY);app.target.localStorage.setItem('sb-project-auth-token','newer');
 await release();assert.equal((await action).confirmed,false);assert.equal(app.calls.length,1);
 assert.equal(app.target.localStorage.getItem('sb-project-auth-token'),'newer');
});
test('a newer sign-in during held member readback prevents final cache clearing and stale success',async()=>{
 const app=browser();let release;const original=app.context.fetch;app.context.fetch=(...args)=>args[0]==='/api/auth/member'?new Promise(resolve=>{release=()=>original(...args).then(resolve);}):original(...args);
 const action=app.load('lib/auth/browserSignOut.ts').signOutBrowser(KEY);while(!release)await new Promise(resolve=>setImmediate(resolve));app.jar.set('soe_auth_intent',KEY);app.target.localStorage.setItem('sb-project-auth-token','newer');await release();assert.equal((await action).confirmed,false);assert.equal(app.target.localStorage.getItem('sb-project-auth-token'),'newer');
});
test('a newer sign-in while the provider response is held prevents any old cookie clearing',async()=>{
 let release,started;
 const providerStarted=new Promise(resolve=>{started=resolve;});
 const app=browser({selected:providerSelection(),provider:options=>new Promise(resolve=>{
  assert.equal(new Headers(options.headers).get('authorization'),'Bearer '+token);
  release=()=>resolve(new Response(null,{status:204}));started();
 })});
 const action=app.load('lib/auth/browserSignOut.ts').signOutBrowser(KEY);
 await Promise.race([providerStarted,action.then(()=>assert.fail('provider request did not start'))]);
 app.jar.set('soe_auth_intent',KEY);
 app.jar.set(COOKIE,encodedCookie(otherToken));
 app.jar.set('soe_auth_selection_v1',`v1.${KEY}.supabase.${ADA}`);
 app.target.localStorage.setItem('sb-project-auth-token','newer');
 release();
 assert.equal((await action).confirmed,false);
 assert.equal(app.calls.some(call=>call.url==='/api/auth/logout'),false);
 assert.equal(app.jar.get(COOKIE),encodedCookie(otherToken));
 assert.equal(app.target.localStorage.getItem('sb-project-auth-token'),'newer');
});

test('confirmed sign-out rejects a copied bearer and leaves another session for the same account usable', async () => {
 const active = new Set([token, otherToken]);
 const selected = providerSelection();
 const whole = selected.get(COOKIE);
 selected.delete(COOKIE);
 selected.set(COOKIE+'.1',whole.slice(70));
 selected.set(COOKIE+'.0',whole.slice(0,70));
 const app = browser({ selected, provider: options => {
  assert.equal(options.method,'POST');assert.equal(options.body,undefined);
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  assert.deepEqual([...new Headers(options.headers)],[['apikey','NONISSUED_FIXTURE'],['authorization','Bearer '+token]]);
  assert.equal(active.delete(token),true);
  return new Response(null,{status:204});
 } });
 app.setMock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {
  getUser: async bearer => active.has(bearer) ? { data:{user:{id:ADA}},error:null }
    : { data:{user:null},error:{message:'Synthetic ended session'} },
 } }) }));
 const db = app.fakes.resetDb({ members:[{id:OTHER,supabase_auth_id:ADA,display_name:'Synthetic reader'}] });
 app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin:() => db }));
 const member = app.load('app/api/auth/member/route.ts');
 const bearer = access => member.GET(request({}, {authorization:'Bearer '+access}));
 assert.equal((await bearer(token)).status,200);
 const result = await app.load('lib/auth/browserSignOut.ts').signOutBrowser(KEY);
 assert.equal(result.confirmed,true);assert.equal(result.providerSession,'revoked');
 assert.equal(app.jar.has(COOKIE+'.0'),false);assert.equal(app.jar.has(COOKIE+'.1'),false);
 assert.equal((await bearer(token)).status,401);assert.equal((await bearer(otherToken)).status,200);
 assert.equal(app.providerCalls,0);
});

test('provider endpoint accepts canonical whole and legacy encoded session cookies without setting cookies', async () => {
 for (const value of [encodedCookie(token), encodeURIComponent(sessionJson(token))]) {
  const jar = providerSelection();jar.set(COOKIE,value);jar.set('soe_auth_intent',OTHER);
  const app = browser({provider: options => {
   assert.equal(new Headers(options.headers).get('authorization'),'Bearer '+token);
   return new Response(null,{status:204});
  }});
  const response = await app.load('app/api/auth/logout/provider/route.ts').POST(
   request({previousIntent:PREVIOUS,requestId:KEY},{'x-soe-auth-intent':OTHER},jar));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{requestId:KEY,state:'revoked'});
  assert.equal(response.cookies.jar.size,0);assert.match(response.headers.get('cache-control'),/no-store/);
 }
});

test('provider revocation ignores missing, unsafe, and ambiguous sessions', async () => {
 const unsafeTokens = [
  jwt({sub:ADA}), jwt({sub:ADA,session_id:'00000000-0000-0000-0000-000000000000'}),
  jwt({sub:OTHER,session_id:SESSION}), jwt({sub:ADA,SUB:OTHER,session_id:SESSION}),
  jwt({sub:ADA,session_id:SESSION,SESSION_ID:null}),
 ];
 const edits = [
  ...unsafeTokens.map(access => jar => jar.set(COOKIE,encodedCookie(access))),
  jar => jar.set(COOKIE,'%broken'),
  jar => jar.set(COOKIE+'.0',jar.get(COOKIE)),
  jar => {jar.set(COOKIE+'.1',jar.get(COOKIE));jar.delete(COOKIE);},
  jar => {jar.set('sb-other-project-auth-token',jar.get(COOKIE));jar.delete(COOKIE);},
  jar => jar.set('soe_auth_selection_v1',`v1.${OTHER}.supabase.${ADA}`),
 ];
 for (const edit of edits) {
  const selected=providerSelection();edit(selected);
  const app=browser({selected});
  const result=await app.load('lib/auth/browserSignOut.ts').signOutBrowser(KEY);
  assert.equal(result.confirmed,true);assert.equal(result.providerSession,'unconfirmed');
  assert.equal(app.calls.some(call=>call.url.startsWith(PROVIDER)),false);
 }
});

test('cross-origin and stale provider requests, extra token inputs, and duplicate cookies cannot revoke', async () => {
 const jar=providerSelection();jar.set('soe_auth_intent',OTHER);
 const body={previousIntent:PREVIOUS,requestId:KEY};
 const header={'x-soe-auth-intent':OTHER};
 const repeated=[...jar].map(([name,value])=>name+'='+value).join('; ')+'; '+COOKIE+'='+encodedCookie(otherToken);
 const cases=[
  [body,{...header,origin:'https://foreign.invalid'},403,undefined],
  [body,{...header,'sec-fetch-site':'cross-site'},403,undefined],
  [body,header,200,'unconfirmed',repeated],
  [body,{'x-soe-auth-intent':KEY},409,undefined],
  [{...body,previousIntent:OTHER},header,409,undefined],
  [{...body,access_token:token},header,400,undefined],
 ];
 const app=browser(), route=app.load('app/api/auth/logout/provider/route.ts');
 for(const [payload,headers,status,state,cookie] of cases){
  const response=await route.POST(request(payload,cookie?{...headers,cookie}:headers,jar));
  assert.equal(response.status,status);assert.equal((await response.json()).state,state);
  assert.equal(response.cookies.jar.size,0);
 }
 assert.equal(app.calls.length,0);
});

test('a stalled provider request is aborted before the browser completes local sign-out', async () => {
 let signal;
 const app=browser({selected:providerSelection(),provider:options=>{signal=options.signal;return new Promise(()=>{});}});
 app.context.setTimeout=(callback,ms)=>setTimeout(callback,ms===3000?5:ms);
 const result=await app.load('lib/auth/browserSignOut.ts').signOutBrowser(KEY);
 assert.equal(signal.aborted,true);assert.equal(result.confirmed,true);assert.equal(result.providerSession,'unconfirmed');
 assert.equal(app.jar.get('soe_auth_provider'),'signed_out');
});
