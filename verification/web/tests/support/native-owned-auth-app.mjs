// Canonical auth/member/contribution handlers and SQL. Only provider identity,
// delivery and the server's PostgREST adapter are synthetic; no issued account.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {contributionSource,createMemberContributionsApp,contributionAppHashes,SUBJECTS,TOKENS,rpc} from './member-contributions-app.mjs';
await contributionSource('verification/web/tests/support/offline-app.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export const ORIGIN='https://native-owned-auth.test',PROVIDER='https://native-auth-provider.test';
export const PUBLIC_KEY='sb_publishable_NONISSUED_NATIVE_OWNED_AUTH';
export const NEW_SUBJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ACCESS={author:TOKENS.author,new:'NONISSUED_NATIVE_NEW_ACCESS',rotated:'NONISSUED_NATIVE_ROTATED_ACCESS'};
export {SUBJECTS};
const SOURCES=['verification/web/tests/support/native-owned-auth-app.mjs','app/api/auth/ensure-member/route.ts','lib/getAuthenticatedMember.ts','lib/auth/verified-supabase-subject.ts','lib/auth/request.ts','lib/auth/walletSession.ts','docs/sql/member-identity-preflight.sql','docs/sql/member-identity-unique.sql'];
export async function ownedAuthHashes(){return{...await contributionAppHashes(),...Object.fromEntries(await Promise.all(SOURCES.map(async name=>[name,createHash('sha256').update(await contributionSource(name)).digest('hex')])))};}
export async function createOwnedAuthApp(){
 const f=await createMemberContributionsApp(),app=offlineApp(),sql=[],serverProvider=[];let closed=false;
 try{
  for(const name of SOURCES)await contributionSource(name);
  await f.db.exec(`ALTER TABLE members ADD COLUMN IF NOT EXISTS supabase_auth_id uuid,
   ADD COLUMN IF NOT EXISTS email text,ADD COLUMN IF NOT EXISTS bio text,ADD COLUMN IF NOT EXISTS discipline text,
   ADD COLUMN IF NOT EXISTS skills text[],ADD COLUMN IF NOT EXISTS project_description text,ADD COLUMN IF NOT EXISTS seeking text,
   ADD COLUMN IF NOT EXISTS philosophy text,ADD COLUMN IF NOT EXISTS exp_tokens integer,ADD COLUMN IF NOT EXISTS tier text,
   ADD COLUMN IF NOT EXISTS coherence_data jsonb,ADD COLUMN IF NOT EXISTS total_responses integer,ADD COLUMN IF NOT EXISTS wallet_address text;
   ALTER TABLE members ALTER COLUMN id SET DEFAULT gen_random_uuid();
   GRANT SELECT,INSERT ON members TO service_role;`);
  await f.db.query('UPDATE members SET supabase_auth_id=$1,email=$2 WHERE id=$3',[SUBJECTS.author,'PRIVATE_AUTHOR_EMAIL',f.authorId]);
  await f.db.query('UPDATE members SET supabase_auth_id=$1 WHERE id=$2',[SUBJECTS.other,f.actors.other]);
  for(const name of ['preflight','unique'])await f.db.exec((await contributionSource(`docs/sql/member-identity-${name}.sql`)).toString());
  app.context.process.env.NEXT_PUBLIC_SUPABASE_URL=PROVIDER;app.context.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_KEY;
  app.setMock('@/lib/supabase/server',()=>({createClient:async()=>{throw Error('Cookie authority forbidden in native proof');}}));
  app.setMock('@supabase/supabase-js',()=>({createClient:(url,key,options)=>{
   assert.equal(url,PROVIDER);assert.equal(key,PUBLIC_KEY);assert.deepEqual(JSON.parse(JSON.stringify(options)),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   return{auth:{getUser:async token=>{serverProvider.push({exactTokenRecognized:Object.values(ACCESS).includes(token)});const id=token===ACCESS.new?NEW_SUBJECT:[ACCESS.author,ACCESS.rotated].includes(token)?SUBJECTS.author:null;return{data:{user:id?{id}:null},error:null};}}};
  }}));
  const columns=new Set(['id','supabase_auth_id','display_name','email','bio','discipline','skills','project_description','seeking','philosophy','exp_tokens','tier','coherence_data','total_responses','wallet_address']);
  const argumentNames=new Map();
  app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({
   from(table){assert.equal(table,'members');let projection,filter,payload;const builder={
    select(value){assert(value.split(',').every(v=>columns.has(v.trim())));projection=value;return builder;},
    eq(column,value){assert(['id','supabase_auth_id'].includes(column));assert(!filter);filter={column,value};return builder;},
    insert(value){assert.deepEqual(Object.keys(value).sort(),['display_name','exp_tokens','supabase_auth_id','tier']);payload=JSON.parse(JSON.stringify(value));return builder;},single:()=>execute(false),maybeSingle:()=>execute(true)};
    async function execute(optional){assert(projection);sql.push({kind:payload?'insert':'select',projection});try{await f.db.exec('SET ROLE service_role');let rows;
     if(payload){const keys=Object.keys(payload);rows=(await f.db.query(`INSERT INTO members(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING ${projection}`,keys.map(k=>payload[k]))).rows;}
     else{assert(filter);rows=(await f.db.query(`SELECT ${projection} FROM members WHERE ${filter.column}=$1`,[filter.value])).rows;}
     if(rows.length!==1&&!(optional&&rows.length===0))return{data:null,error:{code:'PGRST116'}};return{data:rows[0]??null,error:null};
    }catch(error){return{data:null,error:{code:error.code??'FIXTURE_ERROR'}};}finally{await f.db.exec('RESET ROLE');}}
    return builder;
   },
   async rpc(name,args){assert(['soe_circle_message_contributions','soe_circle_message_state','soe_circle_message_action'].includes(name));try{
    if(!argumentNames.has(name))argumentNames.set(name,(await f.db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name])).rows[0].proargnames);
    const keys=argumentNames.get(name);assert.deepEqual(Object.keys(args).sort(),[...keys].sort());sql.push({kind:'rpc',name});return{data:await rpc(f.db,name,keys.map(k=>args[k])),error:null};
   }catch(error){return{data:null,error:{code:error.code??'FIXTURE_ERROR'}};}}
  })}));
  const member=app.load('app/api/auth/member/route.ts'),setup=app.load('app/api/auth/ensure-member/route.ts'),list=app.load('app/api/circles/contributions/route.ts'),message=app.load('app/api/circles/[circleId]/messages/[messageId]/route.ts');
  async function dispatch(path,{method='GET',headers={},body}={}){
   assert(!closed);const url=new URL(path,ORIGIN);assert.equal(url.origin,ORIGIN);const h=new Headers(headers);assert(h.has('authorization'));assert(!h.has('cookie'));if(method==='POST')h.set('content-type','application/json');
   const request=new Request(url,{method,headers:h,...(body===undefined?{}:{body})});Object.defineProperty(request,'cookies',{value:{get:()=>undefined}});
   if(url.pathname==='/api/auth/member'){assert.equal(method,'GET');return member.GET(request);}
   if(url.pathname==='/api/auth/ensure-member'){assert.equal(method,'POST');return setup.POST(request);}
   if(url.pathname==='/api/circles/contributions'){assert.equal(method,'GET');return list.GET(request);}
   const match=/^\/api\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(url.pathname);assert(match,'Unexpected native owned-auth app route');return message[method](request,{params:Promise.resolve({circleId:match[1],messageId:match[2]})});
  }
  return{...f,sql,serverProvider,dispatch,rows:async()=> (await f.db.query('SELECT id,supabase_auth_id,display_name,exp_tokens,tier FROM members WHERE supabase_auth_id IS NOT NULL ORDER BY id')).rows,
   async close(){if(closed)return;closed=true;await f.close();}};
 }catch(error){await f.close();throw error;}
}
