// Additive receipt contract over the immutable historical review/coverage chain.
import { createHash } from 'node:crypto';
import { coverageSource } from './review-coverage-db.mjs';
await coverageSource('verification/web/tests/support/review-coverage-db.mjs');
const base = await import('./review-coverage-db.mjs');
export const { IDS, rpc, asRole, requestId, completeCoverage, coverageStart, coverageAck, coverageDecide } = base;
export const LISTING_RECEIPT_SQL = ['apply', 'rollback'].map(action => `docs/sql/circle-listing-review-receipt-${action}.sql`);
export async function listingReceiptSourceHashes() {
  const result = { ...base.COVERAGE_SOURCE_HASHES };
  for (const path of [...LISTING_RECEIPT_SQL, 'verification/web/tests/support/circle-listing-receipt-db.mjs']) {
    result[path] = createHash('sha256').update(await coverageSource(path)).digest('hex');
  }
  return result;
}
export async function applyListingReceipts(db, action = 'apply') {
  if (!['apply', 'rollback'].includes(action)) throw Error('Unknown listing receipt candidate');
  try { return await db.exec((await coverageSource(`docs/sql/circle-listing-review-receipt-${action}.sql`)).toString()); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}
export async function createListingReceiptDb({ install = true, reportCount = 0 } = {}) {
  const f = await base.createReviewCoverageDb({ reportCount });
  try { if (install) await applyListingReceipts(f.db); return f; }
  catch (error) { await f.db.close(); throw error; }
}
export function directInput(f, revision, overrides = {}) {
  return { expectedRevision: revision, requestId: requestId(), action: 'restore', reason: 'no_violation',
    summary: 'A human has reviewed the current listing and found no conduct violation.', evidenceReportId: null, evidenceExcerpt: null, ...overrides };
}
export function directDecide(f, input, actor = f.reviewerId, circleId = f.circleId) {
  return rpc(f.db, 'soe_circle_review_decide', [actor, circleId, input.expectedRevision, input.requestId,
    input.action, input.reason, input.summary, input.evidenceReportId, input.evidenceExcerpt]);
}
