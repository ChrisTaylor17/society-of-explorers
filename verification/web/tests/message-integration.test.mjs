import test from 'node:test';
import assert from 'node:assert/strict';
import { messageApp, IDS } from './support/message-app.mjs';
import { CONTENT, requestId } from './support/message-db.mjs';

const messagePath = `/api/circles/${IDS.circle}/messages/${IDS.message}`;
const reviewPath = `/api/admin/circles/${IDS.circle}/messages/${IDS.message}`;
const discussionPath = `/api/book-salons/${IDS.circle}`;
async function get(a, path = messagePath, status = 200) {
  const response = await a.dispatch(path); assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control'), /no-store/);
  return response.json();
}
async function post(a, path, body, status = 200, headers) {
  const response = await a.dispatch(path, 'POST', body, headers); assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control'), /no-store/);
  return response.json();
}
const snapshot = state => ({ expectedRevision: state.revision, contentHash: state.contentHash, requestId: requestId() });
const decision = (state, action = 'hide') => ({ ...snapshot(state), action, reason: action === 'hide' ? 'harassment' : 'no_violation',
  summary: 'A human reviewed the conduct and recorded a separate explanation for the author.',
  evidenceReportId: null, evidenceExcerpt: action === 'hide' ? 'fictional discussion' : null });

test('actual routes and SQL: report, assigned review, hidden reads, author withdrawal after departure and current replay', async t => {
  const a = await messageApp(); t.after(() => a.close());
  const state = await get(a); assert.equal(state.message.content, CONTENT); assert.equal(state.canReport, true);
  const report = { ...snapshot(state), action: 'report', reason: 'harassment', note: 'PRIVATE_REPORT_NOTE is an allegation requiring human review.' };
  const receipt = await post(a, messagePath, report); assert.equal(receipt.received, true);
  assert.equal(receipt.state.message.visibility, 'visible');
  assert.equal((await post(a, messagePath, report)).replayed, true);
  assert.equal((await a.db.query('SELECT count(*)::int n FROM circle_message_reports')).rows[0].n, 1);
  assert.equal((await get(a, discussionPath)).messages.find(m => m.id === IDS.message).content, CONTENT);
  a.setActor(IDS.reviewer);
  const queue = await get(a, '/api/admin/circles/messages'); assert.equal(queue.items.length, 1);
  const detail = await get(a, reviewPath); assert.equal(detail.reports[0].note, report.note);
  assert.equal(detail.message.content, CONTENT);
  const hide = decision(detail); assert.equal((await post(a, reviewPath, hide)).safety.visibility, 'hidden');
  a.setActor(IDS.reader);
  const held = await get(a); assert.equal(held.message.content, null); assert.equal(held.contentHash, null); assert.equal(held.canReport, false);
  assert.equal(JSON.stringify(held).includes('PRIVATE_REPORT_NOTE'), false);
  const discussion = await get(a, discussionPath); const row = discussion.messages.find(m => m.id === IDS.message);
  assert.equal(row.visibility, 'hidden'); assert.equal(row.content, '[Post hidden after human review.]');
  assert.equal(JSON.stringify(discussion).includes(CONTENT), false);
  a.setActor(IDS.author);
  await a.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [IDS.circle, IDS.author]);
  await a.db.query("UPDATE book_cohorts SET circle_hidden=true,status='completed' WHERE id=$1", [IDS.circle]);
  const own = await get(a, '/api/circles/contributions'); assert.equal(own.items.length, 1);
  const ownState = own.items[0]; assert.equal(ownState.message.content, null); assert.equal(ownState.canWithdraw, true);
  assert.equal(ownState.explanations[0].summary, hide.summary);
  assert.equal(JSON.stringify(own).includes('PRIVATE_REPORT_NOTE'), false);
  const withdraw = { ...snapshot(ownState), action: 'withdraw' };
  const withdrawn = await post(a, messagePath, withdraw); assert.equal(withdrawn.withdrawn, true);
  assert.equal(withdrawn.state.message.visibility, 'withdrawn');
  a.setActor(IDS.reviewer);
  const current = await get(a, reviewPath); assert.equal(current.message.content, CONTENT); // private retained evidence
  assert.equal((await post(a, reviewPath, decision(current, 'restore'))).safety.visibility, 'withdrawn');
  const replay = await post(a, reviewPath, hide); assert.equal(replay.replayed, true); assert.equal(replay.safety.visibility, 'withdrawn');
  a.setActor(IDS.author);
  assert.equal((await post(a, messagePath, withdraw)).replayed, true);
  assert.equal((await get(a)).message.content, null);
  assert.equal((await a.db.query('SELECT content FROM seminar_messages WHERE id=$1', [IDS.message])).rows[0].content, CONTENT);
  await get(a, discussionPath, 404);
});

test('HTTP decisions refuse a report that arrived after the snapshot and preserve unread reports', async t => {
  const a = await messageApp(); t.after(() => a.close());
  const first = await get(a);
  await post(a, messagePath, { ...snapshot(first), action: 'report', reason: 'spam', note: null });
  a.setActor(IDS.reviewer); const before = await get(a, reviewPath);
  a.setActor(IDS.reporter2); const next = await get(a);
  await post(a, messagePath, { ...snapshot(next), action: 'report', reason: 'safety', note: 'New report after reviewer snapshot.' });
  a.setActor(IDS.reviewer); await post(a, reviewPath, decision(before), 409);
  assert.equal((await a.db.query("SELECT count(*)::int n FROM circle_message_reports WHERE status='open'")).rows[0].n, 2);
  assert.equal((await a.db.query('SELECT count(*)::int n FROM circle_message_decisions')).rows[0].n, 0);
});

test('HTTP canonical identity, conflict restrictions and browser origin cannot be supplied by a caller', async t => {
  const a = await messageApp(); t.after(() => a.close());
  const state = await get(a);
  const body = { ...snapshot(state), action: 'report', reason: 'safety', note: null };
  await post(a, messagePath, { ...body, actor: IDS.author }, 400);
  await post(a, messagePath, body, 403, { origin: 'https://foreign.invalid' });
  a.setActor(null); await get(a, messagePath, 401); await get(a, reviewPath, 401);
  a.setActor(IDS.reader); await get(a, reviewPath, 403);
  a.setActor(IDS.host); await get(a, reviewPath, 403);
  a.setActor(IDS.author); await get(a, reviewPath, 403);
  assert.equal((await a.db.query('SELECT count(*)::int n FROM circle_message_reports')).rows[0].n, 0);
  const posted = await post(a, discussionPath, { content: 'A new synthetic discussion contribution.', memberId: IDS.reviewer });
  assert.equal(posted.outcome, 'confirmed');
  const persisted = await a.db.query('SELECT member_id FROM seminar_messages WHERE id=$1', [posted.message.id]);
  assert.equal(persisted.rows[0].member_id, IDS.author);
  await post(a, discussionPath, { content: 'Foreign browser post.' }, 403, { origin: 'https://foreign.invalid' });
});

test('Circle history uses the latest 100 stable rows and never initializes safety state on reads', async t => {
  const a = await messageApp(); t.after(() => a.close());
  await a.db.query(`INSERT INTO seminar_messages(id,cohort_id,member_id,member_name,content,created_at)
    SELECT ('eeeeeeee-eeee-4eee-8eee-'||lpad(i::text,12,'0'))::uuid,$1,$2,'Synthetic Reader','History '||i,
      timestamptz '2030-01-01 00:00:00+00'+i*interval '1 second' FROM generate_series(1,105) i`, [IDS.circle, IDS.reader]);
  const before = (await a.db.query('SELECT count(*)::int n FROM circle_message_states')).rows[0].n;
  const history = await get(a, discussionPath);
  assert.equal(history.history.truncated, true); assert.equal(history.messages.length, 100);
  assert.equal(history.messages[0].content, 'History 6'); assert.equal(history.messages.at(-1).content, 'History 105');
  await get(a); a.setActor(IDS.author); await get(a, '/api/circles/contributions');
  a.setActor(IDS.reviewer); await get(a, reviewPath); await get(a, '/api/admin/circles/messages');
  assert.equal((await a.db.query('SELECT count(*)::int n FROM circle_message_states')).rows[0].n, before);
});
