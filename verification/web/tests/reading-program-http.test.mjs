import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';

const plain = v => JSON.parse(JSON.stringify(v));
const app = offlineApp();
const { READING_EDITIONS } = app.load('lib/circles/reading-program.ts');
const edition = READING_EDITIONS.find(e => e.bookId === 'apology');
const program = { version: 1, bookId: edition.bookId, editionId: edition.editionId, sessions: [{ from: 0, to: 10 }] };
const key = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const circle = '33333333-3333-4333-8333-333333333333';
const input = { requestId: key, title: 'Source edition readers', description: null, format: 'online', city: null, region: null,
  venueName: null, venueType: 'online', weekday: 2, time: '19:00', timezone: 'America/New_York', startDate: '2026-11-03', maxMembers: 8,
  onlineUrl: 'https://meet.example.test/private', readingProgram: program };
const row = { id: circle, title: input.title, description: null, max_members: 8, start_date: input.startDate, status: 'forming', created_by: null, created_at: null,
  circle_format: 'online', circle_city: null, circle_region: null, circle_venue_name: null, circle_venue_type: 'online', circle_weekday: 2,
  circle_time: '19:00', circle_timezone: 'America/New_York', circle_hidden: false, circle_path_id: 'book-v1', circle_reading_program: program };

function fixture() {
  const a = offlineApp(), calls = [], { JULES } = a.fakes;
  a.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async () => ({ memberId: JULES }) }));
  a.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => ({ rpc: async (name, args) => {
    calls.push({ name, args: plain(args) }); return { error: null, data: { requestId: key, circleId: circle, replayed: false,
      receipt: { action: 'create', joined: true, completed: false, date: null, status: null },
      state: { revision: 1, isMember: true, isHost: true, hidden: false, completed: false, ended: false,
        canJoin: false, canLeave: true, canRsvp: true, canComplete: true, canReadConversation: true } } };
  } }) }));
  return { app: a, calls, req: body => a.fakes.makeReq(body, { url: 'https://offline.invalid/api/circles', headers: { origin: 'https://offline.invalid' } }) };
}

test('program normalization preserves omitted legacy payloads and rejects explicit null, forged pins, unsafe ranges and extra keys', () => {
  const { validateCircleInput } = app.load('lib/circles/schedule.ts');
  const old = { ...input }; delete old.readingProgram;
  const legacy = validateCircleInput(old, new Date('2026-11-03T12:00:00Z'));
  assert.equal(legacy.ok, true); assert.equal(Object.hasOwn(legacy.value, 'readingProgram'), false);
  const valid = validateCircleInput(input, new Date('2026-11-03T12:00:00Z')); assert.equal(valid.ok, true);
  assert.deepEqual(plain(valid.value.readingProgram), program);
  for (const value of [null, undefined, { ...program, editionId: program.editionId + 'x' }, { ...program, extra: true },
    { ...program, sessions: [] }, { ...program, sessions: [{ from: 0, to: edition.blockCount }] },
    { ...program, sessions: [{ from: 2, to: 1 }] }, { ...program, sessions: [{ from: 0.5, to: 3 }] }]) {
    assert.equal(validateCircleInput({ ...input, readingProgram: value }, new Date('2026-11-03T12:00:00Z')).ok, false);
  }
});

test('public book program uses its finite calendar, exact context, no invented starter reading, and fails closed on malformed stored programs', () => {
  const { toPublicCircle } = app.load('lib/circles/server.ts');
  const first = toPublicCircle(row, { memberCount: 1, hostName: 'Synthetic host' }, new Date('2026-11-03T12:00:00Z'));
  assert.equal(first.program_length, 1); assert.equal(first.reading, null); assert.deepEqual(plain(first.reading_program), program);
  assert.equal(first.week, 1); assert.equal(first.next_meeting, '2026-11-03');
  const ended = toPublicCircle(row, { memberCount: 1, hostName: null }, new Date('2026-11-04T12:00:00Z'));
  assert.equal(ended.program_length, 1); assert.equal(ended.week, 2); assert.equal(ended.next_meeting, null); assert.equal(ended.spots_left, 0);
  for (const bad of [{ ...row, circle_reading_program: { ...program, sessions: [] } }, { ...row, circle_reading_program: null }, { ...row, circle_path_id: 'starter-12' }]) {
    assert.throws(() => toPublicCircle(bad, { memberCount: 1, hostName: null }));
  }
});

test('discovery preserves valid pair or range hints, searches canonical book authors and never broadens malformed contexts', () => {
  const { toPublicCircle } = app.load('lib/circles/server.ts');
  const { parseDiscoveryQuery, discoverySearchParams, discoverCircles } = app.load('lib/circles/discovery.ts');
  const inventory = [toPublicCircle(row, { memberCount: 1, hostName: null }, new Date('2026-11-03T12:00:00Z'))];
  for (const range of ['', '&from=20&to=30']) {
    const raw = `book=${edition.bookId}&edition=${edition.editionId}${range}`;
    const q = parseDiscoveryQuery(new URLSearchParams(raw));
    assert.equal(q.invalidContext, undefined); assert.equal(discoverySearchParams(q).toString(), raw);
    assert.equal(discoverCircles(inventory, { ...q, q: 'Plato' }).length, 1);
  }
  const other = READING_EDITIONS.find(e => e.bookId !== edition.bookId);
  assert.equal(discoverCircles(inventory, parseDiscoveryQuery(new URLSearchParams({ book: other.bookId, edition: other.editionId }))).length, 0);
  for (const query of [`book=${edition.bookId}`, `book=${edition.bookId}&edition=wrong`, `book=${edition.bookId}&book=${edition.bookId}&edition=${edition.editionId}`,
    `book=${edition.bookId}&edition=${edition.editionId}&from=0`, `book=${edition.bookId}&edition=${edition.editionId}&from=00&to=1`,
    `book=${edition.bookId}&edition=${edition.editionId}&from=0&to=${edition.blockCount}`, `from=0&to=1`]) {
    const q = parseDiscoveryQuery(new URLSearchParams(query)); assert.equal(q.invalidContext, true, query);
    assert.equal(discoverCircles(inventory, q).length, 0); assert.throws(() => discoverySearchParams(q));
  }
});

test('invalid discovery context returns 400 before an admin client or database read exists', async () => {
  const a = offlineApp(); let accessed = false;
  a.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => { accessed = true; throw Error('No database expected'); } }));
  const route = a.load('app/api/circles/route.ts');
  const res = await route.GET(a.fakes.makeReq(undefined, { url: 'https://offline.invalid/api/circles?book=apology' }));
  assert.equal(res.status, 400); assert.deepEqual((await res.json()).circles, []); assert.equal(accessed, false);
});

test('creation verifies actual local reader bytes and exact pinned TOC before invoking one canonical SQL operation', async () => {
  const a = fixture(), route = a.app.load('app/api/circles/route.ts');
  const res = await route.POST(a.req(input)); assert.equal(res.status, 200, await res.clone().text());
  assert.equal(a.calls.length, 1); assert.equal(a.calls[0].name, 'soe_circle_create');
  assert.deepEqual(a.calls[0].args.p_input.readingProgram, program);
  assert.equal(a.calls[0].args.p_input.requestId, undefined);
});

test('changed or unavailable edition rejects before mutation, with generic errors and not_attempted outcome', async () => {
  for (const changed of ['id', 'contents', 'unavailable']) {
    const a = fixture(); const actual = app.load('lib/books/editions.ts');
    a.app.setMock('@/lib/books/editions', () => ({ readBookEdition: async book => {
      if (changed === 'unavailable') throw Error('PRIVATE_STORAGE_DETAIL');
      const meta = plain(await actual.readBookEdition(book));
      if (changed === 'id') meta.edition.editionId += 'x'; else meta.edition.contents = [];
      return meta;
    } }));
    const res = await a.app.load('app/api/circles/route.ts').POST(a.req(input));
    assert.equal(res.status, changed === 'unavailable' ? 503 : 409);
    const body = await res.json(); assert.equal(body.outcome, 'not_attempted'); assert.doesNotMatch(JSON.stringify(body), /PRIVATE_STORAGE_DETAIL/);
    assert.equal(a.calls.length, 0);
  }
});
