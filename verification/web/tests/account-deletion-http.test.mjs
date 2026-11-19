import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  browserCookies, cookieHeader, createAccountDeletionApp, linked, member, other, providerOnly,
} from './support/account-deletion-app.mjs';

const origin = 'https://members.soe.test';
const actor = (subject, provider = 'supabase') => ({ provider, subject });
const makeCode = () => randomUUID() + '.' + randomBytes(32).toString('hex');
const submission = (owner, code = makeCode()) => ({ action: 'request', confirmation: 'DELETE', code, owner });
const status = code => ({ action: 'status', code });
async function fixture(t) {
  const app = await createAccountDeletionApp(origin);
  t.after(app.close);
  return app;
}
function post(app, body, cookies = {}, extra = {}, query = '') {
  return app.dispatch('POST', {
    body: JSON.stringify(body), query,
    headers: { origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', cookie: cookieHeader(cookies), ...extra },
  });
}
function get(app, cookies = {}, extra = {}) {
  return app.dispatch('GET', { headers: { cookie: cookieHeader(cookies), ...extra } });
}
function privateHeaders(response) {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
}
async function receipt(response, code) {
  assert.equal(response.status, 200);
  privateHeaders(response);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['request']);
  assert.deepEqual(Object.keys(body.request).sort(), ['id', 'requestedAt', 'reviewBy']);
  assert.equal(body.request.id, code.split('.')[0]);
  assert(!JSON.stringify(body).includes(code.split('.')[1]));
  return body.request;
}

test('intake requires an exact origin before auth, body parsing or database access', async t => {
  const app = await fixture(t);
  const body = submission(actor(providerOnly));
  for (const headers of [
    { origin: '' },
    { origin: 'null' },
    { origin: origin + '/' },
    { origin: 'https://sibling.soe.test', 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'same-site' },
    { authorization: 'Bearer SYNTHETIC' },
  ]) {
    const reply = await post(app, body, browserCookies(providerOnly), headers);
    assert.equal(reply.status, 403);
    privateHeaders(reply);
  }
  const absent = await app.dispatch('POST', {
    headers: { 'content-type': 'application/json', cookie: cookieHeader(browserCookies(providerOnly)) },
    body: JSON.stringify(body),
  });
  assert.equal(absent.status, 403);
  assert.equal((await post(app, body, browserCookies(providerOnly), {}, '?unexpected=yes')).status, 403);
  assert.equal((await get(app, browserCookies(providerOnly), { 'sec-fetch-site': 'same-site' })).status, 403);
  assert.equal(app.calls.verify, 0);
  assert.deepEqual(app.calls.rpc, []);
});

test('a stale selection, missing sign-in or changed provider or subject cannot enqueue a request', async t => {
  const app = await fixture(t);
  const body = submission(actor(providerOnly));
  assert.equal((await get(app)).status, 401);
  assert.equal((await get(app, browserCookies(providerOnly), { authorization: 'Bearer SYNTHETIC' })).status, 401);
  assert.equal((await post(app, body)).status, 401);
  assert.equal((await post(app, body, { ...browserCookies(providerOnly), 'fixture-auth-subject': other })).status, 401);
  assert.equal((await post(app, body, browserCookies(other))).status, 409);
  assert.equal((await post(app, submission(actor(member, 'wallet')), browserCookies(linked))).status, 409);
  assert.deepEqual(app.calls.rpc, []);
});

test('confirmation, receipt shape and request-size errors do not reach authentication', async t => {
  const app = await fixture(t);
  for (const body of [
    { ...submission(actor(providerOnly)), confirmation: 'delete' },
    { ...submission(actor(providerOnly)), code: 'a'.repeat(101) },
    { ...submission(actor(providerOnly)), email: 'other@example.test' },
    { ...submission(actor(providerOnly)), owner: { ...actor(providerOnly), extra: 1 } },
    { ...submission(actor(providerOnly)), code: 'a'.repeat(5000) },
    { ...status(makeCode()), extra: true },
  ]) assert.equal((await post(app, body, browserCookies(providerOnly))).status, 400);
  assert.equal(app.calls.verify, 0);
  assert.deepEqual(app.calls.rpc, []);
});

test('a verified account without a member gets one private receipt without creating a member', async t => {
  const app = await fixture(t);
  const cookies = browserCookies(providerOnly);
  const overview = await get(app, cookies);
  privateHeaders(overview);
  assert.deepEqual(await overview.json(), { owner: actor(providerOnly), label: 'fictional.reader@example.test', reviewDays: 4, request: null });
  const body = submission(actor(providerOnly));
  const received = await receipt(await post(app, body, cookies), body.code);
  assert.equal(Date.parse(received.reviewBy) - Date.parse(received.requestedAt), 4 * 86400000);
  assert.deepEqual((await (await get(app, cookies)).json()).request, received);
  assert.equal((await (await get(app, browserCookies(other))).json()).request, null);
  assert.equal(app.calls.member, 0);
  const rows = await app.db.query(`
    SELECT member_id, auth_user_id, encode(receipt_hash,'hex') AS digest
    FROM soe_account_deletion_private.requests
  `);
  assert.deepEqual(rows.rows, [{
    member_id: null, auth_user_id: providerOnly,
    digest: createHash('sha256').update(body.code.split('.')[1]).digest('hex'),
  }]);
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM members')).rows[0].n, 1);
});

test('a repeat with the same code keeps the original review date, even after a member is linked', async t => {
  const app = await fixture(t);
  const cookies = browserCookies(providerOnly);
  const body = submission(actor(providerOnly));
  const one = await receipt(await post(app, body, cookies), body.code);
  await app.db.query('INSERT INTO members(id,supabase_auth_id) VALUES ($1,$2)', [randomUUID(), providerOnly]);
  app.intake(8);
  assert.deepEqual(await receipt(await post(app, body, cookies), body.code), one);
  assert.equal((await post(app, submission(actor(providerOnly)), cookies)).status, 409);
  assert.equal((await post(app, submission(actor(other), body.code), browserCookies(other))).status, 409);
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM soe_account_deletion_private.requests')).rows[0].n, 1);
});

test('linked wallet and Supabase sign-ins see one pending request and a revoked wallet loses access', async t => {
  const app = await fixture(t);
  const body = submission(actor(member, 'wallet'));
  const received = await receipt(await post(app, body, app.walletCookies), body.code);
  assert.deepEqual((await (await get(app, browserCookies(linked))).json()).request, received);
  assert.equal((await post(app, submission(actor(linked)), browserCookies(linked))).status, 409);
  assert.equal(await app.revokeWallet(), true);
  assert.equal((await get(app, app.walletCookies)).status, 401);
  assert.equal((await post(app, body, app.walletCookies)).status, 401);
});

test('the full code retrieves only the receipt while intake is off, and wrong and absent codes give the same 404', async t => {
  const app = await fixture(t);
  const body = submission(actor(providerOnly));
  const received = await receipt(await post(app, body, browserCookies(providerOnly)), body.code);
  app.intake(null);
  assert.deepEqual(await receipt(await post(app, status(body.code)), body.code), received);
  assert.equal((await post(app, submission(actor(other)), browserCookies(other))).status, 503);
  app.intake(31);
  assert.equal((await post(app, submission(actor(other)), browserCookies(other))).status, 503);
  const wrongSecret = body.code.split('.')[0] + '.' + makeCode().split('.')[1];
  const wrong = await post(app, status(wrongSecret));
  const missing = await post(app, status(makeCode()));
  assert.equal(wrong.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(await wrong.json(), await missing.json());
});

test('browser and service roles cannot read or change the table and browser roles cannot execute the service routines', async t => {
  const app = await fixture(t);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const statement of [
      'SELECT * FROM soe_account_deletion_private.requests',
      'UPDATE soe_account_deletion_private.requests SET review_by = now()',
      'DELETE FROM soe_account_deletion_private.requests',
      ...(role === 'service_role' ? [] : [
        'SELECT * FROM public.soe_account_deletion_status(NULL,NULL)',
        'SELECT * FROM public.soe_account_deletion_owner_state(NULL,NULL)',
        'SELECT * FROM public.soe_account_deletion_request(NULL,NULL,NULL,NULL,NULL)',
      ]),
    ]) {
      await assert.rejects(app.db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE ' + role);
        await tx.exec(statement);
      }), error => error.code === '42501');
    }
  }
});
