import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicProfileApp, TOKENS, SUBJECTS } from './support/public-profile-app.mjs';

// Canonical authentication, handlers and reviewed local SQL. Only provider
// identity and HTTP delivery are synthetic. No hosted calls or schema changes.
let f;
beforeEach(async () => { await f?.close(); f = await createPublicProfileApp({ admission: true }); });
after(async () => { await f?.close(); });
const headers = (who = 'author') => ({ authorization: 'Bearer ' + TOKENS[who], 'x-soe-expected-member': f.actors[who] });
const json = async (response, status = 200) => {
  assert.equal(response.status, status, await response.clone().text()); assert.match(response.headers.get('cache-control'), /private.*no-store/);
  const value = await response.json(); assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|payload|onlineUrl|email|supabase_auth_id/); return value;
};
const check = (id, h = headers(), extra = '') => f.dispatch('/api/circles/start/receipt?requestId=' + id + extra, { headers: h });
const create = async () => {
  const body = await f.createBody({ description: 'PRIVATE_TEST_DESCRIPTION', onlineUrl: 'https://meeting.invalid/PRIVATE_TEST_ROOM', format: 'online', venueType: 'online', venueName: null });
  const response = await f.dispatch('/api/circles', { method: 'POST', headers: headers(), body });
  assert.equal(response.status, 200, await response.clone().text()); return { body, receipt: await response.json() };
};
const receiptReads = () => f.sql.filter(call => call.table === 'circle_participation_receipts');

test('exact actor-owned creation is recovered by read-only receipt and current-host SQL without its listing payload', async () => {
  const { body, receipt } = await create(); f.sql.length = 0;
  assert.deepEqual(await json(await check(body.requestId)), { memberId: f.authorId, requestId: body.requestId, circleId: receipt.circleId });
  const reads = receiptReads(); assert.equal(reads.length, 1);
  assert.equal(reads[0].projection, 'actor_member_id,request_id,cohort_id,receipt');
  assert.deepEqual(reads[0].filters, [{ column: 'actor_member_id', value: f.authorId }, { column: 'request_id', value: body.requestId }]);
  assert.deepEqual(f.sql.filter(call => call.kind === 'rpc').map(call => call.name), ['soe_circle_membership_state']);
  assert.equal((await f.hosted()).length, 1);
});

test('invalid or duplicate query and missing reviewed owner refuse before any database access', async () => {
  const id = crypto.randomUUID();
  for (const [query, h] of [['bad', headers()], [id + '&requestId=' + id, headers()], [id + '&memberId=' + f.authorId, headers()], [id, { authorization: headers().authorization }],
    [id, { ...headers(), 'x-soe-expected-member': 'BAD' }]]) {
    f.sql.length = 0; await json(await check(query, h), 400); assert.equal(f.sql.length, 0);
  }
});

test('anonymous, invalid bearer and a changed reviewed owner cannot query receipt history', async () => {
  const id = crypto.randomUUID();
  for (const [h, status] of [[{ 'x-soe-expected-member': f.authorId }, 401], [{ ...headers(), authorization: 'Bearer INVALID' }, 401],
    [{ ...headers('other'), 'x-soe-expected-member': f.authorId }, 409]]) {
    f.sql.length = 0; await json(await check(id, h), status); assert.equal(receiptReads().length, 0); assert.equal(f.sql.filter(call => call.kind === 'rpc').length, 0);
  }
});

test('absent and another actor’s receipt remain unknown and never cause a mutation or enumerate its Circle', async () => {
  const { body } = await create();
  for (const [id, who] of [[crypto.randomUUID(), 'author'], [body.requestId, 'other']]) {
    f.sql.length = 0;
    assert.deepEqual(await json(await check(id, headers(who))), { memberId: f.actors[who], requestId: id, circleId: null });
    assert.equal(f.sql.filter(call => call.kind === 'rpc').length, 0); assert.equal((await f.hosted()).length, 1);
  }
});

test('a held original create may complete after a null read; subsequent recovery finds exactly that Circle', async () => {
  const body = await f.createBody(), gate = { arrived: null, release: null };
  const arrived = new Promise(resolve => { gate.arrived = resolve; }), released = new Promise(resolve => { gate.release = resolve; });
  f.beforeHttp(async call => { if (call.method === 'POST') { gate.arrived(); await released; } });
  const pending = f.dispatch('/api/circles', { method: 'POST', headers: headers(), body });
  try {
    await arrived; assert.equal((await json(await check(body.requestId))).circleId, null); assert.equal((await f.hosted()).length, 0);
    gate.release(); const original = await json(await pending);
    assert.equal((await json(await check(body.requestId))).circleId, original.circleId); assert.equal((await f.hosted()).length, 1);
  } finally { gate.release(); await pending; }
});

test('receipt recovery ignores a full hosting quota and works for a host who left or completed the Circle', async () => {
  const { body, receipt } = await create(); await create(); await create();
  assert.equal((await json(await f.dispatch('/api/circles/start', { headers: headers() }))).canCreate, false);
  assert.equal((await json(await check(body.requestId))).circleId, receipt.circleId);
  const leave = await json(await f.dispatch(`/api/circles/${receipt.circleId}/leave`, { method: 'POST', headers: headers(), body: { requestId: crypto.randomUUID(), expectedRevision: receipt.state.revision } }));
  await json(await f.dispatch(`/api/circles/${receipt.circleId}/complete`, { method: 'POST', headers: headers(), body: { expectedMemberId: f.authorId, requestId: crypto.randomUUID(), expectedRevision: leave.state.revision } }));
  assert.equal((await json(await check(body.requestId))).circleId, receipt.circleId);
});

test('foreign, malformed or non-create receipt rows are unavailable, never mistaken for absence or confirmation', async () => {
  const { body } = await create();
  for (const tamper of [row => { row.actor_member_id = f.actors.other; }, row => { row.request_id = crypto.randomUUID(); },
    row => { row.cohort_id = 'not-a-circle'; }, row => { row.receipt.action = 'join'; }, row => { row.receipt.joined = false; },
    row => { row.receipt.private = 'PRIVATE_EXTRA'; }, row => { row.receipt = null; }]) {
    f.transformDb(({ table, result }) => { if (table === 'circle_participation_receipts' && result.data) tamper(result.data); return result; });
    f.sql.length = 0; await json(await check(body.requestId), 503); assert.equal(f.sql.filter(call => call.kind === 'rpc').length, 0);
  }
});

test('lost current host authority or failed receipt/state query cannot confirm a historical request', async () => {
  const { body } = await create();
  for (const mode of ['read-error', 'state-error', 'not-host', 'wrong-circle']) {
    f.transformDb(({ table, name, result }) => {
      if (table === 'circle_participation_receipts' && mode === 'read-error' || name === 'soe_circle_membership_state' && mode === 'state-error') return { data: null, error: { code: '42501', message: 'PRIVATE_FAILURE' } };
      if (name === 'soe_circle_membership_state' && result.data) {
        if (mode === 'not-host') { result.data.viewer.is_host = false; result.data.capabilities.canComplete = false; }
        if (mode === 'wrong-circle') result.data.circle.id = crypto.randomUUID();
      }
      return result;
    });
    await json(await check(body.requestId), 503);
  }
});

test('account proof is checked again after receipt and authority reads before releasing a result', async () => {
  const { body } = await create(); f.setCookieActor('author');
  const intent = 'c1000000-0000-4000-8000-000000000001';
  const cookie = `soe_auth_provider=supabase; soe_auth_intent=${intent}; soe_auth_selection_v1=v1.${intent}.supabase.${SUBJECTS.author}`;
  f.transformDb(({ name, result }) => { if (name === 'soe_circle_membership_state') f.setCookieActor('other'); return result; });
  const response = await check(body.requestId, { cookie, 'x-soe-expected-member': f.authorId });
  assert.ok([401, 409].includes(response.status)); await json(response, response.status);
});
