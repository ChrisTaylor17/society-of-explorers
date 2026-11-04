import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';

const CIRCLE = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const MESSAGE = '55555555-5555-4555-8555-555555555555';
const ORIGIN = 'https://offline.invalid';
const DATE = '2026-11-03T15:00:00.000Z';
const circleBook = 'soe-circles-path';
const plain = value => JSON.parse(JSON.stringify(value));
const context = id => ({ params: Promise.resolve({ cohortId: id }) });

function fixture() {
  const app = offlineApp();
  const { ADA, JULES } = app.fakes;
  app.setUser({ id: 'fixture-jules' });
  const cohort = { id: CIRCLE, book_id: circleBook, title: 'Fictional Circle', description: null,
    max_members: 8, start_date: '2026-11-03', thinker_id: 'socrates', status: 'forming', created_at: DATE, circle_hidden: false };
  const db = app.fakes.resetDb({ members: [{ id: ADA, display_name: 'Ada' }, { id: JULES, supabase_auth_id: 'fixture-jules', display_name: 'Jules' }],
    book_cohorts: [cohort], book_cohort_members: [{ id: 'membership-jules', cohort_id: CIRCLE, member_id: JULES }], seminar_messages: [] });
  const calls = [];
  const data = { cohort, members: [{ id: 'membership-jules', members: { display_name: 'Jules' } }], messages: [], history: { truncated: false, limit: 100 } };
  const a = { app, ADA, JULES, db, calls, data, respond: name => ({ data: name === 'soe_circle_messages_read' ? data : null, error: null }) };
  db.rpc = async (name, args) => { calls.push({ name, args: plain(args) }); return a.respond(name, args); };
  a.route = app.load('app/api/book-salons/[cohortId]/route.ts');
  a.request = (body, headers = { origin: ORIGIN }) => app.fakes.makeReq(body, { url: `${ORIGIN}/api/book-salons/${CIRCLE}`, headers });
  return a;
}
const message = (extra = {}) => ({ id: MESSAGE, member_name: 'Jules', content: 'Fictional visible text.', created_at: DATE, is_mine: true, visibility: 'visible', ...extra });
function privateHeaders(response) {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.match(response.headers.get('vary'), /Cookie/);
  assert.match(response.headers.get('vary'), /Authorization/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('Circle reads use only the atomic service RPC and whitelist its legacy-compatible response', async () => {
  const a = fixture(); a.data.messages = [message({ member_id: a.JULES, report_note: 'PRIVATE_REPORT_NOTE' })];
  a.data.cohort.online_url = 'PRIVATE_MEETING_LINK'; a.data.raw_payload = 'PRIVATE_AUDIT';
  const response = await a.route.GET(a.request(undefined), context(CIRCLE));
  assert.equal(response.status, 200); privateHeaders(response);
  const value = await response.json();
  assert.deepEqual(a.calls, [{ name: 'soe_circle_messages_read', args: { p_actor: a.JULES, p_circle_id: CIRCLE } }]);
  assert.equal(value.messages[0].content, 'Fictional visible text.');
  assert.deepEqual(value.history, { limit: 100, truncated: false });
  assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|member_id|circle_hidden/);
  assert.equal(a.db.log.some(row => ['seminar_messages', 'book_cohort_members'].includes(row.table)), false);
});

test('author and peers receive fixed tombstones, even if RPC includes withheld raw text', async () => {
  const a = fixture();
  a.data.messages = [message({ content: 'HIDDEN_RAW_SECRET', visibility: 'hidden' }),
    message({ id: OTHER, content: 'WITHDRAWN_RAW_SECRET', visibility: 'withdrawn', is_mine: false })];
  const response = await a.route.GET(a.request(undefined), context(CIRCLE));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.messages[0].content, '[Post hidden after human review.]');
  assert.equal(body.messages[1].content, '[Post withdrawn by its author.]');
  assert.doesNotMatch(JSON.stringify(body), /RAW_SECRET/);
});

test('anonymous and forged body/cookie authority cannot reach Circle reads', async () => {
  const a = fixture(); a.app.setUser(null);
  const response = await a.route.GET(a.app.fakes.makeReq({ memberId: a.JULES }, { url: `${ORIGIN}/api/book-salons/${CIRCLE}`, cookies: { soe_wallet_id: a.JULES } }), context(CIRCLE));
  assert.equal(response.status, 401); assert.equal(a.calls.length, 0); privateHeaders(response);
});

test('missing safety RPC/schema and malformed projections cannot fall back to raw Circle tables', async () => {
  const a = fixture();
  for (const code of ['PGRST202', '42883', '42P01', '42501']) {
    a.respond = () => ({ data: null, error: { code, message: 'PRIVATE_DATABASE_ERROR' } });
    const response = await a.route.GET(a.request(undefined), context(CIRCLE));
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE_DATABASE_ERROR/);
  }
  for (const data of [null, {}, { ...a.data, history: undefined }, { ...a.data, messages: [message({ visibility: undefined })] },
    { ...a.data, messages: [message(), message()] }, { ...a.data, messages: [message()], history: { limit: 100, truncated: true } },
    { ...a.data, cohort: { ...a.data.cohort, id: OTHER } }]) {
    a.respond = () => ({ data, error: null });
    assert.equal((await a.route.GET(a.request(undefined), context(CIRCLE))).status, 503);
  }
  assert.equal(a.db.log.some(row => row.table === 'seminar_messages'), false);
});

test('atomic access denial maps privately and a bounded latest window is explicit', async () => {
  const a = fixture();
  for (const [code, expected] of [['PT403', 403], ['PT404', 404], ['PT409', 409]]) {
    a.respond = () => ({ data: null, error: { code, details: 'PRIVATE_ACCESS_DETAIL' } });
    const response = await a.route.GET(a.request(undefined), context(CIRCLE));
    assert.equal(response.status, expected); assert.doesNotMatch(await response.text(), /PRIVATE_ACCESS_DETAIL/);
  }
  a.data.messages = Array.from({ length: 100 }, (_, index) => message({ id: `message-${index}` }));
  a.data.history.truncated = true; a.respond = () => ({ data: a.data, error: null });
  const response = await a.route.GET(a.request(undefined), context(CIRCLE));
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).history, { limit: 100, truncated: true });
});

test('Circle writes reject browser-origin forgery before consuming the request body', async () => {
  const a = fixture();
  for (const headers of [{ origin: 'https://evil.invalid' }, { origin: ORIGIN, 'sec-fetch-site': 'cross-site' }, { cookie: 'session=fictional' }, { origin: 'null' }]) {
    const request = a.request(undefined, headers); request.text = async () => { throw Error('Body must not be read'); };
    const response = await a.route.POST(request, context(CIRCLE));
    assert.equal(response.status, 403); assert.equal((await response.json()).outcome, 'not_attempted');
  }
  assert.equal(a.calls.length, 0); assert.equal(a.db.rows('seminar_messages').length, 0);
});

test('Circle JSON bounds real streamed UTF-8 bytes and rejects malformed data before persistence', async () => {
  const a = fixture();
  const request = a.request(undefined); let cancelled = false;
  request.body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(20_000))); }, cancel() { cancelled = true; } });
  const response = await a.route.POST(request, context(CIRCLE));
  assert.equal(response.status, 413); assert.equal((await response.json()).outcome, 'not_attempted'); assert.equal(cancelled, true);
  const invalid = a.request(undefined); invalid.body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } });
  assert.equal((await a.route.POST(invalid, context(CIRCLE))).status, 400);
  for (const body of [{ content: 'x'.repeat(2001) }, { content: 'bad\u0000text' }, { content: '' }, []]) assert.equal((await a.route.POST(a.request(body), context(CIRCLE))).status, 400);
  assert.equal(a.calls.length, 0);
});

test('Circle posting forwards only canonical identity and content to the atomic insert and projects its receipt', async () => {
  const a = fixture();
  a.respond = (_name, args) => ({ data: { outcome: 'confirmed', circleId: CIRCLE,
    message: message({ content: args.p_content, member_id: a.JULES, hidden_original: 'PRIVATE_CONTENT' }), raw_payload: 'PRIVATE_AUDIT' }, error: null });
  const response = await a.route.POST(a.request({ content: '  My thought.  ', memberId: a.ADA, role: 'admin' }), context(CIRCLE));
  assert.equal(response.status, 200); privateHeaders(response);
  const value = await response.json(); assert.equal(value.outcome, 'confirmed'); assert.equal(value.message.content, 'My thought.');
  assert.deepEqual(a.calls, [{ name: 'soe_circle_messages_post', args: { p_actor: a.JULES, p_circle_id: CIRCLE, p_content: 'My thought.', p_member_name: 'Jules' } }]);
  assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|member_id/);
  assert.equal(a.db.log.some(row => row.table === 'seminar_messages'), false);
});

test('bearer-only nonbrowser writes remain permitted while failed or malformed confirmations stay unknown', async () => {
  const a = fixture();
  // This case tests origin handling with an already verified nonbrowser actor.
  a.app.setMock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'FICTIONAL_TOKEN' ? { id: 'fixture-jules' } : null }, error: null }) } }) }));
  for (const data of [null, {}, { outcome: 'confirmed', circleId: OTHER, message: message() },
    { outcome: 'confirmed', circleId: CIRCLE, message: message({ content: 'hello', visibility: 'hidden' }) }]) {
    a.respond = () => ({ data, error: null });
    const response = await a.route.POST(a.request({ content: 'hello' }, { authorization: 'Bearer FICTIONAL_TOKEN' }), context(CIRCLE));
    assert.equal(response.status, 503); assert.equal((await response.json()).outcome, 'unknown');
  }
  a.respond = () => { throw Error('PRIVATE_TRANSPORT_FAILURE'); };
  const response = await a.route.POST(a.request({ content: 'hello' }), context(CIRCLE));
  assert.equal(response.status, 503); const value = await response.json(); assert.equal(value.outcome, 'unknown'); assert.doesNotMatch(JSON.stringify(value), /PRIVATE_TRANSPORT/);
});

test('atomic authorization refusal or known missing RPC never claims a write was attempted', async () => {
  const a = fixture();
  for (const [code, expected] of [['PT400', 400], ['PT403', 403], ['PT404', 404], ['PGRST202', 503], ['42883', 503], ['42P01', 503]]) {
    a.respond = () => ({ data: null, error: { code, message: 'PRIVATE_ERROR' } });
    const response = await a.route.POST(a.request({ content: 'hello' }), context(CIRCLE));
    assert.equal(response.status, expected); const value = await response.json(); assert.equal(value.outcome, 'not_attempted'); assert.doesNotMatch(JSON.stringify(value), /PRIVATE_ERROR/);
  }
});

test('ordinary salon reads and writes retain their original public and insert behavior', async () => {
  const a = fixture(); a.db.rows('book_cohorts')[0].book_id = 'hamlet'; a.app.setUser(null);
  a.db.rows('seminar_messages').push({ id: MESSAGE, cohort_id: CIRCLE, member_id: a.JULES, member_name: 'Jules', content: 'Ordinary salon text.', created_at: DATE });
  const read = await a.route.GET(a.request(undefined), context(CIRCLE));
  assert.equal(read.status, 200); assert.equal((await read.json()).messages[0].content, 'Ordinary salon text.');
  a.app.setUser({ id: 'fixture-jules' });
  const write = await a.route.POST(a.request({ content: 'Ordinary reply.' }, {}), context(CIRCLE));
  assert.equal(write.status, 200); assert.equal((await write.json()).message.content, 'Ordinary reply.');
  assert.equal(a.calls.length, 0); assert.equal(a.db.rows('seminar_messages').length, 2);
});

function aliasFixture({ bookId = circleBook, error = null, data, hanging = false } = {}) {
  const app = offlineApp(), calls = []; let signal;
  const Legacy = () => { throw Error('Legacy client must not execute during alias classification'); };
  app.setMock('./LegacySalon', () => ({ __esModule: true, default: Legacy }));
  app.setMock('next/link', () => ({ __esModule: true, default: props => props.children }));
  app.setMock('next/navigation', () => ({ redirect: url => { throw Object.assign(Error('REDIRECT'), { url }); }, notFound: () => { throw Error('NOT_FOUND'); } }));
  app.setMock('@/lib/auth/getSession', () => ({ getMemberSession: () => { throw Error('Session creation forbidden'); }, getSupabaseAccessToken: () => { throw Error('Credential read forbidden'); } }));
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => ({ from: table => {
    calls.push({ table }); const query = { select(fields) { calls.push({ fields }); return query; }, eq(field, value) { calls.push({ field, value }); return query; },
      abortSignal(value) { signal = value; return query; }, maybeSingle() { return hanging ? new Promise(() => {}) : Promise.resolve({ data: data === undefined ? { id: CIRCLE, book_id: bookId } : data, error }); } };
    return query;
  } }) }));
  app.context.setTimeout = (fn, milliseconds) => { assert.equal(milliseconds, 5000); return setTimeout(fn, 5); };
  return { app, calls, Legacy, get signal() { return signal; }, page: app.load('app/book-salons/[cohortId]/page.tsx').default };
}

test('legacy Circle URL redirects server-side using only bounded id/book classification and no session code', async () => {
  const a = aliasFixture();
  await assert.rejects(a.page(context(CIRCLE)), error => error.message === 'REDIRECT' && error.url === `/circles/${CIRCLE}`);
  assert.deepEqual(a.calls, [{ table: 'book_cohorts' }, { fields: 'id,book_id' }, { field: 'id', value: CIRCLE }]);
  assert.ok(a.signal instanceof AbortSignal);
});

test('ordinary legacy salon resolves to its unchanged client, while invalid or missing IDs never mount it', async () => {
  const a = aliasFixture({ bookId: 'hamlet' });
  const element = await a.page(context(CIRCLE)); assert.equal(element.type, a.Legacy);
  const bad = aliasFixture(); await assert.rejects(bad.page(context('bad')), /NOT_FOUND/); assert.equal(bad.calls.length, 0);
  const missing = aliasFixture({ data: null }); await assert.rejects(missing.page(context(CIRCLE)), /NOT_FOUND/);
});

test('legacy alias timeout and database/malformed replies stay generic and do not mount the legacy client', async () => {
  for (const options of [{ hanging: true }, { error: { message: 'PRIVATE_DATABASE_URI' } }, { data: { id: OTHER, book_id: circleBook } }]) {
    const a = aliasFixture(options); const element = await a.page(context(CIRCLE));
    assert.notEqual(element.type, a.Legacy); assert.doesNotMatch(JSON.stringify(element), /PRIVATE_DATABASE_URI/);
    assert.match(JSON.stringify(element), /Discussion unavailable/);
    if (options.hanging) assert.equal(a.signal.aborted, true);
  }
});
