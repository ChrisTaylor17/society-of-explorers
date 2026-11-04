import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';

const CIRCLE = '33333333-3333-4333-8333-333333333333';
const REPORT = '44444444-4444-4444-8444-444444444444';
const DECISION = '55555555-5555-4555-8555-555555555555';
const REQUEST = '66666666-6666-4666-8666-666666666666';
const OTHER = '77777777-7777-4777-8777-777777777777';
const DATE = '2026-11-03T15:00:00.000Z';
const ORIGIN = 'https://offline.invalid';
const PATH = `/api/admin/circles/reports/${CIRCLE}`;
const plain = value => JSON.parse(JSON.stringify(value));
const context = id => ({ params: Promise.resolve({ circleId: id }) });
const event = (extra = {}) => ({ id: DECISION, action: 'hide', reason: 'safety', summary: 'The listing raises a documented safety concern.', created_at: DATE, report_count: 1, ...extra });
const queue = (extra = {}) => ({ items: [{ id: CIRCLE, title: 'Fictional Readers', hidden: true, openReports: 1, revision: 3 }], nextCursor: null, ...extra });
const detail = (extra = {}) => ({ circle: { id: CIRCLE, title: 'Fictional Readers', description: 'A fictional public description.', hidden: true }, revision: 3,
  reports: [{ id: REPORT, reason: 'safety', note: 'PRIVATE_REPORT_NOTE', created_at: DATE }], decisions: [event()], complete: true, ...extra });
const receipt = (extra = {}) => ({ decision: event(), revision: 4, hidden: true, replayed: false, ...extra });
const host = (extra = {}) => ({ circle: { id: CIRCLE, title: 'Fictional Readers', hidden: true }, decisions: [event()], ...extra });
const input = (extra = {}) => ({ expectedRevision: 3, requestId: REQUEST, action: 'hide', reason: 'safety', summary: 'The listing raises a documented safety concern.', evidenceReportId: REPORT, evidenceExcerpt: 'PRIVATE_REPORT_NOTE', ...extra });
const reportInput = (extra = {}) => ({ circleId: CIRCLE, requestId: REQUEST, reason: 'safety', note: 'A fictional concern', ...extra });

function fixture() {
  const app = offlineApp();
  const { ADA, JULES } = app.fakes;
  app.setUser({ id: 'fictional-auth-ada', user_metadata: { role: 'admin', email: 'untrusted@example.test' } });
  const db = app.fakes.resetDb({ members: [{ id: ADA, supabase_auth_id: 'fictional-auth-ada', display_name: 'Ada', wallet_address: `0x${'1'.repeat(40)}` }, { id: JULES, display_name: 'Jules' }] });
  const calls = [];
  const value = { app, db, calls, ADA, JULES, respond: () => ({ data: queue(), error: null }) };
  db.rpc = async (name, args) => { calls.push({ name, args: plain(args) }); return value.respond(name, args); };
  value.request = (body, path = PATH, headers = { origin: ORIGIN }) => app.fakes.makeReq(body, { url: `${ORIGIN}${path}`, headers });
  value.queue = () => app.load('app/api/admin/circles/reports/route.ts');
  value.detail = () => app.load('app/api/admin/circles/reports/[circleId]/route.ts');
  value.host = () => app.load('app/api/circles/[circleId]/review/route.ts');
  value.hosts = () => app.load('app/api/circles/review/route.ts');
  value.report = () => app.load('app/api/circles/report/route.ts');
  return value;
}

function assertPrivate(response) {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.match(response.headers.get('vary'), /Cookie/);
  assert.match(response.headers.get('vary'), /Authorization/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
}

test('queue derives the verified actor and projects away extra private RPC fields', async () => {
  const a = fixture();
  a.respond = () => ({ data: queue({ reporter_key: 'PRIVATE_HASH', online_url: 'PRIVATE_LINK', items: [{ ...queue().items[0], reporter_member_id: a.JULES, note: 'PRIVATE_REPORT_NOTE' }] }), error: null });
  const response = await a.queue().GET(a.request(undefined, '/api/admin/circles/reports?actorMemberId=forged&role=admin'));
  assert.equal(response.status, 200); assertPrivate(response);
  assert.deepEqual(await response.json(), queue());
  assert.deepEqual(a.calls, [{ name: 'soe_circle_review_queue', args: { p_after: null, p_limit: 25, p_actor: a.ADA } }]);
});

test('anonymous and raw UUID-cookie callers never reach the private queue RPC', async () => {
  const a = fixture(); a.app.setUser(null);
  assert.equal((await a.queue().GET(a.request(undefined))).status, 401);
  const forged = a.app.fakes.makeReq(undefined, { url: `${ORIGIN}/api/admin/circles/reports`, cookies: { soe_wallet_id: a.ADA } });
  const response = await a.queue().GET(forged);
  assert.equal(response.status, 401); assertPrivate(response); assert.equal(a.calls.length, 0);
});

test('a signed localhost wallet and user metadata cannot bypass the RPC grant denial', async () => {
  const a = fixture(); a.app.setUser(null);
  a.respond = () => ({ data: null, error: { code: 'PT403', message: 'PRIVATE_GRANT_DETAIL' } });
  const cookie = await a.app.fakes.walletCookie(a.ADA);
  const request = a.app.fakes.makeReq(undefined, { url: 'http://localhost/api/admin/circles/reports', cookies: { soe_wallet_id: cookie } });
  const response = await a.queue().GET(request);
  assert.equal(response.status, 403); assert.equal(a.calls[0].args.p_actor, a.ADA);
  assert.doesNotMatch(await response.text(), /PRIVATE_GRANT_DETAIL/);
});

test('keyset pages forward only a bounded cursor and limit', async () => {
  const a = fixture(); a.respond = () => ({ data: queue({ nextCursor: CIRCLE }), error: null });
  const response = await a.queue().GET(a.request(undefined, `/api/admin/circles/reports?after=${OTHER}&limit=1`));
  assert.equal(response.status, 200);
  assert.equal(a.calls[0].args.p_after, OTHER); assert.equal(a.calls[0].args.p_limit, 1);
  for (const params of ['after=not-a-uuid', 'limit=0', 'limit=26', 'limit=-1', 'limit=1.5', 'limit=', 'limit=1e1']) {
    assert.equal((await a.queue().GET(a.request(undefined, `/api/admin/circles/reports?${params}`))).status, 400, params);
  }
  assert.equal(a.calls.length, 1);
});

test('unavailable/malformed queue RPC success cannot masquerade as an empty queue', async () => {
  const a = fixture();
  for (const data of [null, {}, { items: [] }, queue({ nextCursor: OTHER }), queue({ items: [...queue().items, ...queue().items] }), queue({ items: [{ ...queue().items[0], revision: -1 }] }), queue({ items: [{ ...queue().items[0], openReports: 1.5 }] })]) {
    a.respond = () => ({ data, error: null });
    const response = await a.queue().GET(a.request(undefined));
    assert.equal(response.status, 503); assertPrivate(response);
  }
});

test('SQL authorization, missing case, validation and stale revision codes map without private error messages', async () => {
  const a = fixture();
  for (const [code, status] of [['PT400', 400], ['PT403', 403], ['PT404', 404], ['PT409', 409], ['42P01', 503], ['42883', 503], ['PGRST202', 503], ['', 503]]) {
    a.respond = () => ({ data: null, error: { code, message: 'PRIVATE_CONNECTION_DETAIL', details: 'PRIVATE_REPORT_NOTE' } });
    const response = await a.queue().GET(a.request(undefined));
    assert.equal(response.status, status, code); assertPrivate(response);
    assert.doesNotMatch(await response.text(), /PRIVATE_CONNECTION_DETAIL|PRIVATE_REPORT_NOTE/);
  }
});

test('thrown provider failures remain generic private 503 responses', async () => {
  const a = fixture(); a.respond = () => { throw new Error('PRIVATE_CONNECTION_DETAIL'); };
  const response = await a.queue().GET(a.request(undefined));
  assert.equal(response.status, 503); assertPrivate(response); assert.doesNotMatch(await response.text(), /PRIVATE_CONNECTION_DETAIL/);
});

test('authorized detail returns only report content needed by the reviewer', async () => {
  const a = fixture();
  a.respond = () => ({ data: detail({ reports: [{ ...detail().reports[0], reporter_member_id: a.JULES, reporter_key: 'PRIVATE_HASH', email: 'private@example.test' }], decisions: [{ ...event(), actor_member_id: a.ADA, evidence_excerpt: 'PRIVATE_EVIDENCE', request_id: REQUEST }], circle: { ...detail().circle, online_url: 'PRIVATE_LINK' } }), error: null });
  const response = await a.detail().GET(a.request(undefined), context(CIRCLE));
  assert.equal(response.status, 200); assertPrivate(response); assert.deepEqual(await response.json(), detail());
});

test('detail rejects the wrong circle, malformed rows and an oversized private snapshot', async () => {
  const a = fixture();
  for (const data of [detail({ circle: { ...detail().circle, id: OTHER } }), detail({ reports: Array.from({ length: 101 }, () => detail().reports[0]) }), detail({ reports: [{ ...detail().reports[0], note: { invalid: true } }] }), detail({ reports: [...detail().reports, ...detail().reports] }), detail({ decisions: [{ ...event(), reason: 'no_violation' }] })]) {
    a.respond = () => ({ data, error: null });
    assert.equal((await a.detail().GET(a.request(undefined), context(CIRCLE))).status, 503);
  }
});

test('incomplete bounded report snapshots remain explicitly incomplete', async () => {
  const a = fixture(); a.respond = () => ({ data: detail({ complete: false }), error: null });
  const response = await a.detail().GET(a.request(undefined), context(CIRCLE));
  assert.equal(response.status, 200); assert.equal((await response.json()).complete, false);
});

test('host views strip reporter counts, private notes, evidence, actor and request fields', async () => {
  const a = fixture();
  const raw = host({ decisions: [{ ...event(), note: 'PRIVATE_REPORT_NOTE', evidence_excerpt: 'PRIVATE_EVIDENCE', actor_member_id: a.ADA, request_id: REQUEST }], reports: detail().reports, online_url: 'PRIVATE_LINK' });
  a.respond = name => ({ data: name === 'soe_circle_host_reviews' ? { items: [raw], nextCursor: null } : raw, error: null });
  for (const response of [await a.host().GET(a.request(undefined), context(CIRCLE)), await a.hosts().GET(a.request(undefined, '/api/circles/review'))]) {
    assert.equal(response.status, 200); assertPrivate(response);
    const body = await response.text();
    assert.doesNotMatch(body, /report_count|PRIVATE_REPORT_NOTE|PRIVATE_EVIDENCE|PRIVATE_LINK|actor_member_id|request_id/);
    assert.match(body, /documented safety concern/);
  }
});

test('host list validates its page and refuses malformed or mismatched detail data', async () => {
  const a = fixture(); a.respond = () => ({ data: host({ circle: { ...host().circle, id: OTHER } }), error: null });
  assert.equal((await a.host().GET(a.request(undefined), context(CIRCLE))).status, 503);
  assert.equal((await a.hosts().GET(a.request(undefined, '/api/circles/review?limit=100'))).status, 400);
  a.respond = () => ({ data: { items: [host()], nextCursor: OTHER }, error: null });
  assert.equal((await a.hosts().GET(a.request(undefined, '/api/circles/review'))).status, 503);
});

test('hide decision forwards a validated exact excerpt and server-bound actor', async () => {
  const a = fixture(); a.respond = () => ({ data: receipt(), error: null });
  const response = await a.detail().POST(a.request(input()), context(CIRCLE));
  assert.equal(response.status, 200); assertPrivate(response); assert.deepEqual(await response.json(), receipt());
  assert.deepEqual(a.calls[0], { name: 'soe_circle_review_decide', args: { p_circle_id: CIRCLE, p_expected_revision: 3, p_request_id: REQUEST, p_action: 'hide', p_reason: 'safety', p_summary: input().summary, p_evidence_report_id: REPORT, p_evidence_excerpt: 'PRIVATE_REPORT_NOTE', p_actor: a.ADA } });
});

test('restoration forwards no private evidence and preserves operation identity', async () => {
  const a = fixture();
  const payload = input({ action: 'restore', reason: 'no_violation', evidenceReportId: null, evidenceExcerpt: null });
  a.respond = () => ({ data: receipt({ hidden: false, decision: event({ action: 'restore', reason: 'no_violation' }) }), error: null });
  assert.equal((await a.detail().POST(a.request(payload), context(CIRCLE))).status, 200);
  assert.equal(a.calls[0].args.p_request_id, REQUEST); assert.equal(a.calls[0].args.p_evidence_excerpt, null);
});

test('replay returns the original event with current visibility without repeating a decision', async () => {
  const a = fixture(); a.respond = () => ({ data: receipt({ hidden: false, revision: 9, replayed: true }), error: null });
  const response = await a.detail().POST(a.request(input()), context(CIRCLE));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), receipt({ hidden: false, revision: 9, replayed: true }));
  a.respond = () => ({ data: receipt({ hidden: false, replayed: false }), error: null });
  assert.equal((await a.detail().POST(a.request(input()), context(CIRCLE))).status, 503);
});

test('a success receipt must confirm the submitted operation and advance a new revision', async () => {
  const a = fixture();
  for (const data of [receipt({ revision: 3 }), receipt({ decision: event({ summary: 'A different otherwise valid public explanation.' }) }), receipt({ hidden: false, decision: event({ action: 'restore', reason: 'no_violation' }) })]) {
    a.respond = () => ({ data, error: null });
    assert.equal((await a.detail().POST(a.request(input()), context(CIRCLE))).status, 503);
  }
});

test('review request validation rejects forged actors, wrong reasons and unbounded evidence before RPC', async () => {
  const a = fixture();
  for (const patch of [{ actorMemberId: a.JULES }, { expectedRevision: -1 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { requestId: 'not-a-uuid' }, { action: 'delete' }, { reason: 'resolved' }, { summary: 'short' }, { summary: 'x'.repeat(1001) }, { summary: 'An invalid\u0000 control character in summary' }, { evidenceExcerpt: 'tiny' }, { evidenceExcerpt: 'x'.repeat(501) }, { evidenceReportId: OTHER + 'x' }, { action: 'restore', reason: 'resolved' }]) {
    assert.equal((await a.detail().POST(a.request(input(patch)), context(CIRCLE))).status, 400, JSON.stringify(patch));
  }
  assert.equal(a.calls.length, 0);
});

test('mutation origin checks reject cross-origin, same-site siblings and unproven cookie requests', async () => {
  const a = fixture(); a.respond = () => ({ data: receipt(), error: null });
  // Exact synthetic bearer verification separates origin policy from identity.
  a.app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => a.db }));
  a.app.setMock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'FICTIONAL_ONLY' ? { id: 'fictional-auth-ada' } : null }, error: null }) } }) }));
  for (const headers of [{ origin: 'https://another.example.test' }, { origin: ORIGIN, 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site', cookie: 'fictional=session' }, { cookie: 'fictional=session' }, {}]) {
    assert.equal((await a.detail().POST(a.request(input(), PATH, headers), context(CIRCLE))).status, 403);
  }
  assert.equal(a.calls.length, 0);
  for (const headers of [{ origin: ORIGIN }, { 'sec-fetch-site': 'same-origin', cookie: 'fictional=session' }, { authorization: 'Bearer FICTIONAL_ONLY' }]) {
    assert.equal((await a.detail().POST(a.request(input(), PATH, headers), context(CIRCLE))).status, 200);
  }
});

test('decision validation failures differ from ambiguous RPC failures', async () => {
  const a = fixture();
  a.respond = () => ({ data: null, error: { code: 'PT409', message: 'PRIVATE_STALE_DETAIL' } });
  assert.equal((await a.detail().POST(a.request(input()), context(CIRCLE))).status, 409);
  a.respond = () => ({ data: null, error: { code: 'PGRST202', message: 'PRIVATE_FUNCTION_DETAIL' } });
  const response = await a.detail().POST(a.request(input()), context(CIRCLE));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE_FUNCTION_DETAIL/);
  assert.equal(a.calls[0].args.p_request_id, a.calls[1].args.p_request_id);
});

test('invalid circle ids and malformed JSON cannot trigger a write', async () => {
  const a = fixture();
  assert.equal((await a.detail().GET(a.request(undefined), context('..'))).status, 400);
  assert.equal((await a.detail().POST(a.request(input()), context('..'))).status, 400);
  const request = a.request(input()); request.text = async () => '{';
  assert.equal((await a.detail().POST(request, context(CIRCLE))).status, 400);
  assert.equal(a.calls.length, 0);
});

test('declared oversized bodies are refused before reading or calling RPC', async () => {
  const a = fixture(); const request = a.request(input(), PATH, { origin: ORIGIN, 'content-length': '12001' });
  request.text = () => { throw new Error('Body must not be read'); };
  assert.equal((await a.detail().POST(request, context(CIRCLE))).status, 413); assert.equal(a.calls.length, 0);
});

test('streaming and fallback body limits count UTF-8 bytes rather than characters', async () => {
  const a = fixture();
  const native = new Request(`${ORIGIN}${PATH}`, { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify(input({ summary: '😀'.repeat(4000) })) });
  assert.equal((await a.detail().POST(native, context(CIRCLE))).status, 413);
  const fake = a.request(input({ summary: '😀'.repeat(4000) }));
  assert.equal((await a.detail().POST(fake, context(CIRCLE))).status, 413); assert.equal(a.calls.length, 0);
});

test('anonymous reporting binds a private IP hash and never accepts a body actor', async () => {
  const a = fixture(); a.app.setUser(null); a.respond = () => ({ data: { received: true, reporter_key: 'PRIVATE_HASH', note: 'PRIVATE_REPORT_NOTE' }, error: null });
  const response = await a.report().POST(a.request(reportInput({ memberId: a.ADA, actorMemberId: a.ADA }), '/api/circles/report', { 'x-forwarded-for': '203.0.113.14' }));
  assert.equal(response.status, 200); assertPrivate(response); assert.deepEqual(await response.json(), { received: true });
  assert.equal(a.calls[0].name, 'soe_circle_report'); assert.equal(a.calls[0].args.p_actor, null);
  assert.match(a.calls[0].args.p_reporter_key, /^[0-9a-f]{32}$/); assert.notEqual(a.calls[0].args.p_reporter_key, '203.0.113.14');
  assert.equal(a.calls[0].args.p_request_id, REQUEST);
});

test('signed-in reports bind the verified actor and leave anonymous source keys null', async () => {
  const a = fixture(); a.respond = () => ({ data: { received: true }, error: null });
  const response = await a.report().POST(a.request(reportInput({ memberId: a.JULES, reporterKey: 'forged' }), '/api/circles/report'));
  assert.equal(response.status, 200); assert.equal(a.calls[0].args.p_actor, a.ADA); assert.equal(a.calls[0].args.p_reporter_key, null);
});

test('report retries forward the same payload and key; only SQL can confirm receipt', async () => {
  const a = fixture(); a.respond = () => ({ data: { received: true }, error: null });
  const report = a.report();
  assert.equal((await report.POST(a.request(reportInput(), '/api/circles/report'))).status, 200);
  assert.equal((await report.POST(a.request(reportInput(), '/api/circles/report'))).status, 200);
  assert.deepEqual(a.calls[0], a.calls[1]);
  a.respond = () => ({ data: null, error: null });
  assert.equal((await report.POST(a.request(reportInput(), '/api/circles/report'))).status, 503);
});

test('report validation and origin failures do not fall back to sequential writes', async () => {
  const a = fixture();
  for (const patch of [{ circleId: 'bad' }, { requestId: null }, { reason: 'unsupported' }]) {
    assert.equal((await a.report().POST(a.request(reportInput(patch), '/api/circles/report'))).status, 400);
  }
  assert.equal((await a.report().POST(a.request(reportInput(), '/api/circles/report', { origin: 'https://another.example.test' }))).status, 403);
  assert.equal(a.calls.length, 0);
  assert.equal(a.db.log.filter(entry => entry.op !== 'select').length, 0);
});

test('reports retain the five-per-hour identity budget and include Retry-After', async () => {
  const a = fixture(); a.respond = () => ({ data: { received: true }, error: null });
  for (let n = 0; n < 5; n++) assert.equal((await a.report().POST(a.request(reportInput(), '/api/circles/report'))).status, 200);
  const response = await a.report().POST(a.request(reportInput(), '/api/circles/report'));
  assert.equal(response.status, 429); assert.ok(Number(response.headers.get('retry-after')) > 0); assert.equal(a.calls.length, 5);
});

test('shared public-safe parsers strip private fields and reject invalid events', () => {
  const a = fixture(); const shared = a.app.load('lib/circles/moderation.ts');
  assert.equal(shared.parseCircleReviewDetail(detail({ decisions: [{ ...event(), created_at: 'not-a-date' }] })), null);
  assert.equal(shared.parseCircleReviewDetail(detail({ decisions: [{ ...event(), report_count: 101 }] })), null);
  assert.equal(shared.parseCircleHostReview(host({ decisions: [event(), event()] })), null);
  assert.equal(shared.parseCircleHostReviews({ items: [host(), host()], nextCursor: null }), null);
  const result = plain(shared.parseCircleHostReview(host()));
  assert.equal(result.decisions[0].report_count, undefined);
  assert.equal(shared.validateCircleReviewInput(input()).ok, true);
});
