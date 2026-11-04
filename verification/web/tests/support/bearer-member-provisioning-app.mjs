// Actual account handlers and identity uniqueness SQL; only provider verification
// and the server-to-database transport are synthetic. No issued credentials.
import assert from 'node:assert/strict';
import {lstat,stat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ROOT=new URL('../../../../',import.meta.url);
export async function provisioningSource(name){const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);assert.equal(link.isSymbolicLink(),false,'Refuse linked source '+name);assert.ok(info.isFile()&&(!info.size||info.blocks),'Refuse offloaded source '+name);return readFile(file);}
await provisioningSource('verification/web/tests/support/offline-app.mjs');
await provisioningSource('verification/web/tooling/node_modules/@electric-sql/pglite/dist/index.js');
const {offlineApp}=await import('./offline-app.mjs');
const {PGlite}=await import('../../tooling/node_modules/@electric-sql/pglite/dist/index.js');
export const IDS=Object.freeze({member:'81111111-1111-4111-8111-111111111111',other:'82222222-2222-4222-8222-222222222222',created:'83333333-3333-4333-8333-333333333333',subject:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',otherSubject:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
export const TOKEN='NONISSUED_EXACT_NATIVE_TOKEN';
export const ORIGIN='https://provisioning.invalid';
export const PROVISIONING_SOURCES=Object.freeze(['app/api/auth/ensure-member/route.ts','app/api/auth/member/route.ts','lib/getAuthenticatedMember.ts','lib/auth/verified-supabase-subject.ts','lib/auth/memberDto.ts','lib/auth/request.ts','lib/auth/provider.ts','lib/auth/walletSession.ts','lib/http/routeError.ts','docs/sql/member-identity-preflight.sql','docs/sql/member-identity-unique.sql','tests/security/fakes.ts','verification/web/tests/support/offline-app.mjs','verification/web/tests/support/bearer-member-provisioning-app.mjs']);
export async function provisioningHashes(extra=[]){return Object.fromEntries(await Promise.all([...new Set([...PROVISIONING_SOURCES,...extra])].map(async name=>[name,createHash('sha256').update(await provisioningSource(name)).digest('hex')])));}
export function accountRequest(body={}, {headers={},cookies={},method='POST',raw,path='/api/auth/ensure-member'}={}){const h=new Headers(headers);if(!h.has('content-type'))h.set('content-type','application/json');const req=new Request('https://provisioning.invalid'+path,{method,headers:h,...(method==='POST'?{body:raw??JSON.stringify(body)}:{})});Object.defineProperty(req,'cookies',{value:{get:name=>Object.hasOwn(cookies,name)?{value:cookies[name]}:undefined}});return req;}
export async function createProvisioningApp(t,{install=true,cookieUser={id:IDS.otherSubject},tokenUser={id:IDS.subject},tokenError=null,cookieError=null}={}){
 for(const source of PROVISIONING_SOURCES)await provisioningSource(source);
 const db=new PGlite();await db.waitReady;let closed=false;const close=async()=>{if(closed)return;closed=true;await db.close();};t?.after(close);
 await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
 CREATE TABLE members(id uuid PRIMARY KEY DEFAULT '${IDS.created}',supabase_auth_id uuid,display_name text,email text,bio text,discipline text,skills text[],project_description text,seeking text,philosophy text,exp_tokens integer,tier text,coherence_data jsonb,total_responses integer,wallet_address text,service_secret text,stripe_customer_id text);
 ALTER TABLE members ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT ON members TO service_role;
 CREATE TABLE daily_email_subscriptions(id text PRIMARY KEY,member_id uuid,unsubscribed_at timestamptz);
 INSERT INTO daily_email_subscriptions VALUES('synthetic-unsubscribed','${IDS.member}','2026-01-01T00:00:00Z');`);
 if(install)for(const name of ['preflight','unique'])await db.exec((await provisioningSource(`docs/sql/member-identity-${name}.sql`)).toString());
 const app=offlineApp(),calls=[],providerCalls=[],http=[];let insertHook=null,resultHook=null,sqlFailure=null,httpHook=null;
 app.context.process.env.NEXT_PUBLIC_SUPABASE_URL='https://synthetic.invalid';app.context.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='NONISSUED_PUBLIC_KEY';
 app.setMock('@/lib/supabase/server',()=>({createClient:async()=>{providerCalls.push({kind:'cookie-client'});return{auth:{getUser:async(...args)=>{providerCalls.push({kind:'cookie-user',args});return{data:{user:cookieUser},error:cookieError};}}};}}));
 app.setMock('@supabase/supabase-js',()=>({createClient:(url,key,options)=>{assert.equal(url,'https://synthetic.invalid');assert.equal(key,'NONISSUED_PUBLIC_KEY');assert.deepEqual(JSON.parse(JSON.stringify(options)),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});providerCalls.push({kind:'token-client'});return{auth:{getUser:async(...args)=>{providerCalls.push({kind:'token-user',args});return{data:{user:args.length===1&&args[0]===TOKEN?tokenUser:null},error:tokenError};}}};}}));
 const allowedColumns=new Set(['id','supabase_auth_id','display_name','email','bio','discipline','skills','project_description','seeking','philosophy','exp_tokens','tier','coherence_data','total_responses','wallet_address']);
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({from(table){assert.equal(table,'members');let columns=null,filter=null,payload=null;
  const builder={select(value){assert.equal(typeof value,'string');assert.ok(value.split(',').every(name=>allowedColumns.has(name.trim())));columns=value;return builder;},eq(column,value){assert.ok(['id','supabase_auth_id'].includes(column));assert.equal(filter,null);filter={column,value};return builder;},insert(value){assert.equal(payload,null);assert.deepEqual(Object.keys(value).sort(),['display_name','exp_tokens','supabase_auth_id','tier']);assert.equal(value.exp_tokens,0);assert.equal(value.tier,'free');payload=JSON.parse(JSON.stringify(value));return builder;},single:()=>execute(false),maybeSingle:()=>execute(true)};
  async function execute(optional){assert.ok(columns);const call={kind:payload?'insert':'select',columns,filter,payload};calls.push(call);try{
    if(payload&&insertHook){const hook=insertHook;insertHook=null;await hook(payload,db);}if(sqlFailure)throw Object.assign(Error('PRIVATE_SQL_DETAIL'),{code:sqlFailure});
    await db.exec('SET ROLE service_role');let rows;
    if(payload){const keys=Object.keys(payload);rows=(await db.query(`INSERT INTO members(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING ${columns}`,keys.map(key=>payload[key]))).rows;}
    else{assert.ok(filter);rows=(await db.query(`SELECT ${columns} FROM members WHERE ${filter.column}=$1`,[filter.value])).rows;}
    if(rows.length!==1&&!(optional&&rows.length===0))return{data:null,error:{code:'PGRST116',message:'PRIVATE_SQL_CARDINALITY'}};
    const result={data:rows[0]??null,error:null};return resultHook?resultHook(call,result):result;
   }catch(error){return{data:null,error:{code:error.code??'FIXTURE_ERROR',message:'PRIVATE_SQL_DETAIL'}};}finally{await db.exec('RESET ROLE');}}
  return builder;}})}));
 const route=app.load('app/api/auth/ensure-member/route.ts'),member=app.load('app/api/auth/member/route.ts');
 async function dispatch(path,{method='GET',headers={},body,signal,cookies={}}={}){assert.equal(closed,false);const url=new URL(path,ORIGIN);assert.equal(url.origin,ORIGIN);assert.ok((url.pathname==='/api/auth/member'&&method==='GET')||(url.pathname==='/api/auth/ensure-member'&&method==='POST'));const req=accountRequest(undefined,{method,headers,cookies,raw:body,path:url.pathname+url.search});if(signal?.aborted)throw Error('Synthetic transport aborted before dispatch');http.push({path:url.pathname+url.search,method,body:body??null});const response=await(method==='GET'?member.GET(req):route.POST(req));return httpHook?httpHook({path:url.pathname+url.search,method,request:req,response}):response;}
 return{db,app,calls,providerCalls,http,route,member,dispatch,close,transformHttp(fn){httpHook=fn;},
  async seed({id=IDS.member,subject=IDS.subject,name='Synthetic member',email='PRIVATE_SYNTHETIC_EMAIL',wallet=null}={}){await db.query('INSERT INTO members(id,supabase_auth_id,display_name,email,exp_tokens,tier,wallet_address,service_secret,stripe_customer_id) VALUES($1,$2,$3,$4,7,$5,$6,$7,$8)',[id,subject,name,email,'protected-tier',wallet,'PRIVATE_SERVICE_SECRET','PRIVATE_STRIPE_ID']);},
  beforeInsert(fn){insertHook=fn;},transformResult(fn){resultHook=fn;},failSql(code){sqlFailure=code;},setTokenUser(value,error=null){tokenUser=value;tokenError=error;},setCookieUser(value,error=null){cookieUser=value;cookieError=error;},
  rows:async()=> (await db.query('SELECT id,supabase_auth_id,display_name,email,exp_tokens,tier FROM members ORDER BY id')).rows,
 };
}
