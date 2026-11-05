import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvisioningApp,accountRequest,IDS,TOKEN} from './support/bearer-member-provisioning-app.mjs';
const bearer={authorization:'Bearer '+TOKEN};
test('explicit native bearer verifies the exact token and provisions its subject without cookie fallback',async t=>{
 const f=await createProvisioningApp(t),response=await f.route.POST(accountRequest({displayName:' Native Explorer '},{headers:bearer})),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.created,true);assert.equal(body.member.supabase_auth_id,IDS.subject);assert.equal(body.member.display_name,'Native Explorer');assert.deepEqual(f.providerCalls.map(x=>x.kind),['token-client','token-user']);assert.deepEqual(f.providerCalls[1].args,[TOKEN]);assert.equal((await f.rows()).length,1);
 const session=await f.member.GET(accountRequest(undefined,{method:'GET',path:'/api/auth/member',headers:bearer}));assert.equal(session.status,200);const current=await session.json();assert.equal(current.member.id,body.member.id);assert.deepEqual(current.auth,{provider:'supabase',subject:IDS.subject});
});
test('valid explicit bearer overrides conflicting wallet and browser provider cookies without mutating them',async t=>{
 const f=await createProvisioningApp(t);await f.seed();for(const selected of ['wallet','supabase','unexpected']){const response=await f.route.POST(accountRequest({},{headers:bearer,cookies:{soe_auth_provider:selected,soe_wallet_id:IDS.other}}));assert.equal(response.status,200);assert.equal((await response.json()).member.id,IDS.member);assert.equal(response.cookies.jar.size,0);}
 assert.equal(f.providerCalls.some(x=>x.kind.startsWith('cookie')),false);assert.equal(f.calls.some(x=>x.kind==='insert'),false);
});
test('signed-out marker vetoes bearer provisioning before verification, body reads or database access',async t=>{
 const f=await createProvisioningApp(t),req={url:'https://provisioning.invalid/api/auth/ensure-member',headers:new Headers(bearer),cookies:{get:name=>name==='soe_auth_provider'?{value:'signed_out'}:undefined},get body(){throw Error('Body must not be consumed');}};
 assert.equal((await f.route.POST(req)).status,401);assert.deepEqual(f.providerCalls,[]);assert.deepEqual(f.calls,[]);assert.deepEqual(await f.rows(),[]);
});
test('malformed and oversized explicit bearer never falls back to a valid cookie account',async t=>{
 const f=await createProvisioningApp(t);for(const authorization of ['Basic invalid','bearer token','Bearer token extra','Bearer '+ 'x'.repeat(16384)]){assert.equal((await f.route.POST(accountRequest({},{headers:{authorization}}))).status,401);}
 assert.deepEqual(f.providerCalls,[]);assert.deepEqual(f.calls,[]);assert.deepEqual(await f.rows(),[]);
});
test('unverified, errored or non-UUID provider subjects refuse provisioning without cookie fallback',async t=>{
 const f=await createProvisioningApp(t);for(const [user,error]of [[null,null],[{id:IDS.subject},{name:'AuthRetryableFetchError',message:'PRIVATE_PROVIDER_DETAIL'}],[{id:'invalid-subject'},null],[{},null]]){f.setTokenUser(user,error);const response=await f.route.POST(accountRequest({},{headers:bearer}));assert.equal(response.status,401);assert.doesNotMatch(JSON.stringify(await response.json()),/PRIVATE_PROVIDER_DETAIL/);}
 assert.equal(f.providerCalls.some(x=>x.kind.startsWith('cookie')),false);assert.deepEqual(f.calls,[]);
});
test('privilege, member ID and provider claims in setup JSON are rejected before database queries',async t=>{
 const f=await createProvisioningApp(t);for(const payload of [{id:IDS.other},{memberId:IDS.other},{tier:'admin'},{exp_tokens:99999},{wallet_address:'0xforged'},{provider:'wallet'},{supabase_auth_id:IDS.otherSubject},{role:'admin'},{displayName:'x'.repeat(201)}]){assert.equal((await f.route.POST(accountRequest(payload,{headers:bearer}))).status,400);}
 assert.deepEqual(f.calls,[]);assert.deepEqual(await f.rows(),[]);
});
test('client subject is only an optional assertion and normalized UUID matching binds the verified subject',async t=>{
 const f=await createProvisioningApp(t,{tokenUser:{id:IDS.subject.toUpperCase()}});assert.equal((await f.route.POST(accountRequest({supabaseAuthId:IDS.otherSubject},{headers:bearer}))).status,403);assert.deepEqual(f.calls,[]);
 const response=await f.route.POST(accountRequest({supabaseAuthId:IDS.subject},{headers:{...bearer,'x-member-id':IDS.other},path:'/api/auth/ensure-member?memberId='+IDS.other}));assert.equal(response.status,200);assert.equal((await response.json()).member.supabase_auth_id,IDS.subject);assert.equal(f.calls.every(call=>call.kind==='insert'?call.payload.supabase_auth_id===IDS.subject:call.filter.value===IDS.subject),true);
});
test('email and display-name collisions cannot claim another account or change subscriptions',async t=>{
 const f=await createProvisioningApp(t);await f.seed({id:IDS.other,subject:IDS.otherSubject,name:'Same name',email:'same@example.invalid',wallet:'0xsynthetic'});const before=await f.db.query('SELECT * FROM daily_email_subscriptions');
 const response=await f.route.POST(accountRequest({email:'same@example.invalid',displayName:'Same name'},{headers:bearer}));assert.equal(response.status,200);assert.equal((await response.json()).member.id,IDS.created);const rows=await f.rows();assert.equal(rows.find(x=>x.id===IDS.other).supabase_auth_id,IDS.otherSubject);assert.equal(rows.find(x=>x.id===IDS.created).email,null);assert.deepEqual((await f.db.query('SELECT * FROM daily_email_subscriptions')).rows,before.rows);assert.ok(f.calls.every(x=>x.kind==='insert'||x.filter.column==='supabase_auth_id'));
});
test('actual unique subject collision recovers the existing same-subject member and never duplicates it',async t=>{
 const f=await createProvisioningApp(t);f.beforeInsert(async(payload,db)=>{await db.query('INSERT INTO members(id,supabase_auth_id,display_name,tier,exp_tokens) VALUES($1,$2,$3,$4,$5)',[IDS.member,payload.supabase_auth_id,'Racing synthetic member','free',0]);});
 const response=await f.route.POST(accountRequest({},{headers:bearer})),body=await response.json();assert.equal(response.status,200);assert.equal(body.created,false);assert.equal(body.member.id,IDS.member);assert.equal((await f.rows()).length,1);assert.deepEqual(f.calls.map(x=>x.kind),['select','insert','select']);assert.equal(f.calls[2].filter.value,IDS.subject);
});
test('unrelated primary-key collision cannot recover using another subject or account details',async t=>{
 const f=await createProvisioningApp(t);await f.seed({id:IDS.created,subject:IDS.otherSubject});const before=await f.rows();const response=await f.route.POST(accountRequest({},{headers:bearer}));assert.equal(response.status,503);assert.deepEqual(await f.rows(),before);assert.deepEqual(f.calls.map(x=>x.kind),['select','insert','select']);assert.equal(f.calls[2].filter.value,IDS.subject);
});
test('existing, inserted and race-recovery rows must independently match the verified subject',async t=>{
 for(const stage of ['existing','insert','race'])await t.test(stage,async tt=>{const f=await createProvisioningApp(tt);if(stage==='existing')await f.seed();if(stage==='race')f.beforeInsert(async(payload,db)=>{await db.query('INSERT INTO members(id,supabase_auth_id,display_name) VALUES($1,$2,$3)',[IDS.member,payload.supabase_auth_id,'Race']);});
  f.transformResult((call,result)=>result.data&&(stage==='insert'?call.kind==='insert':call.kind==='select')?{...result,data:{...result.data,supabase_auth_id:IDS.otherSubject}}:result);
  const response=await f.route.POST(accountRequest({},{headers:bearer}));assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),new RegExp(IDS.otherSubject));
 });
});
test('duplicate subject rows and database failures refuse account selection with private generic errors',async t=>{
 const f=await createProvisioningApp(t,{install:false});await f.seed();await f.seed({id:IDS.other});let response=await f.route.POST(accountRequest({},{headers:bearer}));assert.equal(response.status,503);assert.equal(f.calls.some(x=>x.kind==='insert'),false);f.failSql('XX000');response=await f.route.POST(accountRequest({},{headers:bearer}));assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/PRIVATE_SQL_DETAIL|PRIVATE_SQL_CARDINALITY|aaaaaaaa/);
});
test('successful response is private, whitelisted and does not expose credentials or billing secrets',async t=>{
 const f=await createProvisioningApp(t);await f.seed();const response=await f.route.POST(accountRequest({},{headers:bearer})),body=await response.json();assert.equal(response.status,200);assert.equal(body.created,false);assert.equal(body.member.id,IDS.member);assert.doesNotMatch(JSON.stringify(body),/PRIVATE_SERVICE_SECRET|PRIVATE_STRIPE_ID|NONISSUED_EXACT_NATIVE_TOKEN|wallet_address/);assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.match(response.headers.get('vary'),/Cookie/);assert.match(response.headers.get('vary'),/Authorization/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.cookies.jar.size,0);
});
test('origin rejection precedes credential reads and bounded invalid JSON never reaches the database',async t=>{
 const f=await createProvisioningApp(t);for(const headers of [{origin:'https://foreign.invalid'},{'sec-fetch-site':'cross-site'}])assert.equal((await f.route.POST(accountRequest({},{headers:{...bearer,...headers}}))).status,403);assert.deepEqual(f.providerCalls,[]);
 for(const raw of ['[]','null','{',' '.repeat(4097),new Uint8Array([0xc0,0x80])])assert.equal((await f.route.POST(accountRequest(undefined,{headers:bearer,raw}))).status,400);
 assert.deepEqual(f.calls,[]);assert.deepEqual(await f.rows(),[]);
});
test('no-header cookie provisioning retains its selected-provider behavior and verified subject',async t=>{
 const f=await createProvisioningApp(t);for(const selected of ['wallet','signed_out','unexpected'])assert.equal((await f.route.POST(accountRequest({},{cookies:{soe_auth_provider:selected}}))).status,409);assert.deepEqual(f.providerCalls,[]);
 const response=await f.route.POST(accountRequest({displayName:'Cookie member'},{cookies:{soe_auth_provider:'supabase',soe_auth_intent:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',soe_auth_selection_v1:'v1.cccccccc-cccc-4ccc-8ccc-cccccccccccc.supabase.'+IDS.otherSubject}})),body=await response.json();assert.equal(response.status,200);assert.equal(body.member.supabase_auth_id,IDS.otherSubject);assert.deepEqual(f.providerCalls.map(x=>x.kind),['cookie-client','cookie-user']);assert.deepEqual(f.providerCalls[1].args,[]);
});
test('newly provisioned subject is idempotent and browser roles remain unable to read or insert members',async t=>{
 const f=await createProvisioningApp(t);const first=await f.route.POST(accountRequest({},{headers:bearer})),firstBody=await first.json();const second=await f.route.POST(accountRequest({displayName:'Do not replace the profile'},{headers:bearer})),secondBody=await second.json();assert.equal(firstBody.created,true);assert.equal(secondBody.created,false);assert.equal(secondBody.member.id,firstBody.member.id);assert.equal(secondBody.member.display_name,'Explorer');assert.equal(f.calls.filter(x=>x.kind==='insert').length,1);
 for(const role of ['anon','authenticated']){await f.db.exec('SET ROLE '+role);try{await assert.rejects(f.db.query('SELECT id FROM members'),error=>error.code==='42501');await assert.rejects(f.db.query('INSERT INTO members(id) VALUES($1)',[IDS.other]),error=>error.code==='42501');}finally{await f.db.exec('RESET ROLE');}}
 assert.equal((await f.rows()).length,1);assert.equal((await f.db.query("SELECT indisunique FROM pg_index WHERE indexrelid='soe_members_auth_subject_key'::regclass")).rows[0].indisunique,true);
});
