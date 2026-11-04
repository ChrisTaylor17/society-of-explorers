import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDb, createBaseDb, PASSAGE_SQL, IDS, EDITIONS, CANONICAL, rpc, asRole, requestId, createCircle, participate,
  reference, access, post, receipt, messageState, messageAction, messageDecide } from './support/passage-post-db.mjs';

const fixture = async t => { const db = await createDb(); t.after(() => db.close()); return db; };
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);
const count = async (db, table) => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

test('the entire SQL test process starts with external networking disabled', () => {
  assert.throws(() => globalThis.fetch('https://fixture.invalid/never-send'), /EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
});

test('access and own receipt reads require current visible membership and provision nothing', async t => {
  const db = await fixture(t), key = requestId();
  const before = await count(db, 'seminar_messages');
  assert.deepEqual(await access(db), { circleId: IDS.circle });
  assert.equal(await receipt(db, { key }), null);
  assert.equal(await count(db, 'circle_passage_post_receipts'), 0);
  assert.equal(await count(db, 'seminar_messages'), before);
  await rejects(() => access(db, { actor: null }), 'PT403');
  await rejects(() => access(db, { actor: IDS.newcomer }), 'PT403');
  await rejects(() => receipt(db, { actor: IDS.newcomer, key }), 'PT403');
  await rejects(() => access(db, { circle: IDS.salon }), 'PT404');
  await rejects(() => receipt(db, { key: null }), 'PT400');
});

test('all eight exact editions accept real block bounds in any current Circle, including link-only references', async t => {
  const db = await fixture(t);
  for (const edition of EDITIONS) {
    const key = requestId(), ref = reference(edition.bookId, { blockIndex: edition.blockCount - 1, start: null, end: null });
    const saved = await post(db, { key, ref });
    assert.equal(saved.outcome, 'confirmed'); assert.equal(saved.requestId, key); assert.equal(saved.circleId, IDS.circle);
    assert.equal(saved.message.content, CANONICAL); assert.equal(saved.message.is_mine, true); assert.equal(saved.message.visibility, 'visible');
    assert.equal(saved.replayed, false); assert.equal((await receipt(db, { key })).message.id, saved.message.id);
  }
  assert.equal(await count(db, 'circle_passage_post_receipts'), 8);
  const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='circle_passage_post_receipts'")).rows.map(r => r.column_name);
  assert.deepEqual(columns.sort(), ['actor_member_id', 'request_id', 'cohort_id', 'message_id', 'payload_hash', 'created_at'].sort());
});

test('strict reference shape pins known editions and rejects malformed or out-of-bound positions before saving', async t => {
  const db = await fixture(t), valid = reference(), n = EDITIONS.find(e => e.bookId === valid.bookId).blockCount;
  const invalid = [null, [], false, {}, { ...valid, version: '1' }, { ...valid, version: 2 }, { ...valid, extra: true },
    { ...valid, bookId: 'missing' }, { ...valid, editionId: valid.editionId + 'x' }, { ...valid, blockIndex: '0' },
    { ...valid, blockIndex: -1 }, { ...valid, blockIndex: 0.5 }, { ...valid, blockIndex: n }, { ...valid, start: null },
    { ...valid, end: null }, { ...valid, start: '0' }, { ...valid, start: -1 }, { ...valid, start: 0.5 },
    { ...valid, start: 2, end: 2 }, { ...valid, start: 3, end: 2 }, { ...valid, end: 601 },
    { ...valid, start: 9007199254740991, end: 9007199254740992 }];
  delete invalid[3].start;
  const before = await count(db, 'seminar_messages');
  for (const ref of invalid) await rejects(() => post(db, { ref }), 'PT400');
  const missing = { ...valid }; delete missing.end; await rejects(() => post(db, { ref: missing }), 'PT400');
  assert.equal(await count(db, 'seminar_messages'), before); assert.equal(await count(db, 'circle_passage_post_receipts'), 0);
  await post(db, { ref: { ...valid, start: 50, end: 650 } });
});

test('SQL bounds the canonical retained body in UTF16 units and rejects invalid content without a receipt', async t => {
  const db = await fixture(t), before = await count(db, 'seminar_messages');
  for (const content of [null, '', ' ', 'x'.repeat(2001), '😀'.repeat(1001), 'forbidden\u0001control']) {
    await rejects(() => post(db, { content }), 'PT400');
  }
  await rejects(() => post(db, { key: null }), 'PT400');
  assert.equal(await count(db, 'seminar_messages'), before); assert.equal(await count(db, 'circle_passage_post_receipts'), 0);
  assert.equal((await post(db, { content: '😀'.repeat(1000) })).message.content.length, 2000);
});

test('same-key retry returns one immutable message, ignores a later display name and binds canonical content and reference', async t => {
  const db = await fixture(t), key = requestId(), before = await count(db, 'seminar_messages');
  const first = await post(db, { key });
  const again = await post(db, { key, name: 'A changed canonical display name' });
  assert.equal(again.replayed, true); assert.equal(again.message.id, first.message.id); assert.equal(again.message.member_name, 'Fictional Author');
  assert.equal(await count(db, 'seminar_messages'), before + 1); assert.equal(await count(db, 'circle_passage_post_receipts'), 1);
  await rejects(() => post(db, { key, content: CANONICAL + ' changed' }), 'PT409');
  await rejects(() => post(db, { key, ref: reference('apology', { start: 1, end: 24 }) }), 'PT409');
  assert.equal(await receipt(db, { actor: IDS.reader, key }), null);
});

test('one actor request key spans Circles without inserting a message on a conflicting second Circle', async t => {
  const db = await fixture(t), key = requestId();
  const second = await createCircle(db); await participate(db, 'join', { actor: IDS.author, circle: second.circleId });
  await post(db, { key }); const before = await count(db, 'seminar_messages');
  await rejects(() => post(db, { circle: second.circleId, key }), 'PT409');
  await rejects(() => receipt(db, { circle: second.circleId, key }), 'PT409');
  assert.equal(await count(db, 'seminar_messages'), before); assert.equal(await count(db, 'circle_passage_post_receipts'), 1);
});

test('different actors may use the same UUID without reading or rebinding each other’s operation', async t => {
  const db = await fixture(t), key = requestId();
  const first = await post(db, { key }), second = await post(db, { actor: IDS.reader, key });
  assert.notEqual(first.message.id, second.message.id); assert.equal(await count(db, 'circle_passage_post_receipts'), 2);
  assert.equal((await receipt(db, { key })).message.id, first.message.id);
  assert.equal((await receipt(db, { actor: IDS.reader, key })).message.id, second.message.id);
});

test('retained actor UUID evidence does not add a member account-deletion constraint', async t => {
  const db = await fixture(t), key = requestId();
  await post(db, { key });
  await participate(db, 'leave', { actor: IDS.author });
  await db.query('DELETE FROM members WHERE id=$1', [IDS.author]);
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM members WHERE id=$1', [IDS.author])).rows[0].n), 0);
  const retained = (await db.query('SELECT actor_member_id FROM circle_passage_post_receipts WHERE request_id=$1', [key])).rows;
  assert.deepEqual(retained, [{ actor_member_id: IDS.author }]);
  const memberFks = (await db.query("SELECT count(*) AS n FROM pg_constraint WHERE conrelid='circle_passage_post_receipts'::regclass AND confrelid='members'::regclass AND contype='f'")).rows[0].n;
  assert.equal(Number(memberFks), 0);
  await rejects(() => receipt(db, { key }), 'PT403');
  await rejects(() => post(db, { key }), 'PT403');
});

test('completed Circles allow current-member wrap-up while leave and hidden gates apply even to exact replay', async t => {
  const db = await fixture(t), key = requestId();
  await db.query("UPDATE book_cohorts SET status='completed' WHERE id=$1", [IDS.circle]);
  await access(db); const first = await post(db, { key });
  await participate(db, 'leave', { actor: IDS.author });
  await rejects(() => receipt(db, { key }), 'PT403'); await rejects(() => post(db, { key }), 'PT403');
  // Owner-only fixture restoration is a synthetic membership schedule; it is not
  // a bypass granted to browser or service callers by this delta.
  await db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)', [IDS.circle, IDS.author]);
  assert.equal((await post(db, { key })).message.id, first.message.id);
  await db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1', [IDS.circle]);
  await rejects(() => access(db), 'PT404'); await rejects(() => receipt(db, { key }), 'PT404'); await rejects(() => post(db, { key }), 'PT404');
});

test('ordinary and own receipt projections withhold the full canonical quote credits and locator after human hide or author withdrawal', async t => {
  const db = await fixture(t), key = requestId(), first = await post(db, { key });
  const state = await messageState(db, IDS.author, first.message.id);
  assert.equal(state.contentHash, createHash('sha256').update(CANONICAL).digest('hex'));
  const review = await rpc(db, 'soe_circle_message_review_detail', [IDS.reviewer, IDS.circle, first.message.id]);
  assert.equal(review.message.content, CANONICAL);
  await messageDecide(db, { message: first.message.id, excerpt: 'fictional human' });
  for (const value of [await receipt(db, { key }), await post(db, { key })]) {
    assert.equal(value.message.visibility, 'hidden'); assert.equal(value.message.content, null); assert.equal(value.replayed, true);
    assert.equal(JSON.stringify(value).includes(CANONICAL), false);
  }
  const conversation = await rpc(db, 'soe_circle_messages_read', [IDS.author, IDS.circle]);
  assert.equal(conversation.messages.find(m => m.id === first.message.id).content, '[Post hidden after human review.]');
  await messageAction(db, { actor: IDS.author, message: first.message.id, action: 'withdraw' });
  await messageDecide(db, { message: first.message.id, action: 'restore' });
  const final = await receipt(db, { key }); assert.equal(final.message.visibility, 'withdrawn'); assert.equal(final.message.content, null);
});

test('a late receipt failure rolls the underlying message insert back atomically', async t => {
  const db = await fixture(t), key = requestId(), before = await count(db, 'seminar_messages');
  await db.exec("CREATE FUNCTION fixture_refuse_passage_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Synthetic receipt failure';END $$; CREATE TRIGGER fixture_refuse BEFORE INSERT ON circle_passage_post_receipts FOR EACH ROW EXECUTE FUNCTION fixture_refuse_passage_receipt();");
  await rejects(() => post(db, { key }), '23514');
  assert.equal(await count(db, 'seminar_messages'), before); assert.equal(await receipt(db, { key }), null);
});

test('serialized simultaneous same-key calls save once and changed payload calls cannot duplicate the operation', async t => {
  const db = await fixture(t), key = requestId(), before = await count(db, 'seminar_messages');
  const values = await Promise.all([post(db, { key }), post(db, { key })]);
  assert.deepEqual(values.map(v => v.replayed).sort(), [false, true]); assert.equal(values[0].message.id, values[1].message.id);
  assert.equal(await count(db, 'seminar_messages'), before + 1);
  const next = requestId(), results = await Promise.allSettled([post(db, { key: next }), post(db, { key: next, content: 'A different fictional canonical body.' })]);
  assert.equal(results.filter(v => v.status === 'fulfilled').length, 1);
  assert.equal(results.find(v => v.status === 'rejected').reason.code, 'PT409');
});

test('service-only invoker functions and RLS deny browser receipts or keyed posts without adding profile privileges', async t => {
  const db = await fixture(t), key = requestId(); await post(db, { key });
  for (const role of ['anon', 'authenticated']) {
    await rejects(() => rpc(db, 'soe_circle_passage_access', [IDS.author, IDS.circle], role), '42501');
    await rejects(() => rpc(db, 'soe_circle_passage_receipt', [IDS.author, IDS.circle, key], role), '42501');
    await rejects(() => rpc(db, 'soe_circle_passage_post', [IDS.author, IDS.circle, requestId(), CANONICAL, reference(), 'Fictional'], role), '42501');
    await rejects(() => asRole(db, role, tx => tx.query('SELECT * FROM circle_passage_post_receipts')), '42501');
  }
  const rows = (await db.query("SELECT prosecdef FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'soe_circle_passage_%' OR proname LIKE '_soe_circle_passage_%')")).rows;
  assert.equal(rows.length, 8); assert.equal(rows.every(r => r.prosecdef === false), true);
  for (const operation of ['UPDATE', 'DELETE', 'TRUNCATE']) {
    assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed', ['service_role', 'circle_passage_post_receipts', operation])).rows[0].allowed, false);
  }
  assert.equal((await db.query("SELECT has_column_privilege('service_role','members','display_name','UPDATE') AS allowed")).rows[0].allowed, false);
  await rejects(() => db.query('UPDATE circle_passage_post_receipts SET payload_hash=$1', ['b'.repeat(64)]), 'PT403');
  await rejects(() => db.query('DELETE FROM circle_passage_post_receipts'), 'PT403');
});

test('the delta leaves all existing moderation and text-only RPC definitions unchanged', async t => {
  const db = await createBaseDb(); t.after(() => db.close());
  const definitions = async () => (await db.query("SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY signature")).rows;
  const before = await definitions(); await db.exec(PASSAGE_SQL); const after = await definitions();
  assert.deepEqual(after.filter(p => !p.signature.includes('circle_passage_')), before);
  const old = await rpc(db, 'soe_circle_messages_post', [IDS.author, IDS.circle, 'Unchanged text-only contribution.', 'Fictional']);
  assert.equal(old.message.content, 'Unchanged text-only contribution.'); assert.equal(await count(db, 'circle_passage_post_receipts'), 0);
});

test('missing reviewed prerequisites abort the unapplied delta without creating a receipt table', async t => {
  const db = await createBaseDb(); t.after(() => db.close());
  await db.exec('DROP FUNCTION soe_circle_membership_state(uuid,uuid);');
  await assert.rejects(() => db.exec(PASSAGE_SQL), /Reviewed Circle prerequisites/);
  await db.exec('ROLLBACK;');
  assert.equal((await db.query("SELECT to_regclass('public.circle_passage_post_receipts') AS name")).rows[0].name, null);
});
