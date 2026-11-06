import assert from 'node:assert/strict';
import { test } from 'node:test';
import { A, B, LIVE, PAST, LEGACY, FOREIGN, UPCOMING, LINK, liveRoomFixture } from './support/live-room-fixture.mjs';

const origin = 'https://soe.invalid';
function request(path, { actor, body, headers = {} } = {}) {
  return new Request(origin + path, {
    method: body ? 'POST' : 'GET',
    ...(body && { body: JSON.stringify(body) }),
    headers: { ...headers, ...(actor && { 'x-fixture-actor': actor }) },
  });
}
function action(fixture, id, type, options = {}) {
  return fixture.action.POST(request('/api/live/' + id, {
    ...options, body: { action: type, memberId: B },
  }), { params: Promise.resolve({ sessionId: id }) });
}
async function open(t) {
  const fixture = await liveRoomFixture();
  t.after(() => fixture.db.close());
  return fixture;
}
async function joined(fixture) {
  const { rows } = await fixture.db.query('SELECT member_id, joined_at::text FROM room_participants WHERE room_id = $1 ORDER BY member_id', [LIVE]);
  return rows;
}

test('public schedule preserves its calendar and withholds links, summaries and other communities', async t => {
  const fixture = await open(t);
  const response = await fixture.list.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const payload = await response.json();
  assert.equal(payload.upcoming.id, LIVE);
  assert.deepEqual(payload.past.map(row => row.id), [PAST]);
  assert.deepEqual(Object.keys(payload.upcoming).sort(),
    ['ended_at', 'id', 'is_live', 'room_type', 'scheduled_for', 'started_at', 'title']);
  assert.match(payload.calendarLinks.google, /^https:\/\/calendar.google.com\//);
  assert.match(decodeURIComponent(payload.calendarLinks.ics), /BEGIN:VCALENDAR/);
  assert.doesNotMatch(JSON.stringify(payload), /daily\.co|PRIVATE_|metadata/);
});

test('generic room routes preserve old null-typed rooms and cannot expose or mutate Live Council rooms', async t => {
  const fixture = await open(t);
  const req = Object.assign(request('/api/rooms', { actor: A }), { nextUrl: new URL(origin + '/api/rooms') });
  const response = await fixture.rooms.GET(req);
  assert.equal(response.status, 200);
  const { rooms } = await response.json();
  assert.deepEqual(rooms.map(room => room.id), [LEGACY]);
  assert.equal(rooms[0].daily_room_url, 'https://soe-fixture.daily.co/old-open');
  assert(!Object.hasOwn(rooms[0], 'metadata'));
  const denied = await fixture.room.POST(request('/api/rooms/' + LIVE, {
    actor: A, body: { action: 'end' },
  }), { params: Promise.resolve({ roomId: LIVE }) });
  // This inherited UUID gate rejects standard room IDs before a write.
  assert.equal(denied.status, 400);
  assert.equal((await fixture.db.query('SELECT is_live FROM video_rooms WHERE id=$1', [LIVE])).rows[0].is_live, true);
});

test('anonymous and cross-origin join attempts are refused before room access', async t => {
  const fixture = await open(t);
  assert.equal((await action(fixture, LIVE, 'join')).status, 401);
  assert.equal((await action(fixture, LIVE, 'join', {
    actor: A, headers: { origin: 'https://other.invalid' },
  })).status, 403);
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(await joined(fixture), []);
});

test('one deliberate verified member joins the exact live session, with a stable retry', async t => {
  const fixture = await open(t);
  const response = await action(fixture, LIVE, 'join', { actor: A });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('referrer-policy'), /no-referrer/);
  assert.deepEqual(await response.json(), { success: true, dailyUrl: LINK });
  const original = await joined(fixture);
  assert.deepEqual(original.map(row => row.member_id), [A]);
  assert.equal((await action(fixture, LIVE, 'join', { actor: A })).status, 200);
  assert.deepEqual(await joined(fixture), original);
});

test('closed, future, foreign, generic and unsafe URLs cannot create an attendance record', async t => {
  const fixture = await open(t);
  for (const id of [PAST, FOREIGN, LEGACY, UPCOMING]) {
    assert.equal((await action(fixture, id, 'join', { actor: A })).status, 404);
  }
  for (const url of ['https://daily.co.evil.invalid/live-fixture', 'https://soe-fixture.daily.co/wrong-room',
    'https://name:pass@soe-fixture.daily.co/live-fixture', LINK + '?t=opaque']) {
    await fixture.db.query('UPDATE video_rooms SET daily_room_url=$1 WHERE id=$2', [url, LIVE]);
    const refused = await action(fixture, LIVE, 'join', { actor: A });
    assert.equal(refused.status, 409);
    assert(!Object.hasOwn(await refused.json(), 'dailyUrl'));
  }
  assert.deepEqual(await joined(fixture), []);
  assert.equal(fixture.calls.filter(call => call.path.includes('/rpc/')).length, 0);
});

test('rotation or closure between URL check and write returns a conflict with no link or attendance', async t => {
  const fixture = await open(t);
  fixture.onJoin(() => fixture.db.query("UPDATE video_rooms SET daily_room_url='https://different.daily.co/live-fixture' WHERE id=$1", [LIVE]));
  const rotation = await action(fixture, LIVE, 'join', { actor: A });
  assert.equal(rotation.status, 409);
  assert.doesNotMatch(await rotation.text(), /daily\.co/);
  fixture.onJoin(() => fixture.db.query('UPDATE video_rooms SET is_live=false, ended_at=now() WHERE id=$1', [LIVE]));
  const closure = await action(fixture, LIVE, 'join', { actor: A });
  assert.equal(closure.status, 409);
  assert.doesNotMatch(await closure.text(), /daily\.co/);
  assert.deepEqual(await joined(fixture), []);
});

test('managers can end and start the designated Council; transcript summaries are retired', async t => {
  const fixture = await open(t);
  assert.equal((await action(fixture, LIVE, 'end', { actor: B })).status, 403);
  assert.equal((await action(fixture, FOREIGN, 'end', { actor: A })).status, 404);
  assert.equal((await action(fixture, LIVE, 'end', { actor: A })).status, 200);
  const beforeSummary = fixture.calls.length;
  assert.equal((await action(fixture, LIVE, 'summarize', { actor: A })).status, 410);
  assert.equal(fixture.calls.length, beforeSummary);
  const started = await fixture.list.POST(request('/api/live', { actor: A, body: { action: 'go_live' } }));
  assert.equal(started.status, 200);
  const { session } = await started.json();
  assert.equal(session.id, UPCOMING);
  assert.equal(session.is_live, true);
  assert(!Object.hasOwn(session, 'daily_room_url'));
  assert(!fixture.calls.some(call => call.path.includes('room_transcripts')));
});
