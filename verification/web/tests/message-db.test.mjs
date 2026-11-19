import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDb, IDS, CONTENT, rpc, asRole, requestId, messageState, messageAction, messageDecide } from './support/message-db.mjs';
import { createDb as baseDb } from './support/moderation-db.mjs';

const denied = code => error => error.code === code;
async function scalar(db,sql,params=[]) { return Object.values((await db.query(sql,params)).rows[0])[0]; }
async function fixture(t) { const db=await createDb(); t.after(()=>db.close()); return db; }

test('reads have no initialization side effects and author controls survive departure, hidden Circle and completion',async t=>{
  const db=await fixture(t);
  const state=await messageState(db); assert.equal(state.revision,0); assert.equal(state.canReport,true);
  assert.equal(state.message.is_mine,false); assert.match(state.contentHash,/^[a-f0-9]{64}$/);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_states'),0);
  await rpc(db,'soe_circle_messages_read',[IDS.reader,IDS.circle]);
  await rpc(db,'soe_circle_message_review_detail',[IDS.reviewer,IDS.circle,IDS.message]);
  await rpc(db,'soe_circle_message_contributions',[IDS.author,null,25]);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_states'),0);
  await db.query('DELETE FROM book_cohort_members WHERE member_id=$1',[IDS.author]);
  await db.query("UPDATE book_cohorts SET circle_hidden=true,status='completed' WHERE id=$1",[IDS.circle]);
  const own=await messageState(db,IDS.author); assert.equal(own.canWithdraw,true);
  const list=await rpc(db,'soe_circle_message_contributions',[IDS.author,null,25]);
  assert.deepEqual(list.items.map(x=>x.message.id),[IDS.message]);
  assert.equal('members' in list.items[0],false); assert.equal('circleTitle' in list.items[0],false);
  await assert.rejects(messageState(db,IDS.reader),denied('PT403'));
  await assert.rejects(rpc(db,'soe_circle_messages_read',[IDS.author,IDS.circle]),denied('PT404'));
  const withdrawn=await messageAction(db,{actor:IDS.author,action:'withdraw'});
  assert.equal(withdrawn.state.message.visibility,'withdrawn'); assert.equal(withdrawn.state.message.content,null);
  assert.equal(await scalar(db,'SELECT content FROM seminar_messages WHERE id=$1',[IDS.message]),CONTENT);
});

test('reporting requires another visible post and current membership; reports never automatically hide',async t=>{
  const db=await fixture(t); const initial=await messageState(db);
  await assert.rejects(messageAction(db,{actor:IDS.author,revision:0,hash:initial.contentHash}),denied('PT403'));
  await assert.rejects(messageAction(db,{actor:IDS.reviewer,revision:0,hash:initial.contentHash}),denied('PT403'));
  await assert.rejects(messageState(db,IDS.reader,IDS.message,IDS.circle2),denied('PT404'));
  await messageAction(db); await messageAction(db,{actor:IDS.reporter2});
  await db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[IDS.circle,IDS.host]);
  await messageAction(db,{actor:IDS.host});
  const current=await messageState(db); assert.equal(current.revision,3); assert.equal(current.message.visibility,'visible');
  assert.equal(await scalar(db,"SELECT count(*)::int FROM circle_message_reports WHERE status='open'"),3);
  await db.query('DELETE FROM book_cohort_members WHERE member_id=$1',[IDS.reader]);
  await assert.rejects(messageAction(db,{revision:3,hash:initial.contentHash}),denied('PT403'));
});

test('legacy email and malformed author labels are masked in every ordinary projection',async t=>{
  const db=await fixture(t);
  const ids=['eeeeeeee-eeee-4eee-8eee-000000000001','eeeeeeee-eeee-4eee-8eee-000000000002'];
  for(let i=0;i<ids.length;i++) await db.query('INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content) VALUES($1,$2,$3,$4,$5)',[ids[i],IDS.circle,IDS.author,i===0?'private-legacy@example.invalid':'x'.repeat(250),'Fictional legacy post.']);
  for(const id of ids) {
    assert.equal((await messageState(db,IDS.reader,id)).message.member_name,'Explorer');
    assert.equal((await messageState(db,IDS.author,id)).message.member_name,'Explorer');
  }
  const own=await rpc(db,'soe_circle_message_contributions',[IDS.author,null,25]);
  for(const id of ids) assert.equal(own.items.find(x=>x.message.id===id).message.member_name,'Explorer');
  const read=await rpc(db,'soe_circle_messages_read',[IDS.reader,IDS.circle]);
  assert.equal(JSON.stringify(read).includes('private-legacy@example.invalid'),false);
});

test('report receipts bind exact payload, changed evidence appends, current identical evidence dedupes',async t=>{
  const db=await fixture(t); const state=await messageState(db); const key=requestId();
  const input={key,revision:state.revision,hash:state.contentHash,note:'First private report evidence.'};
  await messageAction(db,input); const replay=await messageAction(db,input); assert.equal(replay.replayed,true); assert.equal(replay.state.revision,1);
  await assert.rejects(messageAction(db,{...input,note:'Changed payload on same request.'}),denied('PT409'));
  await messageAction(db,{note:input.note}); assert.equal((await messageState(db)).revision,1);
  await messageAction(db,{note:'Changed evidence gets a new retained report.'});
  assert.equal((await messageState(db)).revision,2);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_reports'),2);
  assert.equal(await scalar(db,'SELECT count(DISTINCT reporter_member_id)::int FROM circle_message_reports'),1);
  await messageDecide(db); const hidden=await messageAction(db,input);
  assert.equal(hidden.replayed,true); assert.equal(hidden.state.message.visibility,'hidden'); assert.equal(hidden.state.message.content,null);
  assert.equal(hidden.state.contentHash,null); assert.equal(hidden.state.explanations.length,0);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_reports'),2);
});

test('stale revision, incorrect content hash and changed cross-post request key roll back completely',async t=>{
  const db=await fixture(t); const initial=await messageState(db); const key=requestId();
  await assert.rejects(messageAction(db,{revision:0,hash:'0'.repeat(64)}),denied('PT409'));
  await messageAction(db,{key,actor:IDS.reporter2});
  await assert.rejects(messageAction(db,{revision:0,hash:initial.contentHash}),denied('PT409'));
  await assert.rejects(messageAction(db,{key,actor:IDS.reporter2,message:IDS.message2}),denied('PT409'));
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_states WHERE message_id=$1',[IDS.message2]),0);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_reports'),1);
});

test('assigned human hide/restore never reverses author withdrawal; exact retry returns original event and current state',async t=>{
  const db=await fixture(t); await messageAction(db); const initial=await rpc(db,'soe_circle_message_review_detail',[IDS.reviewer,IDS.circle,IDS.message]);
  const hide={key:requestId(),revision:initial.revision,hash:initial.contentHash};
  const hidden=await messageDecide(db,hide); assert.equal(hidden.safety.visibility,'hidden');
  const author=await messageState(db,IDS.author); assert.equal(author.message.content,null); assert.equal(author.explanations.length,1);
  assert.equal(author.explanations[0].id,hidden.decision.id); assert.equal('report_count' in author.explanations[0],false);
  const ordinary=await messageState(db); assert.deepEqual(ordinary.explanations,[]);
  assert.equal(JSON.stringify(author).includes('private fictional report'),false);
  await messageAction(db,{actor:IDS.author,action:'withdraw'});
  const restored=await messageDecide(db,{action:'restore'}); assert.equal(restored.safety.visibility,'withdrawn');
  const replay=await messageDecide(db,hide); assert.equal(replay.replayed,true); assert.equal(replay.decision.id,hidden.decision.id);
  assert.equal(replay.safety.revision,restored.safety.revision); assert.equal(replay.safety.visibility,'withdrawn');
  await assert.rejects(messageDecide(db,{...hide,summary:'A changed explanation conflicts with the same immutable request.'}),denied('PT409'));
  const legacy=await rpc(db,'soe_circle_messages_read',[IDS.reader,IDS.circle]);
  const row=legacy.messages.find(m=>m.id===IDS.message); assert.equal(row.content,'[Post withdrawn by its author.]'); assert.equal(row.visibility,'withdrawn');
  assert.equal(JSON.stringify(legacy).includes(CONTENT),false);
  assert.equal((await rpc(db,'soe_circle_message_review_detail',[IDS.reviewer,IDS.circle,IDS.message])).message.content,CONTENT);
});

test('review conflicts include host, author, current participant and any known Circle/post reporter',async t=>{
  const db=await fixture(t);
  for (const actor of [IDS.host,IDS.author,IDS.reader]) {
    await db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[IDS.circle,actor]);
    await assert.rejects(rpc(db,'soe_circle_message_review_detail',[actor,IDS.circle,IDS.message]),denied('PT403'));
  }
  await db.query('INSERT INTO circle_reports(cohort_id,reporter_member_id,reason) VALUES($1,$2,$3)',[IDS.circle,IDS.reviewer,'safety']);
  await assert.rejects(rpc(db,'soe_circle_message_review_detail',[IDS.reviewer,IDS.circle,IDS.message]),denied('PT403'));
  await db.query('INSERT INTO circle_message_reports(cohort_id,message_id,reporter_member_id,reason) VALUES($1,$2,$3,$4)',[IDS.circle,IDS.message2,IDS.reviewer2,'spam']);
  await assert.rejects(rpc(db,'soe_circle_message_review_detail',[IDS.reviewer2,IDS.circle,IDS.message]),denied('PT403'));
});

test('expired and revoked grants deny detail and even previously successful decision replay',async t=>{
  const db=await fixture(t); const initial=await rpc(db,'soe_circle_message_review_detail',[IDS.reviewer,IDS.circle,IDS.message]);
  const input={key:requestId(),revision:0,hash:initial.contentHash}; await messageDecide(db,input);
  await db.query('UPDATE circle_reviewer_grants SET revoked_at=now() WHERE member_id=$1',[IDS.reviewer]);
  await assert.rejects(messageDecide(db,input),denied('PT403'));
  await db.query("UPDATE circle_reviewer_grants SET expires_at=now()-interval '1 second' WHERE member_id=$1",[IDS.reviewer2]);
  await assert.rejects(rpc(db,'soe_circle_message_review_detail',[IDS.reviewer2,IDS.circle,IDS.message]),denied('PT403'));
});

test('decision requires exact evidence and a complete current report snapshot',async t=>{
  const db=await fixture(t); const first=await messageAction(db); const snapshot=await rpc(db,'soe_circle_message_review_detail',[IDS.reviewer,IDS.circle,IDS.message]);
  await assert.rejects(messageDecide(db,{excerpt:'An invented evidence excerpt.'}),denied('PT400'));
  await messageAction(db,{actor:IDS.reporter2});
  await assert.rejects(messageDecide(db,{revision:snapshot.revision,hash:snapshot.contentHash}),denied('PT409'));
  assert.equal(await scalar(db,"SELECT count(*)::int FROM circle_message_reports WHERE status='open'"),2);
  await db.query("INSERT INTO circle_message_reports(cohort_id,message_id,reporter_member_id,reason,note) SELECT $1,$2,$3,'safety','Extra evidence '||i FROM generate_series(1,99) i",[IDS.circle,IDS.message,IDS.reader]);
  const incomplete=await rpc(db,'soe_circle_message_review_detail',[IDS.reviewer,IDS.circle,IDS.message]);
  assert.equal(incomplete.complete,false); assert.equal(incomplete.reports.length,100);
  await assert.rejects(messageDecide(db,{action:'restore'}),denied('PT409'));
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_decisions'),0);
  assert.equal(await scalar(db,"SELECT count(*)::int FROM circle_message_reports WHERE status='open'"),101);
  assert.equal(first.state.message.visibility,'visible');
});

test('audit/receipt insertion failure rolls visibility and report closure back atomically',async t=>{
  const db=await fixture(t); await messageAction(db); const before=await messageState(db);
  await db.exec("CREATE FUNCTION fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictional audit unavailable'; END $$; CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON circle_message_decisions FOR EACH ROW EXECUTE FUNCTION fixture_audit_failure();");
  await assert.rejects(messageDecide(db),/fictional audit unavailable/);
  assert.equal((await messageState(db)).revision,before.revision); assert.equal((await messageState(db)).message.visibility,'visible');
  assert.equal(await scalar(db,"SELECT count(*)::int FROM circle_message_reports WHERE status='open'"),1);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_decisions'),0);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_receipts'),1);
});

test('browser Data API cannot read/edit Circle messages, forge membership, downgrade Circle or truncate',async t=>{
  const db=await fixture(t);
  for(const role of ['anon','authenticated']) {
    assert.equal(await asRole(db,role,tx=>scalar(tx,'SELECT count(*)::int FROM seminar_messages WHERE cohort_id=$1',[IDS.circle])),0);
    assert.equal(await asRole(db,role,tx=>scalar(tx,'SELECT count(*)::int FROM book_cohort_members WHERE cohort_id=$1',[IDS.circle])),0);
    await assert.rejects(asRole(db,role,tx=>tx.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)',[IDS.circle,IDS.reviewer])),denied('42501'));
    await assert.rejects(asRole(db,role,tx=>tx.query("INSERT INTO seminar_messages(cohort_id,member_id,content) VALUES($1,$2,'forged')",[IDS.circle,IDS.reader])),denied('42501'));
    assert.equal((await asRole(db,role,tx=>tx.query("UPDATE seminar_messages SET content='tampered' WHERE id=$1",[IDS.message]))).affectedRows,0);
    assert.equal((await asRole(db,role,tx=>tx.query("UPDATE book_cohorts SET book_id='ordinary-salon' WHERE id=$1",[IDS.circle]))).affectedRows,0);
    await assert.rejects(asRole(db,role,tx=>tx.exec('TRUNCATE seminar_messages')),denied('42501'));
    await assert.rejects(rpc(db,'soe_circle_message_state',[IDS.reader,IDS.circle,IDS.message],role),denied('42501'));
    await assert.rejects(asRole(db,role,tx=>tx.query('SELECT * FROM circle_message_reports')),denied('42501'));
  }
  assert.equal(await scalar(db,'SELECT content FROM seminar_messages WHERE id=$1',[IDS.message]),CONTENT);
  // A re-grant of SELECT still finds no policy on a private table.
  await db.exec('GRANT SELECT ON circle_message_reports TO authenticated;');
  assert.equal(await asRole(db,'authenticated',tx=>scalar(tx,'SELECT count(*)::int FROM circle_message_reports')),0);
});

test('legacy ordinary salon DML survives while Circle content/author/cohort identity stays immutable',async t=>{
  const db=await fixture(t);
  const row=await asRole(db,'authenticated',tx=>tx.query("INSERT INTO seminar_messages(cohort_id,member_id,content) VALUES($1,$2,'ordinary unchanged') RETURNING id",[IDS.salon,IDS.reader]));
  const id=row.rows[0].id;
  await asRole(db,'authenticated',tx=>tx.query("UPDATE seminar_messages SET content='ordinary editable' WHERE id=$1",[id]));
  assert.equal(await scalar(db,'SELECT content FROM seminar_messages WHERE id=$1',[id]),'ordinary editable');
  await asRole(db,'authenticated',tx=>tx.query('DELETE FROM seminar_messages WHERE id=$1',[id]));
  for (const sql of ["UPDATE seminar_messages SET content='tampered' WHERE id=$1",'UPDATE seminar_messages SET member_id=NULL WHERE id=$1', 'DELETE FROM seminar_messages WHERE id=$1'])
    await assert.rejects(db.query(sql,[IDS.message]),denied('PT403'));
  await assert.rejects(db.query('UPDATE seminar_messages SET cohort_id=$1 WHERE id=$2',[IDS.salon,IDS.message]),denied('PT403'));
  await assert.rejects(db.query("UPDATE book_cohorts SET book_id='ordinary-salon' WHERE id=$1",[IDS.circle]),denied('PT403'));
});

test('parent deletion retains never-initialized Circle posts while ordinary salon cascades remain intact',async t=>{
  const db=await fixture(t);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM circle_message_states'),0);
  await assert.rejects(db.query('DELETE FROM book_cohorts WHERE id=$1',[IDS.circle]),denied('PT403'));
  assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohorts WHERE id=$1',[IDS.circle]),1);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM seminar_messages WHERE cohort_id=$1',[IDS.circle]),2);
  assert.equal(await scalar(db,'SELECT content FROM seminar_messages WHERE id=$1',[IDS.message]),CONTENT);
  await db.query("INSERT INTO seminar_messages(cohort_id,member_id,content) VALUES($1,$2,'Ordinary salon cascade fixture.')",[IDS.salon,IDS.reader]);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM seminar_messages WHERE cohort_id=$1',[IDS.salon]),1);
  await db.query('DELETE FROM book_cohorts WHERE id=$1',[IDS.salon]);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM book_cohorts WHERE id=$1',[IDS.salon]),0);
  assert.equal(await scalar(db,'SELECT count(*)::int FROM seminar_messages WHERE cohort_id=$1',[IDS.salon]),0);
});

test('queue and contribution keysets are bounded and disclose only authorized projections',async t=>{
  const db=await fixture(t); await messageAction(db);
  await messageAction(db,{actor:IDS.author,message:IDS.message2});
  const first=await rpc(db,'soe_circle_message_review_queue',[IDS.reviewer,null,1]); assert.equal(first.items.length,1); assert.equal(first.nextCursor,first.items[0].messageId);
  const second=await rpc(db,'soe_circle_message_review_queue',[IDS.reviewer,first.nextCursor,1]); assert.equal(second.items.length,1); assert.notEqual(second.items[0].messageId,first.items[0].messageId); assert.equal(second.nextCursor,null);
  assert.equal('content' in first.items[0],false); assert.equal('reporter_member_id' in first.items[0],false);
  const own=await rpc(db,'soe_circle_message_contributions',[IDS.reader,null,25]); assert.deepEqual(own.items.map(x=>x.message.id),[IDS.message2]);
  await assert.rejects(rpc(db,'soe_circle_message_review_queue',[IDS.reviewer,null,26]),denied('PT400'));
  await assert.rejects(rpc(db,'soe_circle_message_contributions',[IDS.author,null,0]),denied('PT400'));
});

test('safe revision ceiling and immutable audit survive concurrent serialized attempts',async t=>{
  const db=await fixture(t); const initial=await messageState(db); const args={revision:0,hash:initial.contentHash};
  const outcomes=await Promise.allSettled([messageAction(db,{...args,actor:IDS.reader}),messageAction(db,{...args,actor:IDS.reporter2})]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1); assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'PT409');
  const hidden=await messageDecide(db);
  await assert.rejects(db.query("UPDATE circle_message_decisions SET summary='changed public explanation content' WHERE id=$1",[hidden.decision.id]),denied('PT403'));
  await assert.rejects(db.exec('DELETE FROM circle_message_receipts'),denied('PT403'));
  await db.query('UPDATE circle_message_states SET revision=9007199254740991 WHERE message_id=$1',[IDS.message]);
  await assert.rejects(messageDecide(db,{action:'restore'}),denied('PT409'));
  await assert.rejects(db.query('UPDATE circle_message_states SET revision=9007199254740992 WHERE message_id=$1',[IDS.message]),denied('23514'));
});

test('preflight fails closed on unknown policies or inherited browser authority without partial schema',async t=>{
  const sql=await readFile(new URL('../../../docs/sql/circle-message-moderation.sql',import.meta.url),'utf8');
  for(const change of ["CREATE POLICY unreviewed ON seminar_messages FOR SELECT USING(true)", 'CREATE ROLE inherited_browser NOLOGIN; GRANT inherited_browser TO authenticated', 'GRANT SELECT ON seminar_messages TO authenticated']) {
    const db=await baseDb(); t.after(()=>db.close()); await db.exec(change);
    await assert.rejects(db.exec(sql),/Unknown legacy policy|Unexpected browser authority|Unexpected legacy browser grants/);
    await db.exec('ROLLBACK');
    assert.equal(await scalar(db,"SELECT to_regclass('public.circle_message_states') IS NULL"),true);
  }
});
