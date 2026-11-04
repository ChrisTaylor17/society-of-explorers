import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { offlineApp } from './support/offline-app.mjs';

const app = offlineApp(), lib = app.load('lib/circles/discovery-page.ts');
const catalog = app.load('lib/circles/discovery-catalog.ts'), { toPublicCircle } = app.load('lib/circles/server.ts');
const { READING_EDITIONS } = app.load('lib/circles/reading-program.ts');
const id = '11111111-1111-4111-8111-111111111111';
const row = { id, title: 'A welcoming reading Circle', description: 'A public description.', max_members: 8, start_date: '2030-01-01',
  status: 'forming', created_by: null, created_at: null, circle_format: 'in_person', circle_city: 'Montréal', circle_region: 'QC',
  circle_venue_name: 'Public library', circle_venue_type: 'library', circle_weekday: 2, circle_time: '19:00', circle_timezone: 'UTC',
  circle_hidden: false, circle_path_id: 'starter-12', circle_reading_program: null };
const at = '2029-12-20T12:00:00.123456Z';
const circle = extra => ({ ...toPublicCircle(row, { memberCount: 2, hostName: 'Fictional Host' }, new Date(at)), phase: 'upcoming', ...extra });
const response = extra => ({ ready: true, circles: [circle()], page: { limit: 25, nextCursor: null, asOf: at }, ...extra });
const clone = value => JSON.parse(JSON.stringify(value));

test('public query roundtrip preserves all filters and a separate opaque continuation', () => {
  const edition = READING_EDITIONS[0];
  const params = new URLSearchParams({ q: '  Plato   virtue  ', city: 'Montréal', format: 'online', open: '1', sort: 'title',
    book: edition.bookId, edition: edition.editionId, from: '0', to: '1', limit: '3', cursor: 'eyJwdWJsaWMiOnRydWV9' });
  const parsed = lib.parseDiscoveryPageRequest(params); assert.equal(parsed.ok, true);
  assert.equal(parsed.value.query.q, 'Plato virtue'); assert.equal(parsed.value.query.from, 0); assert.equal(parsed.value.query.to, 1);
  assert.equal(parsed.value.cursor, params.get('cursor')); assert.equal(parsed.value.limit, 3);
  assert.deepEqual(clone(lib.parseDiscoveryPageRequest(lib.discoveryPageSearchParams(parsed.value)).value), clone(parsed.value));
  const reset = lib.discoveryPageSearchParams({ ...parsed.value, cursor: null }); assert.equal(reset.has('cursor'), false);
});

for (const query of ['q=a&q=b', 'cursor=a&cursor=b', 'limit=0', 'limit=26', 'limit=01', 'limit=2.5', 'cursor=', 'cursor=a=b',
  'memberId=private', 'format=hybrid', 'open=true', 'sort=private', 'book=republic', 'from=0&to=1', 'q=' + 'x'.repeat(161)]) {
  test(`invalid or ambiguous public navigation refuses: ${query.slice(0, 70)}`, () => assert.equal(lib.parseDiscoveryPageRequest(new URLSearchParams(query)).ok, false));
}

test('literal wildcard-looking and accented queries remain plain public strings', () => {
  const parsed = lib.parseDiscoveryPageRequest(new URLSearchParams({ q: '100% _ C++ [Plato]', city: 'Québec' }));
  assert.equal(parsed.ok, true); assert.equal(parsed.value.query.q, '100% _ C++ [Plato]');
  assert.equal(catalog.discoveryTerms('  CAFÉ ΣΟΣ ΟΣ 100% _  ').join('|'), 'cafe|σος|ος|100%|_');
});

test('public projection is copied through a whitelist including nested reading/program fields', () => {
  const source = circle({ created_by: 'PRIVATE_ACTOR', members: ['PRIVATE_MEMBER'], online_url: 'PRIVATE_URL', reports: 'PRIVATE_REPORT' });
  source.reading = { ...source.reading, secret: 'PRIVATE_READING' };
  const parsed = lib.parsePublicDiscoveryCircle(source); assert.ok(parsed);
  assert.doesNotMatch(JSON.stringify(parsed), /PRIVATE_|created_by|"members":|online_url|reports|secret/);
  assert.equal(parsed.phase, 'upcoming'); assert.equal(parsed.spots_left, 6);
});

test('full and upcoming public phases keep exact capacities and finite reading dates', () => {
  assert.equal(lib.parsePublicDiscoveryCircle(circle({ member_count: 12, spots_left: 0 })).spots_left, 0);
  for (const extra of [{ spots_left: 8 }, { max_members: 2 }, { member_count: -1 }, { next_meeting: '2030-01-02' },
    { week: 13 }, { status: 'completed' }, { phase: 'forming' }, { start_date: null }, { time: null }, { timezone: 'Private/Unknown' }]) {
    assert.equal(lib.parsePublicDiscoveryCircle(circle(extra)), null, JSON.stringify(extra));
  }
});

test('safe posted host labels require scalar-safe bounds and never include email-shaped names', () => {
  for (const name of ['Reader@private.invalid', 'Bad\nHost', 'Bad\tHost', 'Bad\rHost', '\uD800', 'x'.repeat(41), '   ']) {
    assert.equal(lib.parsePublicDiscoveryCircle(circle({ host_name: name })), null);
  }
  assert.equal(lib.parsePublicDiscoveryCircle(circle({ host_name: '🙂'.repeat(20) })).host_name.length, 40);
});

test('source-edition programs are strict copied values while private range claims confer no filter authority', () => {
  const edition = READING_EDITIONS[0], program = { version: 1, bookId: edition.bookId, editionId: edition.editionId, sessions: [{ from: 0, to: 0 }] };
  const projected = { ...toPublicCircle({ ...row, circle_path_id: 'book-v1', circle_reading_program: program }, { memberCount: 0, hostName: 'Explorer' }, new Date(at)), phase: 'upcoming' };
  const parsed = lib.parsePublicDiscoveryCircle(projected); assert.equal(parsed.program_length, 1); assert.equal(parsed.reading, null);
  assert.equal(lib.parsePublicDiscoveryCircle({ ...projected, reading_program: { ...program, private: 'not-authority' } }), null);
  const query = lib.parseDiscoveryPageRequest(new URLSearchParams({ book: edition.bookId, edition: edition.editionId, from: '0', to: '1' })).value.query;
  const sql = catalog.toDiscoverySqlQuery(query); assert.equal(sql.book, edition.bookId); assert.equal(sql.edition, edition.editionId);
  assert.equal(Object.hasOwn(sql, 'from'), false); assert.equal(Object.hasOwn(sql, 'to'), false);
});

test('page parser refuses duplicate IDs, oversized pages, repeated cursors and false global totals', () => {
  const parsed = lib.parseDiscoveryPage(response({ globalTotal: 999, private: 'PRIVATE_RAW' }));
  assert.ok(parsed); assert.equal(Object.hasOwn(parsed, 'globalTotal'), false); assert.doesNotMatch(JSON.stringify(parsed), /PRIVATE_RAW/);
  for (const value of [response({ circles: [circle(), circle()] }), response({ circles: Array.from({ length: 26 }, () => circle()) }),
    response({ page: { limit: 25, nextCursor: 'eyJhIjoxfQ', asOf: at } }), response({ page: { limit: 0, nextCursor: null, asOf: at } }),
    response({ page: { limit: 25, nextCursor: null, asOf: '2029-02-30T00:00:00Z' } })]) assert.equal(lib.parseDiscoveryPage(value), null);
  const page = response({ page: { limit: 1, nextCursor: 'eyJhIjoxfQ', asOf: at } });
  assert.ok(lib.parseDiscoveryPage(page, { limit: 1 })); assert.equal(lib.parseDiscoveryPage(page, { limit: 1, cursor: 'eyJhIjoxfQ' }), null);
  assert.equal(lib.parseDiscoveryPage(page, { limit: 2 }), null);
});

test('calendar dates and database microsecond timestamps are validated without inventing legacy dates', () => {
  assert.equal(lib.isDiscoveryDay('2028-02-29'), true);
  for (const date of ['0000-01-01', '2029-02-29', '2030-02-30', 'infinity', null]) assert.equal(lib.isDiscoveryDay(date), false);
  assert.equal(lib.isDiscoveryTimestamp(at), true);
  for (const date of ['2030-02-30T00:00:00Z', '2030-01-01T24:00:00Z', '2030-01-01T00:00:60Z', 'infinity', null]) assert.equal(lib.isDiscoveryTimestamp(date), false);
  assert.equal(lib.isDiscoveryRestart({ restart_required: true }), true); assert.equal(lib.isDiscoveryRestart({ error: 'timeout' }), false);
});

test('trusted search catalog derives metadata only from the eight pinned editions and twelve starter readings', () => {
  const data = catalog.DISCOVERY_SEARCH_CATALOG;
  assert.equal(data.starter.length, 12); assert.equal(data.editions.length, 8);
  assert.deepEqual(clone(data.editions.map(e => [e.bookId, e.editionId, e.blockCount])), clone(READING_EDITIONS.map(e => [e.bookId, e.editionId, e.blockCount])));
  assert.equal(catalog.DISCOVERY_CATALOG_HASH, createHash('sha256').update(JSON.stringify(data)).digest('hex'));
  assert.doesNotMatch(JSON.stringify(data), /online_url|created_by|member_id|reports|https:\/\//);
});
