import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../../../', import.meta.url);
function resident(name) { const s = lstatSync(new URL(name, root)); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks)); }
for (const name of ['verification/web/tests/support/native-circle-reviewer-app.mjs', 'verification/web/tests/support/offline-app.mjs', 'platforms/tests/load-source.mjs']) resident(name);
process.chdir(fileURLToPath(new URL('verification/web/', root)));
const { nativeCircleReviewerApp } = await import('./support/native-circle-reviewer-app.mjs');
const { sourceLoader } = await import('../../../platforms/tests/load-source.mjs');
const { createCircleReviews } = sourceLoader()('platforms/shared/circle-reviews.ts');
let created = 0, closed = 0;
async function json(app, path, method = 'GET', body) {
  const response = await app.dispatch(path, method, body);
  assert.equal(response.status, 200, method + ' ' + path);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  return response.json();
}
async function fixture(t, reportCount) {
  const app = await nativeCircleReviewerApp({ reportCount }); created++;
  const origin = 'https://review-coverage-fixture.test', calls = [], listeners = new Set(), snapshots = [];
  const base = `/api/admin/circles/reports/${app.circleId}`;
  let hook = null, keys = 0;
  const controller = createCircleReviews({ origin, initialOnline: true, timeoutMs: 5000, newRequestId: async () => { keys++; return randomUUID(); },
    owner: { scope: () => 'synthetic-verified-listing-reviewer', bearer: async () => 'NONISSUED_REVIEWER', subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } },
    circleReviewerTransport: async (url, options) => {
      const path = url.slice(origin.length); calls.push({ path, method: options.method, body: options.body });
      const reply = async () => { const response = await app.dispatch(path, options.method, options.body); return { status: response.status, url, redirected: false, json: () => response.json() }; };
      return hook ? hook({ path, options, reply }) : reply();
    } });
  controller.subscribe(value => snapshots.push(value)); controller.connect();
  t.after(async () => { controller.disconnect(); assert.equal(listeners.size, 0); await app.close(); closed++; });
  const token = () => controller.model().action;
  // The real queue includes open reports or a hidden listing. Establish the
  // zero-report restoration case through an actual authorized decision first.
  if (reportCount === 0) {
    const detail = await json(app, base);
    await json(app, base, 'POST', { expectedRevision: detail.revision, requestId: randomUUID(), action: 'hide', reason: 'safety',
      summary: 'An earlier human decision restricted this synthetic listing.', evidenceReportId: null, evidenceExcerpt: app.circleTitle });
  }
  await controller.loadQueue(token()); assert(controller.model().queue?.items.some(item => item.id === app.circleId));
  await controller.openCase(app.circleId, token()); assert.equal(controller.model().detail?.complete, reportCount <= 100);
  function draft(action = 'hide', source = 'title', excerpt = app.circleTitle) {
    controller.setAction(action, token()); controller.setReason(action === 'hide' ? 'safety' : 'resolved', token());
    controller.setSummary('A human reviewed every current report and recorded a specific conduct finding.', token());
    if (source === 'title' || source === 'description' || controller.model().evidence?.id !== source) controller.setEvidence(source, token());
    if (action === 'hide') controller.setExcerpt(excerpt, token());
    controller.confirmDecision(true, token()); assert.equal(controller.model().canSubmit, true);
  }
  async function cover() {
    await controller.startCoverage(token());
    while (!controller.model().coverage.page.complete) { controller.confirmCoverage(true, token()); await controller.ackCoverage(token()); }
  }
  return { app, base, controller, calls, snapshots, token, draft, cover, get keys() { return keys; }, setHook: value => { hook = value; } };
}

for (const reportCount of [0, 50, 100]) test(`portable listing controller → actual HTTP/SQL: ${reportCount} reports, direct decisions and exact receipt recovery`, async t => {
  const f = await fixture(t, reportCount), c = f.controller;
  assert.equal(c.model().detail.reports.length, reportCount); assert.equal('requestAdvice' in c, false);
  f.draft(reportCount === 0 ? 'restore' : 'hide', reportCount === 100 ? 'description' : 'title', reportCount === 100 ? f.app.description : f.app.circleTitle);
  f.setHook(async ({ path, options, reply }) => { const response = await reply(); if (path === f.base && options.method === 'POST') throw Error('Lost committed direct listing receipt'); return response; });
  await c.submitDecision(f.token()); assert.equal(c.model().phase, 'unknown'); assert.equal(c.model().pendingDecision, true);
  const exact = f.calls.find(call => call.path === f.base && call.method === 'POST'), keyCount = f.keys;
  assert.equal(Object.keys(JSON.parse(exact.body)).length, 7); assert.equal(c.model().decisionConfirmed, false);
  const beforeRead = f.calls.length; await c.refreshCase(f.token()); assert.equal(f.calls.length, beforeRead);
  assert.deepEqual(await f.app.counts(), { total: reportCount, open: 0, decisions: reportCount === 0 ? 2 : 1 });
  await f.app.db.query('UPDATE circle_reviewer_grants SET revoked_at=clock_timestamp() WHERE cohort_id=$1 AND member_id=$2', [f.app.circleId, f.app.authorId]);
  f.setHook(null); await c.retryDecision(f.token());
  assert.equal(c.model().phase, 'unknown'); assert.equal(c.model().pendingDecision, true); assert.equal(c.model().decisionConfirmed, false);
  assert.match(c.model().message, /earlier decision may have been saved/i);
  await f.app.db.query('UPDATE circle_reviewer_grants SET revoked_at=NULL WHERE cohort_id=$1 AND member_id=$2', [f.app.circleId, f.app.authorId]);
  const current = await json(f.app, f.base);
  await json(f.app, f.base, 'POST', { expectedRevision: current.revision, requestId: randomUUID(), action: reportCount === 0 ? 'hide' : 'restore',
    reason: reportCount === 0 ? 'safety' : 'resolved', summary: 'A later independent human review changed the listing visibility.',
    evidenceReportId: null, evidenceExcerpt: reportCount === 0 ? f.app.circleTitle : null });
  await f.app.addListingReports(f.app.circleId, 1);
  f.setHook(null); await c.retryDecision(f.token());
  assert.equal(c.model().decisionConfirmed, true); assert.equal(c.model().receipt.replayed, true);
  assert.equal(c.model().receipt.circleId, f.app.circleId); assert.equal(c.model().receipt.requestId, JSON.parse(exact.body).requestId);
  assert.equal(c.model().receipt.decision.report_count, reportCount); assert.equal(c.model().detail.circle.hidden, reportCount === 0);
  assert.equal(c.model().detail.reports.length, 1); assert.equal(c.model().draft.confirmed, false); assert.equal(f.keys, keyCount);
  assert.equal(f.calls.filter(call => call.path === f.base && call.method === 'POST').at(-1).body, exact.body);
  assert.deepEqual(await f.app.counts(), { total: reportCount + 1, open: 1, decisions: reportCount === 0 ? 3 : 2 });
  assert(!f.calls.some(call => call.path.includes('/messages') || call.path.endsWith('/advice')));
});

for (const reportCount of [101, 250]) test(`portable listing controller → actual HTTP/SQL: all ${reportCount} reports, ACK recovery, expired exact replay and bounded evidence`, async t => {
  const f = await fixture(t, reportCount), c = f.controller;
  assert.equal(c.model().detail.reports.length, 0); assert.equal(c.model().canEditDraft, false);
  await c.startCoverage(f.token()); const first = c.model().coverage.page.reports[0], sessionId = c.model().coverage.sessionId;
  assert.equal(c.model().coverage.page.messageId, null); assert.equal(c.model().coverage.page.contentHash, null);
  c.setEvidence(first.id, f.token()); c.confirmCoverage(true, f.token());
  f.setHook(async ({ options, reply }) => { const response = await reply(); if (options.method === 'POST' && JSON.parse(options.body).action === 'ack') throw Error('Lost committed listing ACK'); return response; });
  await c.ackCoverage(f.token()); assert.equal(c.model().coverage.page, null); assert.equal(c.model().canSubmit, false);
  assert.equal(c.model().evidence, null); f.setHook(null); await c.refreshCoverage(f.token());
  assert.equal(c.model().coverage.page.reviewedReports, 50); assert.equal(c.model().coverage.confirmed, false);
  await c.openCoveragePage(1, f.token()); c.setEvidence(first.id, f.token());
  assert.equal(c.model().coverage.page.acknowledged, true); assert.equal(c.model().coverage.canAcknowledge, false);
  await c.refreshCoverage(f.token());
  while (!c.model().coverage.page.complete) { c.confirmCoverage(true, f.token()); await c.ackCoverage(f.token()); }
  assert.equal(c.model().coverage.page.reviewedReports, reportCount); assert.equal(c.model().evidence.id, first.id);
  assert.deepEqual(await f.app.counts(), { total: reportCount, open: reportCount, decisions: 0 });
  f.draft('hide', first.id, first.note);
  f.setHook(async ({ path, reply }) => { const response = await reply(); if (path.endsWith('/coverage/decision')) throw Error('Lost committed covered listing receipt'); return response; });
  await c.submitDecision(f.token()); assert.equal(c.model().phase, 'unknown'); assert.equal(c.model().pendingDecision, true); assert.equal(c.model().decisionConfirmed, false);
  const exact = f.calls.find(call => call.path.endsWith('/coverage/decision')), keyCount = f.keys;
  assert.equal(JSON.parse(exact.body).sessionId, sessionId); assert.equal(JSON.parse(exact.body).evidenceReportId, first.id);
  assert.deepEqual(await f.app.counts(), { total: reportCount, open: 0, decisions: 1 });
  await f.app.db.query("UPDATE circle_review_coverage_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [sessionId]);
  await f.app.db.query('UPDATE circle_reviewer_grants SET revoked_at=clock_timestamp() WHERE cohort_id=$1 AND member_id=$2', [f.app.circleId, f.app.authorId]);
  f.setHook(null); await c.retryDecision(f.token());
  assert.equal(c.model().phase, 'unknown'); assert.equal(c.model().pendingDecision, true); assert.equal(c.model().decisionConfirmed, false);
  assert.match(c.model().message, /earlier decision may have been saved/i);
  await f.app.db.query('UPDATE circle_reviewer_grants SET revoked_at=NULL WHERE cohort_id=$1 AND member_id=$2', [f.app.circleId, f.app.authorId]);
  const changed = await json(f.app, f.base);
  await json(f.app, f.base, 'POST', { expectedRevision: changed.revision, requestId: randomUUID(), action: 'restore', reason: 'resolved',
    summary: 'A later independent human review lifted the listing restriction.', evidenceReportId: null, evidenceExcerpt: null });
  await f.app.addListingReports(f.app.circleId, 1); f.setHook(null); await c.retryDecision(f.token());
  assert.equal(c.model().decisionConfirmed, true); assert.equal(c.model().receipt.replayed, true); assert.equal(c.model().receipt.decision.report_count, reportCount);
  assert.equal(c.model().receipt.requestId, JSON.parse(exact.body).requestId); assert.equal(c.model().receipt.circleId, f.app.circleId);
  assert.equal(c.model().detail.circle.hidden, false); assert.equal(c.model().detail.reports.length, 1); assert.equal(c.model().draft.confirmed, false);
  assert.equal(f.keys, keyCount); assert.equal(f.calls.filter(call => call.path.endsWith('/coverage/decision')).at(-1).body, exact.body);
  assert.deepEqual(await f.app.counts(), { total: reportCount + 1, open: 1, decisions: 2 });
  // A newly prepared decision cannot reuse expired coverage; SQL rejects the
  // proof even if the local clock still considers its earlier receipt current.
  await f.app.addListingReports(f.app.circleId, 100); await c.refreshCase(f.token()); await f.cover(); f.draft();
  const expired = c.model().coverage.sessionId;
  await f.app.db.query("UPDATE circle_review_coverage_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [expired]);
  await c.submitDecision(f.token()); assert.equal(c.model().phase, 'unavailable'); assert.equal(c.model().pendingDecision, false);
  assert.equal(c.model().decisionConfirmed, false); assert.deepEqual(await f.app.counts(), { total: reportCount + 101, open: 101, decisions: 2 });
  for (const m of f.snapshots) { if (m.coverage?.page) assert(m.coverage.page.reports.length <= 50); if (m.detail && !m.detail.complete) assert.equal(m.detail.reports.length, 0); }
  assert(!f.calls.some(call => call.path.includes('/messages') || call.path.endsWith('/advice')));
});
test.after(() => { assert.equal(closed, created); console.log('PORTABLE_CIRCLE_REVIEW_SQL_STATS ' + JSON.stringify({ created, closed, providerCalls: 0, fixture: 'Actual listing HTTP/SQL with synthetic verified actor and transport; one PGlite backend per case' })); });
