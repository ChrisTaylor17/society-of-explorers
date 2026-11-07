import { isUuid } from '@/lib/ids/uuid';
import { membershipInteger, membershipRecord, membershipText, parseCircleMembershipReceipt,
  type CircleMembershipReceipt } from './membership';

export const CIRCLE_INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const CIRCLE_INVITATION_MAX_LENGTH = 1600;
export type CircleInvitationReview = { memberId: string; circleId: string; circleRevision: number; invitationRevision: number;
  targetMemberId: string; targetLabel: string; expiresAt: string };
export type CircleInvitationReviewInput = { expectedMemberId: string; targetMemberId: string };
export type CircleInvitationIssueInput = CircleInvitationReviewInput & { requestId: string; expectedRevision: number;
  expectedInvitationRevision: number; expectedTargetLabel: string; expiresAt: string };
export type CircleInvitedJoinInput = { expectedMemberId: string; requestId: string; expectedRevision: number; invitationToken: string };
export type CircleInvitationRevokeInput = { expectedMemberId: string; requestId: string; expectedRevision: number; expectedInvitationRevision: number };
export type CircleInvitedJoinReceipt = CircleMembershipReceipt & { memberId: string };

export const canonicalAdmissionUuid = (value: unknown): value is string => isUuid(value) && value === value.toLowerCase();
export const exactAdmissionKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
export function admissionTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
const targetLabel = (value: unknown): value is string => membershipText(value, 40) && Boolean(value.trim()) && !value.includes('@');
export function parseCircleInvitationReview(value: unknown, memberId: string, circleId: string, targetMemberId: string): CircleInvitationReview | null {
  if (!membershipRecord(value) || !exactAdmissionKeys(value, ['memberId', 'circleId', 'circleRevision', 'invitationRevision', 'targetMemberId', 'targetLabel', 'expiresAt'])
    || value.memberId !== memberId || value.circleId !== circleId || value.targetMemberId !== targetMemberId
    || ![value.memberId, value.circleId, value.targetMemberId].every(canonicalAdmissionUuid)
    || !membershipInteger(value.circleRevision) || !membershipInteger(value.invitationRevision) || value.invitationRevision < 1
    || !targetLabel(value.targetLabel) || !admissionTime(value.expiresAt)) return null;
  return { memberId, circleId, targetMemberId, circleRevision: value.circleRevision, invitationRevision: value.invitationRevision,
    targetLabel: value.targetLabel, expiresAt: value.expiresAt };
}
export function parseCircleInvitationReviewInput(value: unknown): CircleInvitationReviewInput | null {
  return membershipRecord(value) && exactAdmissionKeys(value, ['expectedMemberId', 'targetMemberId'])
    && canonicalAdmissionUuid(value.expectedMemberId) && canonicalAdmissionUuid(value.targetMemberId)
    ? { expectedMemberId: value.expectedMemberId, targetMemberId: value.targetMemberId } : null;
}
export function parseCircleInvitationIssueInput(value: unknown): CircleInvitationIssueInput | null {
  if (!membershipRecord(value) || !exactAdmissionKeys(value, ['expectedMemberId', 'targetMemberId', 'requestId', 'expectedRevision', 'expectedInvitationRevision', 'expectedTargetLabel', 'expiresAt'])
    || !canonicalAdmissionUuid(value.expectedMemberId) || !canonicalAdmissionUuid(value.targetMemberId) || !canonicalAdmissionUuid(value.requestId)
    || !membershipInteger(value.expectedRevision) || !membershipInteger(value.expectedInvitationRevision) || value.expectedInvitationRevision < 1
    || !targetLabel(value.expectedTargetLabel) || !admissionTime(value.expiresAt)) return null;
  return { expectedMemberId: value.expectedMemberId, targetMemberId: value.targetMemberId, requestId: value.requestId,
    expectedRevision: value.expectedRevision, expectedInvitationRevision: value.expectedInvitationRevision,
    expectedTargetLabel: value.expectedTargetLabel, expiresAt: value.expiresAt };
}
export function parseCircleInvitedJoinInput(value: unknown): CircleInvitedJoinInput | null {
  if (!membershipRecord(value) || !exactAdmissionKeys(value, ['expectedMemberId', 'requestId', 'expectedRevision', 'invitationToken'])
    || !canonicalAdmissionUuid(value.expectedMemberId) || !canonicalAdmissionUuid(value.requestId) || !membershipInteger(value.expectedRevision)
    || typeof value.invitationToken !== 'string' || value.invitationToken.length > CIRCLE_INVITATION_MAX_LENGTH
    || !/^soe-ci1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value.invitationToken)) return null;
  return { expectedMemberId: value.expectedMemberId, requestId: value.requestId, expectedRevision: value.expectedRevision, invitationToken: value.invitationToken };
}
export function parseCircleInvitationRevokeInput(value: unknown): CircleInvitationRevokeInput | null {
  return membershipRecord(value) && exactAdmissionKeys(value, ['expectedMemberId', 'requestId', 'expectedRevision', 'expectedInvitationRevision'])
    && canonicalAdmissionUuid(value.expectedMemberId) && canonicalAdmissionUuid(value.requestId) && membershipInteger(value.expectedRevision)
    && membershipInteger(value.expectedInvitationRevision) && value.expectedInvitationRevision >= 1
    ? { expectedMemberId: value.expectedMemberId, requestId: value.requestId, expectedRevision: value.expectedRevision,
      expectedInvitationRevision: value.expectedInvitationRevision } : null;
}
export function parseCircleInvitedJoinReceipt(value: unknown, input: CircleInvitedJoinInput, circleId: string): CircleInvitedJoinReceipt | null {
  if (!membershipRecord(value) || !exactAdmissionKeys(value, ['memberId', 'requestId', 'circleId', 'receipt', 'state', 'replayed'])
    || value.memberId !== input.expectedMemberId || !membershipRecord(value.receipt)
    || !exactAdmissionKeys(value.receipt, ['action', 'joined', 'completed', 'date', 'status'])
    || !membershipRecord(value.state) || !exactAdmissionKeys(value.state, ['revision', 'isMember', 'isHost', 'hidden', 'completed', 'ended', 'canJoin', 'canLeave', 'canRsvp', 'canComplete', 'canReadConversation'])) return null;
  const parsed = parseCircleMembershipReceipt(value, 'join', circleId, input.requestId);
  return parsed && parsed.state.revision > input.expectedRevision
    && (parsed.replayed || parsed.state.revision === input.expectedRevision + 1)
    ? { memberId: input.expectedMemberId, ...parsed } : null;
}
