import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  browserCookies, cookieHeader, createAccountDeletionApp, intent, linked, member, other, providerOnly, walletAddress,
} from './support/account-deletion-app.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const { SiweMessage } = require('siwe');
const { Wallet } = require('ethers');
const origin = 'https://members.soe.test';
const bearer = subject => 'Bearer SYNTHETIC_BEARER_' + subject;
const asWallet = 'wallet';
const asSupabase = 'supabase';

async function fixture(t, address) {
  const app = await createAccountDeletionApp(origin, { erasure: true, address });
  t.after(app.close);
  return app;
}

function route(app, path, method, cookies = {}, body, extra = {}, query = '') {
  return app.dispatchAt(path, method, {
    headers: { origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', cookie: cookieHeader(cookies), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body), query,
  });
}

async function enqueue(app, subject, provider = asSupabase) {
  const id = randomUUID(), code = id + '.' + randomBytes(32).toString('hex');
  const cookies = provider === asWallet ? app.walletCookies : browserCookies(subject);
  const reply = await route(app, '/api/account/deletion', 'POST', cookies, {
    action: 'request', confirmation: 'DELETE', owner: { provider, subject }, code,
  });
  assert.equal(reply.status, 200);
  return { id, code, response: await reply.json() };
}

async function start(app, id, memberId, authId) {
  const result = await app.db.query(
    'SELECT soe_account_deletion_private.start_erasure($1,$2,$3) AS started', [id, memberId, authId],
  );
  return result.rows[0].started.toISOString();
}

async function rejectPrivate(reply) {
  assert.equal(reply.status, 401);
  assert.match(reply.headers.get('cache-control'), /private.*no-store/);
  assert.equal(reply.headers.get('set-cookie'), null);
}

test('owner-started processing retires wallet, selected browser and native bearer access while preserving the public status receipt', async t => {
  const app = await fixture(t);
  const pending = await enqueue(app, member, asWallet);
  for (const [cookies, extra] of [
    [app.walletCookies, {}], [browserCookies(linked), {}], [{}, { authorization: bearer(linked) }],
  ]) {
    const ok = await route(app, '/api/auth/member', 'GET', cookies, undefined, extra);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).member.id, member);
  }
  const started = await start(app, pending.id, member, linked);
  assert.equal(await start(app, pending.id, member, linked), started);
  const beforeMemberQueries = app.calls.member;
  for (const [cookies, extra] of [
    [app.walletCookies, {}],
    [browserCookies(linked), {}],
    [{}, { authorization: bearer(linked) }],
    [browserCookies(linked), { authorization: bearer(linked), 'x-soe-auth-intent': intent }],
  ]) {
    await rejectPrivate(await route(app, '/api/auth/member', 'GET', cookies, undefined, extra));
    await rejectPrivate(await route(app, '/api/great-books/progress', 'GET', cookies, undefined, extra));
  }
  const edge = await route(app, '/api/projects/create', 'POST', {}, {}, { authorization: bearer(linked) });
  await rejectPrivate(edge);
  assert.equal(app.calls.member, beforeMemberQueries);

  const anonymous = await route(app, '/api/account/deletion', 'POST', {}, { action: 'status', code: pending.code });
  assert.equal(anonymous.status, 200);
  assert.deepEqual(await anonymous.json(), pending.response);
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM members')).rows[0].n, 1);
  const next = await route(app, '/api/auth/ensure-member', 'POST', {}, { displayName: 'Unrelated' }, { authorization: bearer(other) });
  assert.equal(next.status, 200);
  assert.equal((await next.json()).created, true);
});

test('a provider-only request stops ordinary sign-in choice and profile provisioning; the SQL trigger also refuses stale identity creation', async t => {
  const app = await fixture(t);
  const pending = await enqueue(app, providerOnly);
  await start(app, pending.id, null, providerOnly);
  const cookies = browserCookies(providerOnly);
  const before = app.calls.member;
  await rejectPrivate(await route(app, '/api/auth/provider', 'POST', cookies, {
    provider: asSupabase, intent, expectedSubject: providerOnly,
  }));
  await rejectPrivate(await route(app, '/api/auth/ensure-member', 'POST', cookies, { displayName: 'Fictional' }));
  await rejectPrivate(await route(app, '/api/auth/ensure-member', 'POST', {}, { displayName: 'Fictional' }, { authorization: bearer(providerOnly) }));
  assert.equal(app.calls.member, before);
  await assert.rejects(app.db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE service_role');
    await tx.query('INSERT INTO public.members(supabase_auth_id) VALUES($1)', [providerOnly]);
  }), error => error.code === 'PT403');
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM public.members WHERE supabase_auth_id=$1', [providerOnly])).rows[0].n, 0);
});

test('Google callback keeps its buffered cookies private after the exact subject enters processing', async t => {
  const app = await fixture(t);
  const cookies = { ...browserCookies(linked), soe_auth_pkce_intent: intent };
  const query = '?code=SYNTHETIC_OAUTH&intent=' + intent + '&next=%2Fdashboard';
  const current = await route(app, '/auth/callback', 'GET', cookies, undefined, {}, query);
  assert.equal(new URL(current.headers.get('location')).pathname, '/auth/complete');
  assert(current.cookies.get('soe_auth_selection_v1'));
  const pending = await enqueue(app, linked);
  await start(app, pending.id, member, linked);
  const refused = await route(app, '/auth/callback', 'GET', cookies, undefined, {}, query);
  assert.equal(new URL(refused.headers.get('location')).pathname, '/login');
  assert.equal(refused.headers.get('set-cookie'), null);
});

test('a valid fresh wallet signature cannot mint a session or recreate an identity under removal', async t => {
  const signer = Wallet.createRandom();
  const app = await fixture(t, signer.address);
  async function signIn() {
    const cookies = { soe_auth_intent: intent };
    const challenge = await route(app, '/api/auth/nonce', 'GET', cookies, undefined, { 'x-soe-auth-intent': intent });
    assert.equal(challenge.status, 200);
    const { nonce } = await challenge.json();
    cookies.soe_siwe_nonce = challenge.cookies.get('soe_siwe_nonce').value;
    const message = new SiweMessage({ domain: new URL(origin).host, address: signer.address, uri: origin, version: '1', chainId: 1, nonce }).prepareMessage();
    return route(app, '/api/auth/siwe', 'POST', cookies, {
      message, intent, address: signer.address, signature: await signer.signMessage(message),
    });
  }
  const normal = await signIn();
  assert.equal(normal.status, 200);
  assert(normal.cookies.get('soe_wallet_id'));
  const pending = await enqueue(app, member, asWallet);
  await start(app, pending.id, member, linked);
  await rejectPrivate(await signIn());
  // In this synthetic fixture the member row can be removed independently.
  // The already-started processing record still holds the wallet digest.
  await app.db.query('DELETE FROM public.members WHERE id=$1', [member]);
  await rejectPrivate(await signIn());
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM members')).rows[0].n, 0);
});

test('owner review must match current linkage and duplicate wallets fail closed', async t => {
  const app = await fixture(t);
  const pending = await enqueue(app, providerOnly);
  const newMember = randomUUID();
  await app.db.query('INSERT INTO public.members(id,supabase_auth_id) VALUES($1,$2)', [newMember, providerOnly]);
  await assert.rejects(start(app, pending.id, null, providerOnly), error => error.code === 'PT409');
  await assert.rejects(start(app, pending.id, member, providerOnly), error => error.code === 'PT409');
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM soe_account_deletion_private.processing')).rows[0].n, 0);
  await start(app, pending.id, newMember, providerOnly);
  const walletPending = await enqueue(app, member, asWallet);
  const duplicate = randomUUID();
  await app.db.query('INSERT INTO public.members(id,wallet_address) VALUES($1,$2)', [duplicate, walletAddress]);
  await assert.rejects(start(app, walletPending.id, member, linked), error => error.code === 'PT409');
  await app.db.query('DELETE FROM public.members WHERE id=$1', [duplicate]);
  await app.db.query('UPDATE public.members SET supabase_auth_id=$1 WHERE id=$2', [other, member]);
  await assert.rejects(start(app, walletPending.id, member, linked), error => error.code === 'PT409');
  await assert.rejects(start(app, walletPending.id, member, other), error => error.code === 'PT409');
  assert.equal((await route(app, '/api/auth/member', 'GET', app.walletCookies)).status, 200);
});

test('only the database owner starts processing and the service access check fails closed when unavailable', async t => {
  const app = await fixture(t);
  const pending = await enqueue(app, linked);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const sql of [
      'SELECT * FROM soe_account_deletion_private.processing',
      'SELECT * FROM soe_account_deletion_private.identity_gate',
      `SELECT soe_account_deletion_private.start_erasure('${pending.id}', '${member}', '${linked}')`,
      ...(role === 'service_role' ? [] : ["SELECT public.soe_account_erasure_access_allowed('supabase',NULL)"]),
    ]) {
      await assert.rejects(app.db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE ' + role);
        await tx.exec(sql);
      }), error => error.code === '42501');
    }
  }
  app.makeGuardUnavailable();
  await rejectPrivate(await route(app, '/api/auth/member', 'GET', app.walletCookies));
  await rejectPrivate(await route(app, '/api/auth/member', 'GET', {}, undefined, { authorization: bearer(linked) }));
  const anonymous = await route(app, '/api/account/deletion', 'POST', {}, { action: 'status', code: pending.code });
  assert.equal(anonymous.status, 200);
});
