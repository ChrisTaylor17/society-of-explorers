import test from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createDb, addCircle, requestId, asRole, rpc, report, decide, state, count } from './support/moderation-db.mjs';

const errorCode = code => error => { assert.equal(error.code, code, error.message); return true; };
async function fixture(t) { const db = await createDb(); t.after(() => db.close()); return db; }

test('new sensitive tables have RLS, no browser grants, no seeded reviewer beyond explicit test fixtures; invoker RPCs', async t => {
  const db = await fixture(t);
  const tables = await db.query(`SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('circle_reviewer_grants','circle_review_decisions','circle_report_receipts')`);
  assert.equal(tables.rows.length, 3); assert(tables.rows.every(r => r.relrowsecurity));
  const funcs = await db.query(`SELECT proname,prosecdef FROM pg_proc WHERE proname LIKE 'soe_circle_%' OR proname LIKE '_soe_circle_%'`);
  assert(funcs.rows.length >= 9); assert(funcs.rows.every(r => r.prosecdef === false));
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['circle_reviewer_grants', 'circle_review_decisions', 'circle_report_receipts']) {
      await assert.rejects(asRole(db, role, tx => tx.query(`SELECT * FROM ${table}`)), errorCode('42501'));
      // Even an accidental SELECT grant is still blocked by RLS (no policies).
      await db.exec(`GRANT SELECT ON ${table} TO ${role}`);
      assert.deepEqual((await asRole(db, role, tx => tx.query(`SELECT * FROM ${table}`))).rows, []);
      await db.exec(`REVOKE SELECT ON ${table} FROM ${role}`);
    }
    await assert.rejects(rpc(db, 'soe_circle_review_queue', [IDS.reviewer, null, 25], role), errorCode('42501'));
    await assert.rejects(rpc(db, 'soe_circle_report', [IDS.reporter, null, IDS.circle, 'spam', null, requestId()], role), errorCode('42501'));
  }
  await assert.rejects(asRole(db, 'service_role', tx => tx.query('INSERT INTO circle_reviewer_grants VALUES ($1,$2,NULL,NULL)', [IDS.circle, IDS.ordinary])), errorCode('42501'));
});

test('review authority fails closed for missing, revoked, expired, host, participant and known reporter grants', async t => {
  const db = await fixture(t);
  for (const actor of [null, IDS.ordinary, IDS.host]) {
    await assert.rejects(rpc(db, 'soe_circle_review_detail', [actor, IDS.circle]), errorCode('PT403'));
  }
  for (const change of ["revoked_at=clock_timestamp()", "expires_at=clock_timestamp()-interval '1 second'"]) {
    await db.exec(`UPDATE circle_reviewer_grants SET ${change} WHERE member_id='${IDS.reviewer}'`);
    await assert.rejects(rpc(db, 'soe_circle_review_detail', [IDS.reviewer, IDS.circle]), errorCode('PT403'));
    await db.exec(`UPDATE circle_reviewer_grants SET revoked_at=NULL,expires_at=NULL WHERE member_id='${IDS.reviewer}'`);
  }
  await db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES ($1,$2)', [IDS.circle, IDS.host]);
  await assert.rejects(rpc(db, 'soe_circle_review_detail', [IDS.host, IDS.circle]), errorCode('PT403'));
  await db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)', [IDS.circle, IDS.reviewer]);
  await assert.rejects(decide(db), errorCode('PT403'));
  await db.query('DELETE FROM book_cohort_members WHERE member_id=$1', [IDS.reviewer]);
  await report(db, { actor: IDS.reviewer });
  await assert.rejects(rpc(db, 'soe_circle_review_detail', [IDS.reviewer, IDS.circle]), errorCode('PT403'));
  await assert.rejects(rpc(db, 'soe_circle_review_queue', [IDS.reviewer, null, 25]), errorCode('PT403'));
});

test('queue/detail project only authorized bounded Circle information and omit reporter/credential data', async t => {
  const db = await fixture(t);
  await addCircle(db, IDS.circle2, { hidden: true });
  await report(db);
  const queue = await rpc(db, 'soe_circle_review_queue', [IDS.reviewer, null, 25]);
  assert.deepEqual(queue.items.map(x => x.id), [IDS.circle]); assert.equal(queue.nextCursor, null);
  assert.deepEqual(Object.keys(queue.items[0]).sort(), ['hidden','id','openReports','revision','title']);
  const detail = await rpc(db, 'soe_circle_review_detail', [IDS.reviewer, IDS.circle]);
  assert.equal(detail.complete, true); assert.equal(detail.revision, 1);
  assert.equal(detail.reports.length, 1);
  assert.deepEqual(Object.keys(detail.reports[0]).sort(), ['created_at','id','note','reason']);
  const text = JSON.stringify(detail);
  for (const key of ['reporter_member_id','reporter_key','actor_member_id','request_id','online_url','email','wallet_address']) assert(!text.includes(key));
  await assert.rejects(rpc(db, 'soe_circle_review_detail', [IDS.reviewer, IDS.circle2]), errorCode('PT403'));
});

test('SQL replay preserves original event but returns current visibility/revision after authorization; changed payload conflicts', async t => {
  const db = await fixture(t); const key = requestId();
  await report(db);
  const hidden = await decide(db, { revision: 1, key });
  assert.equal(hidden.hidden, true); assert.equal(hidden.revision, 2); assert.equal(hidden.replayed, false);
  const restored = await decide(db, { revision: 2, action: 'restore' });
  assert.equal(restored.hidden, false); assert.equal(restored.revision, 3);
  const replay = await decide(db, { revision: 1, key });
  assert.deepEqual(replay, { ...hidden, revision: 3, hidden: false, replayed: true });
  assert.deepEqual(await state(db), { hidden: false, revision: 3 });
  await assert.rejects(decide(db, { revision: 1, key, summary: 'A changed explanation is a different operation.' }), errorCode('PT409'));
  await db.query('UPDATE circle_reviewer_grants SET revoked_at=clock_timestamp() WHERE member_id=$1', [IDS.reviewer]);
  await assert.rejects(decide(db, { revision: 1, key }), errorCode('PT403'));
  assert.equal(await count(db, 'circle_review_decisions'), 2);
});

test('exact report evidence is required for hiding; restore reasons and payload bounds are enforced', async t => {
  const db = await fixture(t);
  await report(db);
  const detail = await rpc(db, 'soe_circle_review_detail', [IDS.reviewer, IDS.circle]);
  const reportId = detail.reports[0].id;
  await assert.rejects(decide(db, { revision: 1, reportId, excerpt: 'NOT in the report' }), errorCode('PT400'));
  await assert.rejects(decide(db, { revision: 1, reportId: IDS.report, excerpt: 'exact evidence' }), errorCode('PT400'));
  await assert.rejects(decide(db, { revision: 1, excerpt: 'four' }), errorCode('PT400'));
  await assert.rejects(decide(db, { revision: 1, excerpt: 'circle\nPublic description' }), errorCode('PT400'));
  await assert.rejects(decide(db, { revision: 1, summary: 'too short' }), errorCode('PT400'));
  await assert.rejects(decide(db, { revision: 1, action: 'restore', reason: 'spam' }), errorCode('PT400'));
  const result = await decide(db, { revision: 1, reportId, excerpt: 'exact evidence' });
  assert.equal(result.decision.report_count, 1);
  assert.deepEqual(Object.keys(result.decision).sort(), ['action','created_at','id','reason','report_count','summary']);
  assert.equal(await count(db, 'circle_reports', "WHERE status='open'"), 0);
});

test('audit insertion error rolls back report closure and visibility/revision together', async t => {
  const db = await fixture(t); await report(db);
  await db.exec(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$;
    CREATE TRIGGER reject_test_audit BEFORE INSERT ON circle_review_decisions FOR EACH ROW EXECUTE FUNCTION reject_test_audit();`);
  await assert.rejects(decide(db, { revision: 1 }), /injected audit failure/);
  assert.deepEqual(await state(db), { hidden: false, revision: 1 });
  assert.equal(await count(db, 'circle_reports', "WHERE status='open'"), 1);
  assert.equal(await count(db, 'circle_review_decisions'), 0);
});

test('immutable audit cannot be updated/deleted even after an accidental owner DML grant', async t => {
  const db = await fixture(t); await decide(db);
  for (const query of ['UPDATE circle_review_decisions SET summary=summary', 'DELETE FROM circle_review_decisions']) {
    await assert.rejects(db.exec(query), errorCode('PT403'));
  }
  assert.equal(await count(db, 'circle_review_decisions'), 1);
});

test('competing SQL decisions at the same revision yield one commit and one conflict; same-key retry is a replay', async t => {
  const db = await fixture(t);
  const outcomes = await Promise.allSettled([decide(db), decide(db, { actor: IDS.reviewer2 })]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(x => x.status === 'rejected').reason.code, 'PT409');
  assert.equal(await count(db, 'circle_review_decisions'), 1);
  const key = requestId();
  const retries = await Promise.all([decide(db, { revision: 1, action: 'restore', key }), decide(db, { revision: 1, action: 'restore', key })]);
  assert.deepEqual(retries.map(x => x.replayed), [false, true]);
  assert.equal(await count(db, 'circle_review_decisions'), 2);
});

test('report key/identity/payload dedupe, threshold, restore and explicit new report survive real SQL writes', async t => {
  const db = await fixture(t); const key = requestId();
  await Promise.all([report(db, { key }), report(db, { key }), report(db)]);
  assert.equal(await count(db, 'circle_reports'), 1); assert.deepEqual(await state(db), { hidden: false, revision: 1 });
  await assert.rejects(report(db, { key, note: 'Changed payload must not silently replace evidence.' }), errorCode('PT409'));
  await assert.rejects(report(db, { key, actor: IDS.reporter2 }), errorCode('PT409'));
  await report(db, { actor: IDS.reporter2 });
  await report(db, { actor: null, reporterKey: 'a'.repeat(32) });
  assert.deepEqual(await state(db), { hidden: true, revision: 3 });
  await decide(db, { revision: 3, action: 'restore' });
  await report(db, { key });
  assert.deepEqual(await state(db), { hidden: false, revision: 4 });
  assert.equal(await count(db, 'circle_reports', "WHERE status='open'"), 0);
  await report(db); // New key after closure: same words can describe new harm.
  assert.deepEqual(await state(db), { hidden: false, revision: 5 });
  assert.equal(await count(db, 'circle_reports', "WHERE status='open'"), 1);
});

test('new report invalidates an older human snapshot; failed report transaction leaves no receipt', async t => {
  const db = await fixture(t); await report(db);
  await report(db, { actor: IDS.reporter2 });
  await assert.rejects(decide(db, { revision: 1, action: 'restore' }), errorCode('PT409'));
  assert.equal(await count(db, 'circle_reports', "WHERE status='open'"), 2);
  const key = requestId();
  await db.exec(`CREATE FUNCTION reject_test_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected report failure'; END $$;
    CREATE TRIGGER reject_test_report BEFORE INSERT ON circle_reports FOR EACH ROW EXECUTE FUNCTION reject_test_report();`);
  const before = await count(db, 'circle_report_receipts');
  await assert.rejects(report(db, { actor: null, reporterKey: 'b'.repeat(32), key }), /injected report failure/);
  assert.equal(await count(db, 'circle_report_receipts'), before);
  assert.deepEqual(await state(db), { hidden: false, revision: 2 });
});

test('changed open evidence from one source is retained without multiplying threshold authority; exact keys replay as no-ops', async t => {
  const db = await fixture(t);
  const firstKey = requestId(), secondKey = requestId(), thirdKey = requestId();
  const first = { key: firstKey, note: 'The first fictional evidence note.' };
  const second = { key: secondKey, note: 'The second fictional evidence note adds new details.' };
  const third = { key: thirdKey, reason: 'safety', note: second.note };
  await report(db, first);
  await report(db, { ...first, key: requestId() }); // Equal open intent is deduped.
  assert.equal(await count(db, 'circle_reports'), 1);
  await report(db, second);
  await report(db, third); // Changed reason is new evidence too.
  const reports = (await db.query('SELECT note,reason FROM circle_reports ORDER BY created_at,id')).rows;
  assert.equal(reports.length, 3);
  assert(reports.some(row => row.note === first.note));
  assert(reports.some(row => row.note === second.note && row.reason === 'spam'));
  assert(reports.some(row => row.note === second.note && row.reason === 'safety'));
  assert.deepEqual(await state(db), { hidden: false, revision: 3 });
  await report(db, first); await report(db, second); await report(db, third);
  assert.equal(await count(db, 'circle_reports'), 3);
  assert.deepEqual(await state(db), { hidden: false, revision: 3 });
  await report(db, { actor: IDS.reporter2 });
  assert.deepEqual(await state(db), { hidden: false, revision: 4 });
  await report(db, { actor: null, reporterKey: 'c'.repeat(32) });
  assert.deepEqual(await state(db), { hidden: true, revision: 5 });
});

test('more than 100 open reports is explicitly incomplete and cannot be silently closed', async t => {
  const db = await fixture(t);
  await db.query(`INSERT INTO circle_reports(cohort_id,reason,note,reporter_key)
    SELECT $1,'spam','Fixture report '||n,lpad(n::text,32,'0') FROM generate_series(1,101) n`, [IDS.circle]);
  const detail = await rpc(db, 'soe_circle_review_detail', [IDS.reviewer, IDS.circle]);
  assert.equal(detail.complete, false); assert.equal(detail.reports.length, 100);
  await assert.rejects(decide(db), errorCode('PT409'));
  assert.equal(await count(db, 'circle_reports', "WHERE status='open'"), 101);
  assert.equal(await count(db, 'circle_review_decisions'), 0);
});

test('keyset queues and host dashboard include own hidden Circles but never private report/evidence/actor fields', async t => {
  const db = await fixture(t); await addCircle(db, IDS.circle2, { hidden: true });
  await db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES ($1,$2)', [IDS.circle2, IDS.reviewer]);
  await report(db); await decide(db, { revision: 1 });
  const first = await rpc(db, 'soe_circle_review_queue', [IDS.reviewer, null, 1]);
  assert.equal(first.items[0].id, IDS.circle); assert.equal(first.nextCursor, IDS.circle);
  const next = await rpc(db, 'soe_circle_review_queue', [IDS.reviewer, first.nextCursor, 1]);
  assert.equal(next.items[0].id, IDS.circle2); assert.equal(next.nextCursor, null);
  const hosted = await rpc(db, 'soe_circle_host_reviews', [IDS.host, null, 1]);
  assert.equal(hosted.items[0].circle.hidden, true); assert.equal(hosted.nextCursor, IDS.circle);
  assert.deepEqual(Object.keys(hosted.items[0].decisions[0]).sort(), ['action','created_at','id','reason','summary']);
  const encoded = JSON.stringify(hosted);
  for (const key of ['report_count','evidence','payload','request_id','actor','reporter','note','description','revision']) assert(!encoded.includes(key));
  for (const privateValue of [IDS.reporter, IDS.reviewer, 'Fictional report note']) assert(!encoded.includes(privateValue));
  await assert.rejects(rpc(db, 'soe_circle_host_review', [IDS.ordinary, IDS.circle]), errorCode('PT404'));
  assert.deepEqual(await rpc(db, 'soe_circle_host_reviews', [IDS.ordinary, null, 25]), { items: [], nextCursor: null });
  for (const limit of [0,51,null]) await assert.rejects(rpc(db, 'soe_circle_review_queue', [IDS.reviewer,null,limit]), errorCode('PT400'));
});

test('revision is a safe JSON integer; exhausted revision refuses writes without mutation', async t => {
  const db = await fixture(t);
  await db.query('UPDATE book_cohorts SET circle_review_revision=9007199254740991 WHERE id=$1', [IDS.circle]);
  const detail = await rpc(db, 'soe_circle_review_detail', [IDS.reviewer, IDS.circle]);
  assert.equal(detail.revision, Number.MAX_SAFE_INTEGER); assert(Number.isSafeInteger(detail.revision));
  await assert.rejects(decide(db, { revision: Number.MAX_SAFE_INTEGER }), errorCode('PT409'));
  await assert.rejects(report(db), errorCode('PT409'));
  assert.equal(await count(db,'circle_report_receipts'),0);
  assert.equal(await count(db,'circle_reports'),0);
});
