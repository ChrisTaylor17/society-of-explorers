import { parsePublicProfileReference } from '@/lib/members/public-reference';
import { isUuid } from '@/lib/ids/uuid';
import { REPORT_REASONS, type ReportReason } from './report';
import { REVIEW_REPORT_COUNT_MAX } from './review-coverage';

export const MESSAGE_SAFETY_LIMIT = 25;
export type MessageVisibility = 'visible' | 'hidden' | 'withdrawn';
export type MessageDecisionReason = 'safety' | 'harassment' | 'spam' | 'misleading' | 'inappropriate' | 'no_violation' | 'insufficient_evidence' | 'resolved';
export type MessageExplanation = { id: string; action: 'hide' | 'restore'; reason: MessageDecisionReason; summary: string; created_at: string };
export type MessageReviewDecision = MessageExplanation & { report_count: number };
export type MessageSafetyState = {
  circleId: string;
  message: { id: string; member_name: string; publicProfileId?: string | null; content: string | null; created_at: string; is_mine: boolean; visibility: MessageVisibility };
  revision: number; contentHash: string | null; canReport: boolean; canWithdraw: boolean; explanations: MessageExplanation[];
};
export type MessageContributions = { items: MessageSafetyState[]; nextCursor: string | null };
export type MessageActionInput = { expectedRevision: number; contentHash: string; requestId: string } &
  ({ action: 'withdraw' } | { action: 'report'; reason: ReportReason; note: string | null });
export type MessageActionReceipt = { requestId: string; circleId: string; messageId: string; state: MessageSafetyState; replayed: boolean } &
  ({ received: true; withdrawn?: never } | { withdrawn: true; received?: never });
export type MessageReviewQueueItem = { circleId: string; messageId: string; circleTitle: string; visibility: MessageVisibility; openReports: number; revision: number };
export type MessageReviewQueue = { items: MessageReviewQueueItem[]; nextCursor: string | null };
export type MessageReviewDetail = {
  circle: { id: string; title: string };
  message: { id: string; member_name: string; content: string; created_at: string; visibility: MessageVisibility };
  revision: number; contentHash: string;
  reports: { id: string; reason: ReportReason; note: string | null; created_at: string }[];
  decisions: MessageReviewDecision[]; complete: boolean;
};
export type MessageDecisionInput = { expectedRevision: number; contentHash: string; requestId: string; action: 'hide' | 'restore'; reason: MessageDecisionReason; summary: string; evidenceReportId: string | null; evidenceExcerpt: string | null };
export type MessageDecisionReceipt = { requestId: string; circleId: string; messageId: string; decision: MessageReviewDecision; safety: { revision: number; visibility: MessageVisibility }; replayed: boolean };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const plain = (value: unknown, min: number, max: number): value is string => typeof value === 'string' && value.length <= max && value.trim().length >= min && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 64 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
const hash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const visibility = (value: unknown): value is MessageVisibility => value === 'visible' || value === 'hidden' || value === 'withdrawn';
const reason = (value: unknown): value is ReportReason => typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
const reasonFor = (action: unknown, value: unknown): value is MessageDecisionReason => typeof value === 'string' && (action === 'hide'
  ? ['safety', 'harassment', 'spam', 'misleading', 'inappropriate'].includes(value)
  : action === 'restore' && ['no_violation', 'insufficient_evidence', 'resolved'].includes(value));
const unique = (ids: string[]) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length;
const cursor = (value: unknown): value is string | null => value === null || isUuid(value);

function explanation(value: unknown): MessageExplanation | null {
  if (!record(value) || !isUuid(value.id) || (value.action !== 'hide' && value.action !== 'restore') || !reasonFor(value.action, value.reason)
    || !plain(value.summary, 20, 1000) || !timestamp(value.created_at)) return null;
  return { id: value.id, action: value.action, reason: value.reason, summary: value.summary, created_at: value.created_at };
}
function decision(value: unknown): MessageReviewDecision | null {
  const item = explanation(value);
  return item && record(value) && integer(value.report_count) && value.report_count <= REVIEW_REPORT_COUNT_MAX ? { ...item, report_count: value.report_count } : null;
}

/** Always project a whitelist. Private report/evidence fields never pass through. */
export function parseMessageSafetyState(value: unknown): MessageSafetyState | null {
  if (!record(value) || !isUuid(value.circleId) || !record(value.message) || !integer(value.revision)
    || typeof value.canReport !== 'boolean' || typeof value.canWithdraw !== 'boolean'
    || !Array.isArray(value.explanations) || value.explanations.length > 100) return null;
  const m = value.message;
  if (!isUuid(m.id) || !plain(m.member_name, 0, 200) || !timestamp(m.created_at) || typeof m.is_mine !== 'boolean' || !visibility(m.visibility)
    || (m.visibility === 'visible' ? !plain(m.content, 1, 2000) : m.content !== null)
    || (m.is_mine || m.visibility === 'visible' ? !hash(value.contentHash) : value.contentHash !== null)
    || (value.canReport && (m.is_mine || m.visibility !== 'visible')) || (value.canWithdraw && (!m.is_mine || m.visibility === 'withdrawn'))) return null;
  const publicProfileId = parsePublicProfileReference(m.publicProfileId);
  if (publicProfileId === undefined || (m.visibility !== 'visible' && publicProfileId !== null)) return null;
  const explanations = value.explanations.map(explanation);
  if (explanations.some((item) => item === null) || (!m.is_mine && explanations.length > 0)) return null;
  const valid = explanations as MessageExplanation[];
  if (!unique(valid.map((item) => item.id))) return null;
  return { circleId: value.circleId, message: { id: m.id, member_name: m.member_name, publicProfileId, content: m.content as string | null, created_at: m.created_at, is_mine: m.is_mine, visibility: m.visibility },
    revision: value.revision, contentHash: value.contentHash as string | null, canReport: value.canReport, canWithdraw: value.canWithdraw, explanations: valid };
}
export function parseMessageContributions(value: unknown): MessageContributions | null {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > MESSAGE_SAFETY_LIMIT || !cursor(value.nextCursor)) return null;
  const items = value.items.map(parseMessageSafetyState);
  if (items.some((item) => !item || !item.message.is_mine)) return null;
  const valid = items as MessageSafetyState[];
  if (!unique(valid.map((item) => item.message.id)) || (value.nextCursor !== null && value.nextCursor !== valid.at(-1)?.message.id)) return null;
  return { items: valid, nextCursor: value.nextCursor };
}
export function parseMessageActionReceipt(value: unknown): MessageActionReceipt | null {
  if (!record(value) || !isUuid(value.requestId) || !isUuid(value.circleId) || !isUuid(value.messageId) || typeof value.replayed !== 'boolean'
    || !((value.received === true && value.withdrawn === undefined) || (value.withdrawn === true && value.received === undefined))) return null;
  const state = parseMessageSafetyState(value.state);
  if (!state || state.circleId !== value.circleId || state.message.id !== value.messageId || (value.withdrawn === true && state.message.visibility !== 'withdrawn')) return null;
  return { requestId: value.requestId, circleId: value.circleId, messageId: value.messageId, state, replayed: value.replayed,
    ...(value.received === true ? { received: true as const } : { withdrawn: true as const }) };
}
export function parseMessageReviewQueue(value: unknown): MessageReviewQueue | null {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > MESSAGE_SAFETY_LIMIT || !cursor(value.nextCursor)) return null;
  const items: MessageReviewQueueItem[] = [];
  for (const item of value.items) {
    if (!record(item) || !isUuid(item.circleId) || !isUuid(item.messageId) || !plain(item.circleTitle, 1, 120) || !visibility(item.visibility) || !integer(item.openReports) || !integer(item.revision)) return null;
    items.push({ circleId: item.circleId, messageId: item.messageId, circleTitle: item.circleTitle, visibility: item.visibility, openReports: item.openReports, revision: item.revision });
  }
  if (!unique(items.map((item) => item.messageId)) || (value.nextCursor !== null && value.nextCursor !== items.at(-1)?.messageId)) return null;
  return { items, nextCursor: value.nextCursor };
}
export function parseMessageReviewDetail(value: unknown): MessageReviewDetail | null {
  if (!record(value) || !record(value.circle) || !isUuid(value.circle.id) || !plain(value.circle.title, 1, 120) || !record(value.message)
    || !integer(value.revision) || !hash(value.contentHash) || typeof value.complete !== 'boolean'
    || !Array.isArray(value.reports) || value.reports.length > 100 || !Array.isArray(value.decisions) || value.decisions.length > 100) return null;
  const m = value.message;
  if (!isUuid(m.id) || !plain(m.member_name, 0, 200) || !plain(m.content, 1, 2000) || !timestamp(m.created_at) || !visibility(m.visibility)) return null;
  const reports: MessageReviewDetail['reports'] = [];
  for (const r of value.reports) {
    if (!record(r) || !isUuid(r.id) || !reason(r.reason) || !(r.note === null || plain(r.note, 0, 1000)) || !timestamp(r.created_at)) return null;
    reports.push({ id: r.id, reason: r.reason, note: r.note, created_at: r.created_at });
  }
  const decisions = value.decisions.map(decision);
  if (decisions.some((item) => !item) || !unique(reports.map((item) => item.id))) return null;
  const valid = decisions as MessageReviewDecision[];
  if (!unique(valid.map((item) => item.id))) return null;
  return { circle: { id: value.circle.id, title: value.circle.title }, message: { id: m.id, member_name: m.member_name, content: m.content, created_at: m.created_at, visibility: m.visibility },
    revision: value.revision, contentHash: value.contentHash, reports, decisions: valid, complete: value.complete };
}
export function parseMessageDecisionReceipt(value: unknown): MessageDecisionReceipt | null {
  if (!record(value) || !isUuid(value.requestId) || !isUuid(value.circleId) || !isUuid(value.messageId) || !record(value.safety)
    || !integer(value.safety.revision) || !visibility(value.safety.visibility) || typeof value.replayed !== 'boolean') return null;
  const d = decision(value.decision);
  if (!d || (!value.replayed && d.action === 'hide' && value.safety.visibility === 'visible')) return null;
  return { requestId: value.requestId, circleId: value.circleId, messageId: value.messageId, decision: d,
    safety: { revision: value.safety.revision, visibility: value.safety.visibility }, replayed: value.replayed };
}

type Valid<T> = { ok: true; value: T } | { ok: false; error: string };
export function validateMessageActionInput(value: unknown): Valid<MessageActionInput> {
  const invalid = { ok: false as const, error: 'Use a valid post action and refresh its current state.' };
  if (!record(value) || Object.keys(value).some((key) => !['action', 'expectedRevision', 'contentHash', 'requestId', 'reason', 'note'].includes(key))
    || !integer(value.expectedRevision) || !hash(value.contentHash) || !isUuid(value.requestId)) return invalid;
  const base = { expectedRevision: value.expectedRevision, contentHash: value.contentHash, requestId: value.requestId };
  if (value.action === 'withdraw' && value.reason === undefined && value.note === undefined) return { ok: true, value: { ...base, action: 'withdraw' } };
  if (value.action !== 'report' || !reason(value.reason) || !(value.note === null || value.note === undefined || plain(value.note, 0, 1000))) return invalid;
  return { ok: true, value: { ...base, action: 'report', reason: value.reason, note: typeof value.note === 'string' && value.note.trim() ? value.note.trim() : null } };
}
export function validateMessageDecisionInput(value: unknown): Valid<MessageDecisionInput> {
  const invalid = { ok: false as const, error: 'Use a current review, matching reason, author-facing explanation and exact evidence.' };
  if (!record(value) || Object.keys(value).some((key) => !['action', 'expectedRevision', 'contentHash', 'requestId', 'reason', 'summary', 'evidenceReportId', 'evidenceExcerpt'].includes(key))
    || !integer(value.expectedRevision) || !hash(value.contentHash) || !isUuid(value.requestId) || (value.action !== 'hide' && value.action !== 'restore')
    || !reasonFor(value.action, value.reason) || !plain(value.summary, 20, 1000)) return invalid;
  const evidenceReportId = value.evidenceReportId ?? null;
  const evidenceExcerpt = value.evidenceExcerpt ?? null;
  if (!(evidenceReportId === null || isUuid(evidenceReportId)) || (value.action === 'hide' && !plain(evidenceExcerpt, 5, 500))
    || (value.action === 'restore' && (evidenceReportId !== null || evidenceExcerpt !== null))) return invalid;
  return { ok: true, value: { expectedRevision: value.expectedRevision, contentHash: value.contentHash, requestId: value.requestId, action: value.action,
    reason: value.reason, summary: value.summary.trim(), evidenceReportId, evidenceExcerpt: typeof evidenceExcerpt === 'string' ? evidenceExcerpt.trim() : null } };
}
