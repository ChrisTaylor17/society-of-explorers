import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb, rpc, asRole, IDS, SCOPE, CONFIG_HASH, OFFER, TERMS, requestId, eventId,
  read, begin, customer, complete, snapshot, apply } from './support/supporter-db.mjs';

const reject = (fn, code) => assert.rejects(fn, error => error.code === code);
async function fixture(t) { const db = await createDb(); t.after(() => db.close()); return db; }

test('read is self-scoped and never provisions accounts or changes existing tiers', async t => {
  const db = await fixture(t);
  assert.deepEqual(await read(db), { accountId: null, revision: 0, customerId: null, riskReview: false,
    otherScopeBlocked: false, attempt: null, portalAttempt: null, subscription: null });
  await read(db, IDS.other);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM supporter_accounts')).rows[0].n, 0);
  assert.deepEqual((await db.query('SELECT tier FROM members ORDER BY id')).rows.map(row => row.tier), ['free', 'oracle']);
  await reject(() => read(db, IDS.absent), 'PT403');
  for (const scope of ['', 'test:acct_x:live', 'live:evil', 'TEST:acct_A', 'test:acct_A\n']) await reject(() => read(db, IDS.actor, scope), 'PT400');
});

test('explicit begin records fixed stable parameters; exact retries precede CAS but changed config conflicts', async t => {
  const db = await fixture(t); const key = requestId();
  const state = await begin(db, { key });
  assert.equal(state.revision, 1); assert.equal(state.attempt.status, 'pending');
  assert.equal(Date.parse(state.attempt.expiresAt) - Date.parse(state.attempt.createdAt), 3600000);
  assert.equal(Date.parse(state.attempt.retryUntil) - Date.parse(state.attempt.createdAt), 22 * 3600000);
  const replay = await begin(db, { key, revision: 876 });
  assert.equal(replay.replayed, true); assert.deepEqual(replay.attempt, state.attempt);
  await reject(() => begin(db, { key, hash: 'b'.repeat(64) }), 'PT409');
  await reject(() => begin(db, { revision: state.revision }), 'PT409');
  for (const input of [{ offer: 'free' }, { terms: 'old' }, { hash: 'not-sha' }, { revision: -1 }, { key: null }]) {
    await reject(() => begin(db, input), 'PT400');
  }
  assert.equal((await read(db)).revision, 1);
});

test('unresolved unknown checkout stays blocked beyond provider TTL and same key remains original', async t => {
  const db = await fixture(t); let state = await begin(db);
  state = await rpc(db, 'soe_supporter_checkout_unknown', [IDS.actor, SCOPE, state.attempt.requestId]);
  await db.query(`UPDATE supporter_checkout_attempts SET created_at=created_at-interval '25 hours',
    expires_at=expires_at-interval '25 hours',retry_until=retry_until-interval '25 hours' WHERE account_id=$1`, [state.accountId]);
  const aged = await read(db);
  assert.ok(Date.parse(aged.attempt.retryUntil) < Date.now());
  const retry = await begin(db, { key: state.attempt.requestId, revision: 0 });
  assert.equal(retry.attempt.status, 'unknown'); assert.deepEqual(retry.attempt, aged.attempt);
  await reject(() => begin(db, { revision: aged.revision }), 'PT409');
});

test('customer stage recovers a lost provider response and refuses actor/customer rebinding', async t => {
  const db = await fixture(t); const first = await begin(db); const state = await customer(db, first);
  assert.equal(state.customerId, 'cus_FictionalOne'); assert.equal(state.revision, 2);
  assert.equal((await customer(db, first)).replayed, true);
  await reject(() => customer(db, first, 'cus_Different'), 'PT409');
  await reject(() => customer(db, first, 'cus_FictionalOne', IDS.other), 'PT404');
  const second = await begin(db, { actor: IDS.other });
  await reject(() => customer(db, second, 'cus_FictionalOne', IDS.other), 'PT409');
  assert.equal((await read(db, IDS.other)).customerId, null);
});

test('same customer ID is isolated by provider account and live/test scope', async t => {
  const db = await fixture(t); const states = [];
  for (const scope of [SCOPE, 'live:acct_FictionalOne', 'test:acct_FictionalTwo']) {
    const state = await customer(db, await begin(db, { scope }), 'cus_FictionalOne', IDS.actor, scope);
    states.push(state);
    await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, scope, state.attempt.requestId, state.revision, 'rejected', null]);
  }
  assert.equal(new Set(states.map(state => state.accountId)).size, 3);
  await reject(() => rpc(db, 'soe_supporter_event_state', [SCOPE, states[1].accountId, 'cus_FictionalOne']), 'PT404');
});

test('changing configured provider account cannot bypass same-mode unfinished activity while test and live remain separate', async t => {
  const db = await fixture(t); const first = await begin(db);
  assert.equal((await read(db, IDS.actor, 'test:acct_Replacement')).otherScopeBlocked, true);
  await reject(() => begin(db, { scope: 'test:acct_Replacement' }), 'PT409');
  const live = await begin(db, { scope: 'live:acct_Replacement' });
  assert.equal(live.otherScopeBlocked, false);
  assert.equal((await read(db, IDS.actor, 'test:acct_Replacement')).accountId, null);
  const rejected = await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, first.attempt.requestId, first.revision, 'rejected', null]);
  const replacement = await begin(db, { scope: 'test:acct_Replacement' });
  assert.equal(replacement.otherScopeBlocked, false); assert.notEqual(replacement.accountId, rejected.accountId);
});

test('same-mode active subscription and completed-unresolved receipts still block account swaps after checkout settles', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db));
  const settled = await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, state.attempt.requestId, state.revision,
    'completed', 'cs_test_ScopeGuard', null, state.attempt.expiresAt, 'sub_FictionalOne']);
  await reject(() => begin(db, { scope: 'test:acct_Replacement' }), 'PT409');
  const active = await apply(db, settled);
  assert.equal((await read(db, IDS.actor, 'test:acct_Replacement')).otherScopeBlocked, true);
  await reject(() => begin(db, { scope: 'test:acct_Replacement' }), 'PT409');
  await apply(db, active, { value: snapshot({ status: 'canceled', paid: false }) });
  assert.equal((await begin(db, { scope: 'test:acct_Replacement' })).otherScopeBlocked, false);
});

test('session registration is atomic, exact and bound to original expiry and known customer', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db));
  const ready = await complete(db, state); assert.equal(ready.attempt.status, 'ready'); assert.equal(ready.revision, 3);
  assert.equal((await complete(db, state)).replayed, true);
  await reject(() => complete(db, state, { sessionId: 'cs_test_Different' }), 'PT409');
  await reject(() => complete(db, state, { url: 'https://evil.example/c/pay/x' }), 'PT400');
  await reject(() => rpc(db, 'soe_supporter_checkout_complete', [IDS.actor, SCOPE, state.attempt.requestId,
    state.customerId, 'cs_test_FictionalOne', 'https://checkout.stripe.com/c/pay/fictional', '2030-01-01T00:00:00Z']), 'PT409');
  assert.equal((await read(db)).revision, ready.revision);
});

test('verified resolution permits a new UUID but never rewrites an original request', async t => {
  const db = await fixture(t); const ready = await complete(db, await customer(db, await begin(db)));
  const expired = await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, ready.attempt.requestId, ready.revision, 'expired', ready.attempt.sessionId]);
  const next = await begin(db, { revision: expired.revision });
  assert.notEqual(next.attempt.requestId, expired.attempt.requestId);
  const original = await begin(db, { key: expired.attempt.requestId, revision: 0 });
  assert.equal(original.attempt.status, 'expired'); assert.equal(original.revision, next.revision);
  await reject(() => rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, next.attempt.requestId, next.revision, 'expired', null]), 'PT409');
});

test('provider-confirmed pre-session rejection and rolling limits are durable and replay-safe', async t => {
  const db = await fixture(t); let revision = 0; let original;
  for (let i = 0; i < 3; i++) {
    const state = await begin(db, { revision }); original ??= state;
    const resolved = await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, state.attempt.requestId, state.revision, 'rejected', null]);
    revision = resolved.revision;
  }
  await reject(() => begin(db, { revision }), 'PT409');
  assert.equal((await begin(db, { key: original.attempt.requestId })).replayed, true);
});

test('event snapshot and receipt commit together; duplicate hashes replay current state and conflict hashes fail', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db)); const key = eventId();
  const applied = await apply(db, state, { event: key });
  assert.equal(applied.subscription.status, 'active'); assert.equal(applied.subscription.paid, true);
  assert.equal(applied.appliedRevision, applied.revision);
  const later = await apply(db, applied, { kind: 'risk', value: null });
  const replay = await apply(db, state, { event: key });
  assert.equal(replay.replayed, true); assert.equal(replay.revision, later.revision); assert.equal(replay.riskReview, true);
  await reject(() => apply(db, later, { event: key, hash: 'b'.repeat(64) }), 'PT409');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM supporter_webhook_receipts')).rows[0].n, 2);
  assert.deepEqual((await db.query('SELECT tier FROM members ORDER BY id')).rows.map(row => row.tier), ['free', 'oracle']);
});

test('stale CAS and malformed snapshots create neither receipts nor partial subscription updates', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db));
  await reject(() => apply(db, state, { revision: 0 }), 'PT409');
  for (const value of [null, {}, [], snapshot({ extra: true }), snapshot({ status: 'mystery' }), snapshot({ paid: 'true' }),
    snapshot({ currentPeriodEnd: '2026-10-01T00:00:00Z' }), snapshot({ currentPeriodStart: 'infinity' }), snapshot({ currentPeriodEnd: null }),
    snapshot({ status: 'trialing' })]) await reject(() => apply(db, state, { value }), 'PT400');
  assert.equal((await read(db)).subscription, null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM supporter_webhook_receipts')).rows[0].n, 0);
  assert.equal((await read(db)).revision, state.revision);
});

test('events require pre-existing exact scope/account/customer ownership and cannot provision', async t => {
  const db = await fixture(t); const state = await begin(db);
  await reject(() => apply(db, state, { customerId: 'cus_FictionalOne' }), 'PT404');
  const mapped = await customer(db, state);
  for (const input of [{ scope: 'live:acct_FictionalOne' }, { account: IDS.absent }, { customerId: 'cus_Other' }]) {
    await reject(() => apply(db, mapped, input), 'PT404');
  }
  assert.equal((await read(db)).subscription, null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM supporter_accounts')).rows[0].n, 1);
});

test('lost session response can be atomically recovered by a verified completed event without an obsolete URL', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db));
  const settled = await apply(db, state, { kind: 'checkout', request: state.attempt.requestId, status: 'completed',
    sessionId: 'cs_test_Recovered', expiry: state.attempt.expiresAt });
  assert.equal(settled.attempt.status, 'completed'); assert.equal(settled.attempt.sessionId, 'cs_test_Recovered');
  assert.equal(settled.attempt.sessionUrl, null); assert.equal(settled.subscription.status, 'active');
  await reject(() => begin(db, { revision: settled.revision }), 'PT409');
});

test('a failed event resolution rolls back snapshot, receipt and revision together', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db));
  await reject(() => apply(db, state, { kind: 'checkout', request: state.attempt.requestId, status: 'completed',
    sessionId: 'cs_test_Recovered', expiry: '2030-01-01T00:00:00Z' }), 'PT400');
  assert.equal((await read(db)).subscription, null); assert.equal((await read(db)).revision, state.revision);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM supporter_webhook_receipts')).rows[0].n, 0);
});

test('manual reconciliation adopts a terminal session after a lost reply without allowing another charge', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db));
  const settled = await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, state.attempt.requestId, state.revision,
    'completed', 'cs_test_ManualRecovered', null, state.attempt.expiresAt, 'sub_FictionalOne']);
  assert.equal(settled.attempt.status, 'completed'); assert.equal(settled.attempt.sessionUrl, null);
  await reject(() => begin(db, { revision: settled.revision }), 'PT409');
  const terminal = await apply(db, settled, { value: snapshot({ status: 'canceled', paid: false }) });
  const fresh = await begin(db, { revision: terminal.revision });
  assert.notEqual(fresh.attempt.requestId, settled.attempt.requestId);
});

test('an older canceled subscription snapshot before or after a new completion cannot authorize another checkout', async t => {
  const db = await fixture(t); let state = await customer(db, await begin(db));
  state = await apply(db, state, { value: snapshot({ id: 'sub_OldCanceled', status: 'canceled', paid: false }) });
  await reject(() => rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, state.attempt.requestId, state.revision,
    'completed', 'cs_test_NewComplete', null, state.attempt.expiresAt]), 'PT400');
  state = await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, state.attempt.requestId, state.revision,
    'completed', 'cs_test_NewComplete', null, state.attempt.expiresAt, 'sub_NewComplete']);
  assert.equal(state.attempt.subscriptionId, 'sub_NewComplete'); assert.ok(state.attempt.resolvedAt);
  await reject(() => begin(db, { revision: state.revision }), 'PT409');
  assert.equal((await read(db, IDS.actor, 'test:acct_Replacement')).otherScopeBlocked, true);
  state = await apply(db, state, { value: snapshot({ id: 'sub_OldCanceled', status: 'canceled', paid: false }) });
  await reject(() => begin(db, { revision: state.revision }), 'PT409');
  await reject(() => begin(db, { scope: 'test:acct_Replacement' }), 'PT409');
  state = await apply(db, state, { value: snapshot({ id: 'sub_NewComplete', status: 'canceled', paid: false }) });
  assert.equal((await read(db, IDS.actor, 'test:acct_Replacement')).otherScopeBlocked, false);
  const next = await begin(db, { revision: state.revision }); assert.notEqual(next.attempt.requestId, state.attempt.requestId);
});

test('same-subscription terminal evidence must follow completion and durable closure survives later subscription replacement', async t => {
  const db = await fixture(t); let state = await customer(db, await begin(db));
  state = await apply(db, state, { value: snapshot({ status: 'canceled', paid: false }) });
  const key = state.attempt.requestId;
  state = await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, key, state.revision,
    'completed', 'cs_test_FirstComplete', null, state.attempt.expiresAt, 'sub_FictionalOne']);
  const resolvedAt = state.attempt.resolvedAt;
  await reject(() => begin(db, { revision: state.revision }), 'PT409');
  const replay = await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, key, 0,
    'completed', 'cs_test_FirstComplete', null, state.attempt.expiresAt, 'sub_FictionalOne']);
  assert.equal(replay.replayed, true); assert.equal(replay.attempt.resolvedAt, resolvedAt);
  await reject(() => rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, key, 0,
    'completed', 'cs_test_FirstComplete', null, state.attempt.expiresAt, 'sub_Rebind']), 'PT409');
  state = await apply(db, state, { value: snapshot({ status: 'canceled', paid: false }) });
  state = await begin(db, { revision: state.revision });
  state = await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, state.attempt.requestId, state.revision,
    'completed', 'cs_test_SecondComplete', null, state.attempt.expiresAt, 'sub_SecondComplete']);
  state = await apply(db, state, { value: snapshot({ id: 'sub_SecondComplete', status: 'canceled', paid: false }) });
  const third = await begin(db, { revision: state.revision }); assert.equal(third.attempt.status, 'pending');
});

test('same signed event replay accepts later derived risk kind without changing original receipt or applying new writes', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db)); const event = eventId();
  const original = await apply(db, state, { event });
  const replay = await apply(db, original, { event, kind: 'risk', value: null });
  assert.equal(replay.replayed, true); assert.equal(replay.revision, original.revision); assert.equal(replay.riskReview, false);
  assert.equal((await db.query('SELECT event_kind FROM supporter_webhook_receipts WHERE event_id=$1', [event])).rows[0].event_kind, 'subscription');
});

test('receipt insertion failure rolls back already-written subscription and checkout resolution', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db));
  await db.exec(`CREATE FUNCTION public.fixture_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Synthetic receipt constraint'; END $$;
    CREATE TRIGGER fixture_reject BEFORE INSERT ON supporter_webhook_receipts FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_receipt();`);
  await reject(() => apply(db, state, { kind: 'checkout', request: state.attempt.requestId, status: 'completed',
    sessionId: 'cs_test_RolledBack', expiry: state.attempt.expiresAt }), '23514');
  const current = await read(db);
  assert.equal(current.revision, state.revision); assert.equal(current.subscription, null);
  assert.equal(current.attempt.status, 'pending'); assert.equal(current.attempt.sessionId, null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM supporter_webhook_receipts')).rows[0].n, 0);
});

test('competing event delivery deduplicates exact hashes and rejects stale independent snapshots', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db)); const key = eventId();
  const results = await Promise.all([apply(db, state, { event: key }), apply(db, state, { event: key })]);
  assert.deepEqual(results.map(result => result.replayed).sort(), [false, true]);
  assert.equal(results[0].revision, results[1].revision);
  await reject(() => apply(db, state, { value: snapshot({ status: 'canceled', paid: false }) }), 'PT409');
  assert.equal((await read(db)).subscription.status, 'active');
});

test('provider session mode cannot cross account scope and direct malformed rows fail constraints', async t => {
  const db = await fixture(t); const state = await customer(db, await begin(db));
  await reject(() => complete(db, state, { sessionId: 'cs_live_WrongMode' }), '23514');
  await reject(() => db.query(`UPDATE supporter_checkout_attempts SET session_id='cs_test_MissingExpiry',
    session_url='https://checkout.stripe.com/c/pay/fictional' WHERE account_id=$1`, [state.accountId]), '23514');
  assert.equal((await read(db)).attempt.sessionId, null);
});

test('risk review is sticky through cancellation and subsequent paid snapshots; new sales remain blocked', async t => {
  const db = await fixture(t); let state = await customer(db, await begin(db));
  state = await apply(db, state, { kind: 'risk', value: null });
  state = await apply(db, state, { value: snapshot({ status: 'canceled', paid: false }) });
  assert.equal(state.riskReview, true);
  state = await apply(db, state); assert.equal(state.riskReview, true);
  await reject(() => begin(db, { revision: state.revision }), 'PT409');
});

test('active subscription replacement and duplicate scoped provider IDs fail closed', async t => {
  const db = await fixture(t); let state = await customer(db, await begin(db)); state = await apply(db, state);
  await reject(() => apply(db, state, { value: snapshot({ id: 'sub_Replacement' }) }), 'PT409');
  const other = await customer(db, await begin(db, { actor: IDS.other }), 'cus_Other', IDS.other);
  await reject(() => apply(db, other), 'PT409');
  assert.equal((await read(db, IDS.other)).subscription, null);
});

test('exact return reads never substitute a newer attempt or another actor', async t => {
  const db = await fixture(t); const old = await begin(db);
  const rejected = await rpc(db, 'soe_supporter_checkout_resolve', [IDS.actor, SCOPE, old.attempt.requestId, old.revision, 'rejected', null]);
  const next = await begin(db, { revision: rejected.revision });
  const exact = await rpc(db, 'soe_supporter_return_read', [IDS.actor, SCOPE, old.attempt.requestId]);
  assert.equal(exact.attempt.requestId, old.attempt.requestId); assert.notEqual(exact.attempt.requestId, next.attempt.requestId);
  await reject(() => rpc(db, 'soe_supporter_return_read', [IDS.other, SCOPE, old.attempt.requestId]), 'PT404');
});

test('portal creation is keyed, customer-bound and recoverable without modifying sales or membership', async t => {
  const db = await fixture(t); const mapped = await customer(db, await begin(db)); const key = requestId();
  const portal = await rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, key, mapped.revision, CONFIG_HASH]);
  assert.equal(portal.portalAttempt.status, 'pending');
  const unknown = await rpc(db, 'soe_supporter_portal_unknown', [IDS.actor, SCOPE, key]);
  assert.equal(unknown.portalAttempt.status, 'unknown');
  await reject(() => rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, requestId(), unknown.revision, CONFIG_HASH]), 'PT409');
  const replay = await rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, key, 0, CONFIG_HASH]);
  assert.equal(replay.replayed, true); assert.equal(replay.portalAttempt.createdAt, portal.portalAttempt.createdAt);
  const ready = await rpc(db, 'soe_supporter_portal_complete', [IDS.actor, SCOPE, key, 'bps_Fictional', 'https://billing.stripe.com/p/session/fictional']);
  assert.equal(ready.portalAttempt.status, 'ready');
  await reject(() => rpc(db, 'soe_supporter_portal_complete', [IDS.actor, SCOPE, key, 'bps_Other', 'https://billing.stripe.com/p/session/other']), 'PT409');
  assert.equal((await rpc(db, 'soe_supporter_portal_complete', [IDS.actor, SCOPE, key, 'bps_Fictional', 'https://billing.stripe.com/p/session/fictional'])).replayed, true);
});

test('legacy portal bootstrap is explicit POST-only, unique, and read never adopts member fields', async t => {
  const db = await fixture(t); const key = requestId();
  await reject(() => rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, key, 0, CONFIG_HASH]), 'PT404');
  assert.equal((await read(db)).accountId, null);
  const legacy = await rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, key, 0, CONFIG_HASH, 'cus_LegacyVerified']);
  assert.equal(legacy.customerId, 'cus_LegacyVerified'); assert.equal(legacy.attempt, null);
  await reject(() => rpc(db, 'soe_supporter_portal_begin', [IDS.other, SCOPE, requestId(), 0, CONFIG_HASH, 'cus_LegacyVerified']), 'PT409');
  assert.equal((await read(db, IDS.other)).accountId, null);
});

test('aged uncertain portal permits a new explicit key after fifteen minutes but keeps original unknown receipt', async t => {
  const db = await fixture(t); const mapped = await customer(db, await begin(db)); const key = requestId();
  let state = await rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, key, mapped.revision, CONFIG_HASH]);
  state = await rpc(db, 'soe_supporter_portal_unknown', [IDS.actor, SCOPE, key]);
  await db.query(`UPDATE supporter_portal_attempts SET created_at=created_at-interval '16 minutes',retry_until=retry_until-interval '16 minutes'
    WHERE account_id=$1`, [state.accountId]);
  const next = await rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, requestId(), state.revision, CONFIG_HASH]);
  assert.notEqual(next.portalAttempt.requestId, key); assert.equal((await read(db)).portalAttempt.requestId, next.portalAttempt.requestId);
  const original = await rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, key, 0, CONFIG_HASH]);
  assert.equal(original.replayed, true); assert.equal(original.portalAttempt.status, 'unknown');
});

test('portal fresh-operation rate limit cannot be avoided by making previous URLs ready or replaying keys', async t => {
  const db = await fixture(t); let state = await customer(db, await begin(db)); let first;
  for (let index = 0; index < 5; index++) {
    const key = requestId(); first ??= key;
    state = await rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, key, state.revision, CONFIG_HASH]);
    state = await rpc(db, 'soe_supporter_portal_complete', [IDS.actor, SCOPE, key, `bps_Limit${index}`, `https://billing.stripe.com/p/session/limit${index}`]);
    assert.equal((await read(db)).portalAttempt.requestId, key);
  }
  await reject(() => rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, requestId(), state.revision, CONFIG_HASH]), 'PT409');
  assert.equal((await rpc(db, 'soe_supporter_portal_begin', [IDS.actor, SCOPE, first, 0, CONFIG_HASH])).replayed, true);
});

test('serialized competing checkout keys produce one durable pending operation and stale key fails', async t => {
  const db = await fixture(t);
  const results = await Promise.allSettled([begin(db), begin(db)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'PT409').length, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM supporter_checkout_attempts')).rows[0].n, 1);
});

test('browser roles have no table/function grants; all new tables enforce RLS and functions invoke as caller', async t => {
  const db = await fixture(t);
  const tables = (await db.query(`SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname LIKE 'supporter_%'`)).rows;
  assert.equal(tables.length, 5); assert.ok(tables.every(row => row.relrowsecurity));
  for (const role of ['anon', 'authenticated']) {
    await reject(() => rpc(db, 'soe_supporter_read', [IDS.actor, SCOPE], role), '42501');
    for (const table of tables) await reject(() => asRole(db, role, tx => tx.query(`SELECT * FROM ${table.relname}`)), '42501');
  }
  const functions = (await db.query(`SELECT proname,prosecdef FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'soe_supporter_%' OR proname LIKE '_supporter_%')`)).rows;
  assert.ok(functions.length >= 14); assert.ok(functions.every(row => !row.prosecdef));
  assert.equal((await db.query(`SELECT has_table_privilege('service_role','members','UPDATE') AS allowed`)).rows[0].allowed, false);
});
