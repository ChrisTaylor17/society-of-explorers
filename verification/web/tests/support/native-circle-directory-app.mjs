// Canonical auth/member/contribution handlers and SQL. Only provider identity,
// delivery and the server's PostgREST adapter are synthetic; no issued account.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {contributionSource,createMemberContributionsApp,contributionAppHashes,SUBJECTS,TOKENS,rpc,requestId} from './member-contributions-app.mjs';
await contributionSource('verification/web/tests/support/offline-app.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export const ORIGIN='https://native-circle-directory.test',PROVIDER='https://native-auth-provider.test';
export const PUBLIC_KEY='sb_publishable_NONISSUED_NATIVE_OWNED_AUTH';
export const NEW_SUBJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ACCESS={author:TOKENS.author,new:'NONISSUED_NATIVE_NEW_ACCESS',rotated:'NONISSUED_NATIVE_ROTATED_ACCESS'};
export {SUBJECTS};
const SOURCES=['verification/web/tests/support/native-circle-directory-app.mjs','app/api/auth/ensure-member/route.ts','lib/getAuthenticatedMember.ts','lib/auth/verified-supabase-subject.ts','lib/auth/request.ts','lib/auth/walletSession.ts','docs/sql/member-identity-preflight.sql','docs/sql/member-identity-unique.sql','docs/sql/circle-discovery-unicode.sql','docs/sql/circle-discovery-search.sql'];
const ROUTES=['app/api/circles/route.ts','app/api/circles/mine/route.ts','app/api/circles/[circleId]/route.ts','app/api/circles/[circleId]/membership/route.ts','app/api/circles/[circleId]/join/route.ts','app/api/circles/[circleId]/leave/route.ts','app/api/book-salons/[cohortId]/route.ts','app/api/circles/[circleId]/discussion/route.ts','app/api/circles/[circleId]/discussion/preview/route.ts'];
export async function directoryAppHashes(){
 const hashes={...await contributionAppHashes()},seen=new Set();
 async function bind(name){if(seen.has(name))return;seen.add(name);const bytes=await contributionSource(name);hashes[name]=createHash('sha256').update(bytes).digest('hex');if(!name.endsWith('.ts')&&!name.endsWith('.tsx'))return;
  for(const match of bytes.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){
   const spec=match[1];if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;if(['@/lib/supabase/admin','@/lib/supabase/server'].includes(spec))continue;
   const target=spec.startsWith('@/')?spec.slice(2):new URL(spec,new URL(name,new URL('../../../../',import.meta.url))).pathname.slice(new URL('../../../../',import.meta.url).pathname.length);
   await bind(/\.(?:ts|tsx|json)$/.test(target)?target:target+'.ts');
  }
 }
 for(const name of [...SOURCES,...ROUTES,'app/api/auth/member/route.ts','app/api/circles/contributions/route.ts','app/api/circles/[circleId]/messages/[messageId]/route.ts'])await bind(name);return hashes;
}
export async function createNativeCircleDirectoryApp(){
 const f=await createMemberContributionsApp(),app=offlineApp(),sql=[],serverProvider=[];let closed=false,httpHook=null;
 try{
  for(const name of [...SOURCES,...ROUTES])await contributionSource(name);
  if(!(await f.db.query("SELECT 1 FROM pg_proc WHERE proname='soe_circle_discovery_search'")).rows.length)for(const name of ['circle-discovery-unicode.sql','circle-discovery-search.sql'])await f.db.exec((await contributionSource('docs/sql/'+name)).toString());
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
   from(table){assert(['members','book_cohorts'].includes(table));let projection,filter,payload;const builder={
    select(value){assert(table==='members'?value.split(',').every(v=>columns.has(v.trim())):value==='id,book_id,title,description,max_members,start_date,thinker_id,status,created_at');projection=value;return builder;},
    eq(column,value){assert((table==='members'?['id','supabase_auth_id']:['id']).includes(column));assert(!filter);filter={column,value};return builder;},
    insert(value){assert.equal(table,'members');assert.deepEqual(Object.keys(value).sort(),['display_name','exp_tokens','supabase_auth_id','tier']);payload=JSON.parse(JSON.stringify(value));return builder;},single:()=>execute(false),maybeSingle:()=>execute(true)};
    async function execute(optional){assert(projection);sql.push({kind:payload?'insert':'select',projection,table});try{await f.db.exec('SET ROLE service_role');let rows;
     if(payload){const keys=Object.keys(payload);rows=(await f.db.query(`INSERT INTO members(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING ${projection}`,keys.map(k=>payload[k]))).rows;}
     else{assert(filter);rows=(await f.db.query(`SELECT ${projection} FROM ${table} WHERE ${filter.column}=$1`,[filter.value])).rows;}
     if(rows.length!==1&&!(optional&&rows.length===0))return{data:null,error:{code:'PGRST116'}};return{data:rows[0]?JSON.parse(JSON.stringify(rows[0])):null,error:null};
    }catch(error){return{data:null,error:{code:error.code??'FIXTURE_ERROR'}};}finally{await f.db.exec('RESET ROLE');}}
    return builder;
   },
   async rpc(name,args){assert(['soe_circle_message_contributions','soe_circle_message_state','soe_circle_message_action','soe_circle_discovery_search','soe_circle_detail','soe_circle_my_circles','soe_circle_membership_state','soe_circle_join','soe_circle_leave','soe_circle_messages_read','soe_circle_discussion_read','soe_circle_discussion_thread','soe_circle_discussion_target','soe_circle_discussion_receipt','soe_circle_discussion_post'].includes(name));try{
    if(!argumentNames.has(name))argumentNames.set(name,(await f.db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name])).rows[0].proargnames);
    const keys=argumentNames.get(name);assert.deepEqual(Object.keys(args).sort(),[...keys].sort());sql.push({kind:'rpc',name});return{data:await rpc(f.db,name,keys.map(k=>args[k])),error:null};
   }catch(error){return{data:null,error:{code:error.code??'FIXTURE_ERROR'}};}}
  })}));
  const routes=new Map();const route=name=>{if(!routes.has(name))routes.set(name,app.load(name));return routes.get(name);};
  async function dispatch(path,{method='GET',headers={},body}={}){
   assert(!closed);const url=new URL(path,ORIGIN);assert.equal(url.origin,ORIGIN);const h=new Headers(headers);assert(!h.has('cookie'));
   if(url.pathname==='/api/circles'){assert.equal(method,'GET');assert(!h.has('authorization'));assert(!h.has('apikey'));}else assert(h.has('authorization'));
   if(method==='POST')h.set('content-type','application/json');const request=new Request(url,{method,headers:h,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});Object.defineProperties(request,{cookies:{value:{get:()=>undefined}},nextUrl:{value:url}});
   let name,params;
   if(['/api/auth/member','/api/auth/ensure-member','/api/circles','/api/circles/mine','/api/circles/contributions'].includes(url.pathname))name='app'+url.pathname+'/route.ts';
   else{
    let m=/^\/api\/circles\/([^/]+)(?:\/(membership|join|leave))?$/.exec(url.pathname);if(m){name='app/api/circles/[circleId]/'+(m[2]?m[2]+'/':'')+'route.ts';params={circleId:m[1]};}
    m=/^\/api\/circles\/([^/]+)\/discussion(\/preview)?$/.exec(url.pathname);if(m){name='app/api/circles/[circleId]/discussion/'+(m[2]?'preview/':'')+'route.ts';params={circleId:m[1]};}
    m=/^\/api\/book-salons\/([^/]+)$/.exec(url.pathname);if(m){name='app/api/book-salons/[cohortId]/route.ts';params={cohortId:m[1]};}
    m=/^\/api\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(url.pathname);if(m){name='app/api/circles/[circleId]/messages/[messageId]/route.ts';params={circleId:m[1],messageId:m[2]};}
   }
   assert(name,'Unexpected native Circle journey route');const handler=route(name)[method];assert.equal(typeof handler,'function');const response=await handler(request,params?{params:Promise.resolve(params)}:undefined);
   return httpHook?httpHook({path:url.pathname+url.search,method,request,response}):response;
  }
  async function seedCircle({title='Native journey Circle',reading=true,format='in_person'}={}){
   const {day,weekday}=(await f.db.query("SELECT to_char(CURRENT_DATE+1,'YYYY-MM-DD') AS day,extract(dow FROM CURRENT_DATE+1)::int AS weekday")).rows[0];
   const edition=JSON.parse(await contributionSource('lib/circles/reading-program-editions.json')).find(x=>x.bookId==='apology');
   const input={title,description:'Synthetic Circle for the complete native member journey.',format,city:format==='online'?null:'Synthetic City',region:null,venueName:format==='online'?null:'Synthetic public library',venueType:format==='online'?null:'library',weekday,time:'19:00',timezone:'UTC',startDate:day,maxMembers:8,onlineUrl:format==='online'?'https://private-meeting.invalid/NONPUBLIC':null,...(reading?{readingProgram:{version:1,bookId:edition.bookId,editionId:edition.editionId,sessions:[{from:8,to:20},{from:21,to:35}]}}:{})};
   const {circleId}=await rpc(f.db,'soe_circle_create',[f.actors.other,requestId(),input]);await f.db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)',[circleId,f.reviewerId]);return circleId;
  }
  return{...f,sql,serverProvider,dispatch,seedCircle,transformHttp(fn){httpHook=fn;},
   async join(circleId,who='author'){const revision=(await f.db.query('SELECT circle_participation_revision FROM book_cohorts WHERE id=$1',[circleId])).rows[0].circle_participation_revision;return rpc(f.db,'soe_circle_join',[f.actors[who],circleId,revision,requestId()]);},
   async isMember(circleId){return(await f.db.query('SELECT EXISTS(SELECT 1 FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2) AS present',[circleId,f.authorId])).rows[0].present;},
   membership:circleId=>rpc(f.db,'soe_circle_detail',[f.authorId,circleId]),
   async seedPage(count=27){assert(Number.isInteger(count)&&count>=1&&count<=50);const first=await seedCircle({title:'Paging Circle 00',reading:false});for(let n=1;n<count;n++)await f.db.query("INSERT INTO book_cohorts SELECT (jsonb_populate_record(NULL::book_cohorts,to_jsonb(c)||jsonb_build_object('id',$2::text,'title',$3::text))).* FROM book_cohorts c WHERE c.id=$1",[first,'96000000-0000-4000-8000-'+String(n).padStart(12,'0'),'Paging Circle '+String(n).padStart(2,'0')]);return first;},
   async receiptCount(){return Number((await f.db.query('SELECT count(*)::int n FROM circle_participation_receipts')).rows[0].n);},
   async messages(circleId){return(await f.db.query('SELECT id,member_id,content FROM seminar_messages WHERE cohort_id=$1 ORDER BY id',[circleId])).rows;},
   rows:async()=> (await f.db.query('SELECT id,supabase_auth_id,display_name,exp_tokens,tier FROM members WHERE supabase_auth_id IS NOT NULL ORDER BY id')).rows,
   async close(){if(closed)return;closed=true;await f.close();}};
 }catch(error){await f.close();throw error;}
}
