// Canonical auth/member/owner-profile/public-profile handlers and SQL. Only provider identity,
// delivery and the server's PostgREST adapter are synthetic; no issued account.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {contributionSource,createMemberContributionsApp,contributionAppHashes,SUBJECTS,TOKENS} from './member-contributions-app.mjs';
await contributionSource('verification/web/tests/support/offline-app.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export const ORIGIN='https://native-profile.test',PROVIDER='https://native-auth-provider.test';
export const PUBLIC_KEY='sb_publishable_NONISSUED_NATIVE_OWNED_AUTH';
export const NEW_SUBJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ACCESS={author:TOKENS.author,new:'NONISSUED_NATIVE_NEW_ACCESS',rotated:'NONISSUED_NATIVE_ROTATED_ACCESS',other:TOKENS.other};
export {SUBJECTS};
const SOURCES=['verification/web/tests/support/native-profile-app.mjs','app/api/auth/ensure-member/route.ts','lib/getAuthenticatedMember.ts','lib/auth/verified-supabase-subject.ts','lib/auth/request.ts','lib/auth/walletSession.ts','docs/sql/member-identity-preflight.sql','docs/sql/member-identity-unique.sql','docs/sql/member-profile-preflight.sql','docs/sql/member-profile-apply.sql'];
const ROUTES=['app/api/auth/member/route.ts','app/api/auth/ensure-member/route.ts','app/api/members/profile/route.ts','app/api/explorer/[id]/route.ts'];
export async function profileAppHashes(){
 const hashes={...await contributionAppHashes()},seen=new Set();
 async function bind(name){if(seen.has(name))return;seen.add(name);const bytes=await contributionSource(name);hashes[name]=createHash('sha256').update(bytes).digest('hex');if(!name.endsWith('.ts')&&!name.endsWith('.tsx'))return;
  for(const match of bytes.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){
   const spec=match[1];if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;if(['@/lib/supabase/admin','@/lib/supabase/server'].includes(spec))continue;
   const target=spec.startsWith('@/')?spec.slice(2):new URL(spec,new URL(name,new URL('../../../../',import.meta.url))).pathname.slice(new URL('../../../../',import.meta.url).pathname.length);
   await bind(/\.(?:ts|tsx|json)$/.test(target)?target:target+'.ts');
  }
 }
 for(const name of [...SOURCES,...ROUTES])await bind(name);return hashes;
}
export async function createNativeProfileApp(){
 const f=await createMemberContributionsApp(),app=offlineApp(),sql=[],serverProvider=[];let closed=false,httpHook=null;
 try{
  for(const name of SOURCES)await contributionSource(name);
  await f.db.exec(`ALTER TABLE members ADD COLUMN IF NOT EXISTS supabase_auth_id uuid,
   ADD COLUMN IF NOT EXISTS email text,ADD COLUMN IF NOT EXISTS bio text,ADD COLUMN IF NOT EXISTS discipline text,
   ADD COLUMN IF NOT EXISTS skills text[],ADD COLUMN IF NOT EXISTS project_description text,ADD COLUMN IF NOT EXISTS seeking text,
   ADD COLUMN IF NOT EXISTS philosophy text,ADD COLUMN IF NOT EXISTS exp_tokens integer,ADD COLUMN IF NOT EXISTS tier text,
   ADD COLUMN IF NOT EXISTS coherence_data jsonb,ADD COLUMN IF NOT EXISTS total_responses integer,ADD COLUMN IF NOT EXISTS wallet_address text;
   ALTER TABLE members ALTER COLUMN id SET DEFAULT gen_random_uuid();
   ALTER TABLE members ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON members FROM PUBLIC,anon,authenticated;
   GRANT SELECT,INSERT,UPDATE,DELETE ON members TO service_role;`);
  // Empty optional strings make an unchanged complete patch a genuine SQL
  // no-op, rather than a null-to-empty normalization write.
  await f.db.query("UPDATE members SET supabase_auth_id=$1,email=$2,display_name='Native profile reader',bio='Initial private biography',discipline='',skills=ARRAY['Reading'],project_description='',seeking='',philosophy='',tier='PRIVATE_PROTECTED_TIER',exp_tokens=7 WHERE id=$3",[SUBJECTS.author,'PRIVATE_AUTHOR_EMAIL',f.authorId]);
  await f.db.query('UPDATE members SET supabase_auth_id=$1 WHERE id=$2',[SUBJECTS.other,f.actors.other]);
  for(const name of ['preflight','unique'])await f.db.exec((await contributionSource(`docs/sql/member-identity-${name}.sql`)).toString());
  // The older Circle fixture seeds only an unowned private-visibility column.
  // Remove that asserted synthetic placeholder so the unchanged real migration
  // owns the complete profile schema. This is not a production migration step.
  const placeholders=(await f.db.query("SELECT attname,atttypid::regtype::text AS type,attnotnull,col_description(attrelid,attnum) AS note FROM pg_attribute WHERE attrelid='members'::regclass AND attname IN('profile_visibility','profile_revision') AND NOT attisdropped")).rows;
  assert.deepEqual(placeholders,[{attname:'profile_visibility',type:'text',attnotnull:true,note:null}]);
  assert.equal((await f.db.query("SELECT count(*)::int AS n FROM members WHERE profile_visibility IS DISTINCT FROM 'private'")).rows[0].n,0);
  assert.equal((await f.db.query("SELECT to_regprocedure('soe_member_profile_update(uuid,bigint,jsonb)') AS fn")).rows[0].fn,null);
  await f.db.exec('ALTER TABLE members DROP COLUMN profile_visibility');
  for(const name of ['preflight','apply'])await f.db.exec((await contributionSource(`docs/sql/member-profile-${name}.sql`)).toString());
  app.context.process.env.NEXT_PUBLIC_SUPABASE_URL=PROVIDER;app.context.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_KEY;
  app.setMock('@/lib/supabase/server',()=>({createClient:async()=>{throw Error('Cookie authority forbidden in native proof');}}));
  app.setMock('@supabase/supabase-js',()=>({createClient:(url,key,options)=>{
   assert.equal(url,PROVIDER);assert.equal(key,PUBLIC_KEY);assert.deepEqual(JSON.parse(JSON.stringify(options)),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   return{auth:{getUser:async token=>{serverProvider.push({exactTokenRecognized:Object.values(ACCESS).includes(token)});const id=token===ACCESS.new?NEW_SUBJECT:token===ACCESS.other?SUBJECTS.other:[ACCESS.author,ACCESS.rotated].includes(token)?SUBJECTS.author:null;return{data:{user:id?{id}:null},error:null};}}};
  }}));
  const columns=new Set(['id','supabase_auth_id','display_name','email','bio','discipline','skills','project_description','seeking','philosophy','exp_tokens','tier','coherence_data','total_responses','wallet_address','profile_visibility','profile_revision']);
  const argumentNames=new Map();
  async function profileRpc(actor,revision,patch){await f.db.exec('SET ROLE service_role');try{return(await f.db.query('SELECT public.soe_member_profile_update($1,$2,$3::jsonb) AS result',[actor,revision,JSON.stringify(patch)])).rows[0].result;}finally{await f.db.exec('RESET ROLE');}}
  app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({
   from(table){assert.equal(table,'members');let projection,payload;const filters=[];const builder={
    select(value){assert(value.split(',').every(v=>columns.has(v.trim())));projection=value;return builder;},
    eq(column,value){assert(['id','supabase_auth_id','profile_visibility'].includes(column));assert(!filters.some(f=>f.column===column));filters.push({column,value});return builder;},
    insert(value){assert.deepEqual(Object.keys(value).sort(),['display_name','exp_tokens','supabase_auth_id','tier']);payload=JSON.parse(JSON.stringify(value));return builder;},single:()=>execute(false),maybeSingle:()=>execute(true)};
    async function execute(optional){assert(projection);sql.push({kind:payload?'insert':'select',projection});try{await f.db.exec('SET ROLE service_role');let rows;
     if(payload){const keys=Object.keys(payload);rows=(await f.db.query(`INSERT INTO members(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING ${projection}`,keys.map(k=>payload[k]))).rows;}
     else{assert(filters.length>=1&&filters.length<=2);if(filters.length===2){assert.deepEqual(filters.map(f=>f.column),['id','profile_visibility']);assert.equal(filters[1].value,'public');assert.equal(projection,'id,display_name,bio,discipline,skills,project_description,seeking,philosophy,profile_visibility');}else assert.notEqual(filters[0].column,'profile_visibility');rows=(await f.db.query(`SELECT ${projection} FROM members WHERE ${filters.map((f,i)=>f.column+'=$'+(i+1)).join(' AND ')}`,filters.map(f=>f.value))).rows;}
     if(rows.length!==1&&!(optional&&rows.length===0))return{data:null,error:{code:'PGRST116'}};return{data:rows[0]??null,error:null};
    }catch(error){return{data:null,error:{code:error.code??'FIXTURE_ERROR'}};}finally{await f.db.exec('RESET ROLE');}}
    return builder;
   },
   async rpc(name,args){assert.equal(name,'soe_member_profile_update');try{
    if(!argumentNames.has(name))argumentNames.set(name,(await f.db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name])).rows[0].proargnames);
    const keys=argumentNames.get(name);assert.deepEqual(Object.keys(args).sort(),[...keys].sort());sql.push({kind:'rpc',name,args:JSON.parse(JSON.stringify(args))});return{data:await profileRpc(args.p_actor,args.p_expected_revision,args.p_patch),error:null};
   }catch(error){return{data:null,error:{code:error.code??'FIXTURE_ERROR'}};}}
  })}));
  const routes=new Map();const route=name=>{if(!routes.has(name))routes.set(name,app.load(name));return routes.get(name);};
  async function dispatch(path,{method='GET',headers={},body}={}){
   assert(!closed);const url=new URL(path,ORIGIN);assert.equal(url.origin,ORIGIN);assert.equal(url.search,'');const h=new Headers(headers);assert(!h.has('cookie'));
   const publicMatch=/^\/api\/explorer\/([a-f0-9-]+)$/.exec(url.pathname);
   if(publicMatch){assert.equal(method,'GET');assert(!h.has('authorization'));assert(!h.has('apikey'));}else assert(h.has('authorization'));
   if(method==='POST')h.set('content-type','application/json');const request=new Request(url,{method,headers:h,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});Object.defineProperties(request,{cookies:{value:{get:()=>undefined}},nextUrl:{value:url}});
   let response;
   if(publicMatch)response=await route('app/api/explorer/[id]/route.ts').GET(request,{params:Promise.resolve({id:publicMatch[1]})});
   else{assert(['/api/auth/member','/api/auth/ensure-member','/api/members/profile'].includes(url.pathname),'Unexpected native profile path');response=await route('app'+url.pathname+'/route.ts')[method](request);}
   return httpHook?httpHook({path:url.pathname,method,request,response}):response;
  }
  return{...f,sql,serverProvider,dispatch,transformHttp(fn){httpHook=fn;},
   async profileRow(who='author'){return(await f.db.query('SELECT * FROM members WHERE id=$1',[f.actors[who]])).rows[0];},
   async updateProfile(patch,who='author'){const row=await this.profileRow(who);return profileRpc(f.actors[who],row.profile_revision,patch);},
   rows:async()=> (await f.db.query('SELECT id,supabase_auth_id,display_name,exp_tokens,tier FROM members WHERE supabase_auth_id IS NOT NULL ORDER BY id')).rows,
   async close(){if(closed)return;closed=true;await f.close();}};
 }catch(error){await f.close();throw error;}
}
