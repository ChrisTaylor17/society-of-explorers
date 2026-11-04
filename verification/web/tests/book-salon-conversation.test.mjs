import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveDb,installCircleChain,runSql,rpc,IDS,snapshotLegacyRows,asRole} from './support/circle-live-db.mjs';
import {offlineApp} from './support/offline-app.mjs';
const path='docs/sql/book-salon-conversation.sql';
const code=expected=>error=>{assert.equal(error.code,expected,error.message);return true;};
async function fixture(t,{install=true}={}){
 const db=await createLiveDb();t.after(()=>db.close());await installCircleChain(db);
 // Explicit prerequisite stub: the dedicated profile migration is independently
 // tested. This fixture does not pretend its three-column members table is live.
 await db.exec('ALTER TABLE members ENABLE ROW LEVEL SECURITY');
 if(install)await runSql(db,path);return db;
}
const parse=offlineApp().load('lib/book-salons/conversation.ts');
test('ordinary SQL read uses publication-aware explicit joins and preserves all historical sender fields',async t=>{
 const db=await fixture(t);const before=await snapshotLegacyRows(db);
 const initial=await rpc(db,'soe_book_salon_messages_read',[null,IDS.salon]);
 assert.equal(initial.membership_count,1);assert.deepEqual(initial.members,[]);assert.equal(initial.messages.length,3);
 assert.ok(initial.messages.every(m=>m.member_name==='Unattributed message'&&!m.is_mine));
 assert.equal(initial.messages[0].created_at,null);assert.equal(initial.messages[0].id,IDS.legacyUnattributed);
 assert.doesNotMatch(JSON.stringify(initial),/sender_name|thinker label|member_id|sender_type|passage_reference/);
 assert.ok(parse.parseSalonConversation(initial,IDS.salon));
 await db.query("UPDATE members SET profile_visibility='public' WHERE id=$1",[IDS.host]);
 const published=await rpc(db,'soe_book_salon_messages_read',[IDS.host,IDS.salon]);
 assert.deepEqual(published.members,[{id:IDS.host,members:{display_name:'Synthetic host'}}]);
 assert.equal(published.messages.find(m=>m.id===IDS.legacyMember).is_mine,true);
 await db.query("UPDATE members SET profile_visibility='private' WHERE id=$1",[IDS.host]);
 assert.deepEqual((await rpc(db,'soe_book_salon_messages_read',[null,IDS.salon])).members,[]);
 const nullable=await rpc(db,'soe_book_salon_messages_read',[null,IDS.orphanCohort]);
 assert.equal(nullable.cohort.title,null);assert.equal(nullable.cohort.created_at,null);assert.ok(parse.parseSalonConversation(nullable,IDS.orphanCohort));
 assert.deepEqual(await snapshotLegacyRows(db),before);
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='book_cohort_members'::regclass AND confrelid='members'::regclass")).rows[0].n,0);
});
test('SQL filters publication before roster limit and returns latest100 with explicit bounds and safe legacy text',async t=>{
 const db=await fixture(t);
 for(let i=1;i<=56;i++){
  const member=`12345678-1234-4234-8234-${String(i).padStart(12,'0')}`;
  await db.query("INSERT INTO members(id,display_name,profile_visibility) VALUES($1,$2,$3)",[member,i===1?'private@example.invalid':`Public ${i}`,i<=5?'private':'public']);
  await db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[IDS.salon,member]);
 }
 await db.query("INSERT INTO seminar_messages(cohort_id,member_name,content,created_at) SELECT $1,'safe',n::text,'2026-02-01'::timestamptz+n*interval '1 minute' FROM generate_series(1,101) n",[IDS.salon]);
 const value=await rpc(db,'soe_book_salon_messages_read',[null,IDS.salon]);
 assert.equal(value.members.length,50);assert.equal(value.membership_count,57);assert.deepEqual(value.roster,{limit:50,truncated:true});
 assert.ok(value.members.every(m=>m.members.display_name.startsWith('Public ')));
 assert.equal(value.messages.length,100);assert.equal(value.messages[0].content,'2');assert.equal(value.messages[99].content,'101');
 assert.deepEqual(value.history,{limit:100,window:'latest',truncated:true});assert.ok(parse.parseSalonConversation(value,IDS.salon));
 await db.query("INSERT INTO seminar_messages(cohort_id,member_name,content,created_at) VALUES($1,'bad@example.invalid',$2,'2027-01-01')",[IDS.salon,'x'.repeat(2001)]);
 const safe=(await rpc(db,'soe_book_salon_messages_read',[null,IDS.salon])).messages.at(-1);
 assert.equal(safe.member_name,'Explorer');assert.equal(safe.content,'[Message unavailable.]');assert.equal(safe.content_available,false);
});
test('actual post RPC admits only current ordinary members and preserves history without inferring sender identity',async t=>{
 const db=await fixture(t);const before=await snapshotLegacyRows(db);
 for(const content of ['', 'x'.repeat(2001), '😀'.repeat(1001), 'bad\u0001text'])await assert.rejects(rpc(db,'soe_book_salon_messages_post',[IDS.host,IDS.salon,content,'Synthetic host']),code('PT400'));
 await assert.rejects(rpc(db,'soe_book_salon_messages_post',[IDS.outsider,IDS.salon,'Unauthorized','Synthetic outsider']),code('PT403'));
 const content='😀'.repeat(1000);const receipt=await rpc(db,'soe_book_salon_messages_post',[IDS.host,IDS.salon,content,'Synthetic host']);
 assert.equal(receipt.outcome,'confirmed');assert.equal(receipt.cohortId,IDS.salon);assert.ok(parse.parseSalonMessage(receipt.message,true));
 assert.equal(receipt.message.content.length,2000);
 const read=await rpc(db,'soe_book_salon_messages_read',[IDS.host,IDS.salon]);assert.deepEqual(read.messages.find(m=>m.id===receipt.message.id),receipt.message);
 const saved=(await db.query('SELECT sender_name,sender_type,member_name FROM seminar_messages WHERE id=$1',[receipt.message.id])).rows[0];
 assert.deepEqual(saved,{sender_name:null,sender_type:'member',member_name:'Synthetic host'});
 await assert.rejects(db.query("UPDATE book_cohorts SET book_id='soe-circles-path' WHERE id=$1",[IDS.salon]),code('PT409'));
 await db.query("INSERT INTO book_cohorts(id,book_id,thinker_id,title,circle_path_id) VALUES($1,'soe-circles-path','socrates','Private Circle','starter-12')",[IDS.reader]);
 await assert.rejects(rpc(db,'soe_book_salon_messages_read',[null,IDS.reader]),code('PT404'));
 await assert.rejects(rpc(db,'soe_book_salon_messages_post',[IDS.host,IDS.reader,'Wrong protocol','Synthetic host']),code('PT404'));
 const after=await snapshotLegacyRows(db);assert.deepEqual(after.seminar_messages.filter(m=>m.id!==receipt.message.id),before.seminar_messages);
});
test('broad observed default ACLs never expose salon RPCs or raw tables to either browser role',async t=>{
 const db=await fixture(t);
 for(const role of ['anon','authenticated']){
  for(const name of ['soe_book_salon_messages_read','soe_book_salon_messages_post'])await assert.rejects(rpc(db,name,name.endsWith('_read')?[IDS.host,IDS.salon]:[IDS.host,IDS.salon,'forged','forged'],role),code('42501'));
  for(const sql of ['SELECT * FROM seminar_messages','SELECT member_name FROM seminar_messages','TRUNCATE seminar_messages','SELECT * FROM book_cohort_members','SELECT * FROM members'])await assert.rejects(asRole(db,role,tx=>tx.query(sql)),code('42501'));
 }
 const functions=(await db.query("SELECT proname,prosecdef,proconfig FROM pg_proc WHERE proname LIKE '%book_salon%' ORDER BY proname")).rows;
 assert.equal(functions.length,4);assert.ok(functions.every(f=>f.prosecdef===false&&f.proconfig[0]==='search_path=pg_catalog, public'));
});
test('new salon SQL refuses missing containment, collisions and partial installation without modifying rows',async t=>{
 const db=await fixture(t,{install:false});const before=await snapshotLegacyRows(db);
 await db.exec('GRANT SELECT(member_name) ON seminar_messages TO authenticated');await assert.rejects(runSql(db,path));await db.exec('ROLLBACK');
 await db.exec('REVOKE SELECT(member_name) ON seminar_messages FROM authenticated');await runSql(db,path);await assert.rejects(runSql(db,path));await db.exec('ROLLBACK');
 assert.deepEqual(await snapshotLegacyRows(db),before);
});
test('bounded function rollback retains actual posts and never reopens contained table access',async t=>{
 const db=await fixture(t);await rpc(db,'soe_book_salon_messages_post',[IDS.host,IDS.salon,'Retain after rollback','Synthetic host']);
 const before=await snapshotLegacyRows(db);await runSql(db,'docs/sql/book-salon-conversation-rollback.sql');
 assert.deepEqual(await snapshotLegacyRows(db),before);
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%book_salon%'")).rows[0].n,0);
 await assert.rejects(asRole(db,'anon',tx=>tx.query('SELECT * FROM seminar_messages')),code('42501'));
});
test('function rollback refuses source/attribute/ACL drift and later dependencies atomically',async t=>{
 for(const change of ["ALTER FUNCTION public.soe_book_salon_messages_read(uuid,uuid) STABLE", "GRANT EXECUTE ON FUNCTION public.soe_book_salon_messages_read(uuid,uuid) TO anon", "CREATE VIEW later_salon_dependency AS SELECT public._soe_book_salon_plain('later',10,true)"]){
  const db=await fixture(t);await db.exec(change);await assert.rejects(runSql(db,'docs/sql/book-salon-conversation-rollback.sql'));await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%book_salon%'")).rows[0].n,4);
 }
});
function routeFixture(db){
 const app=offlineApp();let actor=IDS.host;const calls=[];
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>actor?{memberId:actor,member:{id:actor,display_name:'Synthetic host'}}:null}));
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({
  from(table){let columns,filters=[];const query={select(v){columns=v;return query;},eq(k,v){filters.push([k,v]);return query;},
   async single(){return query.maybeSingle();},async maybeSingle(){calls.push({kind:'read',table,columns,filters});
    assert.ok(['book_cohorts','book_cohort_members'].includes(table));assert.match(columns,/^[a-z_,]+$/);assert.ok(filters.every(([k])=>['id','cohort_id','member_id'].includes(k)));
    try{return {data:(await db.query('SELECT '+columns+' FROM '+table+' WHERE '+filters.map(([k],i)=>`${k}=$${i+1}`).join(' AND '),filters.map(([,v])=>v))).rows[0]??null,error:null};}catch(e){return {data:null,error:{code:e.code}};}}};return query;},
  async rpc(name,args){calls.push({kind:'rpc',name,args});try{return {data:await rpc(db,name,Object.values(args)),error:null};}catch(e){return {data:null,error:{code:e.code,message:'PRIVATE_SQL_DETAILS'}};}},
 })}));return {route:app.load('app/api/book-salons/[cohortId]/route.ts'),setActor:v=>{actor=v;},calls};
}
const context={params:Promise.resolve({cohortId:IDS.salon})};
function request(body,headers={}){const r=new Request('https://soe.invalid/api/book-salons/'+IDS.salon,{method:body===undefined?'GET':'POST',headers:{origin:'https://soe.invalid','content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body),duplex:'half'})});r.cookies={get:()=>undefined};return r;}
test('actual salon HTTP→RPC→SQL→freshGET preserves actor guard and public projection',async t=>{
 const db=await fixture(t);const f=routeFixture(db);f.setActor(null);
 const anon=await f.route.GET(request(),context);assert.equal(anon.status,200);assert.equal((await anon.json()).members.length,0);
 assert.equal((await f.route.GET(request(),{params:Promise.resolve({cohortId:IDS.salon.toUpperCase()})})).status,200);
 assert.equal((await f.route.GET(request(),{params:Promise.resolve({cohortId:'99999999-9999-4999-8999-999999999999'})})).status,404);
 assert.match(anon.headers.get('cache-control'),/private.*no-store/);
 f.setActor(IDS.host);let response=await f.route.POST(request({content:'Bound draft',expectedMemberId:IDS.outsider}),context);
 assert.equal(response.status,409);assert.equal((await response.json()).outcome,'not_attempted');assert.equal(f.calls.filter(c=>c.kind==='rpc'&&c.name.endsWith('_post')).length,0);
 response=await f.route.POST(request({content:'Confirmed ordinary post',expectedMemberId:IDS.host}),{params:Promise.resolve({cohortId:IDS.salon.toUpperCase()})});assert.equal(response.status,200);
 const receipt=await response.json();assert.equal(receipt.outcome,'confirmed');assert.equal(receipt.message.content_available,true);
 const read=await f.route.GET(request(),context);assert.equal(read.status,200);assert.deepEqual((await read.json()).messages.find(m=>m.id===receipt.message.id),receipt.message);
 assert.doesNotMatch(JSON.stringify(receipt),/member_id|sender_type|PRIVATE_/);
 for(const body of [{content:'x',expectedMemberId:IDS.host,member_id:IDS.outsider},{content:'x'.repeat(2001),expectedMemberId:IDS.host},{content:'\ud800',expectedMemberId:IDS.host}])assert.equal((await f.route.POST(request(body),context)).status,400);
 assert.equal((await f.route.POST(request({content:'csrf',expectedMemberId:IDS.host},{origin:'https://evil.invalid'}),context)).status,403);
});
test('salon DTO rejects cross-Circle, duplicate, malformed and fabricated history while stripping raw extras',()=>{
 const app=offlineApp(),p=app.load('lib/book-salons/conversation.ts');
 const base={cohort:{id:IDS.salon,book_id:'ordinary',title:null,description:null,max_members:null,start_date:null,thinker_id:null,status:null,created_at:null},members:[],membership_count:0,roster:{limit:50,truncated:false},messages:[],history:{limit:100,window:'latest',truncated:false},private:'SECRET'};
 assert.ok(p.parseSalonConversation(base,IDS.salon));assert.doesNotMatch(JSON.stringify(p.parseSalonConversation(base,IDS.salon)),/SECRET/);
 for(const bad of [{...base,cohort:{...base.cohort,book_id:'soe-circles-path'}},{...base,membership_count:-1},{...base,history:{...base.history,truncated:true}},{...base,roster:{limit:50,truncated:true}},{...base,messages:[{id:IDS.host,member_name:'email@example.invalid',content:'x',content_available:true,created_at:null,is_mine:false}]}])assert.equal(p.parseSalonConversation(bad,IDS.salon),null);
});
