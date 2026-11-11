import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { offlineApp } from './support/offline-app.mjs';
import { browserCookies, cookieHeader, createAccountDeletionApp, linked, member, other, providerOnly } from './support/account-deletion-app.mjs';

const origin = 'https://members.soe.test';
const contract = offlineApp().load('lib/account/deletion-contract.ts');
const code = () => randomUUID() + '.' + randomBytes(32).toString('hex');
const base = { id: '11111111-1111-4111-8111-111111111111', requestedAt: '2026-11-11T10:00:00.000Z', reviewBy: '2026-11-15T10:00:00.000Z' };
async function fixture(t, options = {}) {
  const app = await createAccountDeletionApp(origin, { progress: true, ...options });
  t.after(app.close);
  return app;
}
function post(app, body, cookies = {}, extra = {}) {
  return app.dispatch('POST', { body: JSON.stringify(body), headers: {
    origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', cookie: cookieHeader(cookies), ...extra,
  } });
}
function get(app, cookies = {}) { return app.dispatch('GET', { headers: { cookie: cookieHeader(cookies) } }); }
async function submit(app, subject, provider = 'supabase') {
  const fullCode = code();
  const body = { action: 'request', code: fullCode, confirmation: 'DELETE', owner: { provider, subject } };
  const reply = await post(app, body, provider === 'wallet' ? app.walletCookies : browserCookies(subject));
  assert.equal(reply.status, 200);
  return { code: fullCode, body, receipt: (await reply.json()).request };
}
async function status(app, fullCode) {
  const reply = await post(app, { action: 'status', code: fullCode });
  assert.equal(reply.status, 200);
  assert.match(reply.headers.get('cache-control'), /private.*no-store/);
  assert.match(reply.headers.get('x-robots-tag'), /noindex/);
  assert.equal(reply.headers.get('referrer-policy'), 'no-referrer');
  const body = await reply.json();
  assert.deepEqual(Object.keys(body), ['request']);
  assert.deepEqual(Object.keys(body.request).sort(), ['id', 'processingStartedAt', 'requestedAt', 'reviewBy']);
  assert(!JSON.stringify(body).includes(fullCode.split('.')[1]));
  return body.request;
}
async function start(app, pending, memberId, authId) {
  return (await app.db.query('SELECT soe_account_deletion_private.start_erasure($1,$2,$3) AS started',
    [pending.receipt.id, memberId, authId])).rows[0].started.toISOString();
}

test('legacy omission, explicit recorded state and processing timestamps survive both receipt parses without promotion', () => {
  for (const [receipt, state] of [[base, 'unknown'], [{ ...base, processingStartedAt: null }, 'recorded'],
    [{ ...base, processingStartedAt: '2026-11-11T10:00:00.000001Z' }, 'processing']]) {
    const parsed = contract.parseDeletionReceipt(receipt);
    assert(parsed);
    const again = contract.parseDeletionReceipt(JSON.parse(JSON.stringify(parsed)));
    assert.equal(contract.deletionReceiptProgress(again), state);
    assert.equal(Object.hasOwn(again, 'processingStartedAt'), state !== 'unknown');
  }
});

test('receipt timestamps reject impossible calendars, absent timezones, reversed microseconds and invented completion fields', () => {
  for (const invalid of ['2026-02-29T10:00:00Z', '2026-11-31T10:00:00Z', '2026-11-11T24:00:00Z',
    '2026-11-11T10:00:60Z', '2026-11-11T10:00:00', '2026-11-11', '2026-11-11T10:00:00-00:00',
    '2026-11-11T10:00:00+24:00', '2026-11-11T10:00:00+00:60', '0000-11-11T10:00:00Z']) {
    assert.equal(contract.parseDeletionReceipt({ ...base, requestedAt: invalid }), null, invalid);
  }
  for (const extra of [{ processingStartedAt: undefined }, { processingStartedAt: false }, { processingStartedAt: '2026-11-11T09:59:59.999999Z' },
    { requestedAt: '2026-11-11T10:00:00.000002Z', processingStartedAt: '2026-11-11T10:00:00.000001Z' },
    { requestedAt: '2026-11-11T10:00:00.000002Z', reviewBy: '2026-11-11T10:00:00.000001Z' },
    { reviewBy: base.requestedAt }, { reviewBy: '2026-11-10T10:00:00Z' }, { completed: true }, { auth_user_id: providerOnly }]) {
    assert.equal(contract.parseDeletionReceipt({ ...base, ...extra }), null);
  }
  assert(contract.parseDeletionReceipt({ ...base, requestedAt: '2026-11-11T10:00:00.000001Z', reviewBy: '2026-11-11T10:00:00.000002Z' }));
  assert(contract.parseDeletionReceipt({ ...base, processingStartedAt: '2026-11-11T05:00:00-05:00' }));
  assert(contract.parseDeletionReceipt({ ...base, processingStartedAt: '2026-11-11T15:30:00+05:30' }));
  assert(contract.parseDeletionReceipt({ ...base, requestedAt: '2024-02-29T10:00:00Z' }));
});

// Actual route handlers and SQL, through the strict service-query adapter.
// This does not exercise hosted PostgREST serialization or a real identity.
test('SQL records processing for a provider-only request and signed-out status reveals only the four safe fields', async t => {
  const app = await fixture(t);
  const pending = await submit(app, providerOnly);
  assert.equal(pending.receipt.processingStartedAt, null);
  assert.equal(contract.deletionReceiptProgress(pending.receipt), 'recorded');
  assert.deepEqual((await (await get(app, browserCookies(providerOnly))).json()).request, pending.receipt);
  assert.equal((await (await get(app, browserCookies(other))).json()).request, null);
  const started = await start(app, pending, null, providerOnly);
  app.intake(null);
  const beforeVerify = app.calls.verify;
  const receipt = await status(app, pending.code);
  assert.equal(receipt.processingStartedAt, started);
  assert.equal(contract.deletionReceiptProgress(contract.parseDeletionReceipt(receipt)), 'processing');
  assert.equal(app.calls.verify, beforeVerify, 'status code lookup does not require sign-in');
  assert.equal((await get(app)).status, 401);
  const ordinary = await app.dispatchAt('/api/auth/member', 'GET', { headers: { cookie: cookieHeader(browserCookies(providerOnly)) } });
  assert.equal(ordinary.status, 401);
  assert.deepEqual((await (await get(app, browserCookies(providerOnly))).json()).request, receipt);
  assert(!JSON.stringify(receipt).includes(providerOnly));
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM public.members')).rows[0].n, 1);
});

test('linked wallet and provider share authorized progress while the private code remains usable after access retirement', async t => {
  const app = await fixture(t);
  const pending = await submit(app, member, 'wallet');
  assert.deepEqual((await (await get(app, browserCookies(linked))).json()).request, pending.receipt);
  const started = await start(app, pending, member, linked);
  assert.equal((await get(app, app.walletCookies)).status, 401);
  assert.equal((await status(app, pending.code)).processingStartedAt, started);
  assert.equal((await (await get(app, browserCookies(other))).json()).request, null);
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM public.members')).rows[0].n, 1);
});

test('wrong and missing codes have identical private failures and failed owner checks never invoke receipt SQL', async t => {
  const app = await fixture(t);
  const pending = await submit(app, providerOnly);
  await start(app, pending, null, providerOnly);
  const wrong = await post(app, { action: 'status', code: pending.receipt.id + '.' + randomBytes(32).toString('hex') });
  const missing = await post(app, { action: 'status', code: code() });
  assert.equal(wrong.status, 404); assert.equal(missing.status, 404);
  assert.deepEqual(await wrong.json(), await missing.json());
  const before = app.calls.rpc.length;
  for (const cookies of [{}, { ...browserCookies(providerOnly), 'fixture-auth-subject': other }]) {
    assert.equal((await get(app, cookies)).status, 401);
  }
  assert.equal((await post(app, pending.body, browserCookies(other))).status, 409);
  assert.equal((await post(app, { action: 'status', code: pending.code }, {}, { origin: 'https://evil.invalid' })).status, 403);
  assert.equal(app.calls.rpc.length, before);
});

test('an older SQL backend falls back only for the exact missing RPC and keeps processing unknown through the route/client round trip', async t => {
  const app = await fixture(t, { progress: false, erasure: true });
  const pending = await submit(app, providerOnly);
  await start(app, pending, null, providerOnly);
  const reply = await post(app, { action: 'status', code: pending.code });
  assert.equal(reply.status, 200);
  const receipt = (await reply.json()).request;
  assert.deepEqual(Object.keys(receipt).sort(), ['id', 'requestedAt', 'reviewBy']);
  const parsed = contract.parseDeletionReceipt(receipt);
  assert.equal(Object.hasOwn(parsed, 'processingStartedAt'), false);
  assert.equal(contract.deletionReceiptProgress(parsed), 'unknown');
  assert.deepEqual(app.calls.rpc.filter(n => n.startsWith('soe_account_deletion_')), [
    'soe_account_deletion_request_progress', 'soe_account_deletion_request',
    'soe_account_deletion_status_progress', 'soe_account_deletion_status',
  ]);
});

test('RPC failure and malformed progress fail unavailable without replaying a possibly attempted submission', async t => {
  let fault;
  const app = await fixture(t, { rpcFault: name => name === 'soe_account_deletion_request_progress' ? fault : undefined });
  const failures = [
    { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.other_function() in the schema cache' } },
    { data: null, error: { code: 'PGRST202' } },
    { data: null, error: { code: '42501', message: 'Permission denied' } },
    { data: { ...base, processingStartedAt: false }, error: null },
    { data: { ...base, processingStartedAt: null, auth_user_id: providerOnly }, error: null },
  ];
  for (fault of failures) {
    const before = app.calls.rpc.length;
    const result = await post(app, { action: 'request', code: code(), confirmation: 'DELETE', owner: { provider: 'supabase', subject: providerOnly } }, browserCookies(providerOnly));
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: 'Account deletion requests are temporarily unavailable.' });
    assert.deepEqual(app.calls.rpc.slice(before), ['soe_account_deletion_request_progress']);
  }
  assert.equal((await app.db.query('SELECT count(*)::int AS n FROM soe_account_deletion_private.requests')).rows[0].n, 0);
});

test('progress routines preserve the effective service-only boundary without granting raw private table access', async t => {
  const app = await fixture(t);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const query of ['SELECT * FROM soe_account_deletion_private.requests', 'SELECT * FROM soe_account_deletion_private.processing',
      'UPDATE soe_account_deletion_private.processing SET started_at=now()',
      ...(role === 'service_role' ? [] : [
        'SELECT * FROM public.soe_account_deletion_owner_progress(NULL,NULL)',
        'SELECT * FROM public.soe_account_deletion_request_progress(NULL,NULL,NULL,NULL,NULL)',
        'SELECT * FROM public.soe_account_deletion_status_progress(NULL,NULL)',
        'SELECT * FROM soe_account_deletion_private.status_progress(NULL,NULL)',
      ])]) {
      await assert.rejects(app.db.transaction(async tx => { await tx.exec('SET LOCAL ROLE ' + role); await tx.exec(query); }), error => error.code === '42501');
    }
  }
  const routines = (await app.db.query(`SELECT n.nspname,p.proname,p.prosecdef,p.provolatile,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname IN ('owner_progress','request_progress','status_progress','soe_account_deletion_owner_progress','soe_account_deletion_request_progress','soe_account_deletion_status_progress')`)).rows;
  assert.equal(routines.length, 6);
  for (const routine of routines) {
    assert.equal(routine.prosecdef, routine.nspname === 'soe_account_deletion_private');
    assert.equal(routine.provolatile, routine.proname.includes('request_progress') ? 'v' : 's');
    assert.deepEqual(routine.proconfig, ['search_path=pg_catalog']);
  }
});
