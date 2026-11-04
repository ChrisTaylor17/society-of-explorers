// Public-safe contracts shared by the human review UI and server routes.
// Parsers construct explicit projections; raw RPC records never reach clients.
import { isUuid } from '@/lib/ids/uuid';
import { isRecord } from './http';
import { REPORT_REASONS, type ReportReason } from './report';

export const CIRCLE_HIDE_REASONS = ['safety', 'harassment', 'spam', 'misleading'] as const;
export const CIRCLE_RESTORE_REASONS = ['no_violation', 'insufficient_evidence', 'resolved'] as const;
export const CIRCLE_REVIEW_LIMIT = 25;
export const CIRCLE_REVIEW_DETAIL_LIMIT = 100;
export const CIRCLE_SUMMARY_MIN = 20;
export const CIRCLE_SUMMARY_MAX = 1000;
export const CIRCLE_EVIDENCE_MIN = 5;
export const CIRCLE_EVIDENCE_MAX = 500;
export const CIRCLE_REVIEW_BODY_MAX_BYTES = 12_000;

export type CircleReviewAction = 'hide' | 'restore';
export type CircleReviewReason = (typeof CIRCLE_HIDE_REASONS)[number] | (typeof CIRCLE_RESTORE_REASONS)[number];
export const CIRCLE_REVIEW_REASON_LABELS: Record<CircleReviewReason, string> = {
  safety: 'Safety concern', harassment: 'Harassment or hateful conduct', spam: 'Spam or selling', misleading: 'Fake or misleading listing',
  no_violation: 'No violation found', insufficient_evidence: 'Insufficient evidence', resolved: 'Concern resolved',
};

export type CircleHostDecision = { id: string; action: CircleReviewAction; reason: CircleReviewReason; summary: string; created_at: string };
export type CircleReviewDecision = CircleHostDecision & { report_count: number };
export type CircleReviewQueueItem = { id: string; title: string; hidden: boolean; openReports: number; revision: number };
export type CircleReviewQueue = { items: CircleReviewQueueItem[]; nextCursor: string | null };
export type CircleReviewReport = { id: string; reason: ReportReason; note: string | null; created_at: string };
export type CircleReviewDetail = {
  circle: { id: string; title: string; description: string | null; hidden: boolean };
  revision: number;
  reports: CircleReviewReport[];
  decisions: CircleReviewDecision[];
  complete: boolean;
};
export type CircleDecisionReceipt = { decision: CircleReviewDecision; revision: number; hidden: boolean; replayed: boolean };
export type CircleHostReview = { circle: { id: string; title: string; hidden: boolean }; decisions: CircleHostDecision[] };
export type CircleHostReviews = { items: CircleHostReview[]; nextCursor: string | null };
export type CircleReviewInput = {
  expectedRevision: number;
  requestId: string;
  action: CircleReviewAction;
  reason: CircleReviewReason;
  summary: string;
  evidenceReportId: string | null;
  evidenceExcerpt: string | null;
};

const unsafeControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
function plain(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length <= max && value.trim().length >= min && !unsafeControls.test(value);
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}
function reasonFor(action: unknown, reason: unknown): reason is CircleReviewReason {
  return typeof reason === 'string' && (action === 'hide'
    ? CIRCLE_HIDE_REASONS.some((candidate) => candidate === reason)
    : action === 'restore' && CIRCLE_RESTORE_REASONS.some((candidate) => candidate === reason));
}
function uniqueIds(items: Array<{ id: string }>): boolean {
  return new Set(items.map((item) => item.id.toLowerCase())).size === items.length;
}
function cursor(value: unknown): value is string | null { return value === null || isUuid(value); }

function hostDecision(value: unknown): CircleHostDecision | null {
  if (!isRecord(value) || !isUuid(value.id) || (value.action !== 'hide' && value.action !== 'restore')
    || !reasonFor(value.action, value.reason) || !plain(value.summary, CIRCLE_SUMMARY_MIN, CIRCLE_SUMMARY_MAX) || !timestamp(value.created_at)) return null;
  return { id: value.id, action: value.action, reason: value.reason, summary: value.summary, created_at: value.created_at };
}
function decision(value: unknown): CircleReviewDecision | null {
  const parsed = hostDecision(value);
  if (!parsed || !isRecord(value) || !integer(value.report_count) || value.report_count > CIRCLE_REVIEW_DETAIL_LIMIT) return null;
  return { ...parsed, report_count: value.report_count };
}
function report(value: unknown): CircleReviewReport | null {
  if (!isRecord(value) || !isUuid(value.id) || !REPORT_REASONS.some((reason) => reason === value.reason)
    || !(value.note === null || plain(value.note, 0, 1000)) || !timestamp(value.created_at)) return null;
  return { id: value.id, reason: value.reason as ReportReason, note: value.note, created_at: value.created_at };
}
function hostCircle(value: unknown): CircleHostReview['circle'] | null {
  if (!isRecord(value) || !isUuid(value.id) || !plain(value.title, 1, 120) || typeof value.hidden !== 'boolean') return null;
  return { id: value.id, title: value.title, hidden: value.hidden };
}

export function parseCircleReviewQueue(value: unknown): CircleReviewQueue | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > CIRCLE_REVIEW_LIMIT || !cursor(value.nextCursor)) return null;
  const items: CircleReviewQueueItem[] = [];
  for (const item of value.items) {
    const circle = hostCircle(item);
    if (!circle || !isRecord(item) || !integer(item.openReports) || !integer(item.revision)) return null;
    items.push({ ...circle, openReports: item.openReports, revision: item.revision });
  }
  if (!uniqueIds(items) || (value.nextCursor !== null && value.nextCursor !== items.at(-1)?.id)) return null;
  return { items, nextCursor: value.nextCursor };
}

export function parseCircleReviewDetail(value: unknown): CircleReviewDetail | null {
  if (!isRecord(value) || !isRecord(value.circle) || !integer(value.revision) || typeof value.complete !== 'boolean'
    || !Array.isArray(value.reports) || value.reports.length > CIRCLE_REVIEW_DETAIL_LIMIT
    || !Array.isArray(value.decisions) || value.decisions.length > CIRCLE_REVIEW_DETAIL_LIMIT) return null;
  const circle = hostCircle(value.circle);
  if (!circle || !(value.circle.description === null || plain(value.circle.description, 0, 600))) return null;
  const reports = value.reports.map(report);
  const decisions = value.decisions.map(decision);
  if (reports.some((item) => !item) || decisions.some((item) => !item)) return null;
  const validReports = reports as CircleReviewReport[];
  const validDecisions = decisions as CircleReviewDecision[];
  if (!uniqueIds(validReports) || !uniqueIds(validDecisions)) return null;
  return { circle: { ...circle, description: value.circle.description }, revision: value.revision, reports: validReports, decisions: validDecisions, complete: value.complete };
}

export function parseCircleDecisionReceipt(value: unknown): CircleDecisionReceipt | null {
  if (!isRecord(value) || !integer(value.revision) || typeof value.hidden !== 'boolean' || typeof value.replayed !== 'boolean') return null;
  const parsed = decision(value.decision);
  if (!parsed || (!value.replayed && (parsed.action === 'hide') !== value.hidden)) return null;
  return { decision: parsed, revision: value.revision, hidden: value.hidden, replayed: value.replayed };
}

export function parseCircleHostReview(value: unknown): CircleHostReview | null {
  if (!isRecord(value) || !Array.isArray(value.decisions) || value.decisions.length > CIRCLE_REVIEW_DETAIL_LIMIT) return null;
  const circle = hostCircle(value.circle);
  const decisions = value.decisions.map(hostDecision);
  if (!circle || decisions.some((item) => !item)) return null;
  const validDecisions = decisions as CircleHostDecision[];
  if (!uniqueIds(validDecisions)) return null;
  return { circle, decisions: validDecisions };
}

export function parseCircleHostReviews(value: unknown): CircleHostReviews | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > CIRCLE_REVIEW_LIMIT || !cursor(value.nextCursor)) return null;
  const items = value.items.map(parseCircleHostReview);
  if (items.some((item) => !item)) return null;
  const validItems = items as CircleHostReview[];
  if (!uniqueIds(validItems.map((item) => item.circle)) || (value.nextCursor !== null && value.nextCursor !== validItems.at(-1)?.circle.id)) return null;
  return { items: validItems, nextCursor: value.nextCursor };
}

export function validateCircleReviewInput(value: unknown): { ok: true; value: CircleReviewInput } | { ok: false; error: string } {
  const invalid = (error: string) => ({ ok: false as const, error });
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    'expectedRevision', 'requestId', 'action', 'reason', 'summary', 'evidenceReportId', 'evidenceExcerpt',
  ].includes(key))) return invalid('Use a valid review request.');
  if (!integer(value.expectedRevision) || !isUuid(value.requestId)) return invalid('Refresh the review before deciding.');
  if ((value.action !== 'hide' && value.action !== 'restore') || !reasonFor(value.action, value.reason)) return invalid('Choose a decision and a matching reason.');
  if (!plain(value.summary, CIRCLE_SUMMARY_MIN, CIRCLE_SUMMARY_MAX)) return invalid(`Write a public-safe summary of ${CIRCLE_SUMMARY_MIN} to ${CIRCLE_SUMMARY_MAX} characters.`);
  const evidenceReportId = value.evidenceReportId ?? null;
  const evidenceExcerpt = value.evidenceExcerpt ?? null;
  if (!(evidenceReportId === null || isUuid(evidenceReportId))) return invalid('Choose evidence from this review.');
  if (value.action === 'hide' && !plain(evidenceExcerpt, CIRCLE_EVIDENCE_MIN, CIRCLE_EVIDENCE_MAX)) return invalid(`Select an exact evidence excerpt of ${CIRCLE_EVIDENCE_MIN} to ${CIRCLE_EVIDENCE_MAX} characters.`);
  if (value.action === 'restore' && (evidenceReportId !== null || evidenceExcerpt !== null)) return invalid('Restoration does not include private evidence excerpts.');
  return { ok: true, value: {
    expectedRevision: value.expectedRevision, requestId: value.requestId, action: value.action, reason: value.reason,
    summary: value.summary.trim(), evidenceReportId, evidenceExcerpt: typeof evidenceExcerpt === 'string' ? evidenceExcerpt.trim() : null,
  } };
}
