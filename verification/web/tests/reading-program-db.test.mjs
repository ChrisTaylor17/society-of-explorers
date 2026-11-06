import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDb, IDS, rpc, asRole, requestId, creationInput, createCircle, participate, detail, program, EDITIONS, readingSql } from './support/reading-program-db.mjs';
import { createDb as messageDb, messageAction, messageDecide } from './support/message-db.mjs';

const code = expected => error => error.code === expected;
async function fixture(t) { const db = await createDb(); t.after(() => db.close()); return db; }
async function scalar(db, sql, params = []) { return Object.values((await db.query(sql, params)).rows[0])[0]; }
const valid = async (db, value) => (await readingSql(db, '_soe_circle_reading_program_valid', [value]))[0];
async function dates(db, id) { return scalar(db, 'SELECT array_to_json(public._soe_circle_participation_dates(c)) FROM book_cohorts c WHERE id=$1', [id]); }
const shift = (day, count) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); };
async function setToday(db, day) {
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  await db.exec(`CREATE OR REPLACE FUNCTION public._soe_circle_participation_today(c public.book_cohorts) RETURNS date LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$ SELECT '${day}'::date; $$;`);
}
async function corruptFixture(db, id, sql, values) {
  // Owner-only fixture corruption models unknown historical data; the deployed
  // immutable trigger is never bypassed by any service/browser RPC.
  await db.exec('ALTER TABLE book_cohorts DISABLE TRIGGER circle_reading_program_fixed');
  try { await db.query('UPDATE book_cohorts SET ' + sql + ' WHERE id=$1', [id, ...values]); }
  finally { await db.exec('ALTER TABLE book_cohorts ENABLE TRIGGER circle_reading_program_fixed'); }
}

test('SQL pins all eight Gutenberg editions and the complete Philemon study with exact reading bounds', async t => {
  const db = await fixture(t);
  const rows = await asRole(db, 'service_role', async tx => (await tx.query('SELECT * FROM public._soe_circle_reading_editions() ORDER BY book_id')).rows);
  const source = JSON.parse(await readFile(new URL('../../../content/root-kernel/philemon.web-classic.json', import.meta.url), 'utf8'));
  const sha = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const philemon = { bookId: 'philemon', editionId: 'web-classic-' + sha, blockCount: 1 };
  const expected = [...EDITIONS, philemon].map(e => ({ book_id: e.bookId, edition_id: e.editionId, block_count: e.blockCount })).sort((a, b) => a.book_id.localeCompare(b.book_id));
  assert.deepEqual(rows, expected);
  const { bookId, editionId } = philemon;
  const fullLetter = { version: 1, bookId, editionId, sessions: [{ from: 0, to: 0 }] };
  assert.equal(await valid(db, fullLetter), true);
  assert.equal(await valid(db, { ...fullLetter, sessions: [{ from: 0, to: 1 }] }), false);
  assert.equal(await valid(db, { ...fullLetter, editionId: EDITIONS[0].editionId }), false);
  for (const item of EDITIONS) {
    const manifest = JSON.parse(await readFile(new URL(`../../../content/great-books/${item.bookId}/manifest.json`, import.meta.url), 'utf8'));
    assert.equal(item.editionId, manifest.editionId); assert.equal(item.blockCount, manifest.reader.blockCount);
    assert.equal(await valid(db, program(item.bookId, [{ from: 0, to: item.blockCount - 1 }])), true);
    assert.equal(await valid(db, program(item.bookId, [{ from: item.blockCount - 1, to: item.blockCount - 1 }])), true);
    assert.equal(await valid(db, program(item.bookId, [{ from: 0, to: item.blockCount }])), false);
  }
});

test('all eight editions persist atomically as explicit book programs without changing the Circle cohort sentinel', async t => {
  const db = await fixture(t);
  for (const [index, item] of EDITIONS.entries()) {
    const actor = index < 3 ? IDS.newcomer : index < 6 ? IDS.newcomer2 : IDS.host;
    const selected = program(item.bookId, [{ from: 0, to: Math.min(10, item.blockCount - 1) }]);
    const result = await createCircle(db, { actor, input: await creationInput(db, { readingProgram: selected }) });
    const current = await detail(db, actor, result.circleId);
    assert.deepEqual(current.circle.circle_reading_program, selected); assert.equal(current.meetings.length, 1);
    assert.equal(await scalar(db, 'SELECT book_id FROM book_cohorts WHERE id=$1', [result.circleId]), 'soe-circles-path');
    assert.equal(await scalar(db, 'SELECT circle_path_id FROM book_cohorts WHERE id=$1', [result.circleId]), 'book-v1');
    assert.deepEqual(await scalar(db, 'SELECT payload->\'input\'->\'readingProgram\' FROM circle_participation_receipts WHERE request_id=$1', [result.requestId]), selected);
  }
});

test('SQL rejects forged metadata, malformed shapes, extra fields, fractional and out-of-bounds positions without guessing', async t => {
  const db = await fixture(t), p = program();
  const invalid = [null, false, [], {}, { ...p, version: 2 }, { ...p, version: '1' }, { ...p, bookId: 'unknown' },
    { ...p, editionId: p.editionId + '-forged' }, { ...p, editionId: EDITIONS.find(e => e.bookId !== p.bookId).editionId },
    { ...p, extra: 'authority' }, { ...p, sessions: [] }, { ...p, sessions: Array(13).fill({ from: 0, to: 1 }) },
    { ...p, sessions: null }, { ...p, sessions: ['0..1'] }, { ...p, sessions: [{ from: 0 }] },
    { ...p, sessions: [{ to: 1 }] }, { ...p, sessions: [{ from: '0', to: 1 }] }, { ...p, sessions: [{ from: 0, to: true }] },
    { ...p, sessions: [{ from: -1, to: 1 }] }, { ...p, sessions: [{ from: 2, to: 1 }] },
    { ...p, sessions: [{ from: 0.5, to: 1 }] }, { ...p, sessions: [{ from: 0, to: 1.5 }] },
    { ...p, sessions: [{ from: 0, to: 1e100 }] }, { ...p, sessions: [{ from: 0, to: 4747 }] },
    { ...p, sessions: [{ from: 0, to: 1, note: 'not supported' }] }];
  for (const value of invalid) assert.equal(await valid(db, value), false, JSON.stringify(value));
  assert.equal((await readingSql(db, '_soe_circle_reading_program_length', [null, 'starter-12']))[0], 12);
  for (const path of [null, '', 'unknown', 'book-v1']) assert.equal((await readingSql(db, '_soe_circle_reading_program_length', [null, path]))[0], null);
  assert.equal((await readingSql(db, '_soe_circle_reading_program_length', [p, 'starter-12']))[0], null);
});

test('explicit passage selections may leave gaps, repeat a passage and revisit earlier genuine blocks', async t => {
  const db = await fixture(t);
  const selected = program('republic', [{ from: 422, to: 430 }, { from: 915, to: 920 }, { from: 422, to: 430 }, { from: 26, to: 30 }]);
  assert.equal(await valid(db, selected), true);
  const created = await createCircle(db, { input: await creationInput(db, { readingProgram: selected }) });
  assert.deepEqual((await detail(db, IDS.newcomer, created.circleId)).circle.circle_reading_program, selected);
  assert.equal((await dates(db, created.circleId)).length, 4);
});

test('create accepts omission alone as legacy starter and rejects explicit null, unknown fields and invalid programs before any write', async t => {
  const db = await fixture(t), input = await creationInput(db);
  const before = await scalar(db, 'SELECT count(*)::int FROM book_cohorts');
  for (const extra of [{ readingProgram: null }, { readingProgram: {} }, { readingProgram: { ...program(), version: 2 } }, { actor: IDS.host }, { readingProgram: program(), unknown: true }]) {
    await assert.rejects(createCircle(db, { input: { ...input, ...extra } }), code('PT400'));
  }
  assert.equal(await scalar(db, 'SELECT count(*)::int FROM book_cohorts'), before);
  assert.equal(await scalar(db, 'SELECT count(*)::int FROM circle_participation_receipts'), 0);
  const legacy = await createCircle(db, { input });
  assert.equal((await detail(db, IDS.newcomer, legacy.circleId)).circle.circle_reading_program, null);
  assert.equal((await dates(db, legacy.circleId)).length, 12);
  assert.equal(await scalar(db, 'SELECT circle_path_id FROM book_cohorts WHERE id=$1', [legacy.circleId]), 'starter-12');
});

test('new programs and existing starter paths cannot be changed, cleared or reassigned after creation', async t => {
  const db = await fixture(t), p = program();
  const created = await createCircle(db, { input: await creationInput(db, { readingProgram: p }) });
  for (const [assignment, values] of [
    ['circle_reading_program=$2', [{ ...p, sessions: [{ from: 20, to: 30 }] }]], ['circle_reading_program=NULL', []],
    ["circle_path_id='starter-12'", []], ["book_id='ordinary-salon'", []],
  ]) await assert.rejects(db.query('UPDATE book_cohorts SET ' + assignment + ' WHERE id=$1', [created.circleId, ...values]), error => ['PT403', 'PT409'].includes(error.code));
  await assert.rejects(db.query("UPDATE book_cohorts SET circle_reading_program=$2,circle_path_id='book-v1' WHERE id=$1", [IDS.circle, p]), code('PT409'));
  await assert.rejects(db.query("UPDATE book_cohorts SET book_id='soe-circles-path' WHERE id=$1", [IDS.salon]), code('PT409'));
  await assert.rejects(db.query('UPDATE book_cohorts SET circle_reading_program=$2 WHERE id=$1', [IDS.salon, p]), code('PT400'));
  await db.query('UPDATE book_cohorts SET circle_reading_program=circle_reading_program,circle_path_id=circle_path_id WHERE id=$1', [created.circleId]);
  assert.deepEqual(await scalar(db, 'SELECT circle_reading_program FROM book_cohorts WHERE id=$1', [created.circleId]), p);
});

test('program immutability preserves ordinary title/visibility review and explicit terminal completion', async t => {
  const db = await fixture(t), p = program();
  const created = await createCircle(db, { input: await creationInput(db, { readingProgram: p }) });
  await db.query("UPDATE book_cohorts SET title='Reviewed public title',circle_hidden=true WHERE id=$1", [created.circleId]);
  const held = await detail(db, IDS.newcomer, created.circleId); assert.equal(held.circle.title, 'Reviewed public title'); assert.deepEqual(held.circle.circle_reading_program, p); assert.equal(held.meetings.length, 0);
  const complete = await participate(db, 'complete', { actor: IDS.newcomer, circle: created.circleId }); assert.equal(complete.state.completed, true);
  await assert.rejects(db.query("UPDATE book_cohorts SET status='forming' WHERE id=$1", [created.circleId]), code('PT409'));
});

for (const count of [1, 2, 12]) test(`${count}-session programs have exactly ${count} finite weekly dates; last day stays open and next day closes joining/RSVP`, async t => {
  const db = await fixture(t), selected = program('apology', Array.from({ length: count }, () => ({ from: 43, to: 44 })));
  const created = await createCircle(db, { input: await creationInput(db, { readingProgram: selected }) });
  const scheduled = await dates(db, created.circleId); assert.equal(scheduled.length, count);
  for (let i = 1; i < count; i++) assert.equal(scheduled[i], shift(scheduled[0], i * 7));
  const last = scheduled.at(-1); await setToday(db, last);
  let view = await detail(db, IDS.newcomer, created.circleId); assert.equal(view.ended, false); assert.equal(view.capabilities.canRsvp, true); assert.equal(view.nextMeeting, last); assert.equal(view.meetings.length, 1);
  await participate(db, 'rsvp', { actor: IDS.newcomer, circle: created.circleId, date: last });
  await assert.rejects(participate(db, 'rsvp', { actor: IDS.newcomer, circle: created.circleId, date: shift(last, 7) }), code('PT400'));
  await setToday(db, shift(last, 1));
  view = await detail(db, IDS.newcomer, created.circleId); assert.equal(view.ended, true); assert.equal(view.meetings.length, 0); assert.equal(view.nextMeeting, null);
  assert.equal(view.capabilities.canRsvp, false); assert.equal(view.capabilities.canReadConversation, true);
  await assert.rejects(participate(db, 'join', { actor: IDS.newcomer2, circle: created.circleId }), code('PT409'));
  await assert.rejects(participate(db, 'rsvp', { actor: IDS.newcomer, circle: created.circleId, date: last }), code('PT409'));
  assert.equal((await rpc(db, 'soe_circle_start', [IDS.newcomer])).activeHosted, 0);
});

test('book-program exact retries remain original receipts after start-date freshness and host quota change', async t => {
  const db = await fixture(t), selected = program('hamlet', Array.from({ length: 12 }, () => ({ from: 10, to: 20 })));
  const input = await creationInput(db, { readingProgram: selected }), key = requestId();
  const first = await createCircle(db, { key, input }); await createCircle(db, { input }); await createCircle(db, { input });
  assert.equal((await rpc(db, 'soe_circle_start', [IDS.newcomer])).canCreate, false);
  // Only the disposable create function's clock call is replaced, to advance
  // freshness deterministically. Its receipt-before-validation/quota ordering
  // and every other statement remain the candidate's actual PostgreSQL body.
  const definition = await scalar(db, "SELECT pg_get_functiondef('public.soe_circle_create(uuid,uuid,jsonb)'::regprocedure)");
  assert.match(definition, /clock_timestamp\(\)/);
  await db.exec("CREATE FUNCTION public.fixture_future_clock() RETURNS timestamptz LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT clock_timestamp()+interval '2 days'; $$;");
  await db.exec(definition.replaceAll('clock_timestamp()', 'public.fixture_future_clock()'));
  await setToday(db, shift(input.startDate, 1));
  await assert.rejects(createCircle(db, { input }), code('PT400'));
  const futureInput = { ...input, startDate: shift(input.startDate, 3) };
  await assert.rejects(createCircle(db, { input: futureInput }), code('PT409'));
  const replay = await createCircle(db, { key, input }); assert.equal(replay.circleId, first.circleId); assert.equal(replay.replayed, true); assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(await scalar(db, "SELECT count(*)::int FROM circle_participation_receipts WHERE actor_member_id=$1 AND receipt->>'action'='create'", [IDS.newcomer]), 3);
  await assert.rejects(createCircle(db, { key, input: { ...input, readingProgram: program('hamlet', [{ from: 11, to: 20 }]) } }), code('PT409'));
});

test('invalid historical program/path cannot fall back to twelve dates but preserves own management and exit', async t => {
  const db = await fixture(t), p = program();
  const created = await createCircle(db, { input: await creationInput(db, { readingProgram: p }) });
  await corruptFixture(db, created.circleId, 'circle_reading_program=$2', [{ ...p, editionId: 'unreviewed-edition' }]);
  await corruptFixture(db, IDS.circle, 'circle_path_id=NULL', []);
  for (const [id, actor] of [[created.circleId, IDS.newcomer], [IDS.circle, IDS.reader]]) {
    assert.equal(await dates(db, id), null); await assert.rejects(detail(db, actor, id), code('PT503'));
    const mine = await rpc(db, 'soe_circle_my_circles', [actor, null, 25]); const item = mine.items.find(row => row.circle.id === id); assert.equal(item.kind, 'management'); assert.equal('ended' in item, false);
    const state = await rpc(db, 'soe_circle_membership_state', [actor, id]); assert.equal(state.capabilities.canLeave, true);
    await assert.rejects(participate(db, 'join', { actor: IDS.newcomer2, circle: id }), code('PT503'));
    assert.equal((await participate(db, 'leave', { actor, circle: id })).state.isMember, false);
  }
  assert.equal((await participate(db, 'complete', { actor: IDS.newcomer, circle: created.circleId })).state.completed, true);
});

test('failed private-link or receipt insert rolls back the entire program-bearing creation', async t => {
  for (const table of ['circle_private', 'circle_participation_receipts']) {
    const db = await fixture(t), before = await scalar(db, 'SELECT count(*)::int FROM book_cohorts');
    await db.exec(`CREATE FUNCTION fixture_program_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic program storage failure'; END $$; CREATE TRIGGER fixture_program_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fixture_program_failure();`);
    const input = await creationInput(db, { readingProgram: program(), format: 'online', venueType: 'online', venueName: null, city: null, onlineUrl: 'https://meet.example.invalid/PRIVATE_PROGRAM' });
    await assert.rejects(createCircle(db, { input }), /synthetic program storage failure/);
    assert.equal(await scalar(db, 'SELECT count(*)::int FROM book_cohorts'), before);
    assert.equal(await scalar(db, 'SELECT count(*)::int FROM book_cohorts WHERE circle_reading_program IS NOT NULL'), 0);
    assert.equal(await scalar(db, 'SELECT count(*)::int FROM book_cohort_members WHERE member_id=$1', [IDS.newcomer]), 0);
    assert.equal(await scalar(db, 'SELECT count(*)::int FROM circle_participation_receipts'), 0);
  }
});

test('reading-program helpers are invoker-only and service-only; browser Circle table writes remain blocked', async t => {
  const db = await fixture(t);
  const functions = (await db.query("SELECT oid,proname,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '_soe_circle_reading_%' ORDER BY proname")).rows;
  assert.equal(functions.length, 4);
  for (const fn of functions) {
    assert.equal(fn.prosecdef, false); assert.ok(fn.proconfig.includes('search_path=pg_catalog, public'));
    for (const role of ['anon', 'authenticated']) assert.equal(await scalar(db, 'SELECT has_function_privilege($1,$2::oid,\'EXECUTE\')', [role, fn.oid]), false);
    assert.equal(await scalar(db, 'SELECT has_function_privilege(\'service_role\',$1::oid,\'EXECUTE\')', [fn.oid]), true);
  }
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(readingSql(db, '_soe_circle_reading_program_valid', [program()], role), code('42501'));
    await assert.rejects(asRole(db, role, tx => tx.query("INSERT INTO book_cohorts(book_id,title,created_by,circle_reading_program,circle_path_id) VALUES('soe-circles-path','Browser forged program',$1,$2,'book-v1')", [IDS.newcomer, program()])), code('42501'));
  }
});

test('book Circles retain atomic member messages, human hide/restore, author withdrawal and browser privacy', async t => {
  const db = await fixture(t), selected = program('meditations');
  const created = await createCircle(db, { input: await creationInput(db, { readingProgram: selected }) }), id = created.circleId;
  await participate(db, 'join', { actor: IDS.reader, circle: id });
  const posted = await rpc(db, 'soe_circle_messages_post', [IDS.newcomer, id, 'A private book discussion contribution retained for human review.', 'Fictional Author']);
  const message = posted.message.id;
  await messageAction(db, { actor: IDS.reader, circle: id, message, action: 'report' });
  assert.equal(await scalar(db, 'SELECT count(*)::int FROM circle_reviewer_grants WHERE cohort_id=$1', [id]), 0);
  await db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)', [id, IDS.reviewer]);
  await messageDecide(db, { actor: IDS.reviewer, circle: id, message, action: 'hide', reason: 'safety', excerpt: 'book discussion', summary: 'A human reviewer held this contribution while assessing a conduct concern.' });
  let conversation = await rpc(db, 'soe_circle_messages_read', [IDS.newcomer, id]);
  assert.equal(conversation.messages.find(row => row.id === message).visibility, 'hidden'); assert.equal(JSON.stringify(conversation).includes('private book discussion'), false);
  await messageDecide(db, { actor: IDS.reviewer, circle: id, message, action: 'restore', reason: 'resolved', summary: 'A human reviewer resolved the concern and restored the original contribution.' });
  assert.equal((await rpc(db, 'soe_circle_messages_read', [IDS.reader, id])).messages.find(row => row.id === message).content, posted.message.content);
  await participate(db, 'leave', { actor: IDS.newcomer, circle: id });
  await messageAction(db, { actor: IDS.newcomer, circle: id, message, action: 'withdraw' });
  conversation = await rpc(db, 'soe_circle_messages_read', [IDS.reader, id]); assert.equal(conversation.messages.find(row => row.id === message).visibility, 'withdrawn');
  assert.equal(await scalar(db, 'SELECT content FROM seminar_messages WHERE id=$1', [message]), posted.message.content);
  for (const role of ['anon', 'authenticated']) assert.equal(await asRole(db, role, async tx => (await tx.query('SELECT * FROM seminar_messages WHERE cohort_id=$1', [id])).rows.length), 0);
  assert.deepEqual(await scalar(db, 'SELECT circle_reading_program FROM book_cohorts WHERE id=$1', [id]), selected);
});

test('unapplied delta refuses a missing participation prerequisite without adding its column', async t => {
  const db = await messageDb(); t.after(() => db.close());
  const sql = await readFile(new URL('../../../docs/sql/circle-reading-programs.sql', import.meta.url), 'utf8');
  await assert.rejects(db.exec(sql), /participation prerequisite/); await db.exec('ROLLBACK');
  assert.equal(await scalar(db, "SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='book_cohorts' AND column_name='circle_reading_program'"), 0);
});
