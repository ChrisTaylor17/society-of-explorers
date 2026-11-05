// Actual canonical bearer resolution, saved-reading handlers and PostgreSQL CAS.
// Only provider identity, PostgREST delivery, and optional HTTP loss are synthetic.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {contributionSource} from './member-contributions-app.mjs';
await contributionSource('verification/web/tests/support/native-reading-app.mjs');
await contributionSource('verification/web/tests/support/offline-app.mjs');
const base=await import('./native-reading-app.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export const {ORIGIN,PROVIDER,PUBLIC_KEY,ACCESS,SUBJECTS,NEW_SUBJECT}=base;
export const TOKENS={...ACCESS,other:'NONISSUED_SAVED_READING_OTHER',outsider:'NONISSUED_SAVED_READING_OUTSIDER'};
const SOURCES=['verification/web/tests/support/saved-reading-app.mjs','supabase/great_books.sql','docs/sql/great-books-private-data.sql',
 'docs/sql/reading-progress-preflight.sql','docs/sql/reading-progress-apply.sql','docs/sql/reading-progress-rollback.sql','app/api/great-books/progress/route.ts'];
export async function savedReadingAppHashes(){
 const hashes={...await base.readingAppHashes()},seen=new Set();
 async function bind(name){if(seen.has(name))return;seen.add(name);const bytes=await contributionSource(name);hashes[name]=createHash('sha256').update(bytes).digest('hex');
  if(!/\.(?:ts|tsx)$/.test(name))return;
  for(const match of bytes.toString().matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){
   const spec=match[1];if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;if(['@/lib/supabase/admin','@/lib/supabase/server'].includes(spec))continue;
   const target=spec.startsWith('@/')?spec.slice(2):new URL(spec,new URL(name,new URL('../../../../',import.meta.url))).pathname.slice(new URL('../../../../',import.meta.url).pathname.length);
   await bind(/\.(?:ts|tsx|json)$/.test(target)?target:target+'.ts');
  }
 }
 for(const name of SOURCES)await bind(name);
 const catalog=JSON.parse(await contributionSource('lib/books/passage-indexes.json'));
 for(const book of catalog)for(const file of ['manifest.json','reader.html'])await bind(`content/great-books/${book.bookId}/${file}`);
 return hashes;
}
export async function createSavedReadingApp(){
 await savedReadingAppHashes();
 const f=await base.createNativeReadingApp(),app=offlineApp(),sql=[],provider=[],http=[];
 let closed=false,httpHook=null,beforeHook=null,dbHook=null,lane=Promise.resolve();
 const serial=fn=>{const task=lane.then(fn);lane=task.catch(()=>{});return task;};
 try{
  for(const name of ['supabase/great_books.sql','docs/sql/great-books-private-data.sql'])await f.db.exec((await contributionSource(name)).toString());
  // The reused moderation fixture intentionally grants a synthetic unrelated
  // role default access. Reconcile that fixture-only grant before preflight;
  // production migration refuses any such unrelated grant instead of erasing it.
  await f.db.exec('REVOKE ALL ON public.reading_progress FROM ai_unrelated');
  for(const name of ['docs/sql/reading-progress-preflight.sql','docs/sql/reading-progress-apply.sql'])await f.db.exec((await contributionSource(name)).toString());
  app.context.process.env.NEXT_PUBLIC_SUPABASE_URL=PROVIDER;app.context.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_KEY;
  app.setMock('@/lib/supabase/server',()=>({createClient:async()=>{throw Error('Cookie authority forbidden in saved reading proof');}}));
  app.setMock('@supabase/supabase-js',()=>({createClient:(url,key,options)=>{
   assert.equal(url,PROVIDER);assert.equal(key,PUBLIC_KEY);assert.deepEqual(JSON.parse(JSON.stringify(options)),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   return{auth:{getUser:async token=>{provider.push({exactTokenRecognized:Object.values(TOKENS).includes(token)});
    const id=token===ACCESS.new?NEW_SUBJECT:token===TOKENS.other?SUBJECTS.other:token===TOKENS.outsider?SUBJECTS.outsider:[ACCESS.author,ACCESS.rotated].includes(token)?SUBJECTS.author:null;
    return{data:{user:id?{id}:null},error:null};}}};
  }}));
  const columns=new Set(['id','supabase_auth_id','display_name','email','bio','discipline','skills','project_description','seeking','philosophy','exp_tokens','tier','coherence_data','total_responses','wallet_address']);
  const contract=app.load('lib/books/reading-progress.ts');
  app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({
   from(table){assert(['members','reading_progress'].includes(table));let projection;const filters=[];
    const query={select(value){assert(table==='members'?value.split(',').every(v=>columns.has(v.trim())):value===contract.READING_PROGRESS_SELECT);projection=value;return query;},
     eq(column,value){assert((table==='members'?['id','supabase_auth_id']:['member_id','book_id']).includes(column));assert(!filters.some(f=>f[0]===column));filters.push([column,value]);return query;},
     in(column,value){assert.equal(table,'reading_progress');assert.equal(column,'book_id');assert(!filters.some(f=>f[0]===column));assert.deepEqual([...value],JSON.parse(JSON.stringify(app.load('lib/books/catalog.ts').GREAT_BOOKS.map(b=>b.id))));filters.push([column,[...value]]);return query;},
     single:()=>execute(true),then:(yes,no)=>execute(false).then(yes,no)};
    function execute(single){return serial(async()=>{assert(projection);assert(table==='members'?filters.length===1:filters.length===2&&filters[0][0]==='member_id');const params=[],where=filters.map(([key,value])=>{params.push(value);return key+(Array.isArray(value)?`=ANY($${params.length}::text[])`:`=$${params.length}`);}).join(' AND ');let result;
     sql.push({kind:'select',table,projection,filters:structuredClone(filters)});
     try{await f.db.exec('SET ROLE service_role');const rows=(await f.db.query(`SELECT ${projection} FROM ${table} WHERE ${where}`,params)).rows;
      result=single&&rows.length!==1?{data:null,error:{code:'PGRST116'}}:{data:JSON.parse(JSON.stringify(single?rows[0]:rows)),error:null};
     }catch(error){result={data:null,error:{code:error.code??'FIXTURE_ERROR'}};}finally{await f.db.exec('RESET ROLE');}
     return dbHook?dbHook({kind:'select',table,result}):result;
    });}return query;
   },
   rpc(name,args){assert.equal(name,'soe_reading_progress_update');const keys=['p_actor','p_expected_revision','p_book_id','p_action','p_edition_id','p_block_index','p_completed'];assert.deepEqual(Object.keys(args).sort(),[...keys].sort());
    return serial(async()=>{sql.push({kind:'rpc',name,args:structuredClone(args)});let result;
     try{await f.db.exec('SET ROLE service_role');result={data:(await f.db.query('SELECT public.soe_reading_progress_update($1,$2,$3,$4,$5,$6,$7) AS result',keys.map(k=>args[k]))).rows[0].result,error:null};}
     catch(error){result={data:null,error:{code:error.code??'FIXTURE_ERROR'}};}finally{await f.db.exec('RESET ROLE');}
     return dbHook?dbHook({kind:'rpc',name,args,result}):result;
    });}
  })}));
  const route=app.load('app/api/great-books/progress/route.ts'),memberRoute=app.load('app/api/auth/member/route.ts'),editions={};
  for(const book of app.load('lib/books/catalog.ts').GREAT_BOOKS)editions[book.id]=(await app.load('lib/books/editions.ts').readBookEdition(book.id)).edition;
  async function dispatch(path,{method='GET',headers={},body,signal}={}){
   const url=new URL(path,ORIGIN);assert.equal(url.origin,ORIGIN);assert(!closed);
   if(!['/api/great-books/progress','/api/auth/member'].includes(url.pathname))return f.dispatch(path,{method,headers,body,signal});
   assert(['GET','POST'].includes(method));const h=new Headers(headers);if(method==='POST'&&!h.has('content-type'))h.set('content-type','application/json');
   const request=new Request(url,{method,headers:h,signal,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
   const cookies=new Map((h.get('cookie')??'').split(';').map(x=>x.trim().split('=')));
   Object.defineProperties(request,{nextUrl:{value:url},cookies:{value:{get:key=>cookies.has(key)?{value:cookies.get(key)}:undefined}}});
   const call={path:url.pathname+url.search,method,request,body:body===undefined?null:typeof body==='string'?body:JSON.stringify(body)};http.push(call);
   if(beforeHook)await beforeHook(call);
   const response=await (url.pathname==='/api/auth/member'?memberRoute:route)[method](request);return httpHook?httpHook({...call,response}):response;
  }
  return{...f,app,route,contract,editions,sql,provider,http,TOKENS,ACCESS,SUBJECTS,ORIGIN,dispatch,
   transformHttp(fn){httpHook=fn;},beforeHttp(fn){beforeHook=fn;},transformDb(fn){dbHook=fn;},
   row(bookId,who='author'){return serial(async()=>(await f.db.query('SELECT * FROM reading_progress WHERE member_id=$1 AND book_id=$2',[f.actors[who]??who,bookId])).rows[0]??null);},
   async seedLegacy(bookId,sectionId,{who='author',paragraphIndex=0,completed=false}={}){await serial(()=>f.db.query('INSERT INTO reading_progress(member_id,book_id,section_id,paragraph_index,completed) VALUES($1,$2,$3,$4,$5)',[f.actors[who]??who,bookId,sectionId,paragraphIndex,completed]));},
   async close(){if(closed)return;closed=true;await lane;await f.close();}};
 }catch(error){await f.close();throw error;}
}
