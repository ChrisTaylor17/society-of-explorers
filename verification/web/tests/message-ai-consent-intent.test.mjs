import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createConsentIntentDb, runConsentIntentSql, rpc, asRole, IDS, requestId, POLICY, activateAllowance, reserveAllowance } from './support/message-ai-consent-intent-db.mjs';
import { currentMessageAiApp } from './support/current-message-ai-consent-app.mjs';
const NAMES = ['soe_circle_message_ai_consent_state', 'soe_circle_message_ai_consent_set', 'soe_circle_message_ai_snapshot'];
const signatures = [NAMES[0] + '(uuid,uuid,uuid)', NAMES[1] + '(uuid,uuid,uuid,bigint,text,text,boolean)', NAMES[2] + '(uuid,uuid,uuid)'];
const denied = (work, code = 'PT409') => assert.rejects(work, error => { assert.equal(error.code, code, error.message); return true; });
let created = 0, closed = 0, providerCalls = 0;
async function fixture(t, options) { const f = await createConsentIntentDb(options); created++; t.after(async () => { await f.db.close(); closed++; }); return f; }
async function httpFixture(t) { const f = await currentMessageAiApp(); created++; t.after(async () => { providerCalls += f.providerCalls.length; await f.close(); closed++; }); return f; }
after(() => { assert.equal(closed, created); assert.equal(providerCalls, 0); console.log('CONSENT_INTENT_CLEANUP ' + JSON.stringify({ created, closed, providerCalls })); });
const state = f => rpc(f.db, NAMES[0], [f.authorId, f.circleId, f.messageId]);
const snapshot = f => rpc(f.db, NAMES[2], [f.reviewerId, f.circleId, f.messageId]);
const decide = (f, current, allowed, overrides = {}) => rpc(f.db, NAMES[1], [overrides.actor ?? f.authorId, overrides.circleId ?? f.circleId, overrides.messageId ?? f.messageId, overrides.revision ?? current.consentRevision, overrides.hash ?? current.contentHash, overrides.policy ?? POLICY, allowed]);
const rows = async f => (await f.db.query('SELECT * FROM circle_message_ai_consents ORDER BY message_id,policy')).rows;
test('network guard is active and legacy absence stays excluded without initializing on reads', async t => {
 assert.throws(() => fetch('https://no-provider.invalid'), /EXTERNAL_NETWORK_DISABLED/);
 const f = await fixture(t), initial = await state(f);
 assert.equal(initial.allowed, false); assert.equal(initial.consentRevision, 0); assert.deepEqual(await rows(f), []);
 await denied(snapshot(f), 'PT403'); assert.deepEqual(await rows(f), []);
});
test('accepted absent false decision creates revision-one barrier against an older held enable', async t => {
 const f = await fixture(t), initial = await state(f), keepOff = await decide(f, initial, false);
 assert.equal(keepOff.allowed, false); assert.equal(keepOff.consentRevision, 1);
 await denied(decide(f, initial, true)); assert.deepEqual(await state(f), keepOff);
});
test('accepted unchanged true and false decisions each advance once and fence held opposite decisions', async t => {
 const f = await fixture(t), enabled = await decide(f, await state(f), true);
 const stillOn = await decide(f, enabled, true); assert.equal(stillOn.consentRevision, 2);
 await denied(decide(f, enabled, false)); assert.equal((await state(f)).allowed, true);
 const off = await decide(f, stillOn, false), stillOff = await decide(f, off, false);
 assert.equal(stillOff.consentRevision, 4); await denied(decide(f, off, true));
});
test('lost committed response has a higher current revision and exact old retry cannot execute twice', async t => {
 const f = await fixture(t), initial = await state(f); await decide(f, initial, false);
 await denied(decide(f, initial, false)); const current = await state(f);
 assert.equal(current.consentRevision, 1); assert.equal(current.allowed, false); assert.equal((await rows(f)).length, 1);
});
test('author, Circle, body hash and fixed policy bindings remain authoritative', async t => {
 const f = await fixture(t), initial = await state(f);
 await denied(decide(f, initial, true, { actor: IDS.host }), 'PT403');
 await denied(decide(f, initial, true, { circleId: IDS.outsider }), 'PT404');
 await denied(decide(f, initial, true, { hash: 'a'.repeat(64) }));
 await denied(decide(f, initial, true, { policy: 'other-policy' }), 'PT400');
 await denied(decide(f, initial, null), 'PT400');
 await denied(decide(f, initial, false, { revision: -1 }), 'PT400');
 assert.deepEqual(await rows(f), []);
});
test('hidden messages cannot newly enable, but existing permission can be explicitly revoked and re-confirmed off', async t => {
 const f = await fixture(t); await decide(f, await state(f), true);
 await f.db.query('INSERT INTO circle_message_states(message_id,cohort_id,hidden) VALUES($1,$2,true)', [f.messageId, f.circleId]);
 const hidden = await state(f); assert.equal(hidden.canEnable, false); assert.equal(hidden.allowed, true);
 await denied(decide(f, hidden, true)); const off = await decide(f, hidden, false);
 assert.equal(off.allowed, false); assert.equal((await decide(f, off, false)).consentRevision, off.consentRevision + 1);
 await denied(snapshot(f), 'PT403');
});
test('withdrawal blocks snapshot and re-enable while author revoke remains usable after leaving', async t => {
 const f = await fixture(t); await decide(f, await state(f), true);
 const safety = await rpc(f.db, 'soe_circle_message_state', [f.authorId, f.circleId, f.messageId]);
 await rpc(f.db, 'soe_circle_message_action', [f.authorId, f.circleId, f.messageId, safety.revision, safety.contentHash, requestId(), 'withdraw', null, null]);
 const rev = (await f.db.query('SELECT circle_participation_revision AS n FROM book_cohorts WHERE id=$1', [f.circleId])).rows[0].n;
 await rpc(f.db, 'soe_circle_leave', [f.authorId, f.circleId, rev, requestId()]);
 await denied(snapshot(f), 'PT403'); const current = await state(f);
 await denied(decide(f, current, true)); assert.equal((await decide(f, current, false)).allowed, false);
});
test('safe-integer exhaustion refuses unchanged or changed decisions without touching rows', async t => {
 const f = await fixture(t), current = await decide(f, await state(f), false);
 await f.db.query('UPDATE circle_message_ai_consents SET consent_revision=9007199254740991 WHERE message_id=$1', [f.messageId]);
 const before = await rows(f), exhausted = { ...current, consentRevision: Number.MAX_SAFE_INTEGER };
 await denied(decide(f, exhausted, false)); await denied(decide(f, exhausted, true)); assert.deepEqual(await rows(f), before);
});
test('service can read/use all authorized RPCs, snapshot is message-only, and allowance remains disabled unless explicitly activated', async t => {
 const f = await fixture(t); await decide(f, await state(f), true);
 const s = await snapshot(f); assert.deepEqual(Object.keys(s).sort(), ['circleId', 'consentRevision', 'content', 'contentHash', 'messageId', 'policy', 'revision'].sort());
 assert.equal(s.consentRevision, 1); await denied(reserveAllowance(f, { snapshot: s }), 'PT503');
 await activateAllowance(f.db); assert.ok(await reserveAllowance(f, { snapshot: s }));
 await denied(rpc(f.db, NAMES[2], [f.authorId, f.circleId, f.messageId]), 'PT403');
 await f.db.query('UPDATE circle_reviewer_grants SET revoked_at=clock_timestamp() WHERE member_id=$1', [f.reviewerId]);
 await denied(snapshot(f), 'PT403');
});
test('service raw INSERT UPDATE DELETE and browser table/function access are denied, including column writes', async t => {
 const f = await fixture(t); await decide(f, await state(f), false);
 for (const sql of ["INSERT INTO circle_message_ai_consents SELECT * FROM circle_message_ai_consents", "UPDATE circle_message_ai_consents SET allowed=true", "DELETE FROM circle_message_ai_consents", "UPDATE circle_message_ai_consents SET consent_revision=consent_revision"]) await denied(asRole(f.db, 'service_role', tx => tx.exec(sql)), '42501');
 for (const role of ['anon', 'authenticated']) {
  for (const sql of ['SELECT * FROM circle_message_ai_consents', 'UPDATE circle_message_ai_consents SET allowed=true']) await denied(asRole(f.db, role, tx => tx.exec(sql)), '42501');
  for (const sig of signatures) assert.equal((await f.db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS yes', [role, 'public.' + sig])).rows[0].yes, false);
  const current = await state(f);
  for (const [name, args] of [[NAMES[0], [f.authorId, f.circleId, f.messageId]], [NAMES[1], [f.authorId, f.circleId, f.messageId, current.consentRevision, current.contentHash, POLICY, true]], [NAMES[2], [f.reviewerId, f.circleId, f.messageId]]]) await denied(rpc(f.db, name, args, role), '42501');
 }
 assert.equal((await state(f)).allowed, false);
});
test('preflight preserves legacy rows and defaults; apply and repeat apply preserve all recorded choices', async t => {
 const f = await fixture(t, { install: false }); await decide(f, await state(f), true); const before = await rows(f);
 const defaults = (await f.db.query('SELECT * FROM pg_default_acl ORDER BY oid')).rows;
 await runConsentIntentSql(f.db, 'preflight'); assert.deepEqual(await rows(f), before);
 await runConsentIntentSql(f.db); await runConsentIntentSql(f.db); assert.deepEqual(await rows(f), before);
 assert.deepEqual((await f.db.query('SELECT * FROM pg_default_acl ORDER BY oid')).rows, defaults);
});
test('disable-only rollback preserves data and raw-write barrier; explicit reapply restores only the recognized setter', async t => {
 const f = await fixture(t); await decide(f, await state(f), true); const before = await rows(f);
 await runConsentIntentSql(f.db, 'rollback'); await runConsentIntentSql(f.db, 'rollback');
 assert.deepEqual(await rows(f), before); assert.equal((await state(f)).allowed, true); assert.ok(await snapshot(f));
 await denied(decide(f, await state(f), false), '42501'); await denied(asRole(f.db, 'service_role', tx => tx.exec('UPDATE circle_message_ai_consents SET allowed=false')), '42501');
 await runConsentIntentSql(f.db); assert.equal((await decide(f, await state(f), false)).consentRevision, 2);
});
test('preflight rejects changed helper body, function path, table shape and opened privileges without repairing drift', async t => {
 const f = await fixture(t);
 for (const mutation of [
  "CREATE OR REPLACE FUNCTION public._soe_circle_message_hash(p_content text) RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$ SELECT 'bad'::text $$",
  'ALTER FUNCTION public.soe_circle_message_ai_snapshot(uuid,uuid,uuid) SET search_path=public',
  'ALTER TABLE circle_message_ai_consents ADD COLUMN unexpected text',
  'GRANT UPDATE(allowed) ON circle_message_ai_consents TO service_role',
  'GRANT EXECUTE ON FUNCTION public.soe_circle_message_ai_snapshot(uuid,uuid,uuid) TO authenticated',
 ]) {
  await f.db.exec('BEGIN'); await f.db.exec(mutation);
  // The candidate owns its transaction; rejection rolls back this outer
  // fixture-only transaction so each deliberate drift stays isolated.
  await denied(runConsentIntentSql(f.db, 'preflight'));
 }
 await runConsentIntentSql(f.db, 'preflight');
});
test('actual current Contributions and permission routes compose with publication SQL and exact +1 receipts', async t => {
 const f = await httpFixture(t);
 const list = await f.dispatch('/api/circles/contributions'); assert.equal(list.status, 200);
 assert.ok(JSON.stringify(await list.json()).includes(f.messageId));
 const path = f.messagePath + '/ai-consent', initial = await (await f.dispatch(path)).json();
 const body = { expectedConsentRevision: initial.consentRevision, contentHash: initial.contentHash, policy: POLICY, allowed: false };
 const confirmed = await f.dispatch(path, 'POST', body); assert.equal(confirmed.status, 200); assert.equal((await confirmed.json()).consentRevision, 1);
 assert.equal((await f.dispatch(path, 'POST', { ...body, allowed: true })).status, 409);
 assert.equal((await f.dispatch(path, 'POST', body)).status, 409);
 assert.equal(f.providerCalls.length, 0);
});
test('actual route refuses same-base or over-advanced/mismatched receipts without leaking private payloads', async t => {
 const f = await httpFixture(t); const path = f.messagePath + '/ai-consent';
 for (const patch of [{ consentRevision: 0 }, { consentRevision: 99 }, { allowed: true }, { contentHash: 'a'.repeat(64) }, { messageId: IDS.outsider }]) {
  const current = await (await f.dispatch(path)).json();
  f.setRpcReply(async (name, args, result) => name === NAMES[1] && result.data ? { data: { ...result.data, ...patch, secret: 'PRIVATE' }, error: null } : result);
  const response = await f.dispatch(path, 'POST', { expectedConsentRevision: current.consentRevision, contentHash: current.contentHash, policy: POLICY, allowed: false });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE/);
  f.setRpcReply(async (_name, _args, result) => result);
 }
 assert.equal(f.providerCalls.length, 0);
});
