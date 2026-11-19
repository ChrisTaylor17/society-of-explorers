import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { A, B, C, Q, RA, RB, day, prompt, practiceDb, practiceHttp } from './support/practice-privacy-fixture.mjs';

async function fixture(t) {
  const f = await practiceHttp(t.after.bind(t));
  t.after(() => {
    assert.equal(f.providers(), 0);
    assert.deepEqual(f.failures, []);
  });
  return f;
}
function request(path, options = {}) {
  const { method = 'GET', body, owner, raw, origin = 'https://soe.invalid', contentType = 'application/json' } = options;
  return new Request('https://soe.invalid' + path, {
    method,
    headers: { 'content-type': contentType, ...(method === 'POST' ? { origin } : {}),
      ...(owner ? { 'x-soe-practice-owner': owner } : {}) },
    ...(method === 'POST' ? { body: raw ?? JSON.stringify(body) } : {}),
  });
}
function load(f, path) {
  return f.app.load('app/api' + path + '/route.ts');
}
async function json(response, status = 200) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(response.headers.get('vary'), /Cookie/i);
  return response.json();
}

test('public Pulse reads just the stored prompt fields and filters out a future row', async t => {
  const f = await fixture(t);
  await f.db.exec("INSERT INTO daily_questions(thinker_id, question_text, date) VALUES ('socrates','FUTURE_SENTINEL','2099-01-01')");
  const result = await json(await load(f, '/feed/pulse').GET());
  assert.deepEqual(result, { todayQuestion: { question_text: prompt, thinker_id: 'socrates', date: day } });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].table, 'daily_questions');
  assert.equal(f.calls[0].method, 'GET');
  assert.equal(f.calls[0].query.date, 'lte.' + day);
});

test('legacy response routes retire without data access and anonymous Practice receives only the prompt', async t => {
  const f = await fixture(t);
  for (const path of ['/practice/responses', '/practice/others']) {
    await json(await load(f, path).GET(request(path + '?questionId=' + Q + '&days=7')), 410);
  }
  assert.equal(f.calls.length, 0);
  const result = await json(await load(f, '/practice/my-today').GET(request('/practice/my-today?memberId=' + A)));
  assert.equal(result.question.question_text, prompt);
  assert.equal(result.memberId, null);
  assert.equal(result.myResponse, null);
  assert.equal(result.myReflection, null);
  assert.equal(result.streak, null);
  assert.deepEqual(f.calls.map(call => call.table), ['daily_questions']);
  assert(!('others' in result) && !('todayCount' in result));
});

test('core and Practice containment close direct reads and require the replacement app to close old service projections', async t => {
  const db = await practiceDb(t.after.bind(t), { withCoreBaseline: true });
  const subject = '50000000-0000-4000-8000-000000000001';
  const otherSubject = '50000000-0000-4000-8000-000000000002';
  await db.query("UPDATE members SET supabase_auth_id=$2, stripe_customer_id='SYNTHETIC_BILLING' WHERE id=$1", [A, subject]);
  await db.query('UPDATE members SET supabase_auth_id=$2 WHERE id=$1', [B, otherSubject]);
  const rawMember = 'SELECT stripe_customer_id FROM members WHERE id=$1';
  const rawAnswers = 'SELECT response_text FROM question_responses ORDER BY response_text';
  const queryAs = (role, query, parameters = []) => db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE ' + role);
    return tx.query(query, parameters);
  });
  assert.equal((await queryAs('anon', rawMember, [A])).rows[0].stripe_customer_id, 'SYNTHETIC_BILLING');
  assert.equal((await queryAs('anon', rawAnswers)).rows.length, 2);
  for (const step of ['preflight', 'apply']) {
    await db.exec(await readFile(new URL('../../../docs/sql/first-release-core-containment-' + step + '.sql', import.meta.url), 'utf8'));
  }
  const f = await practiceHttp(t.after.bind(t), db);
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(queryAs(role, rawMember, [A]), { code: '42501' });
    await assert.rejects(queryAs(role, rawAnswers), { code: '42501' });
    await assert.rejects(queryAs(role, 'SELECT reflection_text FROM practice_reflections'), { code: '42501' });
  }
  // The old upload reads these fields through the service role. The migration
  // deliberately preserves that authority so the application must change too.
  const oldResponses = await db.query('SELECT id, response_text, created_at, member_id, question_id FROM question_responses ORDER BY created_at DESC LIMIT 20');
  assert.deepEqual(oldResponses.rows.map(row => row.response_text).sort(), ['OWNER_A_ANSWER', 'OWNER_B_ANSWER']);
  const oldReflections = await db.query('SELECT response_id, reflection_text, thinker_id, created_at FROM practice_reflections WHERE response_id IN ($1,$2)', [RA, RB]);
  assert.deepEqual(oldReflections.rows.map(row => row.reflection_text).sort(), ['OWNER_A_REFLECTION', 'OWNER_B_REFLECTION']);

  let owner = null;
  f.app.setMock('@/lib/getAuthenticatedMember', () => ({
    getAuthenticatedMember: async () => {
      if (owner === null) return null;
      const { rows } = await db.query('SELECT * FROM members WHERE id=$1', [owner]);
      return { memberId: owner, member: rows[0], auth: { provider: 'supabase', subject: rows[0].supabase_auth_id } };
    },
  }));
  const session = load(f, '/auth/member');
  const sessionRequest = request('/auth/member');
  Object.defineProperty(sessionRequest, 'cookies', { value: { get: () => undefined } });
  await json(await session.GET(sessionRequest), 401);
  for (const path of ['/practice/responses', '/practice/others']) {
    await json(await load(f, path).GET(request(path + '?questionId=' + Q)), 410);
  }
  await json(await load(f, '/exp/award').POST(request('/exp/award', {
    method: 'POST', body: { memberId: A, amount: 50, reason: 'reading' },
  })), 410);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await json(await load(f, '/feed/pulse').GET()), { todayQuestion: { question_text: prompt, thinker_id: 'socrates', date: day } });
  assert.deepEqual(f.calls.map(call => call.table), ['daily_questions']);

  owner = A;
  const current = await json(await session.GET(sessionRequest));
  assert.equal(current.member.id, A);
  assert.equal(current.auth.subject, subject);
  assert.equal(current.member.display_name, 'Synthetic A');
  assert.equal('stripe_customer_id' in current.member, false);
  const save = await json(await load(f, '/practice/respond').POST(request('/practice/respond', {
    method: 'POST', owner: A, body: { questionId: Q, responseText: 'AFTER_CUTOVER_OWNER_A', memberId: B },
  })));
  const own = await json(await load(f, '/practice/my-today').GET(request('/practice/my-today?memberId=' + B)));
  assert.deepEqual(own.myResponse, save.response);
  assert.equal(own.myResponse.response_text, 'AFTER_CUTOVER_OWNER_A');
  assert.equal(own.myReflection, 'OWNER_A_REFLECTION');
  owner = B;
  assert.equal((await json(await session.GET(sessionRequest))).auth.subject, otherSubject);
  const other = await json(await load(f, '/practice/my-today').GET(request('/practice/my-today')));
  assert.equal(other.myResponse.response_text, 'OWNER_B_ANSWER');
  assert.equal(other.myReflection, 'OWNER_B_REFLECTION');
  assert.equal(f.providers(), 0);
  assert.deepEqual(f.failures, []);
});

test('both authors receive their own answers and reflections, including a legacy null-owner reflection', async t => {
  const f = await fixture(t), route = load(f, '/practice/my-today');
  for (const [owner, id, letter] of [[A, RA, 'A'], [B, RB, 'B']]) {
    f.setActor(owner);
    const result = await json(await route.GET(request('/practice/my-today?memberId=' + C)));
    assert.equal(result.memberId, owner);
    assert.equal(result.myResponse.id, id);
    assert.equal(result.myResponse.response_text, 'OWNER_' + letter + '_ANSWER');
    assert.equal(result.myReflection, 'OWNER_' + letter + '_REFLECTION');
  }
  await f.db.query('UPDATE practice_reflections SET member_id=$1 WHERE response_id=$2', [C, RB]);
  const mismatched = await json(await route.GET(request('/practice/my-today')));
  assert.equal(mismatched.myReflection, null);
});

test('a missing daily row uses the local question bank without triggering a provider', async t => {
  const f = await fixture(t);
  await f.db.exec('DELETE FROM daily_questions');
  assert.deepEqual(await json(await load(f, '/feed/pulse').GET()), { todayQuestion: null });
  assert.equal(f.calls.length, 1);
  const current = await json(await load(f, '/practice/today').GET());
  assert.equal(current.question.date, day);
  assert(current.question.question_text.length > 0);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  const second = await json(await load(f, '/practice/my-today').GET(request('/practice/my-today')));
  assert.deepEqual(second.question, current.question);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

test('cross-origin, malformed, oversized, signed-out and stale-owner saves make zero storage calls', async t => {
  const f = await fixture(t), route = load(f, '/practice/respond');
  await json(await route.POST(request('/practice/respond', { method: 'POST', body: null })), 400);
  const body = { questionId: Q, responseText: 'Synthetic save' };
  f.setActor(C);
  await json(await route.POST(request('/practice/respond', {
    method: 'POST', body, origin: 'https://other.invalid', contentType: 'text/plain',
  })), 403);
  f.setActor(null);
  await json(await route.POST(request('/practice/respond', { method: 'POST', body: { ...body, questionId: 'not-an-id' } })), 400);
  await json(await route.POST(request('/practice/respond', { method: 'POST', body: { ...body, responseText: '\ud800' } })), 400);
  await json(await route.POST(request('/practice/respond', { method: 'POST', raw: ' '.repeat(65_536) })), 413);
  await json(await route.POST(request('/practice/respond', { method: 'POST', body })), 401);
  f.setActor(C);
  await json(await route.POST(request('/practice/respond', { method: 'POST', body, owner: A })), 409);
  assert.equal(f.calls.length, 0);
});

test('saving returns an exact owner-bound receipt and stays idempotent across a sequential retry', async t => {
  const f = await fixture(t);
  f.setActor(C);
  const save = load(f, '/practice/respond');
  const body = { questionId: Q, responseText: '  SYNTHETIC_C_SAVED  ', memberId: A };
  const attempt = () => save.POST(request('/practice/respond', { method: 'POST', body, owner: C }));
  const first = await json(await attempt());
  const second = await json(await attempt());
  assert.deepEqual(first, second);
  assert.deepEqual(f.calls, Array.from({ length: 2 }, () => ({ rpc: 'soe_practice_response_save', method: 'POST' })));
  assert.equal(first.total, 1);
  assert.equal(first.response.response_text, 'SYNTHETIC_C_SAVED');
  const own = await json(await load(f, '/practice/my-today').GET(request('/practice/my-today')));
  assert.deepEqual(own.myResponse, first.response);
  assert.equal(own.myReflection, null);
  f.setActor(A);
  const other = await json(await load(f, '/practice/my-today').GET(request('/practice/my-today')));
  assert.equal(other.myResponse.response_text, 'OWNER_A_ANSWER');
  assert.equal(f.providers(), 0);
});

test('an edit preserves a legacy missing timestamp, and an absent save function fails closed', async t => {
  const f = await fixture(t);
  f.setActor(A);
  await f.db.query('UPDATE question_responses SET created_at=NULL WHERE id=$1', [RA]);
  const save = load(f, '/practice/respond');
  const attempt = responseText => save.POST(request('/practice/respond', {
    method: 'POST', owner: A, body: { questionId: Q, responseText },
  }));
  const receipt = await json(await attempt('LEGACY_TIMESTAMP_EDIT'));
  assert.deepEqual(receipt.response, { id: RA, response_text: 'LEGACY_TIMESTAMP_EDIT', created_at: null });
  assert.equal(receipt.total, 0);
  await f.db.exec('RESET ROLE; DROP FUNCTION public.soe_practice_response_save(uuid,uuid,text); SET ROLE service_role;');
  const refusal = await json(await attempt('UNAVAILABLE_FUNCTION_WRITE'), 503);
  assert.deepEqual(refusal, { error: 'Could not confirm the saved answer.' });
  assert.deepEqual(f.failures.splice(0), [{ rpc: 'soe_practice_response_save', code: '42883' }]);
  const own = await json(await load(f, '/practice/my-today').GET(request('/practice/my-today')));
  assert.deepEqual(own.myResponse, receipt.response);
});

test('legacy automatic AI reflection is paused before any provider or storage operation', async t => {
  const f = await fixture(t);
  f.setActor(A);
  const result = await load(f, '/practice/reflect').POST(request('/practice/reflect', {
    method: 'POST', body: { responseId: RA },
  }));
  assert.equal(result.status, 503);
  assert.match(await result.text(), /New AI reflections are paused/);
  assert.equal(f.calls.length, 0);
});

test('private practice participation cannot create a new match while scoring is deferred', async t => {
  const f = await fixture(t);
  await f.db.query('UPDATE members SET total_responses=7 WHERE id=$1', [C]);
  f.setActor(C);
  const before = (await f.db.query('SELECT * FROM matched_conversations')).rows;
  const result = await json(await load(f, '/match/generate').POST(request('/match/generate', { method: 'POST', body: {} })), 503);
  assert.equal(result.code, 'MATCHING_NOT_AVAILABLE');
  assert.equal(f.calls.length, 0);
  assert.deepEqual((await f.db.query('SELECT * FROM matched_conversations')).rows, before);
});
