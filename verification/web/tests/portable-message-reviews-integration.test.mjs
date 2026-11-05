import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../../../', import.meta.url);
function resident(name) { const s = lstatSync(new URL(name, root)); assert(s.isFile() && !s.isSymbolicLink() && (!s.size || s.blocks)); }
for (const name of ['verification/web/tests/support/review-coverage-app.mjs', 'verification/web/tests/support/offline-app.mjs', 'platforms/tests/load-source.mjs']) resident(name);
process.chdir(fileURLToPath(new URL('verification/web/', root)));
const { reviewCoverageApp, requestId } = await import('./support/review-coverage-app.mjs');
const { sourceLoader } = await import('../../../platforms/tests/load-source.mjs');
const { createMessageReviews } = sourceLoader()('platforms/shared/message-reviews.ts');
let created = 0, closed = 0;
async function fixture(t, reportCount) {
  const app = await reviewCoverageApp({ reportCount }); created++;
  const origin = 'https://review-coverage-fixture.test', calls = [], listeners = new Set(), snapshots = [];
  let hook = null;
  const controller = createMessageReviews({ origin, initialOnline: true, timeoutMs: 5000, newRequestId: async () => requestId(),
    owner: { scope: () => 'synthetic-verified-reviewer', bearer: async () => 'NONISSUED_REVIEWER', subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } },
    reviewerTransport: async (url, options) => {
      const path = url.slice(origin.length); calls.push({ path, method: options.method, body: options.body });
      const reply = async () => { const response = await app.dispatch(path, options.method, options.body, options.signal); return { status: response.status, url, redirected: false, json: () => response.json() }; };
      return hook ? hook({ path, options, reply }) : reply();
    } });
  controller.subscribe(value => snapshots.push(value)); controller.connect();
  t.after(async () => { controller.disconnect(); assert.equal(listeners.size, 0); await app.close(); closed++; });
  const token = () => controller.model().action;
  await controller.loadQueue(token()); assert(controller.model().queue.items.some(item => item.messageId === app.messageId));
  await controller.openCase(app.circleId, app.messageId, token()); assert.equal(controller.model().detail.complete, false);
  return { app, controller, calls, snapshots, token, setHook: value => { hook = value; } };
}

for (const reportCount of [101, 250]) test(`portable controller → actual HTTP/SQL: complete ${reportCount}-report review, ACK recovery, exact receipt replay and bounded evidence`, async t => {
  const f = await fixture(t, reportCount), c = f.controller;
  assert.equal(c.model().detail.reports.length, 0); assert.equal(c.model().canRequestAdvice, false);
  await c.startCoverage(f.token()); const first = c.model().coverage.page.reports[0], sessionId = c.model().coverage.sessionId;
  c.setEvidence(first.id, f.token()); c.confirmCoverage(true, f.token());
  f.setHook(async ({ options, reply }) => {
    const result = await reply(); if (options.method === 'POST' && JSON.parse(options.body).action === 'ack') throw Error('Synthetic lost committed ACK reply'); return result;
  });
  await c.ackCoverage(f.token()); assert.equal(c.model().coverage.page, null); assert.equal(c.model().canSubmit, false);
  f.setHook(null); await c.refreshCoverage(f.token()); assert.equal(c.model().coverage.page.reviewedReports, 50); assert.equal(c.model().coverage.confirmed, false);
  // Unknown progress clears chosen private evidence. Revisit its issued page and
  // select the note deliberately; GET does not acknowledge anything itself.
  await c.openCoveragePage(1, f.token()); c.setEvidence(first.id, f.token());
  assert.equal(c.model().coverage.page.acknowledged, true); assert.equal(c.model().coverage.canAcknowledge, false);
  await c.refreshCoverage(f.token());
  while (!c.model().coverage.page.complete) { c.confirmCoverage(true, f.token()); await c.ackCoverage(f.token()); }
  assert.equal(c.model().coverage.page.reviewedReports, reportCount); assert.equal(c.model().evidence.id, first.id);
  assert.equal(c.model().canRequestAdvice, false); await c.requestAdvice(f.token()); assert(!f.calls.some(call => call.path.endsWith('/advice')));
  assert.deepEqual(await f.app.counts('message'), { total: reportCount, open: reportCount, decisions: 0 });
  c.setAction('hide', f.token()); c.setReason('safety', f.token()); c.setSummary('A human reviewed all report pages and recorded a specific conduct finding.', f.token());
  c.setExcerpt(first.note.slice(0, 25), f.token()); c.confirmDecision(true, f.token()); assert.equal(c.model().canSubmit, true);
  f.setHook(async ({ path, reply }) => { const result = await reply(); if (path.endsWith('/coverage/decision')) throw Error('Synthetic lost committed decision reply'); return result; });
  await c.submitDecision(f.token()); assert.equal(c.model().phase, 'unknown'); assert.equal(c.model().pendingDecision, true); assert.equal(c.model().decisionConfirmed, false);
  const exact = f.calls.find(call => call.path.endsWith('/coverage/decision'));
  assert.equal(JSON.parse(exact.body).sessionId, sessionId); assert.equal(JSON.parse(exact.body).evidenceReportId, first.id);
  assert.deepEqual(await f.app.counts('message'), { total: reportCount, open: 0, decisions: 1 });
  // Actual SQL replay checks current reviewer authority before the old receipt,
  // but a consumed/expired session and newly arrived report do not erase it.
  await f.app.db.query("UPDATE circle_review_coverage_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [sessionId]);
  const changed = await f.app.detail('message');
  await f.app.json(f.app.targetPath('message'), 'POST', { expectedRevision: changed.revision, contentHash: changed.contentHash, requestId: requestId(),
    action: 'restore', reason: 'resolved', summary: 'A separate human review lifted the moderator restriction.', evidenceReportId: null, evidenceExcerpt: null });
  await f.app.addReport('message'); f.setHook(null); await c.retryDecision(f.token());
  assert.equal(c.model().decisionConfirmed, true); assert.equal(c.model().receipt.replayed, true); assert.equal(c.model().receipt.decision.report_count, reportCount);
  assert.equal(c.model().detail.reports.length, 1); assert.equal(c.model().draft.confirmed, false);
  assert.equal(f.calls.filter(call => call.path.endsWith('/coverage/decision'))[1].body, exact.body);
  assert.deepEqual(await f.app.counts('message'), { total: reportCount + 1, open: 1, decisions: 2 });
  for (const snapshot of f.snapshots) { if (snapshot.coverage?.page) assert(snapshot.coverage.page.reports.length <= 50); if (snapshot.detail && !snapshot.detail.complete) assert.equal(snapshot.detail.reports.length, 0); }
});
test.after(() => { assert.equal(closed, created); console.log('PORTABLE_REVIEW_SQL_STATS ' + JSON.stringify({ created, closed, providerCalls: 0, fixture: 'Actual HTTP/SQL with synthetic verified actor and transport; one PGlite backend' })); });
