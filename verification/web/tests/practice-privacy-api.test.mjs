import assert from 'node:assert/strict';
import test from 'node:test';
import { A, B, C, Q, RA, RB, day, prompt, practiceHttp } from './support/practice-privacy-fixture.mjs';

async function fixture(t) {
  const f = await practiceHttp(t.after.bind(t));
  t.after(() => {
    assert.equal(f.providers(), 0);
    assert.deepEqual(f.failures, []);
  });
  return f;
}
function request(path, options = {}) {
  const { method = 'GET', body, owner, raw } = options;
  return new Request('https://soe.invalid' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(owner ? { 'x-soe-practice-owner': owner } : {}) },
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

test('malformed input, absent auth and stale owner intent make zero storage calls', async t => {
  const f = await fixture(t), route = load(f, '/practice/respond');
  await json(await route.POST(request('/practice/respond', { method: 'POST', body: null })), 400);
  const body = { questionId: Q, responseText: 'Synthetic save' };
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

test('new practice matching uses shared question IDs and three general prompts without reading answer text', async t => {
  const f = await fixture(t);
  await f.db.query('UPDATE members SET total_responses=7 WHERE id=$1', [C]);
  await f.db.exec("INSERT INTO daily_questions(thinker_id,question_text,date) "
    + "SELECT 'socrates','Synthetic past question',CURRENT_DATE - i FROM generate_series(1,3) i");
  await f.db.query("INSERT INTO question_responses(member_id,question_id,response_text) "
    + "SELECT m.id,q.id,'MATCH_TEXT_MUST_STAY_PRIVATE' FROM members m CROSS JOIN daily_questions q "
    + "WHERE m.id IN ($1,$2) AND q.id <> $3", [B, C, Q]);
  f.setActor(C);
  const result = await json(await load(f, '/match/generate').POST(request('/match/generate', { method: 'POST', body: {} })));
  assert.equal(result.match.partner_display_name, 'Synthetic B');
  assert.equal(result.match.prompts.length, 3);
  assert.match(result.match.match_reason, /3 of the same daily questions/);
  assert.equal(f.calls.filter(call => call.table === 'question_responses').length, 2);
  assert(f.calls.filter(call => call.table === 'question_responses').every(call => !call.select.includes('response_text')));
  assert(!JSON.stringify(result).includes('MATCH_TEXT_MUST_STAY_PRIVATE'));
});
