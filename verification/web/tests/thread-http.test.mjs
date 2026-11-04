import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { threadApp, IDS, requestId } from './support/thread-app.mjs';
import { CONTENT, rpc, messageAction, messageDecide } from './support/message-db.mjs';

const endpoint = `/api/circles/${IDS.circle}/discussion`;
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
const input = (overrides = {}) => ({ requestId: requestId(), comment: 'A synthetic human contribution for this Circle.', parentMessageId: null, ...overrides });
const postBody = value => ({ requestId: value.requestId, comment: value.comment, parentMessageId: value.parentMessageId,
  expectedParentRevision: value.parent?.revision ?? null, expectedParentHash: value.parent?.contentHash ?? null,
  contentHash: value.contentHash, reviewKey: value.reviewKey });
async function call(app, path = endpoint, method = 'GET', body, status = 200, headers) {
  const response = await app.dispatch(path, method, body, headers);
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  return response.json();
}
const preview = (app, value = input(), status = 200) => call(app, endpoint + '/preview', 'POST', value, status);
const send = (app, reviewed, status = 200) => call(app, endpoint, 'POST', postBody(reviewed), status);
async function count(app) {
  return Number((await app.db.query('SELECT count(*)::int n FROM circle_discussion_post_receipts')).rows[0].n);
}

test('actual archive pages reach beyond latest100, preserve tied timestamp order and never initialize read state', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const ids = await app.seedArchive(105);
  const beforeStates = (await app.db.query('SELECT count(*)::int n FROM circle_message_states')).rows[0].n;
  const all = []; let before = null;
  for (let pageNumber = 0; pageNumber < 6; pageNumber++) {
    const page = await call(app, endpoint + (before ? '?before=' + before : ''));
    assert.equal(page.kind, 'archive'); assert.equal(page.limit, 25); assert.ok(page.items.length <= 25);
    all.push(...page.items.map(message => message.id));
    if (!page.nextCursor) break;
    assert.equal(page.nextCursor, page.items.at(-1).id); before = page.nextCursor;
  }
  assert.equal(all.length, 107); assert.equal(new Set(all).size, 107);
  assert.deepEqual(all.slice(0, 105), [...ids].sort().reverse());
  assert.ok(all.includes(IDS.message));
  const old = await call(app, endpoint + '?message=' + IDS.message);
  assert.equal(old.focus.id, IDS.message); assert.equal(old.root.content, CONTENT); assert.equal(old.items.length, 0);
  assert.equal((await app.db.query('SELECT count(*)::int n FROM circle_message_states')).rows[0].n, beforeStates);
  assert.equal(await count(app), 0);
});

test('standalone preview is read-only; keyed save, own lookup and exact replay retain one canonical body', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const reviewed = await preview(app, input({ comment: '  A deliberately reviewed standalone contribution.  ' }));
  assert.equal(reviewed.comment, 'A deliberately reviewed standalone contribution.');
  assert.equal(reviewed.content, reviewed.comment); assert.equal(reviewed.parent, null);
  assert.equal(reviewed.contentHash, sha(reviewed.content)); assert.equal(reviewed.commentLimit, 2000);
  assert.equal(await count(app), 0);
  assert.equal((await call(app, endpoint + '?requestId=' + reviewed.requestId)).receipt, null);
  const saved = await send(app, reviewed);
  assert.equal(saved.message.parentMessageId, null); assert.equal(saved.message.rootMessageId, saved.message.id);
  assert.equal(saved.message.is_mine, true); assert.equal(saved.replayed, false);
  assert.equal((await send(app, reviewed)).message.id, saved.message.id);
  assert.equal((await call(app, endpoint + '?requestId=' + reviewed.requestId)).receipt.replayed, true);
  const changed = await preview(app, input({ requestId: reviewed.requestId, comment: 'A separately reviewed changed payload under the same key.' }));
  assert.equal((await send(app, changed, 409)).outcome, 'not_attempted');
  assert.equal(await count(app), 1);
});

test('nested replies retain immutable parent/root IDs and ID-only context, with separately focused pagination', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const first = await preview(app, input({ parentMessageId: IDS.message, comment: 'A human response to the original question.' }));
  assert.equal(first.parent.message.content, CONTENT); assert.equal(first.parent.message.id, IDS.message);
  assert.ok(first.content.endsWith(`/circles/${IDS.circle}/discussion?message=${IDS.message}`));
  assert.equal(first.content.includes(CONTENT), false); assert.equal(first.content.includes(first.parent.message.member_name), false);
  assert.equal(first.contentHash, sha(first.content)); assert.ok(first.commentLimit < 2000);
  const reply = await send(app, first);
  const nestedPreview = await preview(app, input({ parentMessageId: reply.message.id, comment: 'A reply to the first reply, with its own words.' }));
  const nested = await send(app, nestedPreview);
  assert.equal(nested.message.parentMessageId, reply.message.id); assert.equal(nested.message.rootMessageId, IDS.message);
  const page = await call(app, endpoint + '?message=' + nested.message.id + '&limit=1');
  assert.equal(page.root.id, IDS.message); assert.equal(page.focus.id, nested.message.id);
  assert.equal(page.items[0].id, reply.message.id); assert.equal(page.nextCursor, reply.message.id);
  const next = await call(app, endpoint + '?message=' + nested.message.id + '&limit=1&after=' + page.nextCursor);
  assert.equal(next.items[0].id, nested.message.id); assert.equal(next.nextCursor, null);
  const rootCursor = await call(app, endpoint + '?message=' + nested.message.id + '&limit=1&after=' + IDS.message);
  assert.equal(rootCursor.items[0].id, reply.message.id);
});

test('new replies reject parent report revisions changed since preview, then accept a fresh visible target review', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const old = await preview(app, input({ parentMessageId: IDS.message }));
  await messageAction(app.db, { actor: IDS.reporter2, message: IDS.message, reason: 'spam', note: 'A synthetic new report after reply review.' });
  assert.equal((await send(app, old, 409)).outcome, 'not_attempted'); assert.equal(await count(app), 0);
  const fresh = await preview(app, input({ parentMessageId: IDS.message }));
  assert.ok(fresh.parent.revision > old.parent.revision); assert.equal(fresh.parent.contentHash, old.parent.contentHash);
  assert.equal((await send(app, fresh)).outcome, 'confirmed');
});

test('known replay after parent hide bypasses fresh target read while new replies refuse and tombstones expose no parent text', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const reviewed = await preview(app, input({ parentMessageId: IDS.message }));
  const saved = await send(app, reviewed);
  await messageAction(app.db, { actor: IDS.reporter2, message: IDS.message, note: 'A synthetic private allegation for human review.' });
  await messageDecide(app.db, { actor: IDS.reviewer, message: IDS.message, excerpt: 'fictional discussion' });
  const targetReads = app.calls.filter(value => value.rpc === 'soe_circle_discussion_target').length;
  const replay = await send(app, reviewed);
  assert.equal(replay.replayed, true); assert.equal(replay.message.id, saved.message.id);
  assert.equal(app.calls.filter(value => value.rpc === 'soe_circle_discussion_target').length, targetReads);
  await preview(app, input({ parentMessageId: IDS.message }), 409);
  const page = await call(app, endpoint + '?message=' + saved.message.id);
  assert.equal(page.root.visibility, 'hidden'); assert.equal(page.root.content, null);
  assert.equal(page.focus.content, reviewed.content); assert.equal(JSON.stringify(page).includes(CONTENT), false);
  await messageAction(app.db, { actor: IDS.reader, message: saved.message.id, action: 'withdraw' });
  const withheld = await send(app, reviewed);
  assert.equal(withheld.message.visibility, 'withdrawn'); assert.equal(withheld.message.content, null);
  assert.equal((await call(app, endpoint + '?requestId=' + reviewed.requestId)).receipt.message.content, null);
});

test('lost committed reply is unknown; own read-only lookup and literal manual retry recover one retained reply', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const reviewed = await preview(app, input({ parentMessageId: IDS.message }));
  let lost = false;
  app.transformRpc((name, args, result) => {
    if (name === 'soe_circle_discussion_post' && !lost) { lost = true; throw Error('Synthetic lost committed response'); }
    return result;
  });
  assert.equal((await send(app, reviewed, 503)).outcome, 'unknown'); assert.equal(await count(app), 1);
  const lookup = await call(app, endpoint + '?requestId=' + reviewed.requestId);
  assert.equal(lookup.receipt.message.content, reviewed.content);
  assert.equal((await send(app, reviewed)).replayed, true); assert.equal(await count(app), 1);
  app.setActor(IDS.author);
  assert.equal((await call(app, endpoint + '?requestId=' + reviewed.requestId)).receipt, null);
});

test('current membership and visible Circle gate archive, thread, preview, receipt and exact replay, including authors', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const reviewed = await preview(app); await send(app, reviewed);
  await app.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [IDS.circle, IDS.reader]);
  await call(app, endpoint, 'GET', undefined, 403);
  await call(app, endpoint + '?message=' + IDS.message, 'GET', undefined, 403);
  await call(app, endpoint + '?requestId=' + reviewed.requestId, 'GET', undefined, 403);
  await preview(app, input(), 403); await send(app, reviewed, 403);
  await app.db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)', [IDS.circle, IDS.reader]);
  await app.db.query('UPDATE book_cohorts SET circle_hidden=true WHERE id=$1', [IDS.circle]);
  await call(app, endpoint, 'GET', undefined, 404);
  await call(app, endpoint + '?requestId=' + reviewed.requestId, 'GET', undefined, 404);
  await send(app, reviewed, 404); assert.equal(await count(app), 1);
});

test('completed current members retain discussion; caller actor/body/root fields confer no authority', async t => {
  const app = await threadApp(); t.after(() => app.close());
  await app.db.query("UPDATE book_cohorts SET status='completed' WHERE id=$1", [IDS.circle]);
  await preview(app, { ...input(), actor: IDS.author }, 400);
  const reviewed = await preview(app, input({ parentMessageId: IDS.message }));
  await call(app, endpoint, 'POST', { ...postBody(reviewed), rootMessageId: IDS.message }, 400);
  await call(app, endpoint, 'POST', { ...postBody(reviewed), content: 'Caller-supplied body.' }, 400);
  const saved = await send(app, reviewed);
  assert.equal((await app.db.query('SELECT member_id FROM seminar_messages WHERE id=$1', [saved.message.id])).rows[0].member_id, IDS.reader);
  app.setActor(null); await call(app, endpoint, 'GET', undefined, 401);
  app.setActor(IDS.newcomer); await call(app, endpoint, 'GET', undefined, 403);
});

test('review bindings reject changed account, request, parent state and body before any posting RPC', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const reviewed = await preview(app, input({ parentMessageId: IDS.message }));
  for (const changed of [{ comment: 'Changed wording without a new review.' }, { requestId: requestId() },
    { expectedParentRevision: reviewed.parent.revision + 1 }, { expectedParentHash: '0'.repeat(64) }, { contentHash: '0'.repeat(64) }]) {
    await call(app, endpoint, 'POST', { ...postBody(reviewed), ...changed }, 409);
  }
  app.setActor(IDS.author); await send(app, reviewed, 409);
  app.setActor(IDS.reader); app.setIdentitySequence([IDS.reader, IDS.author]); await send(app, reviewed, 409);
  assert.equal(app.calls.filter(value => value.rpc === 'soe_circle_discussion_post').length, 0);
});

test('strict query modes and current cursor ownership refuse ambiguous or unrelated pages', async t => {
  const app = await threadApp(); t.after(() => app.close());
  for (const query of ['limit=26', 'limit=01', 'after=' + IDS.message, 'message=bad', 'message=' + IDS.message + '&before=' + IDS.message2,
    'requestId=' + requestId() + '&limit=1', 'before=' + IDS.message + '&before=' + IDS.message2, 'actor=' + IDS.author]) {
    await call(app, endpoint + '?' + query, 'GET', undefined, 400);
  }
  await call(app, endpoint + '?before=' + IDS.circle, 'GET', undefined, 400);
  const first = await app.seedReply(IDS.message);
  await call(app, endpoint + '?message=' + first.id + '&after=' + IDS.message2, 'GET', undefined, 400);
  await preview(app, input({ parentMessageId: IDS.message2, comment: 'A different valid root target.' }));
});

test('retained malformed legacy rows become explicit unavailable entries and do not poison the archive', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const invalids = [
    ['e1000000-0000-4000-8000-000000000001', 'No valid source date.', null],
    ['e1000000-0000-4000-8000-000000000002', '   ', '2020-01-01'],
    ['e1000000-0000-4000-8000-000000000003', 'X'.repeat(2001), '2020-01-01'],
    ['e1000000-0000-4000-8000-000000000004', 'Infinite retained date.', 'infinity'],
  ];
  for (const [id, content, date] of invalids) await app.db.query('INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content,created_at) VALUES($1,$2,$3,$4,$5,$6::timestamptz)',
    [id, IDS.circle, IDS.author, 'Synthetic legacy author', content, date]);
  const page = await call(app);
  assert.equal(page.items.length, 6);
  assert.equal(page.items.find(message => message.id === IDS.message).content, CONTENT);
  for (const [id] of invalids) {
    const row = page.items.find(message => message.id === id);
    assert.equal(row.visibility, 'unavailable'); assert.equal(row.content, null);
    await preview(app, input({ parentMessageId: id }), 409);
  }
  assert.equal(page.items.find(message => message.id === invalids[0][0]).created_at, null);
  assert.equal(page.items.find(message => message.id === invalids[3][0]).created_at, null);
});

test('same-origin protection and streamed UTF-8 byte bounds precede mutations; bearer-only native-shaped requests stay canonical', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const value = input();
  await call(app, endpoint + '/preview', 'POST', value, 403, { origin: 'https://foreign.invalid' });
  const make = (body, headers = {}) => new Request('https://offline.invalid' + endpoint + '/preview', { method: 'POST', headers, body });
  const foreign = await app.dispatchRequest(make(JSON.stringify(value), { cookie: 'synthetic=1' })); assert.equal(foreign.status, 403);
  const invalid = await app.dispatchRequest(make(new Uint8Array([0xc3, 0x28]), { origin: 'https://offline.invalid' })); assert.equal(invalid.status, 400);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('界'.repeat(5000))); controller.close(); } });
  const large = await app.dispatchRequest(new Request('https://offline.invalid' + endpoint + '/preview', { method: 'POST', headers: { origin: 'https://offline.invalid' }, body: stream, duplex: 'half' }));
  assert.equal(large.status, 413); assert.equal((await large.json()).outcome, 'not_attempted');
  const bearer = await app.dispatchRequest(make(JSON.stringify(value), { authorization: 'Bearer SYNTHETIC_NOT_A_TOKEN', 'content-type': 'application/json' }));
  assert.equal(bearer.status, 200); assert.equal(await count(app), 0);
});

test('UTF-16 whole-body limits include parent link; display-name truncation preserves scalar characters', async t => {
  const app = await threadApp(); t.after(() => app.close());
  await preview(app, input({ parentMessageId: IDS.message, comment: '🙂'.repeat(1000) }), 400);
  await preview(app, input({ comment: 'Bad\ud800' }), 400);
  app.setDisplayName('A'.repeat(199) + '🙂');
  const reviewed = await preview(app, input({ comment: '🙂'.repeat(1000) }));
  const saved = await send(app, reviewed);
  assert.equal(saved.message.content.length, 2000); assert.equal(saved.message.member_name, 'A'.repeat(199));
  app.setDisplayName('private@example.invalid');
  assert.equal((await send(app, await preview(app))).message.member_name, 'Explorer');
});

test('missing schema and target failures stay not-attempted; generic dispatched failures remain unknown without raw errors', async t => {
  const app = await threadApp(); t.after(() => app.close());
  app.transformRpc((name, args, result) => name === 'soe_circle_discussion_target' ? { data: null, error: { code: '42883', message: 'PRIVATE_DB_DETAIL' } } : result);
  const unavailable = await preview(app, input(), 503);
  assert.equal(unavailable.outcome, 'not_attempted'); assert.equal(JSON.stringify(unavailable).includes('PRIVATE_DB_DETAIL'), false);
  app.transformRpc(null); const reviewed = await preview(app);
  app.transformRpc((name, args, result) => name === 'soe_circle_discussion_post' ? { data: null, error: { code: 'SYNTHETIC_TRANSPORT_UNKNOWN', message: 'PRIVATE_DB_DETAIL' } } : result);
  const unknown = await send(app, reviewed, 503);
  assert.equal(unknown.outcome, 'unknown'); assert.equal(JSON.stringify(unknown).includes('PRIVATE_DB_DETAIL'), false);
  app.transformRpc(null); assert.equal((await call(app, endpoint + '?requestId=' + reviewed.requestId)).receipt.message.content, reviewed.content);
});

test('malformed committed receipts cannot confirm the wrong request, parent or retained body', async t => {
  const app = await threadApp(); t.after(() => app.close());
  for (const corrupt of [value => ({ ...value, requestId: requestId() }),
    value => ({ ...value, message: { ...value.message, parentMessageId: IDS.message2 } }),
    value => ({ ...value, message: { ...value.message, content: 'An unrelated body returned by transport.' } })]) {
    const reviewed = await preview(app, input({ parentMessageId: IDS.message }));
    app.transformRpc((name, args, result) => name === 'soe_circle_discussion_post' && !result.error ? { data: corrupt(result.data), error: null } : result);
    assert.equal((await send(app, reviewed, 503)).outcome, 'unknown');
    app.transformRpc(null);
    assert.equal((await call(app, endpoint + '?requestId=' + reviewed.requestId)).receipt.message.content, reviewed.content);
  }
});

test('withheld or withdrawn parent previews refuse while valid replies remain individually moderated', async t => {
  const app = await threadApp(); t.after(() => app.close());
  const reviewed = await preview(app, input({ parentMessageId: IDS.message }));
  const reply = await send(app, reviewed);
  const state = await rpc(app.db, 'soe_circle_message_state', [IDS.reader, IDS.circle, reply.message.id]);
  assert.equal(state.contentHash, reviewed.contentHash);
  await messageAction(app.db, { actor: IDS.author, message: IDS.message, action: 'withdraw' });
  await preview(app, input({ parentMessageId: IDS.message }), 409);
  const thread = await call(app, endpoint + '?message=' + reply.message.id);
  assert.equal(thread.root.visibility, 'withdrawn'); assert.equal(thread.root.content, null);
  assert.equal(thread.focus.content, reviewed.content); assert.equal(await count(app), 1);
});
