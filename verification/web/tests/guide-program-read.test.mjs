import assert from 'node:assert/strict';
import test from 'node:test';
import { guideProgramFixture, SALON, OTHER_SALON, ABSENT_SALON, GUIDE, MEMBER, OUTSIDER, OTHER_GUIDE } from './support/guide-program-read-fixture.mjs';

const privateResponse = response => {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('surrogate-control'), 'no-store');
  assert.match(response.headers.get('vary'), /Cookie/);
  assert.match(response.headers.get('vary'), /Authorization/);
};
const failure = async (response, status) => {
  assert.equal(response.status, status); privateResponse(response);
  const body = await response.json(); assert.deepEqual(Object.keys(body), ['error']);
  assert(!JSON.stringify(body).includes('PRIVATE_')); return body;
};
const sensitiveRead = call => call.table === 'salon_sessions' || call.table === 'members' ||
  (call.table === 'salon_members' && call.query.select !== 'id') ||
  (call.table === 'salons' && call.query.select !== 'id,guide_member_id');

test('Anonymous detail, sessions and personal-program reads stop before creating a data client', async t => {
  const f = await guideProgramFixture(t);
  for (const route of ['detail', 'sessions', 'mine']) await failure(await f.read(route), 401);
  assert.equal(f.authCalls, 3); assert.equal(f.clientCreations, 0); assert.deepEqual(f.calls, []);
});

test('Invalid and general identifiers do not reach program data even for a signed-in member', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  for (const id of ['general', 'not-a-uuid', 'private-' + MEMBER, ' ' + SALON]) {
    for (const route of ['detail', 'sessions']) await failure(await f.read(route, id), 404);
  }
  assert.equal(f.clientCreations, 0); assert.deepEqual(f.calls, []);
});

test('A current member receives only the existing bounded detail projection and ordered dates', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  const response = await f.read('detail'); assert.equal(response.status, 200); privateResponse(response);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['guide', 'members', 'salon', 'sessions', 'stats']);
  assert.equal(body.salon.id, SALON); assert.equal(body.members[0].members.display_name, 'Fictional Member');
  assert.equal(body.guide.display_name, 'Fictional Guide'); assert.equal(body.stats.next_session, '2026-11-09');
  assert.equal(body.stats.member_count, 1); assert.equal(body.stats.sessions_remaining, 2);
  assert.deepEqual(body.sessions.map(row => row.session_date), ['2026-11-09', '2026-11-16']);
  assert(!JSON.stringify(body).includes('PRIVATE_'));
  assert(!JSON.stringify(body).includes(MEMBER)); assert(!JSON.stringify(body).includes(GUIDE));
  const proof = f.calls.find(call => call.table === 'salon_members' && call.query.member_id);
  assert.equal(proof.query.member_id, 'eq.' + MEMBER); assert.equal(proof.query.salon_id, 'eq.' + SALON);
  assert(f.calls.indexOf(proof) < f.calls.findIndex(sensitiveRead));
});

test('The assigned guide can read without a roster row; a generic guide flag grants nothing', async t => {
  const f = await guideProgramFixture(t); f.signIn(GUIDE);
  for (const route of ['detail', 'sessions']) assert.equal((await f.read(route)).status, 200);
  f.signIn(OUTSIDER); f.auth.member.is_guide = true; f.calls.length = 0;
  for (const route of ['detail', 'sessions']) await failure(await f.read(route), 403);
  assert(!f.calls.some(sensitiveRead));
});

test('Membership in another program and caller-supplied member IDs cannot reveal this program', async t => {
  const f = await guideProgramFixture(t); f.signIn(OUTSIDER);
  for (const route of ['detail', 'sessions']) await failure(await f.read(route, SALON, '?member_id=' + MEMBER + '&guide_member_id=' + GUIDE), 403);
  assert(!f.calls.some(sensitiveRead));
  assert(f.calls.filter(call => call.table === 'salon_members').every(call => call.query.member_id === 'eq.' + OUTSIDER));
  assert.equal((await f.read('sessions', OTHER_SALON)).status, 200);
});

test('Removing membership or changing the assigned guide revokes the next read', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  assert.equal((await f.read('detail')).status, 200);
  await f.db.query('DELETE FROM salon_members WHERE salon_id=$1 AND member_id=$2', [SALON, MEMBER]);
  for (const route of ['detail', 'sessions']) await failure(await f.read(route), 403);
  f.signIn(GUIDE); assert.equal((await f.read('detail')).status, 200);
  await f.db.query('UPDATE salons SET guide_member_id=$1 WHERE id=$2', [OTHER_GUIDE, SALON]);
  for (const route of ['detail', 'sessions']) await failure(await f.read(route), 403);
});

test('Missing programs return not found without reading rosters or sessions', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  for (const route of ['detail', 'sessions']) await failure(await f.read(route, ABSENT_SALON), 404);
  assert(!f.calls.some(sensitiveRead));
});

test('Authorization query failures deny reads as unavailable without fetching private content', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  for (const table of ['salons', 'salon_members']) {
    f.calls.length = 0; f.failure = call => call.table === table;
    for (const route of ['detail', 'sessions']) await failure(await f.read(route), 503);
    assert(!f.calls.some(sensitiveRead));
  }
});

test('Authorized detail lookup failures never become a successful empty or partial detail', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  for (const [table, select, status] of [
    ['salons', 'id,title,status,week_number,max_members,topic_rotation,description,guide_member_id', 503],
    ['salon_members', 'role,sessions_attended,sessions_led,is_guide_candidate,members(display_name)', 500],
    ['salon_sessions', 'session_date,session_number,status,track,topic', 500],
    ['salon_sessions', 'status,session_date,attendance', 503],
    ['salons', 'week_number', 503],
    ['members', 'display_name,guide_level', 503],
  ]) {
    f.failure = call => call.table === table && call.query.select === select;
    await failure(await f.read('detail'), status);
  }
});

test('The sessions endpoint returns a bounded projection, a real empty list, or an explicit failure', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  const response = await f.read('sessions'); privateResponse(response);
  const body = await response.json(); assert.equal(body.sessions.length, 2);
  assert(!JSON.stringify(body).includes('PRIVATE_'));
  assert.deepEqual(Object.keys(body.sessions[0]).sort(), ['id', 'session_date', 'session_number', 'status', 'topic', 'track']);
  f.failure = call => call.table === 'salon_sessions'; await failure(await f.read('sessions'), 503);
  f.failure = null; await f.db.query('DELETE FROM salon_sessions WHERE salon_id=$1', [SALON]);
  assert.deepEqual(await (await f.read('sessions')).json(), { sessions: [] });
});

test('Statistics reject each failed source query instead of inventing zero counts', async t => {
  const f = await guideProgramFixture(t);
  for (const table of ['salon_members', 'salon_sessions', 'salons']) {
    f.failure = call => call.table === table;
    await assert.rejects(f.stats(SALON), /Program statistics unavailable/);
  }
  f.failure = null;
  await f.db.query('DELETE FROM salon_members WHERE salon_id=$1', [SALON]);
  await f.db.query('DELETE FROM salon_sessions WHERE salon_id=$1', [SALON]);
  const stats = await f.stats(SALON); assert.equal(stats.member_count, 0); assert.equal(stats.sessions_remaining, 0); assert.equal(stats.next_session, null);
});

test('Public listings retain their exact bounded projection and verified member count', async t => {
  const f = await guideProgramFixture(t);
  const response = await f.read('list'); assert.equal(response.status, 200); privateResponse(response);
  const body = await response.json(), row = body.salons.find(item => item.id === SALON);
  assert.equal(row.member_count, 1); assert.equal(row.guide_name, 'Fictional Guide');
  assert.deepEqual(Object.keys(row).sort(), ['description', 'guide_name', 'id', 'max_members', 'member_count', 'status', 'title', 'topic_rotation']);
  assert(!JSON.stringify(body).includes('PRIVATE_')); assert.equal(f.authCalls, 0);
});

test('Failed or missing public counts are unavailable, never zero members presented as known', async t => {
  const f = await guideProgramFixture(t);
  f.failure = call => call.method === 'HEAD'; await failure(await f.read('list'), 503);
  f.failure = null; f.missingCount = true; await failure(await f.read('list'), 503);
  f.missingCount = false; assert.equal((await f.read('list')).status, 200);
});

test('Listing failure differs from a genuinely empty list', async t => {
  const f = await guideProgramFixture(t);
  f.failure = call => call.table === 'salons'; await failure(await f.read('list'), 503);
  f.failure = null; await f.db.query("UPDATE salons SET status='completed'");
  assert.deepEqual(await (await f.read('list')).json(), { salons: [] });
});

test('Personal-program lookup stays bound to the current member and preserves its DTO', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  const response = await f.read('mine', SALON, '?member_id=' + OUTSIDER); assert.equal(response.status, 200); privateResponse(response);
  const body = await response.json(); assert.equal(body.salon.id, SALON); assert.equal(body.myMembership.sessions_attended, 3);
  assert(!JSON.stringify(body).includes('PRIVATE_'));
  const query = f.calls.find(call => call.query.select.startsWith('salon_id,'));
  assert.equal(query.query.member_id, 'eq.' + MEMBER);
  f.signIn(GUIDE); assert.deepEqual(await (await f.read('mine')).json(), { salon: null, members: [], sessions: [], stats: null, guide: null, myMembership: null });
});

test('Personal-program statistics and guide failures become generic private errors', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  for (const [table, select] of [['salon_sessions', 'status,session_date,attendance'], ['salons', 'week_number'], ['members', 'display_name,guide_level']]) {
    f.failure = call => call.table === table && call.query.select === select;
    await failure(await f.read('mine'), 503);
  }
});

test('A completed membership cannot hide an active program in either member lookup', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  await f.db.query('DELETE FROM salon_members WHERE member_id=$1', [MEMBER]);
  await f.db.query("UPDATE salons SET status='completed' WHERE id=$1", [OTHER_SALON]);
  await f.db.query('INSERT INTO salon_members(salon_id,member_id) VALUES ($1,$2),($3,$2)', [OTHER_SALON, MEMBER, SALON]);
  const response = await f.read('mine'); assert.equal(response.status, 200);
  assert.equal((await response.json()).salon.id, SALON);
  assert.equal((await f.memberSalon(MEMBER)).id, SALON);
  await f.db.query("UPDATE salons SET status='completed' WHERE id=$1", [SALON]);
  assert.equal((await (await f.read('mine')).json()).salon, null);
  assert.equal(await f.memberSalon(MEMBER), null);
});

test('Unexpected identity or data-client failures do not leak exception details', async t => {
  const f = await guideProgramFixture(t); f.signIn(MEMBER);
  f.authThrows = true;
  for (const route of ['detail', 'sessions', 'mine']) await failure(await f.read(route), 503);
  assert.equal(f.clientCreations, 0); f.authThrows = false; f.clientThrows = true;
  for (const route of ['detail', 'sessions', 'mine', 'list']) await failure(await f.read(route), 503);
  assert.deepEqual(f.calls, []);
});

test('The program authorization helper never adopts the shared chat general-room exception', async t => {
  const f = await guideProgramFixture(t);
  await failure(await f.access(f.client, MEMBER, 'general'), 404);
  await failure(await f.access(f.client, 'unverified', SALON), 404);
  assert.deepEqual(f.calls, []);
});
