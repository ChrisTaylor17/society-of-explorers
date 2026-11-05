import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageSource } from './support/review-coverage-db.mjs';
import { createListingReceiptDb, applyListingReceipts, directInput, directDecide,
  rpc, asRole, requestId, completeCoverage, coverageDecide, IDS } from './support/circle-listing-receipt-db.mjs';
import { reviewCoverageApp } from './support/review-coverage-app.mjs';
import { offlineApp } from './support/offline-app.mjs';

const cleanup = { created: 0, closed: 0, providerCalls: 0 };
test.after(() => console.log('LISTING_RECEIPT_CLEANUP ' + JSON.stringify(cleanup)));
async function fixture(t, options) {
  const f = await createListingReceiptDb(options); cleanup.created++;
  t.after(async () => { await f.db.close(); cleanup.closed++; }); return f;
}
const reject = (work, code) => assert.rejects(work, error => { assert.equal(error.code, code, error.message); return true; });
const scalar = async (db, query, args = []) => Object.values((await db.query(query, args)).rows[0])[0];
const detail = f => rpc(f.db, 'soe_circle_review_detail', [f.reviewerId, f.circleId]);
const signatures = ['soe_circle_review_decide(uuid,uuid,bigint,uuid,text,text,text,uuid,text)',
  'soe_circle_review_coverage_decide(uuid,uuid,uuid,uuid,bigint,text,uuid,text,text,text,uuid,text)'];
const bodies = db => db.query("SELECT oid::text,proname,md5(prosrc) AS body,proacl::text,proowner::text,prosecdef,proconfig FROM pg_proc WHERE proname IN('soe_circle_review_decide','soe_circle_review_coverage_decide') ORDER BY proname").then(r => r.rows);
const decisionRows = db => db.query('SELECT * FROM circle_review_decisions ORDER BY id').then(r => r.rows);
const bodyFrom = (text, name) => text.slice(text.indexOf('FUNCTION public.' + name + '(')).split('$$')[1];

test('additive SQL changes only four listing receipt returns; message branch and historical files remain explicit', async () => {
  assert.throws(() => fetch('https://offline.invalid/no-network'), /EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
  const apply = (await coverageSource('docs/sql/circle-listing-review-receipt-apply.sql')).toString();
  const rollback = (await coverageSource('docs/sql/circle-listing-review-receipt-rollback.sql')).toString();
  for (const [name, path] of [['soe_circle_review_decide', 'docs/sql/circle-moderation.sql'], ['soe_circle_review_coverage_decide', 'docs/sql/circle-review-coverage.sql']]) {
    const original = bodyFrom((await coverageSource(path)).toString(), name), enabled = bodyFrom(apply, name);
    const normalized = enabled.replaceAll("'circleId', p_circle_id, 'requestId', p_request_id, 'decision'", "'decision'")
      .replaceAll("'circleId',p_circle_id,'requestId',p_request_id,'sessionId'", "'sessionId'");
    assert.equal(normalized, original);
    const disabled = bodyFrom(rollback, name).replace("  RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'New listing decisions are disabled';\n", '')
      .replace(" IF p_message_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='New listing decisions are disabled'; END IF;\n", '');
    assert.equal(disabled, enabled);
  }
});

test('preexisting direct and covered decisions replay with correlated IDs after additive install, without row changes', async t => {
  const f = await fixture(t, { install: false, reportCount: 101 });
  const coveredPage = await completeCoverage(f), coveredKey = requestId();
  const coveredOld = await coverageDecide(f, coveredPage, { request: coveredKey });
  const input = directInput(f, coveredOld.revision), directOld = await directDecide(f, input);
  assert.equal(directOld.circleId, undefined); assert.equal(coveredOld.requestId, undefined);
  const rows = await decisionRows(f.db), before = await bodies(f.db);
  await applyListingReceipts(f.db);
  assert.deepEqual(await decisionRows(f.db), rows);
  const after = await bodies(f.db);
  const metadata = rows => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'body')));
  assert.deepEqual(metadata(after), metadata(before));
  for (const [receipt, key, original] of [[await directDecide(f, input), input.requestId, directOld],
    [await coverageDecide(f, coveredPage, { request: coveredKey }), coveredKey, coveredOld]]) {
    assert.equal(receipt.circleId, f.circleId); assert.equal(receipt.requestId, key); assert.equal(receipt.replayed, true);
    assert.deepEqual(receipt.decision, original.decision); assert.equal(receipt.revision, directOld.revision);
  }
  await applyListingReceipts(f.db); assert.deepEqual(await decisionRows(f.db), rows);
});

test('direct receipts bind the request and Circle while exact replay reports later opposite state', async t => {
  const f = await fixture(t, { reportCount: 50 }), snapshot = await detail(f);
  const input = directInput(f, snapshot.revision, { action: 'hide', reason: 'safety', evidenceReportId: snapshot.reports[0].id, evidenceExcerpt: snapshot.reports[0].note });
  const saved = await directDecide(f, input);
  assert.equal(saved.circleId, f.circleId); assert.equal(saved.requestId, input.requestId); assert.equal(saved.revision, snapshot.revision + 1);
  assert.equal(saved.hidden, true); assert.equal(saved.decision.report_count, 50);
  const later = await directDecide(f, directInput(f, saved.revision));
  const replay = await directDecide(f, input);
  assert.deepEqual(replay, { ...saved, hidden: false, revision: later.revision, replayed: true });
  for (const change of [{ summary: 'A different public explanation would change the operation.' }, { expectedRevision: saved.revision },
    { evidenceExcerpt: snapshot.reports[1].note }, { evidenceReportId: snapshot.reports[1].id }]) {
    await reject(() => directDecide(f, { ...input, ...change }), 'PT409');
  }
  const p = await completeCoverage(f);
  await reject(() => coverageDecide(f, p, { request: input.requestId }), 'PT409');
  assert.equal((await decisionRows(f.db)).length, 2);
});

test('coverage receipts retain IDs/session/count through consumed expiry, new reports and later restoration', async t => {
  const f = await fixture(t, { reportCount: 101 }), page = await completeCoverage(f), key = requestId();
  const options = { request: key, action: 'hide', reason: 'safety', evidenceId: f.evidence.listing.id, excerpt: f.evidence.listing.note };
  const saved = await coverageDecide(f, page, options);
  assert.equal(saved.circleId, f.circleId); assert.equal(saved.requestId, key); assert.equal(saved.sessionId, page.sessionId);
  assert.equal(saved.revision, page.revision + 1); assert.equal(saved.decision.report_count, 101);
  await f.db.query("UPDATE circle_review_coverage_sessions SET expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1", [page.sessionId]);
  const later = await directDecide(f, directInput(f, saved.revision));
  await rpc(f.db, 'soe_circle_report', [null, 'b'.repeat(32), f.circleId, 'spam', 'A later private report must remain open.', requestId()]);
  const current = await detail(f), replay = await coverageDecide(f, page, options);
  assert.deepEqual(replay, { ...saved, revision: current.revision, hidden: false, replayed: true });
  assert.equal(current.revision, later.revision + 1); assert.equal(current.reports.length, 1);
  await reject(() => coverageDecide(f, page, { ...options, sessionId: requestId() }), 'PT409');
  await reject(() => directDecide(f, directInput(f, page.revision, { requestId: key })), 'PT409');
});

for (const kind of ['direct', 'coverage']) test(`${kind}: replay never bypasses current grant or participant/reporter conflicts`, async t => {
  const f = await fixture(t), page = await completeCoverage(f), input = directInput(f, page.revision), key = requestId();
  const act = kind === 'direct' ? () => directDecide(f, input) : () => coverageDecide(f, page, { request: key });
  await act();
  for (const field of ["revoked_at=clock_timestamp()", "expires_at=clock_timestamp()-interval '1 second'"]) {
    await f.db.exec(`UPDATE circle_reviewer_grants SET ${field} WHERE member_id='${f.reviewerId}'`);
    await reject(act, 'PT403');
    await f.db.query('UPDATE circle_reviewer_grants SET revoked_at=NULL,expires_at=NULL WHERE member_id=$1', [f.reviewerId]);
  }
  await f.db.query('INSERT INTO book_cohort_members(cohort_id,member_id) VALUES($1,$2)', [f.circleId, f.reviewerId]);
  await reject(act, 'PT403');
  await f.db.query('DELETE FROM book_cohort_members WHERE cohort_id=$1 AND member_id=$2', [f.circleId, f.reviewerId]);
  await rpc(f.db, 'soe_circle_report', [f.reviewerId, null, f.circleId, 'spam', 'The reviewer is now a known reporting party.', requestId()]);
  await reject(act, 'PT403'); assert.equal((await decisionRows(f.db)).length, 1);
});

test('rollback blocks new direct and covered listing writes, retains correlated replay, preserves message branch and permits reapply', async t => {
  const f = await fixture(t, { reportCount: 101 }), page = await completeCoverage(f), key = requestId();
  const saved = await coverageDecide(f, page, { request: key }), input = directInput(f, saved.revision);
  const direct = await directDecide(f, input), next = await completeCoverage(f), rows = await decisionRows(f.db);
  await applyListingReceipts(f.db, 'rollback'); await applyListingReceipts(f.db, 'rollback');
  assert.equal((await directDecide(f, input)).requestId, input.requestId);
  assert.equal((await coverageDecide(f, page, { request: key })).requestId, key);
  await reject(() => directDecide(f, directInput(f, direct.revision)), 'PT409');
  await reject(() => coverageDecide(f, next), 'PT409'); assert.deepEqual(await decisionRows(f.db), rows);
  const messagePage = await completeCoverage(f, 'message'), message = await coverageDecide(f, messagePage);
  assert.equal(message.messageId, f.messageId); assert.equal(message.decision.report_count, 101);
  assert.equal(message.replayed, false); assert.equal(message.safety.revision, messagePage.revision + 1);
  await applyListingReceipts(f.db); const resumed = await directDecide(f, directInput(f, direct.revision));
  assert.equal(resumed.replayed, false); assert.equal(resumed.revision, direct.revision + 1);
});

test('apply and rollback preserve effective service-only invoker authority', async t => {
  const f = await fixture(t);
  for (const action of ['apply', 'rollback', 'apply']) {
    await applyListingReceipts(f.db, action);
    for (const sig of signatures) for (const role of ['anon', 'authenticated', 'ai_unrelated', 'service_role']) {
      assert.equal(await scalar(f.db, 'SELECT has_function_privilege($1,$2,$3)', [role, 'public.' + sig, 'EXECUTE']), role === 'service_role');
    }
    assert.ok((await bodies(f.db)).every(row => row.prosecdef === false));
    await reject(() => asRole(f.db, 'authenticated', tx => tx.query('SELECT public.soe_circle_review_decide($1,$2,0,$3,$4,$5,$6)',
      [f.reviewerId, f.circleId, requestId(), 'restore', 'resolved', 'No browser role may directly run this decision.'])), '42501');
  }
});

test('migration rejects unfamiliar function body, security/search path/default/marker/ACL and refuses original-shape rollback atomically', async t => {
  const f = await fixture(t, { install: false }), before = await bodies(f.db);
  await reject(() => applyListingReceipts(f.db, 'rollback'), 'PT409'); assert.deepEqual(await bodies(f.db), before);
  const sig = 'public.' + signatures[0];
  const changes = [
    [`ALTER FUNCTION ${sig} SECURITY DEFINER`, `ALTER FUNCTION ${sig} SECURITY INVOKER`],
    [`ALTER FUNCTION ${sig} SET search_path=public,pg_catalog`, `ALTER FUNCTION ${sig} SET search_path=pg_catalog,public`],
    [`COMMENT ON FUNCTION ${sig} IS 'unfamiliar-contract'`, `COMMENT ON FUNCTION ${sig} IS NULL`],
    [`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated`, `REVOKE EXECUTE ON FUNCTION ${sig} FROM authenticated`],
    [`GRANT EXECUTE ON FUNCTION ${sig} TO ai_unrelated`, `REVOKE EXECUTE ON FUNCTION ${sig} FROM ai_unrelated`],
  ];
  const original = (await coverageSource('docs/sql/circle-moderation.sql')).toString();
  const start = original.indexOf('CREATE FUNCTION public.soe_circle_review_decide('), end = original.indexOf('$$;', start) + 3;
  const restore = original.slice(start, end).replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
  changes.push([restore.replace('DECLARE v_payload', '-- unreviewed body drift\nDECLARE v_payload'), restore]);
  changes.push([restore.replace('uuid DEFAULT NULL', "uuid DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"), restore]);
  for (const [change, reset] of changes) {
    await f.db.exec(change); const drift = await bodies(f.db);
    await reject(() => applyListingReceipts(f.db), 'PT409'); assert.deepEqual(await bodies(f.db), drift);
    await f.db.exec(reset);
  }
  await applyListingReceipts(f.db);
});

const CIRCLE = '11111111-1111-4111-8111-111111111111', REQUEST = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333', OTHER = '44444444-4444-4444-8444-444444444444';
const input = { expectedRevision: 8, requestId: REQUEST, action: 'restore', reason: 'resolved',
  summary: 'A human has reviewed the current listing and resolved the concern.', evidenceReportId: null, evidenceExcerpt: null };
const receipt = { circleId: CIRCLE, requestId: REQUEST, revision: 9, hidden: false, replayed: false,
  decision: { id: OTHER, action: input.action, reason: input.reason, summary: input.summary, created_at: '2026-11-05T12:00:00Z', report_count: 101 } };
function routeFixture(covered) {
  const app = offlineApp(), calls = []; let result = { ...receipt, ...(covered ? { sessionId: SESSION } : {}) };
  app.setMock('@/lib/getAuthenticatedMember', () => ({ getAuthenticatedMember: async () => ({ memberId: IDS.reviewer }) }));
  app.setMock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: result, error: null }; } }) }));
  const path = 'app/api/admin/circles/reports/[circleId]' + (covered ? '/coverage/decision' : '') + '/route.ts';
  const route = app.load(path), context = { params: Promise.resolve({ circleId: CIRCLE }) };
  const run = () => route.POST(new Request('https://offline.invalid/review', { method: 'POST', headers: { origin: 'https://offline.invalid' },
    body: JSON.stringify({ ...input, ...(covered ? { sessionId: SESSION } : {}) }) }), context);
  return { app, calls, run, set(value) { result = value; } };
}

test('mandatory receipt parser rejects missing/invalid IDs and projects away private server fields', () => {
  const parse = offlineApp().load('lib/circles/moderation.ts').parseCircleDecisionReceipt;
  for (const change of [{ circleId: undefined }, { requestId: undefined }, { circleId: 'bad' }, { requestId: OTHER + 'x' }]) assert.equal(parse({ ...receipt, ...change }), null);
  assert.deepEqual(structuredClone(parse({ ...receipt, actor: 'PRIVATE_ACTOR', requestPayload: 'PRIVATE_EVIDENCE', decision: { ...receipt.decision, evidence_excerpt: 'PRIVATE_EXCERPT' } })), receipt);
});

for (const covered of [false, true]) test(`${covered ? 'covered' : 'direct'} API rejects same-looking uncorrelated and impossible revision receipts without retry`, async () => {
  const f = routeFixture(covered), valid = { ...receipt, ...(covered ? { sessionId: SESSION } : {}) };
  assert.equal((await f.run()).status, 200);
  const changes = [{ circleId: undefined }, { requestId: undefined }, { circleId: OTHER }, { requestId: OTHER },
    { revision: 8 }, { revision: 10 }, { replayed: true, revision: 8 }, { decision: { ...receipt.decision, summary: 'A different but otherwise plausible human explanation.' } }];
  if (covered) changes.push({ sessionId: undefined }, { sessionId: OTHER });
  for (const change of changes) {
    f.set({ ...valid, ...change }); const before = f.calls.length, response = await f.run();
    assert.equal(response.status, 503); assert.equal(f.calls.length, before + 1); assert.deepEqual(Object.keys(await response.json()), ['error']);
  }
  f.set({ ...valid, replayed: true, revision: 12, hidden: true }); const response = await f.run();
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal((await response.json()).hidden, true);
});

for (const covered of [false, true]) test(`${covered ? 'covered' : 'direct'} current API plus SQL confirms exact retry after committed response loss, without duplicate decision`, async t => {
  const f = await fixture(t, { reportCount: covered ? 101 : 0 }), app = await reviewCoverageApp({ fixture: f });
  t.after(() => app.close());
  const page = covered ? (await app.complete('listing')).page : null, snapshot = await app.detail('listing');
  const body = directInput(f, snapshot.revision, page ? { sessionId: page.sessionId } : {});
  const path = app.targetPath('listing') + (covered ? '/coverage/decision' : '');
  // The client discards an actual successful response; a fresh exact manual POST
  // still traverses the current handler and current service-role SQL.
  const dropped = await app.dispatch(path, 'POST', body); assert.equal(dropped.status, 200);
  const replay = await app.json(path, 'POST', body);
  assert.equal(replay.replayed, true); assert.equal(replay.circleId, f.circleId); assert.equal(replay.requestId, body.requestId);
  assert.equal(replay.decision.report_count, covered ? 101 : 0); assert.equal((await decisionRows(f.db)).length, 1);
  const next = directInput(f, replay.revision), later = await app.json(app.targetPath('listing'), 'POST', next);
  const again = await app.json(path, 'POST', body);
  assert.equal(again.revision, later.revision); assert.equal(again.decision.id, replay.decision.id); assert.equal((await decisionRows(f.db)).length, 2);
});
