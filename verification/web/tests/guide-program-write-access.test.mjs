import test from 'node:test';
import assert from 'node:assert/strict';
import { guideWriterFixture, G, M, S, X } from './support/guide-program-write-fixture.mjs';

async function setup(t, options) {
  const f = await guideWriterFixture(); t.after(() => f.close()); await f.seed(options); return f;
}
const writes = f => f.calls.filter(call => ['POST', 'PATCH', 'DELETE'].includes(call.method));

test('removed session leader cannot complete, summarize or change the session, despite retained assignment', async t => {
  const f = await setup(t); await f.signIn(M); await f.db.query('DELETE FROM salon_members WHERE member_id=$1', [M]);
  for (const [name, body] of [['action', { action: 'complete_session', session_id: X, transcript_summary: 'Rejected summary' }],
    ['sessionPatch', { session_id: X, status: 'completed', transcript_summary: 'Rejected summary' }]]) {
    f.calls.length = 0; const result = await f.call(name, body); assert.equal(result.status, 403); assert.equal(writes(f).length, 0);
    assert(!f.calls.some(call => call.table === 'salon_sessions'), 'refuse before private session lookup');
  }
  const row = (await f.db.query('SELECT status,transcript_summary FROM salon_sessions WHERE id=$1', [X])).rows[0];
  assert.deepEqual(row, { status: 'scheduled', transcript_summary: null });
});

test('unavailable current-membership check refuses both writers without modifying or disclosing the session', async t => {
  const f = await setup(t); await f.signIn(M);
  await f.db.exec('RESET ROLE; REVOKE SELECT ON salon_members FROM service_role; SET ROLE service_role;');
  for (const [name, body] of [['action', { action: 'complete_session', session_id: X }], ['sessionPatch', { session_id: X, status: 'live' }]]) {
    f.calls.length = 0; const result = await f.call(name, body); assert.equal(result.status, 503); assert.equal(writes(f).length, 0);
    assert(!f.calls.some(call => call.table === 'salon_sessions')); assert.doesNotMatch(JSON.stringify(result.body), /42501|Synthetic|permission/i);
  }
});

test('a current participant who is not the assigned session leader or guide cannot manage the session', async t => {
  const f = await setup(t, { leader: G }); await f.signIn(M);
  for (const [name, body] of [['action', { action: 'complete_session', session_id: X }], ['sessionPatch', { session_id: X, status: 'live' }]]) {
    const result = await f.call(name, body); assert.equal(result.status, 403); assert.equal(writes(f).length, 0);
  }
});

test('current member assigned to lead can still complete once and repeat without double leadership credit', async t => {
  const f = await setup(t); await f.signIn(M);
  for (let n = 0; n < 2; n++) assert.equal((await f.call('action', { action: 'complete_session', session_id: X })).status, 200);
  const row = (await f.db.query('SELECT sessions_led,(SELECT status FROM salon_sessions WHERE id=$1) AS status FROM salon_members WHERE member_id=$2', [X, M])).rows[0];
  assert.deepEqual(row, { sessions_led: 1, status: 'completed' });
});

test('assigned program guide without a participant row retains management authority', async t => {
  const f = await setup(t); await f.signIn(G);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM salon_members WHERE member_id=$1', [G])).rows[0].n, 0);
  assert.equal((await f.call('action', { action: 'complete_session', session_id: X })).status, 200);
  assert.equal((await f.db.query('SELECT status FROM salon_sessions WHERE id=$1', [X])).rows[0].status, 'completed');
});

test('joining remains available to a nonmember and current-member attendance still works', async t => {
  const f = await setup(t, { member: false }); await f.signIn(M);
  assert.equal((await f.call('action', { action: 'join' })).status, 200);
  assert.equal((await f.call('action', { action: 'attend', session_id: X })).status, 200);
  assert.equal((await f.db.query('SELECT sessions_attended FROM salon_members WHERE salon_id=$1 AND member_id=$2', [S, M])).rows[0].sessions_attended, 1);
});

test('signed-out and removed callers reach no participation writes for attendance or graduation', async t => {
  const f = await setup(t);
  for (const identity of [null, M]) {
    if (identity) { await f.signIn(M); await f.db.query('DELETE FROM salon_members WHERE member_id=$1', [M]); } else f.auth = null;
    for (const body of [{ action: 'attend', session_id: X }, { action: 'graduate', member_ids: [M] }]) {
      f.calls.length = 0; const result = await f.call('action', body); assert.equal(result.status, identity ? 403 : 401); assert.equal(writes(f).length, 0);
    }
  }
});
