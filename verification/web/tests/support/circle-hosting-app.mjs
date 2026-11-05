// Actual canonical identity and attendance handlers over the current SQL chain.
// Provider identities, PostgREST delivery, and optional HTTP loss are synthetic.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {contributionSource} from './member-contributions-app.mjs';
await contributionSource('verification/web/tests/support/circle-attendance-app.mjs');
await contributionSource('verification/web/tests/support/offline-app.mjs');
const base=await import('./circle-attendance-app.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export const {ORIGIN,PROVIDER,PUBLIC_KEY,ACCESS,SUBJECTS,NEW_SUBJECT}=base;
export const TOKENS=base.TOKENS;
const BOOKS=['republic', 'meditations', 'genealogy-of-morals', 'apology', 'odyssey', 'divine-comedy', 'hamlet', 'relativity'];
const ASSETS=BOOKS.flatMap(book=>['manifest.json','reader.html'].map(name=>`content/great-books/${book}/${name}`));
const SOURCES=['verification/web/tests/support/circle-hosting-app.mjs','docs/sql/circle-membership-intent-preflight.sql','docs/sql/circle-membership-intent-apply.sql','docs/sql/circle-membership-intent-rollback.sql', 'lib/circles/hosting.ts','app/api/circles/start/route.ts','app/api/circles/route.ts','app/api/great-books/text/[bookId]/route.ts',...ASSETS,
 'lib/circles/membership.ts','lib/circles/membership-server.ts','app/api/auth/member/route.ts','app/api/circles/[circleId]/route.ts',
 ...['membership','rsvp','join','leave','complete'].map(action=>`app/api/circles/[circleId]/${action}/route.ts`)];
export async function hostingAppHashes(){
 const hashes={...await base.attendanceAppHashes()},seen=new Set();
 async function bind(name){if(seen.has(name))return;seen.add(name);const bytes=await contributionSource(name);hashes[name]=createHash('sha256').update(bytes).digest('hex');if(!/\.(?:ts|tsx)$/.test(name))return;
  for(const match of bytes.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){
   const spec=match[1];if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;if(['@/lib/supabase/admin','@/lib/supabase/server'].includes(spec))continue;
   const target=spec.startsWith('@/')?spec.slice(2):new URL(spec,new URL(name,new URL('../../../../',import.meta.url))).pathname.slice(new URL('../../../../',import.meta.url).pathname.length);
   await bind(/\.(?:ts|tsx|json)$/.test(target)?target:target+'.ts');
  }
 }
 for(const name of SOURCES)await bind(name);return hashes;
}
export async function createCircleHostingApp(){
 await hostingAppHashes();const f=await base.createCircleAttendanceApp(),app=offlineApp(),sql=[],provider=[],http=[];
 let closed=false,httpHook=null,beforeHook=null,dbHook=null,cookieActor=null,lane=Promise.resolve();
 const serial=fn=>{const task=lane.then(fn);lane=task.catch(()=>{});return task;};
 try{
  for(const name of ['circle-membership-intent-preflight.sql','circle-membership-intent-apply.sql'])await f.db.exec((await contributionSource('docs/sql/'+name)).toString());
  app.context.process.env.WALLET_SESSION_SECRET='SYNTHETIC_ATTENDANCE_WALLET_SECRET_NOT_A_REAL_CREDENTIAL_2026';app.context.process.env.NEXT_PUBLIC_SUPABASE_URL=PROVIDER;app.context.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_KEY;
  app.setMock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:cookieActor?{id:SUBJECTS[cookieActor]}:null},error:cookieActor?null:{name:'AuthSessionMissingError'}})}})}));
  app.setMock('@supabase/supabase-js',()=>({createClient:(url,key,options)=>{
   assert.equal(url,PROVIDER);assert.equal(key,PUBLIC_KEY);assert.deepEqual(JSON.parse(JSON.stringify(options)),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   return{auth:{getUser:async token=>{provider.push({exactTokenRecognized:Object.values(TOKENS).includes(token)});
    const id=token===ACCESS.new?NEW_SUBJECT:token===TOKENS.other?SUBJECTS.other:token===TOKENS.outsider?SUBJECTS.outsider:[ACCESS.author,ACCESS.rotated].includes(token)?SUBJECTS.author:null;
    return{data:{user:id?{id}:null},error:null};}}};
  }}));
  const columns=new Set(['id','supabase_auth_id','display_name','email','bio','discipline','skills','project_description','seeking','philosophy','exp_tokens','tier','coherence_data','total_responses','wallet_address']);
  const rpcNames=new Set(['soe_circle_start','soe_circle_create','soe_circle_detail','soe_circle_membership_state','soe_circle_join','soe_circle_leave','soe_circle_rsvp','soe_circle_complete']),argumentsByName=new Map();
  app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({
   from(table){assert.equal(table,'members');let projection,filter;
    const query={select(value){assert(value.split(',').every(v=>columns.has(v.trim())));projection=value;return query;},
     eq(column,value){assert(['id','supabase_auth_id'].includes(column));assert(!filter);filter={column,value};return query;},single:()=>execute()};
    function execute(){return serial(async()=>{assert(projection&&filter);sql.push({kind:'select',table,projection,filter:structuredClone(filter)});let result;
     try{await f.db.exec('SET ROLE service_role');const rows=(await f.db.query(`SELECT ${projection} FROM members WHERE ${filter.column}=$1`,[filter.value])).rows;result=rows.length===1?{data:JSON.parse(JSON.stringify(rows[0])),error:null}:{data:null,error:{code:'PGRST116'}};}
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
   const hosting=url.pathname==='/api/circles/start'||url.pathname==='/api/circles'&&method==='POST';
   const edition=/^\/api\/great-books\/text\/([^/]+)$/.exec(url.pathname);
   const owned=hosting||Boolean(edition)||url.pathname==='/api/auth/member'||Boolean(match&&!['mine','start','search','contributions'].includes(match[1]));
   if(edition){assert(BOOKS.includes(edition[1]));assert.equal(method,'GET');assert.equal(url.search,'');assert.equal(body,undefined);const supplied=new Headers(headers);for(const name of ['authorization','cookie','apikey'])assert(!supplied.has(name));}
   assert(['GET','POST'].includes(method));const h=new Headers(headers);if(method==='POST'&&!h.has('content-type'))h.set('content-type','application/json');
   const request=new Request(url,{method,headers:h,signal,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
   const cookies=new Map((h.get('cookie')??'').split(';').map(x=>x.trim().split('=')));
   Object.defineProperties(request,{nextUrl:{value:url},cookies:{value:{get:key=>cookies.has(key)?{value:cookies.get(key)}:undefined}}});
   const call={path:url.pathname+url.search,method,request,body:body===undefined?null:typeof body==='string'?body:JSON.stringify(body)};http.push(call);
   const early=beforeHook?await beforeHook(call):null;
   const file=hosting?'app'+url.pathname+'/route.ts':edition?'app/api/great-books/text/[bookId]/route.ts':match?'app/api/circles/[circleId]/'+(match[2]?match[2]+'/':'')+'route.ts':'app/api/auth/member/route.ts';
   const params=hosting?undefined:edition?{bookId:edition[1]}:match?{circleId:match[1]}:undefined;
   const response=early instanceof Response?early:owned?await route(file)[method](request,params?{params:Promise.resolve(params)}:undefined):await f.dispatch(path,{method,headers,body,signal});
   return httpHook?httpHook({...call,response}):response;
  }
  return{...f,app,sql,provider,http,TOKENS,ACCESS,SUBJECTS,ORIGIN,dispatch,
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
