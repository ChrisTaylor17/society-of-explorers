import { isUuid } from '@/lib/ids/uuid';
import { REPORT_REASONS, type ReportReason } from './report';

export const REVIEW_COVERAGE_PAGE_SIZE = 50;
export const REVIEW_REPORT_COUNT_MAX = 2_147_483_647;
export type ReviewCoverageEvidence = { id: string; note: string | null; label: string };
export type ReviewCoveragePage = {
  sessionId: string; circleId: string; messageId: string | null; revision: number; contentHash: string | null;
  totalReports: number; reviewedReports: number; pageToken: string;
  reports: { id: string; reason: ReportReason; note: string | null; created_at: string }[];
  complete: boolean; expiresAt: string; pageNumber: number; acknowledged: boolean;
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const timestamp = (v: unknown): v is string => typeof v === 'string' && v.length <= 64 && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const hash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/** Bounded projection. Complete means acknowledged coverage, not a verdict. */
export function parseReviewCoveragePage(value: unknown): ReviewCoveragePage | null {
  const keys = ['sessionId', 'circleId', 'messageId', 'revision', 'contentHash', 'totalReports', 'reviewedReports',
    'pageToken', 'reports', 'complete', 'expiresAt', 'pageNumber', 'acknowledged'];
  if (!record(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))
    || !isUuid(value.sessionId) || !isUuid(value.circleId) || !isUuid(value.pageToken)
    || !(value.messageId === null ? value.contentHash === null : isUuid(value.messageId) && hash(value.contentHash))
    || !integer(value.revision) || !integer(value.totalReports) || value.totalReports > REVIEW_REPORT_COUNT_MAX
    || !integer(value.reviewedReports) || value.reviewedReports > value.totalReports
    || typeof value.complete !== 'boolean' || value.complete !== (value.reviewedReports === value.totalReports)
    || typeof value.acknowledged !== 'boolean' || !timestamp(value.expiresAt)
    || !integer(value.pageNumber) || value.pageNumber < 1 || !Array.isArray(value.reports)) return null;
  const pages = Math.max(1, Math.ceil(value.totalReports / REVIEW_COVERAGE_PAGE_SIZE));
  const frontier = Math.min(pages, Math.floor(value.reviewedReports / REVIEW_COVERAGE_PAGE_SIZE) + 1);
  const expectedLength = Math.min(REVIEW_COVERAGE_PAGE_SIZE, value.totalReports - (value.pageNumber - 1) * REVIEW_COVERAGE_PAGE_SIZE);
  if (value.pageNumber > frontier || value.reports.length !== expectedLength
    || (!value.complete && value.reviewedReports % REVIEW_COVERAGE_PAGE_SIZE !== 0)
    || value.acknowledged !== (value.complete || value.pageNumber * REVIEW_COVERAGE_PAGE_SIZE <= value.reviewedReports)) return null;
  const reports: ReviewCoveragePage['reports'] = [];
  for (const report of value.reports) {
    if (!record(report) || !isUuid(report.id) || !REPORT_REASONS.some(reason => report.reason === reason)
      || !(report.note === null || text(report.note, 1000)) || !timestamp(report.created_at)) return null;
    reports.push({ id: report.id, reason: report.reason as ReportReason, note: report.note, created_at: report.created_at });
  }
  if (new Set(reports.map(report => report.id.toLowerCase())).size !== reports.length) return null;
  return { sessionId: value.sessionId, circleId: value.circleId, messageId: value.messageId as string | null,
    revision: value.revision, contentHash: value.contentHash as string | null, totalReports: value.totalReports,
    reviewedReports: value.reviewedReports, pageToken: value.pageToken, reports, complete: value.complete,
    expiresAt: value.expiresAt, pageNumber: value.pageNumber, acknowledged: value.acknowledged };
}
