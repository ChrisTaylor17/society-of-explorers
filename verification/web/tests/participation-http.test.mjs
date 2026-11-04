import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';

const CIRCLE = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const ORIGIN = 'https://offline.invalid';
const DATE = '2026-11-03';
const plain = value => JSON.parse(JSON.stringify(value));
const context = id => ({ params: Promise.resolve({ circleId: id }) });
const capabilities = (extra = {}) => ({ canJoin: false, canLeave: true, canRsvp: true, canComplete: false, canReadConversation: true, ...extra });
const createBody = (extra = {}) => ({ requestId: KEY, title: 'Fictional Readers', description: null, format: 'hybrid', city: 'Boston', region: 'MA', venueName: 'Main Library', venueType: 'library', weekday: 2, time: '19:00', timezone: 'America/New_York', startDate: DATE, maxMembers: 8, onlineUrl: 'https://meet.example.test/fictional', ...extra });
const snapshot = (extra = {}) => ({ kind: 'circle', circle: { id: CIRCLE, title: 'Fictional Readers', description: null, max_members: 8, start_date: `${DATE}T00:00:00+00:00`, status: 'forming', created_at: `${DATE}T00:00:00Z`,
  circle_format: 'hybrid', circle_city: 'Boston', circle_region: 'MA', circle_venue_name: 'Main Library', circle_venue_type: 'library', circle_weekday: 2, circle_time: '19:00', circle_timezone: 'America/New_York', circle_hidden: false, circle_reading_program: null },
  memberCount: 2, hostName: 'Fictional Host', revision: 3, ended: false, nextMeeting: DATE,
  meetings: [{ date: DATE, going: 1, my_status: 'going' }], online_url: 'https://meet.example.test/fictional',
  viewer: { signed_in: true, is_member: true, is_host: false }, capabilities: capabilities(), ...extra });
const management = (extra = {}) => ({ kind: 'management', circle: { id: CIRCLE, title: 'Fictional Readers', hidden: false }, revision: 3,
  viewer: { signed_in: true, is_member: true, is_host: false }, capabilities: { canLeave: true, canComplete: false }, ...extra });
const receipt = (action = 'join', extra = {}) => ({ requestId: KEY, circleId: CIRCLE,
  receipt: { action, joined: action !== 'leave', completed: action === 'complete', date: action === 'rsvp' ? DATE : null, status: action === 'rsvp' ? 'going' : null },
  state: { revision: 4, isMember: action !== 'leave', isHost: action === 'create' || action === 'complete', hidden: false, completed: action === 'complete', ended: action === 'complete',
    ...capabilities({ canLeave: action !== 'leave', canRsvp: !['leave', 'complete'].includes(action), canComplete: action === 'create', canReadConversation: action !== 'leave' }) }, replayed: false, ...extra });

function fixture() {
  const app = offlineApp(), { ADA, JULES } = app.fakes;
  app.setUser({ id: 'fixture-jules', user_metadata: { role: 'admin', memberId: ADA } });
  const db = app.fakes.resetDb({ members: [{ id: JULES, supabase_auth_id: 'fixture-jules', display_name: 'Jules' }, { id: ADA, display_name: 'Ada' }],
    book_cohorts: [{ id: CIRCLE, book_id: 'soe-circles-path', title: 'Fictional Readers', status: 'forming', max_members: 8 }], book_cohort_members: [], circle_rsvps: [], circle_private: [] });
  const calls = [];
  const a = { app, db, ADA, JULES, calls, respond: () => ({ data: null, error: null }) };
  db.rpc = async (name, args) => { calls.push({ name, args: plain(args) }); return a.respond(name, args); };
  a.load = name => app.load(`app/api/circles/${name ? name + '/' : ''}route.ts`);
  a.request = (body, path = '/api/circles', headers = { origin: ORIGIN }) => app.fakes.makeReq(body, { url: ORIGIN + path, headers });
  return a;
}
function privateHeaders(response) {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.match(response.headers.get('vary'), /Cookie/); assert.match(response.headers.get('vary'), /Authorization/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('hosting eligibility is canonical, explicit, bounded and private', async () => {
  const a = fixture(); a.respond = () => ({ data: { canCreate: true, activeHosted: 1, maxActiveHosted: 3, otherActor: a.ADA }, error: null });
  const response = await a.load('start').GET(a.request(undefined));
  assert.equal(response.status, 200); privateHeaders(response);
  assert.deepEqual(await response.json(), { canCreate: true, activeHosted: 1, maxActiveHosted: 3 });
  assert.deepEqual(a.calls, [{ name: 'soe_circle_start', args: { p_actor: a.JULES } }]);
  a.app.setUser(null); assert.equal((await a.load('start').GET(a.request(undefined))).status, 401);
});

test('create requires a UUID receipt key and supported fields before the atomic RPC', async () => {
  const a = fixture();
  for (const body of [createBody({ requestId: undefined }), createBody({ requestId: 'bad' }), createBody({ memberId: a.ADA }), createBody({ created_by: a.ADA }), createBody({ role: 'admin' }), createBody({ title: 'x' }), createBody({ startDate: '2026-02-30' })]) {
    const response = await a.load('').POST(a.request(body)); assert.equal(response.status, 400);
    assert.equal((await response.json()).outcome, 'not_attempted');
  }
  assert.equal(a.calls.length, 0); assert.equal(a.db.log.some(row => row.op !== 'select'), false);
});

test('create delegates one normalized payload to SQL without a sequential REST fallback', async () => {
  const a = fixture(); a.respond = () => ({ data: receipt('create'), error: null });
  const response = await a.load('').POST(a.request(createBody({ title: '  Fictional   Readers ' })));
  assert.equal(response.status, 200); privateHeaders(response);
  assert.equal((await response.json()).circleId, CIRCLE);
  assert.equal(a.calls.length, 1); assert.equal(a.calls[0].name, 'soe_circle_create');
  assert.equal(a.calls[0].args.p_actor, a.JULES); assert.equal(a.calls[0].args.p_request_id, KEY);
  assert.equal(a.calls[0].args.p_input.title, 'Fictional Readers'); assert.equal(a.calls[0].args.p_input.requestId, undefined);
  assert.equal(a.db.log.some(row => row.op !== 'select'), false);
});

test('Circle mutations enforce origin and actual streamed byte limits', async () => {
  const a = fixture();
  for (const headers of [{ origin: 'https://evil.invalid' }, { origin: ORIGIN, 'sec-fetch-site': 'cross-site' }, { cookie: 'session=fictional' }]) {
    const response = await a.load('[circleId]/join').POST(a.request({ requestId: KEY, expectedRevision: 3 }, '/api/circles/x/join', headers), context(CIRCLE));
    assert.equal(response.status, 403); assert.equal((await response.json()).outcome, 'not_attempted');
  }
  const request = a.request(undefined); let cancelled = false;
  request.body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(12_001))); }, cancel() { cancelled = true; } });
  const response = await a.load('').POST(request); assert.equal(response.status, 413); assert.equal(cancelled, true);
  assert.equal(a.calls.length, 0);
});

test('join, leave, RSVP and completion forward only the canonical actor and revision-bound request', async () => {
  const a = fixture();
  for (const action of ['join', 'leave', 'rsvp', 'complete']) {
    a.respond = () => ({ data: receipt(action), error: null });
    const body = { requestId: KEY, expectedRevision: 3, ...(action === 'rsvp' ? { date: DATE, status: 'going' } : {}) };
    const response = await a.load(`[circleId]/${action}`).POST(a.request(body), context(CIRCLE));
    assert.equal(response.status, 200, action); assert.equal((await response.json()).receipt.action, action);
    assert.deepEqual(a.calls.at(-1), { name: `soe_circle_${action}`, args: { p_actor: a.JULES, p_circle_id: CIRCLE, p_expected_revision: 3, p_request_id: KEY,
      ...(action === 'rsvp' ? { p_date: DATE, p_status: 'going' } : {}) } });
  }
});

test('old unkeyed/forged/stale-shape Circle mutations are explicit refusals', async () => {
  const a = fixture();
  for (const body of [{}, { requestId: KEY }, { requestId: KEY, expectedRevision: -1 }, { requestId: KEY, expectedRevision: 3, memberId: a.ADA }, { requestId: KEY, expectedRevision: 3, cohortId: CIRCLE }]) {
    assert.equal((await a.load('[circleId]/join').POST(a.request(body), context(CIRCLE))).status, 400);
  }
  assert.equal((await a.load('[circleId]/rsvp').POST(a.request({ requestId: KEY, expectedRevision: 3, date: DATE, status: 'maybe' }), context(CIRCLE))).status, 400);
  assert.equal(a.calls.length, 0);
});

test('SQL conflicts/authorization/schema errors stay generic; ambiguous transport and malformed confirmations remain unknown', async () => {
  const a = fixture();
  for (const [code, status] of [['PT400', 400], ['PT403', 403], ['PT404', 404], ['PT409', 409], ['PT503', 503], ['PGRST202', 503], ['42883', 503], ['42P01', 503]]) {
    a.respond = () => ({ data: null, error: { code, message: 'PRIVATE_DATABASE_ERROR' } });
    const response = await a.load('[circleId]/join').POST(a.request({ requestId: KEY, expectedRevision: 3 }), context(CIRCLE));
    assert.equal(response.status, status); const value = await response.json(); assert.equal(value.outcome, 'not_attempted'); assert.doesNotMatch(JSON.stringify(value), /PRIVATE_DATABASE/);
  }
  for (const respond of [() => { throw Error('PRIVATE_NETWORK'); }, () => ({ data: {}, error: null }), () => ({ data: receipt('join', { circleId: OTHER }), error: null })]) {
    a.respond = respond; const response = await a.load('[circleId]/join').POST(a.request({ requestId: KEY, expectedRevision: 3 }), context(CIRCLE));
    assert.equal(response.status, 503); assert.equal((await response.json()).outcome, 'unknown');
  }
});

test('replayed original join receipt may truthfully show a later current departure', async () => {
  const a = fixture(); const replay = receipt('join', { replayed: true });
  replay.state = { ...replay.state, revision: 9, isMember: false, ...capabilities({ canJoin: true, canLeave: false, canRsvp: false, canReadConversation: false }) };
  a.respond = () => ({ data: replay, error: null });
  const response = await a.load('[circleId]/join').POST(a.request({ requestId: KEY, expectedRevision: 3 }), context(CIRCLE));
  assert.equal(response.status, 200); const value = await response.json(); assert.equal(value.receipt.joined, true); assert.equal(value.state.isMember, false); assert.equal(value.state.revision, 9);
});

test('receipt semantics reject forged action events and impossible completed capabilities', async () => {
  const a = fixture();
  for (const mutate of [r => { r.receipt.joined = false; }, r => { r.state.completed = true; }, r => { r.state.completed = true; r.state.ended = true; r.state.canJoin = true; }, r => { r.requestId = OTHER; }]) {
    const bad = receipt('join'); mutate(bad); a.respond = () => ({ data: bad, error: null });
    const response = await a.load('[circleId]/join').POST(a.request({ requestId: KEY, expectedRevision: 3 }), context(CIRCLE));
    assert.equal(response.status, 503); assert.equal((await response.json()).outcome, 'unknown');
  }
});

test('detail projects a consistent RPC snapshot and never exposes other member IDs or private raw fields', async () => {
  const a = fixture(); const data = snapshot(); data.circle.created_by = a.ADA; data.roster = [a.ADA]; data.report_note = 'PRIVATE_REPORT';
  a.respond = () => ({ data, error: null });
  const response = await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE));
  assert.equal(response.status, 200); privateHeaders(response); const value = await response.json();
  assert.equal(value.circle.next_meeting, DATE); assert.equal(value.circle.reading.week, 1); assert.equal(value.online_url, 'https://meet.example.test/fictional');
  assert.doesNotMatch(JSON.stringify(value), /created_by|roster|PRIVATE_REPORT/); assert.equal(JSON.stringify(value).includes(a.ADA), false);
  assert.deepEqual(a.calls[0], { name: 'soe_circle_detail', args: { p_actor: a.JULES, p_circle_id: CIRCLE } });
  assert.equal(a.db.log.some(row => row.table !== 'members'), false);
});

test('public detail keeps all private URLs and caller RSVP status absent', async () => {
  const a = fixture(); a.app.setUser(null);
  const data = snapshot({ viewer: { signed_in: false, is_member: false, is_host: false }, online_url: null,
    meetings: [{ date: DATE, going: 1, my_status: null }], capabilities: capabilities({ canLeave: false, canRsvp: false, canReadConversation: false }) });
  a.respond = () => ({ data, error: null });
  assert.equal((await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE))).status, 200);
  data.online_url = 'https://meet.example.test/SECRET';
  assert.equal((await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE))).status, 503);
});

test('hidden members retain a minimal leave state while hidden outsiders and URL leakage fail closed', async () => {
  const a = fixture(); const data = snapshot({ meetings: [], online_url: null, nextMeeting: null,
    capabilities: capabilities({ canRsvp: false, canReadConversation: false }) }); data.circle.circle_hidden = true;
  a.respond = () => ({ data, error: null });
  const response = await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE));
  assert.equal(response.status, 200); const value = await response.json(); assert.equal(value.circle.hidden, true); assert.equal(value.capabilities.canLeave, true); assert.equal(value.online_url, null);
  data.online_url = 'https://meet.example.test/SECRET';
  assert.equal((await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE))).status, 503);
  data.online_url = null; data.meetings = [{ date: DATE, going: 0, my_status: null }];
  assert.equal((await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE))).status, 503);
  data.meetings = [];
  data.viewer.is_member = false;
  assert.equal((await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE))).status, 503);
});

test('completed/ended member detail has no future meetings but preserves conversation and leaving capability', async () => {
  const a = fixture(); const data = snapshot({ ended: true, nextMeeting: null, meetings: [], capabilities: capabilities({ canRsvp: false }) }); data.circle.status = 'completed';
  a.respond = () => ({ data, error: null });
  const response = await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE));
  assert.equal(response.status, 200); const value = await response.json(); assert.equal(value.circle.next_meeting, null); assert.equal(value.capabilities.canReadConversation, true); assert.equal(value.circle.spots_left, 0);
});

test('malformed detail and infrastructure failure cannot become empty membership, no RSVP or missing URL', async () => {
  const a = fixture();
  for (const data of [null, {}, snapshot({ memberCount: null }), snapshot({ meetings: null }), snapshot({ online_url: null }), snapshot({ online_url: undefined }), snapshot({ revision: -1 }), snapshot({ viewer: null })]) {
    a.respond = () => ({ data, error: null }); assert.equal((await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE))).status, 503);
  }
  a.respond = () => ({ data: null, error: { code: '42P01', message: 'PRIVATE_DATABASE' } });
  const response = await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE)); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE_DATABASE/);
});

test('a missing raw RPC reading-program field refuses detail and My Circles instead of silently assigning the starter path', async () => {
  const a = fixture(), missing = snapshot(); delete missing.circle.circle_reading_program;
  a.respond = () => ({ data: missing, error: null });
  const detail = await a.load('[circleId]').GET(a.request(undefined), context(CIRCLE));
  assert.equal(detail.status, 503); assert.equal('circle' in await detail.json(), false);
  a.respond = () => ({ data: { items: [missing], nextCursor: null }, error: null });
  const mine = await a.load('mine').GET(a.request(undefined));
  assert.equal(mine.status, 503); assert.equal('items' in await mine.json(), false);
});

test('my Circles is strictly paged, self-scoped and contains no roster or meeting URL', async () => {
  const a = fixture(); const data = snapshot();
  a.respond = () => ({ data: { items: [data], nextCursor: null, actor: a.ADA }, error: null });
  const response = await a.load('mine').GET(a.request(undefined, '/api/circles/mine?limit=1'));
  assert.equal(response.status, 200); privateHeaders(response); const value = await response.json();
  assert.equal(value.items[0].circle.id, CIRCLE); assert.equal(JSON.stringify(value).includes('online_url'), false); assert.equal(JSON.stringify(value).includes(a.ADA), false);
  assert.deepEqual(a.calls[0], { name: 'soe_circle_my_circles', args: { p_actor: a.JULES, p_after: null, p_limit: 1 } });
  for (const query of ['limit=0', 'limit=26', 'limit=1.5', 'limit=', 'limit=1&limit=2', 'after=', 'after=bad', `after=${OTHER}&after=${CIRCLE}`]) assert.equal((await a.load('mine').GET(a.request(undefined, '/api/circles/mine?' + query))).status, 400);
});

test('minimal membership controls need canonical own access and expose no calendar, meeting URL or other member IDs', async () => {
  const a = fixture();
  a.respond = () => ({ data: { ...management(), online_url: 'https://meet.example.test/SECRET', ended: true, privateActor: a.ADA }, error: null });
  const response = await a.load('[circleId]/membership').GET(a.request(undefined), context(CIRCLE));
  assert.equal(response.status, 200); privateHeaders(response); assert.deepEqual(await response.json(), management());
  assert.deepEqual(a.calls[0], { name: 'soe_circle_membership_state', args: { p_actor: a.JULES, p_circle_id: CIRCLE } });
  a.respond = () => ({ data: management({ viewer: { signed_in: true, is_member: false, is_host: false } }), error: null });
  assert.equal((await a.load('[circleId]/membership').GET(a.request(undefined), context(CIRCLE))).status, 503);
  a.respond = () => ({ data: null, error: { code: 'PT404' } });
  assert.equal((await a.load('[circleId]/membership').GET(a.request(undefined), context(CIRCLE))).status, 404);
  a.app.setUser(null);
  assert.equal((await a.load('[circleId]/membership').GET(a.request(undefined), context(CIRCLE))).status, 401);
});

test('My Circles parses an explicit management-only row without fabricating a calendar or poisoning valid rows', async () => {
  const a = fixture(); const minimal = management({ circle: { id: OTHER, title: null, hidden: true } });
  a.respond = () => ({ data: { items: [snapshot(), minimal], nextCursor: null }, error: null });
  const response = await a.load('mine').GET(a.request(undefined)); assert.equal(response.status, 200);
  const value = await response.json(); assert.equal(value.items[0].kind, 'circle'); assert.deepEqual(value.items[1], minimal);
  assert.equal('ended' in value.items[1], false); assert.equal('online_url' in value.items[1], false);
  a.respond = () => ({ data: { items: [management({ kind: 'unrecognized' })], nextCursor: null }, error: null });
  assert.equal((await a.load('mine').GET(a.request(undefined))).status, 503);
});

test('malformed or unrelated my-Circles rows and inconsistent next cursors are unavailable, never empty success', async () => {
  const a = fixture();
  for (const value of [{ items: [snapshot()], nextCursor: OTHER }, { items: [snapshot(), snapshot()], nextCursor: null }, { items: [snapshot({ viewer: { signed_in: true, is_member: false, is_host: false } })], nextCursor: null }, { items: [], nextCursor: CIRCLE }]) {
    a.respond = () => ({ data: value, error: null }); assert.equal((await a.load('mine').GET(a.request(undefined))).status, 503);
  }
});

test('legacy join delegates Circles to the same receipt/revision RPC and keeps ordinary salon joining unkeyed', async () => {
  const a = fixture(), join = a.app.load('app/api/book-salons/join/route.ts');
  assert.equal((await join.POST(a.request({ cohortId: CIRCLE }))).status, 400); assert.equal(a.calls.length, 0);
  a.respond = () => ({ data: receipt('join'), error: null });
  assert.equal((await join.POST(a.request({ cohortId: CIRCLE, requestId: KEY, expectedRevision: 3 }))).status, 200);
  assert.equal(a.calls[0].name, 'soe_circle_join'); assert.equal(a.db.rows('book_cohort_members').length, 0);
  a.db.rows('book_cohorts')[0].book_id = 'hamlet';
  const ordinary = await join.POST(a.request({ cohortId: CIRCLE }, '/api/book-salons/join', {}));
  assert.equal(ordinary.status, 200); assert.deepEqual(await ordinary.json(), { joined: true }); assert.equal(a.db.rows('book_cohort_members')[0].member_id, a.JULES);
});
