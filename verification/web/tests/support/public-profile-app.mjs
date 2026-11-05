// Actual canonical identity and attendance handlers over the current SQL chain.
// Provider identities, PostgREST delivery, and optional HTTP loss are synthetic.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {contributionSource} from './member-contributions-app.mjs';
await contributionSource('verification/web/tests/support/circle-hosting-app.mjs');
await contributionSource('verification/web/tests/support/offline-app.mjs');
const base=await import('./circle-hosting-app.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export const {ORIGIN,PROVIDER,PUBLIC_KEY,ACCESS,SUBJECTS,NEW_SUBJECT}=base;
export const TOKENS=base.TOKENS;
const BOOKS=['republic', 'meditations', 'genealogy-of-morals', 'apology', 'odyssey', 'divine-comedy', 'hamlet', 'relativity'];
const ASSETS=BOOKS.flatMap(book=>['manifest.json','reader.html'].map(name=>`content/great-books/${book}/${name}`));
const SOURCES=['app/api/members/profile/route.ts','app/api/auth/provider/route.ts',...['preflight','apply','rollback'].map(n=>'docs/sql/circle-public-profiles-'+n+'.sql'),'app/api/book-salons/[cohortId]/route.ts','app/api/circles/[circleId]/discussion/route.ts','app/api/circles/[circleId]/discussion/preview/route.ts','app/api/circles/[circleId]/messages/[messageId]/route.ts','app/api/explorer/[id]/route.ts','app/explorer/[id]/page.tsx',...['preflight','apply'].map(n=>'docs/sql/member-profile-'+n+'.sql'),...['preflight','apply','rollback'].map(n=>'docs/sql/member-profile-intent-'+n+'.sql'),'verification/web/tests/support/public-profile-app.mjs','docs/sql/circle-membership-intent-preflight.sql','docs/sql/circle-membership-intent-apply.sql','docs/sql/circle-membership-intent-rollback.sql', 'lib/circles/hosting.ts','app/api/circles/start/route.ts','app/api/circles/route.ts','app/api/great-books/text/[bookId]/route.ts',...ASSETS,
 'lib/circles/membership.ts','lib/circles/membership-server.ts','app/api/auth/member/route.ts','app/api/circles/[circleId]/route.ts',
 ...['membership','rsvp','join','leave','complete'].map(action=>`app/api/circles/[circleId]/${action}/route.ts`)];
export async function publicProfileAppHashes(){
 const hashes={...await base.hostingAppHashes()},seen=new Set();
 async function bind(name){if(seen.has(name))return;seen.add(name);const bytes=await contributionSource(name);hashes[name]=createHash('sha256').update(bytes).digest('hex');if(!/\.(?:ts|tsx)$/.test(name))return;
  for(const match of bytes.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){
   const spec=match[1];if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;if(['@/lib/supabase/admin','@/lib/supabase/server'].includes(spec))continue;
   const target=spec.startsWith('@/')?spec.slice(2):new URL(spec,new URL(name,new URL('../../../../',import.meta.url))).pathname.slice(new URL('../../../../',import.meta.url).pathname.length);
   const candidate=/\.(?:ts|tsx|json)$/.test(target)?target:['.ts','.tsx','.json'].map(ext=>target+ext).find(name=>existsSync(new URL('../../../../'+name,import.meta.url)));assert(candidate,'Missing local source '+target);await bind(candidate);
  }
 }
 for(const name of SOURCES)await bind(name);return hashes;
}
export async function createPublicProfileApp(){
 await publicProfileAppHashes();const f=await base.createCircleHostingApp(),app=offlineApp(),sql=[],provider=[],http=[];
 let closed=false,httpHook=null,beforeHook=null,dbHook=null,cookieActor=null,lane=Promise.resolve();
 const serial=fn=>{const task=lane.then(fn);lane=task.catch(()=>{});return task;};
 try{
   await f.db.exec('ALTER TABLE members ENABLE ROW LEVEL SECURITY; REVOKE ALL ON members FROM PUBLIC,anon,authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON members TO service_role;');
   await f.db.exec("UPDATE members SET display_name=coalesce(nullif(display_name,''),'Explorer'),bio=coalesce(bio,''),discipline=coalesce(discipline,''),skills=coalesce(skills,ARRAY[]::text[]),project_description=coalesce(project_description,''),seeking=coalesce(seeking,''),philosophy=coalesce(philosophy,'')");
   const placeholders=(await f.db.query("SELECT attname,atttypid::regtype::text AS type,attnotnull,col_description(attrelid,attnum) AS note FROM pg_attribute WHERE attrelid='members'::regclass AND attname IN('profile_visibility','profile_revision') AND NOT attisdropped")).rows;
   assert.deepEqual(placeholders,[{attname:'profile_visibility',type:'text',attnotnull:true,note:null}]);
   assert.equal((await f.db.query("SELECT count(*)::int AS n FROM members WHERE profile_visibility IS DISTINCT FROM 'private'")).rows[0].n,0);
   await f.db.exec('ALTER TABLE members DROP COLUMN profile_visibility');
   for(const name of ['member-profile-preflight.sql','member-profile-apply.sql','member-profile-intent-preflight.sql','member-profile-intent-apply.sql','circle-public-profiles-preflight.sql','circle-public-profiles-apply.sql'])await f.db.exec((await contributionSource('docs/sql/'+name)).toString());
  app.context.process.env.WALLET_SESSION_SECRET='SYNTHETIC_ATTENDANCE_WALLET_SECRET_NOT_A_REAL_CREDENTIAL_2026';app.context.process.env.NEXT_PUBLIC_SUPABASE_URL=PROVIDER;app.context.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_KEY;
  app.setMock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:cookieActor?{id:SUBJECTS[cookieActor]}:null},error:cookieActor?null:{name:'AuthSessionMissingError'}})}})}));
  app.setMock('@supabase/supabase-js',()=>({createClient:(url,key,options)=>{
   assert.equal(url,PROVIDER);assert.equal(key,PUBLIC_KEY);assert.deepEqual(JSON.parse(JSON.stringify(options)),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   return{auth:{getUser:async token=>{provider.push({exactTokenRecognized:Object.values(TOKENS).includes(token)});
    const id=token===ACCESS.new?NEW_SUBJECT:token===TOKENS.other?SUBJECTS.other:token===TOKENS.outsider?SUBJECTS.outsider:[ACCESS.author,ACCESS.rotated].includes(token)?SUBJECTS.author:null;
    return{data:{user:id?{id}:null},error:null};}}};
  }}));
  const columns=new Set(['id','supabase_auth_id','display_name','email','bio','discipline','skills','project_description','seeking','philosophy','exp_tokens','tier','coherence_data','total_responses','wallet_address','profile_visibility','profile_revision']);
  const rpcNames=new Set(['soe_circle_detail_profiles','soe_circle_messages_read_profiles','soe_circle_discussion_read_profiles','soe_circle_discussion_thread_profiles','soe_circle_discussion_receipt_profiles','soe_circle_message_state_profiles','soe_circle_discussion_target','soe_circle_discussion_post','soe_circle_messages_post','soe_circle_message_action','soe_member_profile_update','soe_circle_start','soe_circle_create','soe_circle_detail','soe_circle_membership_state','soe_circle_join','soe_circle_leave','soe_circle_rsvp','soe_circle_complete']),argumentsByName=new Map();
  app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({
    from(table){assert(['members','book_cohorts'].includes(table));let projection;const filters=[];
     const query={select(value){assert(table==='members'?value.split(',').every(v=>columns.has(v.trim())):value==='id,book_id,title,description,max_members,start_date,thinker_id,status,created_at');projection=value;return query;},
      eq(column,value){assert((table==='members'?['id','supabase_auth_id','profile_visibility']:['id']).includes(column));assert(!filters.some(f=>f.column===column));filters.push({column,value});return query;},single:()=>execute(false),maybeSingle:()=>execute(true)};
     function execute(optional){return serial(async()=>{assert(projection&&filters.length>=1&&filters.length<=2);if(filters.length===2){assert.equal(table,'members');assert.deepEqual(filters.map(f=>f.column),['id','profile_visibility']);assert.equal(filters[1].value,'public');assert.equal(projection,'id,display_name,bio,discipline,skills,project_description,seeking,philosophy,profile_visibility');}sql.push({kind:'select',table,projection,filters:structuredClone(filters)});let result;
      try{await f.db.exec('SET ROLE service_role');const rows=(await f.db.query(`SELECT ${projection} FROM ${table} WHERE ${filters.map((f,i)=>f.column+'=$'+(i+1)).join(' AND ')}`,filters.map(f=>f.value))).rows;result=rows.length===1||optional&&rows.length===0?{data:rows[0]?JSON.parse(JSON.stringify(rows[0])):null,error:null}:{data:null,error:{code:'PGRST116'}};}
      catch(error){result={data:null,error:{code:error.code??'FIXTURE_ERROR'}};}finally{await f.db.exec('RESET ROLE');}
      return dbHook?dbHook({kind:'select',table,result}):result;
     });}return query;
    },
   rpc(name,args){assert(rpcNames.has(name));return serial(async()=>{if(!argumentsByName.has(name))argumentsByName.set(name,(await f.db.query("SELECT proargnames FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace",[name])).rows[0].proargnames);
    const keys=argumentsByName.get(name);assert.deepEqual(Object.keys(args).sort(),[...keys].sort());sql.push({kind:'rpc',name,args:structuredClone(args)});let result;
    try{await f.db.exec('SET ROLE service_role');result={data:(await f.db.query(`SELECT public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,keys.map(k=>args[k]))).rows[0].result,error:null};}
    catch(error){result={data:null,error:{code:error.code??'FIXTURE_ERROR'}};}finally{await f.db.exec('RESET ROLE');}
    return dbHook?dbHook({kind:'rpc',name,args,result}):result;
   });}
  })}));
  const routes=new Map(),route=name=>{if(!routes.has(name))routes.set(name,app.load(name));return routes.get(name);};
  async function dispatch(path,{method='GET',headers={},body,signal}={}){
   const url=new URL(path,ORIGIN);assert.equal(url.origin,ORIGIN);assert(!closed);
   const match=/^\/api\/circles\/([^/]+)(?:\/(membership|rsvp|join|leave|complete))?$/.exec(url.pathname);
   const discussion=/^\/api\/circles\/([0-9a-f-]+)\/discussion(\/preview)?$/.exec(url.pathname);
   const message=/^\/api\/circles\/([0-9a-f-]+)\/messages\/([0-9a-f-]+)$/.exec(url.pathname);
   const legacy=/^\/api\/book-salons\/([0-9a-f-]+)$/.exec(url.pathname);
   const hosting=url.pathname==='/api/circles/start'||url.pathname==='/api/circles'&&method==='POST';
   const account=['/api/auth/member','/api/auth/provider'].includes(url.pathname);
   const edition=/^\/api\/great-books\/text\/([^/]+)$/.exec(url.pathname);
    const publicProfile=/^\/api\/explorer\/([0-9a-f-]+)$/.exec(url.pathname);
    const ownerProfile=url.pathname==='/api/members/profile';
    const owned=Boolean(discussion||message||legacy)||ownerProfile||Boolean(publicProfile)||hosting||Boolean(edition)||account||Boolean(match&&!['mine','start','search','contributions'].includes(match[1]));
    if(publicProfile){assert.equal(method,'GET');assert.equal(url.search,'');const supplied=new Headers(headers);for(const name of ['authorization','cookie','apikey'])assert(!supplied.has(name));}
    if(edition){assert(BOOKS.includes(edition[1]));assert.equal(method,'GET');assert.equal(url.search,'');assert.equal(body,undefined);const supplied=new Headers(headers);for(const name of ['authorization','cookie','apikey'])assert(!supplied.has(name));}
   assert(['GET','POST'].includes(method));const h=new Headers(headers);if(method==='POST'&&!h.has('content-type'))h.set('content-type','application/json');
   const request=new Request(url,{method,headers:h,signal,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
   const cookies=new Map((h.get('cookie')??'').split(';').map(x=>x.trim().split('=')));
   Object.defineProperties(request,{nextUrl:{value:url},cookies:{value:{get:key=>cookies.has(key)?{value:cookies.get(key)}:undefined}}});
   const call={path:url.pathname+url.search,method,request,body:body===undefined?null:typeof body==='string'?body:JSON.stringify(body)};http.push(call);
   const early=beforeHook?await beforeHook(call):null;
    const file=discussion?'app/api/circles/[circleId]/discussion/'+(discussion[2]?'preview/':'')+'route.ts':message?'app/api/circles/[circleId]/messages/[messageId]/route.ts':legacy?'app/api/book-salons/[cohortId]/route.ts':publicProfile?'app/api/explorer/[id]/route.ts':edition?'app/api/great-books/text/[bookId]/route.ts':match&&!hosting?'app/api/circles/[circleId]/'+(match[2]?match[2]+'/':'')+'route.ts':'app'+url.pathname+'/route.ts';
    const params=discussion?{circleId:discussion[1]}:message?{circleId:message[1],messageId:message[2]}:legacy?{cohortId:legacy[1]}:publicProfile?{id:publicProfile[1]}:edition?{bookId:edition[1]}:match&&!hosting?{circleId:match[1]}:undefined;
   const response=early instanceof Response?early:owned?await route(file)[method](request,params?{params:Promise.resolve(params)}:undefined):await f.dispatch(path,{method,headers,body,signal});
   return httpHook?httpHook({...call,response}):response;
  }
   return{...f,app,sql,provider,http,TOKENS,ACCESS,SUBJECTS,ORIGIN,dispatch,
    async profileRow(who='author'){return serial(async()=>(await f.db.query('SELECT * FROM members WHERE id=$1',[f.actors[who]??who])).rows[0]);},
    async updateProfile(patch,who='author'){return serial(async()=>{const id=f.actors[who]??who,row=(await f.db.query('SELECT profile_revision FROM members WHERE id=$1',[id])).rows[0];try{await f.db.exec('SET ROLE service_role');return(await f.db.query('SELECT soe_member_profile_update($1,$2,$3::jsonb) AS result',[id,row.profile_revision,JSON.stringify(patch)])).rows[0].result;}finally{await f.db.exec('RESET ROLE');}});},
   async createBody(extra={}){const {day,weekday}=(await f.db.query("SELECT to_char(CURRENT_DATE+1,'YYYY-MM-DD') AS day,extract(dow FROM CURRENT_DATE+1)::int AS weekday")).rows[0];return{expectedMemberId:f.authorId,requestId:crypto.randomUUID(),title:'Synthetic hosted Circle',description:null,format:'in_person',city:'Synthetic City',region:null,venueName:'Synthetic public library',venueType:'library',weekday,time:'19:00',timezone:'UTC',startDate:day,maxMembers:8,onlineUrl:null,...extra};},
   async hosted(who='author'){return(await f.db.query('SELECT id,title,created_by,status,circle_participation_revision,circle_reading_program FROM book_cohorts WHERE created_by=$1 ORDER BY id',[f.actors[who]??who])).rows;},
   transformHttp(fn){httpHook=fn;},beforeHttp(fn){beforeHook=fn;},transformDb(fn){dbHook=fn;},
   setCookieActor(who){assert(who===null||Object.hasOwn(SUBJECTS,who));cookieActor=who;},
   async walletCookie(who='author'){return 'soe_auth_provider=wallet; soe_wallet_id='+await app.load('lib/auth/walletSession.ts').createWalletSessionValue(f.actors[who]??who);},
   rsvpRow(circleId,date,who='author'){return serial(async()=>(await f.db.query('SELECT * FROM circle_rsvps WHERE cohort_id=$1 AND meeting_date=$2 AND member_id=$3',[circleId,date,f.actors[who]??who])).rows[0]??null);},
   revision(circleId){return serial(async()=>(await f.db.query('SELECT circle_participation_revision AS revision FROM book_cohorts WHERE id=$1',[circleId])).rows[0].revision);},
   async close(){if(closed)return;closed=true;await lane;await f.close();}};
 }catch(error){await f.close();throw error;}
}
