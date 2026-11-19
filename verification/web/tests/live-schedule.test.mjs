import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE, PAST, UPCOMING, liveRoomFixture } from './support/live-room-fixture.mjs';
async function open(t) { const f = await liveRoomFixture(); t.after(() => f.db.close()); return f; }
async function payload(f) { const r = await f.list.GET(); assert.equal(r.status, 200); return r.json(); }

test('an absent event stays empty, without a computed Wednesday or calendar', async t => {
  const f = await open(t);
  await f.db.exec("UPDATE video_rooms SET room_type='hidden_fixture'");
  assert.deepEqual(await payload(f), { upcoming: null, past: [], nextSessionDate: null, calendarLinks: null });
  assert(f.calls.every(call => call.method === 'GET'));
});

test('an absent community and a failed lookup are different outcomes', async t => {
  const f = await open(t);
  await f.db.exec("UPDATE communities SET slug='hidden_fixture' WHERE slug='society-of-explorers'");
  assert.equal((await payload(f)).calendarLinks, null);
  await f.db.exec('REVOKE SELECT ON public.communities FROM service_role');
  const r = await f.list.GET(); assert.equal(r.status, 503);
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await r.json(), { error: 'Session schedule is temporarily unavailable.', code: 'LIVE_SCHEDULE_UNAVAILABLE' });
});

test('one recorded non-Wednesday session produces a single UTC event, with no invented end time', async t => {
  const f = await open(t);
  await f.db.query('UPDATE video_rooms SET is_live=false WHERE id=$1', [LIVE]);
  for (const date of ['2050-01-10T15:30:00Z', '2050-07-10T15:30:00Z']) {
    await f.db.query('UPDATE video_rooms SET scheduled_for=$1 WHERE id=$2', [date, UPCOMING]);
    const body = await payload(f);
    assert.equal(body.upcoming.id, UPCOMING);
    assert.equal(body.nextSessionDate, new Date(date).toISOString());
    const expected = date.replace(/[-:]/g, '');
    const url = new URL(body.calendarLinks.google);
    assert.equal(url.origin, 'https://calendar.google.com');
    assert.equal(url.searchParams.get('dates'), expected + '/' + expected);
    const ics = decodeURIComponent(body.calendarLinks.ics.split(',')[1]);
    assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
    assert.match(ics, new RegExp('DTSTART:' + expected));
    assert.match(ics, new RegExp('UID:soe-live-' + UPCOMING));
    assert.doesNotMatch(ics, /RRULE:|DTEND:|DURATION:/);
  }
});

test('a running session remains visible after the old one-hour window', async t => {
  const f = await open(t);
  await f.db.query("UPDATE video_rooms SET scheduled_for=now()-interval '1 day', started_at=now()-interval '2 hours' WHERE id=$1", [LIVE]);
  const body = await payload(f);
  assert.equal(body.upcoming.id, LIVE);
  assert.equal(body.calendarLinks, null);
  assert.equal(body.nextSessionDate, null);
});

test('a missed start is not described as a completed meeting', async t => {
  const f = await open(t);
  await f.db.query('UPDATE video_rooms SET is_live=false WHERE id=$1', [LIVE]);
  await f.db.query("UPDATE video_rooms SET scheduled_for=now()-interval '2 hours' WHERE id=$1", [UPCOMING]);
  const body = await payload(f);
  assert.equal(body.upcoming, null);
  assert.deepEqual(body.past.map(x => x.id), [PAST]);
});

test('room lookup failures do not silently become an empty schedule', async t => {
  const f = await open(t);
  await f.db.exec('REVOKE SELECT ON public.video_rooms FROM service_role');
  const r = await f.list.GET(); assert.equal(r.status, 503);
  assert.doesNotMatch(await r.text(), /video_rooms|permission denied|calendarLinks|daily\.co/);
});

test('malformed recorded data is unavailable, and fabricated calendar properties are ignored', async t => {
  const f = await open(t);
  await f.db.query("UPDATE video_rooms SET title='' WHERE id=$1", [LIVE]);
  assert.equal((await f.list.GET()).status, 503);
  assert.deepEqual(JSON.parse(JSON.stringify(f.schedule.readPublicLiveSchedule({ upcoming: null, past: [], nextSessionDate: '2050-01-10T15:30:00Z', calendarLinks: { google: 'javascript:bad' } }))),
    { upcoming: null, past: [], nextSessionDate: null, calendarLinks: null });
  for (const invalid of [null, {}, { upcoming: null, past: 'bad' }, { upcoming: { id: LIVE }, past: [] }]) {
    assert.equal(f.schedule.readPublicLiveSchedule(invalid), null);
  }
});

test('calendar text cannot inject another event, UTF-8 folds are bounded, and Eastern dates honor daylight time', async t => {
  const f = await open(t);
  await f.db.query('UPDATE video_rooms SET is_live=false WHERE id=$1', [LIVE]);
  await f.db.query('UPDATE video_rooms SET title=$1, scheduled_for=$2 WHERE id=$3', ['研究'.repeat(50) + ',test;\\\nBEGIN:VEVENT', '2050-01-10T15:30:00Z', UPCOMING]);
  const body = await payload(f);
  const ics = decodeURIComponent(body.calendarLinks.ics.split(',')[1]);
  assert.equal(ics.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
  for (const line of ics.split('\r\n')) assert(Buffer.byteLength(line) <= 75);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /\\,test\\;/);
  assert.match(f.schedule.liveSessionTime('2050-01-10T15:30:00Z'), /10:30 AM EST/);
  assert.match(f.schedule.liveSessionTime('2050-07-10T15:30:00Z'), /11:30 AM EDT/);
});


test('the existing creation default uses Eastern daylight transitions and preserves its host window', async t => {
  const f = await open(t);
  for (const [now, expected] of [
    ['2026-03-04T12:00:00Z', '2026-03-05T01:00:00.000Z'],
    ['2026-03-05T12:00:00Z', '2026-03-12T00:00:00.000Z'],
    ['2026-11-04T12:00:00Z', '2026-11-05T01:00:00.000Z'],
    ['2026-11-05T12:00:00Z', '2026-11-12T01:00:00.000Z'],
    ['2026-11-12T01:30:00Z', '2026-11-12T01:00:00.000Z'],
    ['2026-11-12T02:00:00Z', '2026-11-19T01:00:00.000Z'],
    ['2026-12-31T12:00:00Z', '2027-01-07T01:00:00.000Z'],
  ]) assert.equal(f.scheduler.getNextSessionDate(new Date(now)).toISOString(), expected);
});
