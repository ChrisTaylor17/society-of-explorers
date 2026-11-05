import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createSavedReadingApp,ACCESS,TOKENS,ORIGIN} from './support/saved-reading-app.mjs';
import {contributionSource} from './support/member-contributions-app.mjs';
let f;
before(async()=>{f=await createSavedReadingApp();});
after(async()=>{await f?.close();});
beforeEach(async()=>{f.transformHttp(null);f.beforeHttp(null);f.transformDb(null);await f.db.exec('ROLLBACK; RESET ROLE; TRUNCATE reading_progress');f.sql.length=0;f.http.length=0;f.provider.length=0;});
const headers=()=>({authorization:'Bearer '+ACCESS.author});
const load=(book='hamlet',h=headers())=>f.dispatch('/api/great-books/progress'+(book===null?'':'?bookId='+book),{headers:h});
const save=(revision=0,extra={})=>({expectedMemberId:f.authorId,expectedRevision:revision,bookId:'hamlet',action:'save',editionId:f.editions.hamlet.editionId,blockIndex:42,completed:false,...extra});
const remove=(revision=0,bookId='hamlet')=>({expectedMemberId:f.authorId,expectedRevision:revision,bookId,action:'remove'});
const post=(body,h=headers())=>f.dispatch('/api/great-books/progress',{method:'POST',headers:h,body});
const state=async response=>{assert.equal(response.status,200);return(await response.json()).progress[0];};
async function role(query,args=[],role='service_role'){await f.db.exec('SET ROLE '+role);try{return await f.db.query(query,args);}finally{await f.db.exec('RESET ROLE');}}

test('fresh owner GET returns explicit absent revision zero for all eight books in catalog order',async()=>{
 const response=await load(null),dto=await response.json();assert.equal(response.status,200);assert.equal(dto.memberId,f.authorId);
 assert.deepEqual(dto.progress.map(x=>x.bookId),['republic','meditations','genealogy-of-morals','apology','odyssey','divine-comedy','hamlet','relativity']);
 for(const x of dto.progress){assert.equal(x.status,'absent');assert.equal(x.revision,0);assert.equal(x.bookmark,null);assert.equal(x.edition.editionId,f.editions[x.bookId].editionId);}
 assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.match(response.headers.get('vary'),/Authorization/);assert.equal(f.provider.length,1);assert(f.contract.parseReadingProgressResponse(dto));
});
test('save, current reopen, completion change and remove use monotonic actor-bound revisions',async()=>{
 const first=await state(await post(save()));assert.equal(first.revision,1);assert.equal(first.bookmark.blockIndex,42);assert.equal(first.completed,false);
 assert.deepEqual(await state(await load()),first);const completed=await state(await post(save(1,{completed:true})));assert.equal(completed.revision,2);
 const removed=await state(await post(remove(2)));assert.equal(removed.status,'removed');assert.equal(removed.revision,3);assert.equal(removed.sectionId,null);assert.equal(removed.completed,null);assert.equal(removed.bookmark,null);
 assert.deepEqual(await state(await load()),removed);assert.equal((await f.row('hamlet')).progress_removed,true);
});
test('first removal makes a revision one barrier and repeat removal is a stable no-op',async()=>{
 const first=await state(await post(remove()));assert.equal(first.revision,1);assert.equal(first.status,'removed');
 assert.deepEqual(await state(await post(remove(1))),first);assert.equal((await post(save())).status,409);assert.equal((await post(remove())).status,409);
 assert.equal((await state(await post(save(1)))).revision,2);
});
test('same reviewed save is a no-op preserving revision and timestamp',async()=>{
 const first=await state(await post(save()));assert.deepEqual(await state(await post(save(1))),first);
 assert.equal((await post(save(0))).status,409);assert.deepEqual(await state(await load()),first);
});
test('held initial save cannot revive a newer absent-removal barrier',async()=>{
 let release,entered;const gate=new Promise(r=>release=r),seen=new Promise(r=>entered=r);let held=true;
 f.beforeHttp(async call=>{if(call.method==='POST'&&JSON.parse(call.body).action==='save'&&held){held=false;entered();await gate;}});
 const original=post(save());await seen;const removed=await state(await post(remove()));assert.equal(removed.revision,1);release();assert.equal((await original).status,409);assert.deepEqual(await state(await load()),removed);
});
test('overlapping first saves execute actual SQL and only one base-zero CAS succeeds',async()=>{
 const replies=await Promise.all([post(save(0,{blockIndex:41})),post(save(0,{blockIndex:42}))]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
 const current=await state(await load());assert.equal(current.revision,1);assert([41,42].includes(current.bookmark.blockIndex));
});
test('lost committed save exposes current higher revision without replaying any write',async()=>{
 let lose=true;f.transformHttp(call=>{if(call.method==='POST'&&lose){lose=false;throw Error('synthetic response lost');}return call.response;});
 await assert.rejects(post(save()),/response lost/);const current=await state(await load());assert.equal(current.revision,1);assert.equal(f.sql.filter(c=>c.kind==='rpc').length,1);
 assert.equal((await post(save())).status,409);assert.deepEqual(await state(await load()),current);
});
test('lost committed no-op retains same revision; exact explicit retry succeeds without changing state',async()=>{
 const current=await state(await post(save()));let lose=true;f.transformHttp(call=>{if(call.method==='POST'&&lose){lose=false;throw Error('synthetic no-op receipt lost');}return call.response;});
 await assert.rejects(post(save(1)),/receipt lost/);assert.deepEqual(await state(await load()),current);
 assert.deepEqual(await state(await post(save(1))),current);assert.equal(f.sql.filter(c=>c.kind==='rpc').length,3);
});
test('legacy, old edition and invalid locations remain explicit and are never remapped',async()=>{
 for(const [book,section,expected] of [['hamlet','3','legacy'],['apology',null,'legacy'],['relativity','soe-reading:v1:old-edition:7','edition_changed'],['republic','broken locator','invalid'],['odyssey',`soe-reading:v1:${f.editions.odyssey.editionId}:99999`,'invalid']]){
  await f.seedLegacy(book,section);const current=await state(await load(book));assert.equal(current.revision,0);assert.equal(current.status,'saved');assert.equal(current.sectionId,section);assert.equal(current.bookmark.status,expected);
 }
 assert.equal(f.sql.filter(c=>c.kind==='rpc').length,0);
});
test('canonical other owner proof and progress remain isolated without private member fields',async()=>{
 await post(save());await f.seedLegacy('hamlet','5',{who:'other'});const h={authorization:'Bearer '+TOKENS.other};
 const member=await f.dispatch('/api/auth/member',{headers:h});assert.equal(member.status,200);assert.equal((await member.json()).member.id,f.actors.other);
 const response=await load('hamlet',h),dto=await response.json();assert.equal(dto.memberId,f.actors.other);assert.equal(dto.progress[0].sectionId,'5');
 assert(!JSON.stringify(dto).includes('PRIVATE_AUTHOR_EMAIL'));assert(!JSON.stringify(dto).includes('supabase_auth_id'));assert.equal((await post(save(1),h)).status,409);
});
test('missing invalid conflicting and signed-out bearers never read or mutate progress',async()=>{
 for(const h of [{},{authorization:'Bearer bad'},{authorization:'Basic bad'},{authorization:'Bearer '+ACCESS.author,cookie:'soe_auth_provider=signed_out'}]){
  assert.equal((await load('hamlet',h)).status,401);assert.equal((await post(save(),h)).status,401);
 }
 assert.equal(f.sql.filter(c=>c.table==='reading_progress'||c.kind==='rpc').length,0);
});
test('legacy unrevisioned bodies, forged owner and privilege fields are rejected before RPC',async()=>{
 for(const body of [{bookId:'hamlet',editionId:f.editions.hamlet.editionId,blockIndex:42},{...save(),expectedRevision:undefined},{...save(),memberId:f.authorId},{...save(),role:'admin'},{...remove(),editionId:'x'},{...save(),expectedRevision:-1},{...save(),expectedRevision:9007199254740992}])assert.equal((await post(body)).status,400);
 assert.equal((await post(save(0,{expectedMemberId:f.actors.other}))).status,409);assert.equal(f.sql.filter(c=>c.kind==='rpc').length,0);
});
test('queries are exact and reject unknown duplicate empty and POST query arguments',async()=>{
 for(const query of ['?bookId=hamlet&bookId=hamlet','?memberId='+f.authorId,'?bookId=','?bookId=unknown','?bookId=hamlet&extra=1'])assert.equal((await f.dispatch('/api/great-books/progress'+query,{headers:headers()})).status,400);
 assert.equal((await f.dispatch('/api/great-books/progress?bookId=hamlet',{method:'POST',headers:headers(),body:save()})).status,400);
 assert.equal(f.sql.filter(c=>c.table==='reading_progress'||c.kind==='rpc').length,0);
});
test('save rejects obsolete edition, block outside current verified source, noninteger and omitted completion',async()=>{
 for(const [patch,status]of [[{editionId:'old-edition'},409],[{blockIndex:f.editions.hamlet.blockCount},400],[{blockIndex:0.1},400],[{completed:undefined},400],[{bookId:'unknown'},400]])assert.equal((await post(save(0,patch))).status,status);
 assert.equal(await f.row('hamlet'),null);assert.equal(f.sql.filter(c=>c.kind==='rpc').length,0);
});
test('cross-origin and ambiguous cookie writes refuse before mutation while valid bearer succeeds',async()=>{
 for(const h of [{...headers(),origin:'https://evil.invalid'},{...headers(),'sec-fetch-site':'cross-site'}, {...headers(),cookie:'retained=other'}])assert.equal((await post(save(),h)).status,403);
 assert.equal((await post(save(),{...headers(),origin:ORIGIN})).status,200);assert.equal(f.sql.filter(c=>c.kind==='rpc').length,1);
});
test('actual body bytes, malformed UTF-8 and unfinished body are bounded before persistence',async()=>{
 const request=(body,extra={})=>{const r=new Request(ORIGIN+'/api/great-books/progress',{method:'POST',headers:{...headers(),...extra},body,duplex:'half'});Object.defineProperty(r,'cookies',{value:{get:()=>undefined}});return r;};
 assert.equal((await f.route.POST(request(JSON.stringify({...save(),padding:'界'.repeat(2000)}),{'content-length':'1'}))).status,413);
 assert.equal((await f.route.POST(request(new Uint8Array([0xff])))).status,400);
 const old=f.app.context.setTimeout;f.app.context.setTimeout=(fn,ms,...args)=>old(fn,Math.min(ms,15),...args);
 try{assert.equal((await f.route.POST(request(new ReadableStream({start(){}})))).status,408);}finally{f.app.context.setTimeout=old;}
 assert.equal(f.sql.filter(c=>c.kind==='rpc').length,0);
});
test('foreign duplicate malformed and leaking SQL rows fail closed and responses hide internals',async()=>{
 await post(save());
 for(const mutate of [r=>r.member_id=f.actors.other,r=>r.book_id='apology',r=>r.progress_revision=-1,r=>r.progress_removed=null,r=>r.section_id='x'.repeat(151)]){
  f.transformDb(({kind,table,result})=>{if(kind==='select'&&table==='reading_progress')mutate(result.data[0]);return result;});const response=await load();assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Failed to load saved reading'});
 }
 f.transformDb(({kind,table,result})=>kind==='select'&&table==='reading_progress'?{data:[...result.data,...result.data],error:null}:result);assert.equal((await load()).status,503);
});
test('forged RPC owner revision result or wrong action never yields a saved receipt',async()=>{
 for(const mutate of [r=>r.member_id=f.actors.other,r=>r.progress_revision=100,r=>r.book_id='apology',r=>r.completed=true,r=>r.progress_removed=true]){
  await f.db.exec('TRUNCATE reading_progress');f.transformDb(({kind,result})=>{if(kind==='rpc'&&result.data)mutate(result.data);return result;});assert.equal((await post(save())).status,503);
 }
});
test('service raw upsert update delete truncate and browser SQL RPC are denied after install',async()=>{
 for(const query of [`INSERT INTO reading_progress(member_id,book_id) VALUES('${f.authorId}','hamlet') ON CONFLICT(member_id,book_id) DO UPDATE SET section_id='old-writer'`,`UPDATE reading_progress SET completed=true`,`DELETE FROM reading_progress`,`TRUNCATE reading_progress`])await assert.rejects(role(query),/permission denied/);
 for(const who of ['anon','authenticated','ai_unrelated']){
  await assert.rejects(role('SELECT * FROM reading_progress',[],who),/permission denied/);
  await assert.rejects(role("SELECT soe_reading_progress_update($1,0,'hamlet','remove',NULL,NULL,NULL)",[f.authorId],who),/permission denied/);
 }
 assert.equal((await post(save())).status,200);
});
test('SQL independently validates actor revision book and action payload without an HTTP parser',async()=>{
 for(const args of [[null,0,'hamlet','remove',null,null,null],[f.authorId,-1,'hamlet','remove',null,null,null],[f.authorId,0,'unknown','remove',null,null,null],[f.authorId,0,'hamlet','remove','unexpected',null,null],[f.authorId,0,'hamlet','save','../bad',1,false],[f.authorId,0,'hamlet','save','edition',100000,false],[f.authorId,0,'hamlet','save','edition',1,null]])await assert.rejects(role('SELECT soe_reading_progress_update($1,$2,$3,$4,$5,$6,$7)',args),e=>e.code==='PT400');
 assert.equal((await f.db.query('SELECT * FROM reading_progress')).rows.length,0);
 await assert.rejects(role("SELECT soe_reading_progress_update('99999999-9999-4999-8999-999999999999',0,'hamlet','remove',NULL,NULL,NULL)"),e=>e.code==='PT409');
});
test('revision exhaustion permits exact no-op but refuses change and preserves the row',async()=>{
 await post(save());await f.db.exec('UPDATE reading_progress SET progress_revision=9007199254740991');
 assert.equal((await post(save(9007199254740991))).status,200);assert.equal((await post(remove(9007199254740991))).status,409);assert.equal((await f.row('hamlet')).progress_removed,false);
});
test('preflight and reapply are idempotent and rollback retains tombstones and raw-write barrier',async()=>{
 const current=await state(await post(remove()));const sources={};for(const kind of ['preflight','apply','rollback'])sources[kind]=(await contributionSource('docs/sql/reading-progress-'+kind+'.sql')).toString();
 await f.db.exec('SET ROLE postgres');await f.db.exec(sources.preflight);await f.db.exec(sources.apply);assert.deepEqual(await state(await load()),current);
 await f.db.exec('SET ROLE postgres');await f.db.exec(sources.rollback);assert.deepEqual(await state(await load()),current);assert.equal((await post(save(1))).status,503);await assert.rejects(role('DELETE FROM reading_progress'),/permission denied/);
 await f.db.exec('SET ROLE postgres');await f.db.exec(sources.preflight);await f.db.exec(sources.apply);assert.deepEqual(await state(await load()),current);assert.equal((await post(save())).status,409);
});
test('schema function grants trigger or dependency drift refuses migration without erasing saved data',async()=>{
 await post(save());const preflight=(await contributionSource('docs/sql/reading-progress-preflight.sql')).toString();
 for(const mutation of ["GRANT UPDATE ON reading_progress TO service_role","GRANT SELECT ON reading_progress TO ai_unrelated","ALTER TABLE reading_progress ALTER COLUMN progress_revision SET DEFAULT 1","COMMENT ON FUNCTION soe_reading_progress_update(uuid,bigint,text,text,text,bigint,boolean) IS 'collision'","GRANT EXECUTE ON FUNCTION soe_reading_progress_update(uuid,bigint,text,text,text,bigint,boolean) TO authenticated","CREATE INDEX unexpected_progress_revision ON reading_progress(progress_revision)"]){
  await f.db.exec('SET ROLE postgres; BEGIN;'+mutation);await assert.rejects(f.db.exec(preflight),e=>e.code==='PT409');await f.db.exec('ROLLBACK');assert.equal((await f.row('hamlet')).progress_revision,1);
 }
});
test('strict public contract parser rejects extra identity data wrong order and tampered bookmark derivation',async()=>{
 const dto=await(await load(null)).json(),parse=f.contract.parseReadingProgressResponse;assert(parse(dto));
 for(const mutate of [d=>d.secret='private',d=>d.memberId='invalid',d=>d.progress.reverse(),d=>d.progress.pop(),d=>d.progress[0].edition.blockCount=0,d=>d.progress[0].completed=false,d=>d.progress[0].revision=1,d=>d.progress[0].unknown=true]){const bad=structuredClone(dto);mutate(bad);assert.equal(parse(bad),null);}
 const saved=await(await post(save())).json();saved.progress[0].bookmark.blockIndex=41;assert.equal(parse(saved,'hamlet'),null);
});

test('fresh migration preserves every legacy payload and preflight refuses unexpected grants or open policy',async()=>{
 const db=new f.db.constructor();const source={};for(const name of ['supabase/great_books.sql','docs/sql/great-books-private-data.sql','docs/sql/reading-progress-preflight.sql','docs/sql/reading-progress-apply.sql','docs/sql/reading-progress-rollback.sql'])source[name]=(await contributionSource(name)).toString();
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE TABLE members(id uuid PRIMARY KEY);');
  await db.exec(source['supabase/great_books.sql']);await db.exec(source['docs/sql/great-books-private-data.sql']);
  await db.query("INSERT INTO members VALUES($1);",[f.authorId]);await db.query("INSERT INTO reading_progress(member_id,book_id,section_id,paragraph_index,completed,updated_at) VALUES($1,'hamlet','12',8,NULL,NULL)",[f.authorId]);
  const before=(await db.query('SELECT * FROM reading_progress')).rows;
  await db.exec(source['docs/sql/reading-progress-preflight.sql']);assert.deepEqual((await db.query('SELECT * FROM reading_progress')).rows,before);
  await assert.rejects(db.exec(source['docs/sql/reading-progress-rollback.sql']),e=>e.code==='PT409');await db.exec('ROLLBACK');
  for(const mutation of ["CREATE POLICY unexpected_open ON reading_progress FOR ALL USING(true)","CREATE ROLE unexpected_reader;GRANT SELECT ON reading_progress TO unexpected_reader","GRANT SELECT(section_id) ON reading_progress TO authenticated"]){
   await db.exec('BEGIN;'+mutation);await assert.rejects(db.exec(source['docs/sql/reading-progress-apply.sql']),e=>e.code==='PT409');await db.exec('ROLLBACK');assert.deepEqual((await db.query('SELECT * FROM reading_progress')).rows,before);
  }
  await db.exec(source['docs/sql/reading-progress-apply.sql']);await db.exec(source['docs/sql/reading-progress-apply.sql']);
  assert.deepEqual((await db.query('SELECT id,member_id,book_id,section_id,paragraph_index,completed,updated_at FROM reading_progress')).rows,before);
  const version=(await db.query('SELECT progress_revision,progress_removed FROM reading_progress')).rows[0];assert.deepEqual(version,{progress_revision:0,progress_removed:false});
 }finally{await db.close();}
});
test('unexpected rewrite rules and edited function bodies refuse preflight',async()=>{
 const preflight=(await contributionSource('docs/sql/reading-progress-preflight.sql')).toString();
 const definition=(await f.db.query("SELECT pg_get_functiondef('soe_reading_progress_update(uuid,bigint,text,text,text,bigint,boolean)'::regprocedure) AS body")).rows[0].body;
 for(const mutation of ["CREATE RULE unexpected_rewrite AS ON UPDATE TO reading_progress DO ALSO NOTIFY synthetic_progress_changed",definition.replace('clock_timestamp()','statement_timestamp()')]){
  await f.db.exec('SET ROLE postgres; BEGIN;'+mutation);await assert.rejects(f.db.exec(preflight),e=>e.code==='PT409');await f.db.exec('ROLLBACK');
 }
});
test('rollback refuses a later function dependency without cascade or data removal',async()=>{
 await post(remove());const rollback=(await contributionSource('docs/sql/reading-progress-rollback.sql')).toString();
 await f.db.exec("SET ROLE postgres; BEGIN; CREATE VIEW later_saved_reading_caller AS SELECT soe_reading_progress_update(NULL,0,'hamlet','remove',NULL,NULL,NULL) AS value");
 await assert.rejects(f.db.exec(rollback),e=>e.code==='2BP01');await f.db.exec('ROLLBACK');assert.equal((await f.row('hamlet')).progress_revision,1);
 assert.equal((await post(save(1))).status,200);
});
