import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDb, createBaseDb, THREAD_SQL, IDS, rpc, asRole, requestId, createCircle, participate,
 archive, thread, target, post, receipt, messageState, messageAction, messageDecide } from './support/thread-db.mjs';

const fixture=async t=>{const db=await createDb();t.after(()=>db.close());return db;};
const rejects=(fn,code)=>assert.rejects(fn,error=>error.code===code);
const count=async(db,table)=>Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
const uid=n=>`f0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const insert=async(db,{id=uid(1),circle=IDS.circle,actor=IDS.author,content='A retained synthetic legacy post.',date='2020-01-01T00:00:00.000001Z'}={})=>{
 await db.query('INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id,circle,actor,'Fictional legacy author',content,date]);return id;
};

test('thread SQL tests run with external networking denied from process start',()=>{
 assert.throws(()=>globalThis.fetch('https://fixture.invalid/never-send'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
});

test('all discussion reads require current visible Circle membership and provision no safety or receipt rows',async t=>{
 const db=await fixture(t),before=await count(db,'circle_message_states');
 assert.deepEqual(await target(db),{circleId:IDS.circle,target:null});assert.equal(await receipt(db,{key:requestId()}),null);
 assert.equal((await archive(db)).items.length,2);assert.equal((await thread(db)).root.id,IDS.message);
 assert.equal(await count(db,'circle_message_states'),before);assert.equal(await count(db,'circle_discussion_post_receipts'),0);
 for(const actor of [null,IDS.newcomer])for(const call of [()=>archive(db,{actor}),()=>thread(db,{actor}),()=>target(db,{actor}),()=>receipt(db,{actor,key:requestId()})])await rejects(call,'PT403');
 await rejects(()=>archive(db,{circle:IDS.salon}),'PT404');await rejects(()=>target(db,{circle:IDS.salon}),'PT404');
});

test('standalone keyed posts replay their original identity without depending on a changed display name',async t=>{
 const db=await fixture(t),key=requestId(),before=await count(db,'seminar_messages');
 const first=await post(db,{key,content:'  An independent fictional post.  '});
 assert.equal(first.replayed,false);assert.equal(first.message.content,'An independent fictional post.');
 assert.equal(first.message.parentMessageId,null);assert.equal(first.message.rootMessageId,first.message.id);assert.equal(first.message.is_mine,true);
 const again=await post(db,{key,content:'An independent fictional post.',name:'A later name'});
 assert.equal(again.replayed,true);assert.deepEqual(again.message,first.message);assert.equal(await count(db,'seminar_messages'),before+1);
 assert.equal(await count(db,'circle_message_reply_links'),0);assert.equal((await receipt(db,{key})).message.id,first.message.id);
 await rejects(()=>post(db,{key,content:'A changed body.'}),'PT409');
 assert.equal(await receipt(db,{actor:IDS.reader,key}),null);
});

test('nested replies preserve their immediate parent and canonical root without copying parent content',async t=>{
 const db=await fixture(t);let parent=IDS.message;const ids=[];
 for(let n=0;n<4;n++){const value=await post(db,{parent,content:`Independent reply number ${n}.`});ids.push(value.message.id);assert.equal(value.message.parentMessageId,parent);assert.equal(value.message.rootMessageId,IDS.message);parent=value.message.id;}
 const value=await thread(db,{message:ids.at(-1)});
 assert.equal(value.root.id,IDS.message);assert.equal(value.focus.id,ids.at(-1));assert.deepEqual(value.items.map(x=>x.id),ids);
 const cols=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='circle_message_reply_links' ORDER BY ordinal_position")).rows.map(x=>x.column_name);
 assert.deepEqual(cols,['message_id','cohort_id','parent_message_id','root_message_id','created_at']);
 assert.equal(value.items.every(x=>!x.content.includes('private retained evidence')),true);
 assert.deepEqual(Object.keys(value.items[0]).sort(),['id','member_name','content','created_at','is_mine','visibility','parentMessageId','rootMessageId'].sort());
});

test('reply parent revision and content hash are exact safety preconditions and part of receipt identity',async t=>{
 const db=await fixture(t),preview=(await target(db,{parent:IDS.message})).target,key=requestId();
 assert.equal(preview.revision,0);assert.match(preview.contentHash,/^[0-9a-f]{64}$/);
 const first=await post(db,{parent:IDS.message,key,revision:preview.revision,hash:preview.contentHash});
 await rejects(()=>post(db,{parent:IDS.message,key,revision:1,hash:preview.contentHash}),'PT409');
 await rejects(()=>post(db,{parent:IDS.message,key:requestId(),revision:0,hash:'b'.repeat(64)}),'PT409');
 await messageAction(db,{message:IDS.message});
 await rejects(()=>post(db,{parent:IDS.message,revision:0,hash:preview.contentHash}),'PT409');
 assert.equal((await post(db,{parent:IDS.message,key,revision:0,hash:preview.contentHash})).message.id,first.message.id);
 assert.equal((await target(db,{parent:IDS.message})).target.revision,1);
});

test('held parents refuse new replies while exact old receipts recover independently authored visible children',async t=>{
 const db=await fixture(t),preview=(await target(db,{parent:IDS.message})).target,key=requestId();
 const first=await post(db,{parent:IDS.message,key,revision:0,hash:preview.contentHash});
 await messageDecide(db,{message:IDS.message});
 await rejects(()=>target(db,{parent:IDS.message}),'PT409');
 await rejects(()=>post(db,{parent:IDS.message,revision:0,hash:preview.contentHash}),'PT409');
 const recovered=await post(db,{parent:IDS.message,key,revision:0,hash:preview.contentHash});
 assert.equal(recovered.replayed,true);assert.equal(recovered.message.id,first.message.id);assert.equal(recovered.message.visibility,'visible');
 const value=await thread(db,{message:first.message.id});assert.equal(value.root.content,null);assert.equal(value.root.visibility,'hidden');assert.equal(value.items[0].content,first.message.content);
 await messageAction(db,{actor:IDS.author,message:IDS.message,action:'withdraw'});
 assert.equal((await thread(db)).root.visibility,'withdrawn');assert.equal((await receipt(db,{key})).message.visibility,'visible');
});

test('current archive thread and own receipt projections withhold hidden or withdrawn child text from everyone',async t=>{
 const db=await fixture(t),key=requestId(),first=await post(db,{key,parent:IDS.message,content:'A separate fictional child explanation.'});
 const hash=createHash('sha256').update(first.message.content).digest('hex');
 await messageDecide(db,{message:first.message.id,hash,excerpt:'fictional child'});
 for(const actor of [IDS.author,IDS.reader]){
  const a=(await archive(db,{actor})).items.find(x=>x.id===first.message.id);const b=(await thread(db,{actor,message:first.message.id})).focus;
  for(const value of [a,b]){assert.equal(value.content,null);assert.equal(value.visibility,'hidden');assert.equal('contentHash' in value,false);assert.equal('reports' in value,false);}
 }
 assert.equal((await receipt(db,{key})).message.content,null);
 await messageAction(db,{actor:IDS.author,message:first.message.id,action:'withdraw'});
 assert.equal((await receipt(db,{key})).message.visibility,'withdrawn');
});

test('archive keyset covers more than the legacy 100 window with exact timestamp ties and held cursor anchors',async t=>{
 const db=await fixture(t);const ids=[];
 for(let n=1;n<=107;n++){const id=uid(n);ids.push(id);await insert(db,{id,date:n<5?'2020-01-01T00:00:00.000001Z':`2020-01-01T00:00:00.${String(n).padStart(6,'0')}Z`});}
 await db.query('INSERT INTO circle_message_states(message_id,cohort_id,hidden) VALUES($1,$2,true)',[uid(85),IDS.circle]);
 const expected=(await db.query("SELECT id FROM seminar_messages WHERE cohort_id=$1 ORDER BY coalesce(created_at,'-infinity'::timestamptz) DESC,id DESC",[IDS.circle])).rows.map(x=>x.id);
 let before=null;const seen=[];do{const page=await archive(db,{before,limit:25});seen.push(...page.items.map(x=>x.id));before=page.nextCursor;assert.ok(page.items.length<=25);}while(before);
 assert.deepEqual(seen,expected);assert.equal(new Set(seen).size,109);
 const held=(await archive(db,{before:uid(85),limit:25})).items;assert.equal(held.some(x=>x.id===uid(85)),false);
});

test('thread paging is chronological with a same-root cursor and focus directly accesses older messages',async t=>{
 const db=await fixture(t),replies=[];
 for(let n=0;n<29;n++)replies.push((await post(db,{parent:n%2===0?IDS.message:replies.at(-1),content:`Chronological independent reply ${n}.`})).message.id);
 const first=await thread(db,{message:replies.at(-1),limit:10}),rootCursor=await thread(db,{after:IDS.message,limit:10});
 assert.deepEqual(first.items,rootCursor.items);assert.equal(first.focus.id,replies.at(-1));
 const second=await thread(db,{after:first.nextCursor,limit:10}),third=await thread(db,{after:second.nextCursor,limit:10});
 assert.deepEqual([...first.items,...second.items,...third.items].map(x=>x.id),replies);assert.equal(third.nextCursor,null);
 await rejects(()=>thread(db,{after:IDS.message2}),'PT400');await rejects(()=>thread(db,{after:uid(999)}),'PT400');
});

test('missing wrong-Circle and malformed page anchors fail closed without disclosing another Circle',async t=>{
 const db=await fixture(t),created=await createCircle(db);const foreign=await post(db,{actor:IDS.newcomer,circle:created.circleId});
 for(const before of [foreign.message.id,uid(999)])await rejects(()=>archive(db,{before}),'PT400');
 await rejects(()=>thread(db,{message:foreign.message.id}),'PT404');await rejects(()=>target(db,{parent:foreign.message.id}),'PT404');
 await rejects(()=>post(db,{parent:foreign.message.id,revision:0,hash:'a'.repeat(64)}),'PT409');
 for(const limit of [null,0,-1,26,100]){await rejects(()=>archive(db,{limit}),'PT400');await rejects(()=>thread(db,{limit}),'PT400');}
});

test('legacy invalid bodies or dates remain explicit unavailable entries and navigable cursor anchors',async t=>{
 const db=await fixture(t),rows=[{id:uid(1),date:null},{id:uid(2),date:'infinity'},{id:uid(3),date:'-infinity'},
 {id:uid(4),content:'x'.repeat(2001)},{id:uid(5),content:'😀'.repeat(1001)},{id:uid(6),content:'  '},{id:uid(7),content:'control\u0001body'},
 {id:uid(8),content:'\n\t'},{id:uid(9),content:'\u00a0\u2000\ufeff'}];
 for(const row of rows)await insert(db,row);
 let before=null;const seen=[];do{const page=await archive(db,{before,limit:2});seen.push(...page.items);before=page.nextCursor;}while(before);
 for(const row of rows){const value=seen.find(x=>x.id===row.id);assert.equal(value.visibility,'unavailable');assert.equal(value.content,null);if(row.date===null||row.date?.includes('infinity'))assert.equal(value.created_at,null);await rejects(()=>target(db,{parent:row.id}),'PT409');await rejects(()=>post(db,{parent:row.id,revision:0,hash:'a'.repeat(64)}),'PT409');}
 assert.equal(new Set(seen.map(x=>x.id)).size,11);
 await db.query('INSERT INTO circle_message_states(message_id,cohort_id,withdrawn) VALUES($1,$2,true)',[uid(1),IDS.circle]);
 assert.equal((await thread(db,{message:uid(1)})).root.visibility,'withdrawn');
});

test('body and reply precondition validation enforces UTF16 bounds and rejects incomplete or irrelevant fields',async t=>{
 const db=await fixture(t),preview=(await target(db,{parent:IDS.message})).target;
 for(const content of [null,'','   ','\n\t','\u00a0\u2000\ufeff','x'.repeat(2001),'😀'.repeat(1001),'bad\u0001content'])await rejects(()=>post(db,{content}),'PT400');
 await post(db,{content:'😀'.repeat(1000)});
 const cases=[[null,0,preview.contentHash],[null,null,preview.contentHash],[IDS.message,null,null],[IDS.message,-1,preview.contentHash],[IDS.message,0,'A'.repeat(64)],[IDS.message,9007199254740992,preview.contentHash]];
 for(const [parent,revision,hash]of cases)await rejects(()=>rpc(db,'soe_circle_discussion_post',[IDS.author,IDS.circle,requestId(),'A valid fictional body.',parent,revision,hash,'Fictional']),'PT400');
 await rejects(()=>receipt(db,{key:null}),'PT400');
});

test('key identity spans Circles and membership loss or Circle quarantine blocks all replay and read paths',async t=>{
 const db=await fixture(t),created=await createCircle(db),key=requestId();
 await participate(db,'join',{actor:IDS.author,circle:created.circleId});
 await post(db,{key});await rejects(()=>post(db,{key,circle:created.circleId}),'PT409');await rejects(()=>receipt(db,{key,circle:created.circleId}),'PT409');
 await participate(db,'leave',{actor:IDS.author});
 for(const call of [()=>post(db,{key}),()=>receipt(db,{key}),()=>archive(db),()=>thread(db),()=>target(db)])await rejects(call,'PT403');
 // Existing author-only safety controls remain independent and do not grant
 // authority to inspect the parent or archive after leaving.
 assert.equal((await messageState(db,IDS.author,IDS.message)).message.is_mine,true);
 await db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[IDS.circle,IDS.author]);
 await db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1',[IDS.circle]);
 for(const call of [()=>post(db,{key}),()=>receipt(db,{key}),()=>archive(db),()=>thread(db),()=>target(db)])await rejects(call,'PT404');
});

test('explicit completion permits current-member standalone and reply wrap-up without changing participation',async t=>{
 const db=await fixture(t),before=(await db.query('SELECT circle_participation_revision FROM book_cohorts WHERE id=$1',[IDS.circle])).rows[0];
 await db.query("UPDATE book_cohorts SET status='completed' WHERE id=$1",[IDS.circle]);
 await post(db);const reply=await post(db,{parent:IDS.message});assert.equal(reply.message.visibility,'visible');
 assert.deepEqual((await db.query('SELECT circle_participation_revision FROM book_cohorts WHERE id=$1',[IDS.circle])).rows[0],before);
});

test('late receipt insertion failure atomically rolls back both the message and its reply edge',async t=>{
 const db=await fixture(t),key=requestId(),before=await count(db,'seminar_messages');
 await db.exec("CREATE FUNCTION fixture_refuse_thread_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Synthetic receipt failure';END $$; CREATE TRIGGER fixture_refuse BEFORE INSERT ON circle_discussion_post_receipts FOR EACH ROW EXECUTE FUNCTION fixture_refuse_thread_receipt();");
 await rejects(()=>post(db,{key,parent:IDS.message}),'23514');assert.equal(await count(db,'seminar_messages'),before);assert.equal(await count(db,'circle_message_reply_links'),0);assert.equal(await receipt(db,{key}),null);
});

test('defensive edge checks reject cross-Circle roots cycles forged roots and retroactive reparenting',async t=>{
 const db=await fixture(t),reply=await post(db,{parent:IDS.message}),loose=await post(db),created=await createCircle(db),foreign=await post(db,{actor:IDS.newcomer,circle:created.circleId});
 const link=(child,parent,root,circle=IDS.circle)=>db.query('INSERT INTO circle_message_reply_links(message_id,cohort_id,parent_message_id,root_message_id) VALUES($1,$2,$3,$4)',[child,circle,parent,root]);
 await rejects(()=>link(loose.message.id,foreign.message.id,foreign.message.id),'PT409');
 await rejects(()=>link(loose.message.id,reply.message.id,IDS.message2),'PT409');
 await rejects(()=>link(IDS.message,reply.message.id,IDS.message),'PT409');
 await rejects(()=>link(IDS.message,IDS.message2,IDS.message2),'PT409');
 await rejects(()=>db.query('UPDATE circle_message_reply_links SET parent_message_id=$1',[IDS.message2]),'PT403');
 await rejects(()=>db.query('DELETE FROM circle_message_reply_links'),'PT403');
 await rejects(()=>db.query('DELETE FROM circle_discussion_post_receipts'),'PT403');
 assert.equal((await thread(db,{message:reply.message.id})).root.id,IDS.message);
});

test('serialized simultaneous calls save one keyed post and conflicting payloads cannot duplicate it',async t=>{
 const db=await fixture(t),key=requestId(),before=await count(db,'seminar_messages');
 const values=await Promise.all([post(db,{key,parent:IDS.message}),post(db,{key,parent:IDS.message})]);
 assert.deepEqual(values.map(x=>x.replayed).sort(),[false,true]);assert.equal(values[0].message.id,values[1].message.id);assert.equal(await count(db,'seminar_messages'),before+1);
 const next=requestId(),results=await Promise.allSettled([post(db,{key:next}),post(db,{key:next,content:'A conflicting fictional body.'})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'PT409');
});

test('browser roles have no discussion grants and service-only INVOKER paths add no profile or actor foreign key authority',async t=>{
 const db=await fixture(t),key=requestId();await post(db,{key});
 for(const role of ['anon','authenticated']){
  for(const [name,args]of [['read',[IDS.author,IDS.circle,null,25]],['thread',[IDS.author,IDS.circle,IDS.message,null,25]],['target',[IDS.author,IDS.circle,null]],['receipt',[IDS.author,IDS.circle,key]],['post',[IDS.author,IDS.circle,requestId(),'Fictional',null,null,null,'Fictional']]])await rejects(()=>rpc(db,'soe_circle_discussion_'+name,args,role),'42501');
  for(const table of ['circle_message_reply_links','circle_discussion_post_receipts'])await rejects(()=>asRole(db,role,tx=>tx.query(`SELECT * FROM ${table}`)),'42501');
 }
 const defs=(await db.query("SELECT prosecdef FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'soe_circle_discussion_%' OR proname LIKE '_soe_circle_discussion_%')")).rows;assert.ok(defs.length>=10);assert.equal(defs.every(x=>!x.prosecdef),true);
 for(const table of ['circle_message_reply_links','circle_discussion_post_receipts'])for(const operation of ['UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['service_role',table,operation])).rows[0].allowed,false);
 assert.equal(Number((await db.query("SELECT count(*) AS n FROM pg_constraint WHERE conrelid='circle_discussion_post_receipts'::regclass AND confrelid='members'::regclass AND contype='f'")).rows[0].n),0);
 assert.equal((await db.query("SELECT has_column_privilege('service_role','members','display_name','UPDATE') AS allowed")).rows[0].allowed,false);
});

test('all existing SQL function definitions remain byte identical and old text passage moderation behavior survives',async t=>{
 const db=await createBaseDb();t.after(()=>db.close());
 const definitions=async()=>(await db.query("SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY signature")).rows;
 const before=await definitions();await db.exec(THREAD_SQL);assert.deepEqual((await definitions()).filter(x=>!x.signature.includes('circle_discussion_')),before);
 const old=await rpc(db,'soe_circle_messages_post',[IDS.author,IDS.circle,'An unchanged old text contribution.','Fictional']);
 assert.equal((await thread(db,{message:old.message.id})).root.parentMessageId,null);assert.equal(await count(db,'circle_discussion_post_receipts'),0);
 await messageAction(db,{message:old.message.id});assert.equal((await messageState(db,IDS.author,old.message.id)).revision,1);
});

test('missing reviewed prerequisites abort the new delta without partial discussion tables',async t=>{
 const db=await createBaseDb();t.after(()=>db.close());await db.exec('DROP FUNCTION _soe_circle_passage_utf16_length(text);');
 await assert.rejects(()=>db.exec(THREAD_SQL),/Reviewed discussion prerequisites/);await db.exec('ROLLBACK;');
 assert.equal((await db.query("SELECT to_regclass('public.circle_discussion_post_receipts') AS name")).rows[0].name,null);
});
