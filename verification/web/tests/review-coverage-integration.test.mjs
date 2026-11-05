import test from 'node:test';
import assert from 'node:assert/strict';
import { listingReceiptApp as reviewCoverageApp, listingReceiptAppCleanup } from './support/circle-listing-receipt-app.mjs';
test.after(() => console.log('LISTING_COVERAGE_CLEANUP ' + JSON.stringify(listingReceiptAppCleanup)));

const kinds = ['listing', 'message'];
const coveragePath = (f, kind) => f.targetPath(kind) + '/coverage';
const decisionPath = (f, kind) => coveragePath(f, kind) + '/decision';
const projection = detail => ({ revision: detail.revision, hidden: detail.circle.hidden ?? null,
  visibility: detail.message?.visibility ?? null });

for (const reportCount of [101, 250]) test(`actual API+SQL: both ${reportCount}-report cases require complete pages and accept earlier-page evidence`, async t => {
  const f = await reviewCoverageApp({ reportCount }); t.after(() => f.close());
  for (const kind of kinds) {
    const first = await f.start(kind);
    assert.equal(first.totalReports, reportCount); assert.equal(first.reports.length, 50);
    assert.equal(first.complete, false); assert.equal(first.reviewedReports, 0);
    assert.ok(first.reports.some(report => report.id === f.evidence[kind].id));
    await f.json(decisionPath(f, kind), 'POST', f.decision(kind, first), 409);
    assert.deepEqual(await f.counts(kind), { total: reportCount, open: reportCount, decisions: 0 });

    // This explicit fresh start also proves that the abandoned session is not
    // needed to complete a new review. Only issued pages in this session count.
    const { page, reportIds } = await f.complete(kind);
    assert.equal(page.complete, true); assert.equal(page.reviewedReports, reportCount);
    assert.equal(page.pageNumber, Math.ceil(reportCount / 50));
    assert.ok(reportIds.includes(f.evidence[kind].id));
    const earlier = await f.page(kind, page.sessionId, 1);
    assert.equal(earlier.acknowledged, true); assert.equal(earlier.complete, true);
    assert.equal(earlier.reviewedReports, reportCount);
    assert.ok(earlier.reports.some(report => report.id === f.evidence[kind].id));

    const input = f.decision(kind, page), receipt = await f.json(decisionPath(f, kind), 'POST', input);
    assert.equal(receipt.sessionId, page.sessionId); assert.equal(receipt.replayed, false);
    assert.equal(receipt.decision.report_count, reportCount);
    assert.deepEqual(await f.counts(kind), { total: reportCount, open: 0, decisions: 1 });
    const fresh = await f.detail(kind);
    assert.equal(fresh.reports.length, 0); assert.equal(fresh.complete, true);
    assert.equal(fresh.decisions.length, 1); assert.ok(fresh.decisions.length <= 100);
    assert.equal(fresh.decisions[0].id, receipt.decision.id);
    assert.equal(fresh.decisions[0].report_count, reportCount);
    assert.equal(kind === 'listing' ? fresh.circle.hidden : fresh.message.visibility, kind === 'listing' ? true : 'hidden');

    const replay = await f.json(decisionPath(f, kind), 'POST', input);
    assert.equal(replay.replayed, true); assert.equal(replay.decision.id, receipt.decision.id);
    await f.json(decisionPath(f, kind), 'POST', { ...input, summary: 'A changed explanation is a different request payload.' }, 409);
    assert.equal((await f.counts(kind)).decisions, 1);
  }
});

test('actual API+SQL: forged/skipped/cross-surface/other-reviewer progress never credits unseen pages', async t => {
  const f = await reviewCoverageApp({ reportCount: 101 }); t.after(() => f.close());
  const otherReviewer = '91919191-9191-4191-8191-919191919191';
  await f.db.query("INSERT INTO members(id,display_name) VALUES($1,'Other synthetic reviewer') ON CONFLICT(id) DO NOTHING", [otherReviewer]);
  await f.db.query(`INSERT INTO circle_reviewer_grants(cohort_id,member_id)
    SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM circle_reviewer_grants WHERE cohort_id=$1 AND member_id=$2)`, [f.circleId, otherReviewer]);
  const listing = await f.start('listing'), message = await f.start('message');
  for (const [kind, first, foreign] of [['listing', listing, message], ['message', message, listing]]) {
    await f.json(coveragePath(f, kind) + `?sessionId=${first.sessionId}&page=3`, 'GET', undefined, 409);
    await f.json(coveragePath(f, kind), 'POST', { action: 'ack', sessionId: first.sessionId, pageToken: crypto.randomUUID() }, 409);
    await f.json(coveragePath(f, kind) + `?sessionId=${foreign.sessionId}`, 'GET', undefined, 409);
    f.setActor(otherReviewer);
    const stolen = await f.json(coveragePath(f, kind) + `?sessionId=${first.sessionId}`, 'GET', undefined, 409);
    const unknown = await f.json(coveragePath(f, kind) + `?sessionId=${crypto.randomUUID()}`, 'GET', undefined, 409);
    assert.deepEqual(stolen, unknown); assert.deepEqual(Object.keys(stolen), ['error']);
    f.setActor(f.reviewerId);
    const next = await f.ack(kind, first);
    assert.equal(next.reviewedReports, 50); assert.equal(next.pageNumber, 2);
    const replay = await f.ack(kind, first);
    assert.equal(replay.reviewedReports, 50); assert.equal(replay.pageNumber, 2);
    assert.equal(replay.pageToken, next.pageToken);
    assert.deepEqual(await f.counts(kind), { total: 101, open: 101, decisions: 0 });
  }
});

for (const timing of ['after the first page', 'after all pages']) test(`actual API+SQL: a real new report ${timing} invalidates both case snapshots without a decision`, async t => {
  const f = await reviewCoverageApp({ reportCount: 101 }); t.after(() => f.close());
  // Message first: a genuine listing report can legitimately quarantine the
  // Circle under its separate existing threshold policy.
  for (const kind of ['message', 'listing']) {
    let value = await f.start(kind);
    if (timing === 'after all pages') {
      while (!value.complete) value = await f.ack(kind, value);
    } else value = await f.ack(kind, value);
    await f.addReport(kind); // Actual authorized report RPC, not a direct row/revision edit.
    const afterReport = await f.detail(kind);
    await f.json(coveragePath(f, kind) + `?sessionId=${value.sessionId}`, 'GET', undefined, 409);
    await f.json(decisionPath(f, kind), 'POST', f.decision(kind, value), 409);
    assert.deepEqual(projection(await f.detail(kind)), projection(afterReport));
    assert.deepEqual(await f.counts(kind), { total: 102, open: 102, decisions: 0 });
  }
});
