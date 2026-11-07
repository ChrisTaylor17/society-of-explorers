import { isUuid } from '@/lib/ids/uuid';
import { membershipInteger, membershipRecord, membershipText, parseCircleMembershipReceipt,
  type CircleMembershipReceipt } from './membership';

export const CIRCLE_INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const CIRCLE_INVITATION_MAX_LENGTH = 1600;
export type CircleInvitationReview = { memberId: string; circleId: string; circleRevision: number; invitationRevision: number;
  targetMemberId: string; targetLabel: string; expiresAt: string };
export type CircleInvitationReviewInput = { expectedMemberId: string; recipientCode: string };
export type CircleInvitationIssueInput = CircleInvitationReviewInput & { targetMemberId: string; requestId: string; expectedRevision: number;
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
  return membershipRecord(value) && exactAdmissionKeys(value, ['expectedMemberId', 'recipientCode'])
    && canonicalAdmissionUuid(value.expectedMemberId) && isCircleRecipientCode(value.recipientCode)
    ? { expectedMemberId: value.expectedMemberId, recipientCode: value.recipientCode } : null;
}
export function parseCircleInvitationIssueInput(value: unknown): CircleInvitationIssueInput | null {
  if (!membershipRecord(value) || !exactAdmissionKeys(value, ['expectedMemberId', 'recipientCode', 'targetMemberId', 'requestId', 'expectedRevision', 'expectedInvitationRevision', 'expectedTargetLabel', 'expiresAt'])
    || !isCircleRecipientCode(value.recipientCode) || !canonicalAdmissionUuid(value.expectedMemberId) || !canonicalAdmissionUuid(value.targetMemberId) || !canonicalAdmissionUuid(value.requestId)
    || !membershipInteger(value.expectedRevision) || !membershipInteger(value.expectedInvitationRevision) || value.expectedInvitationRevision < 1
    || !targetLabel(value.expectedTargetLabel) || !admissionTime(value.expiresAt)) return null;
  return { expectedMemberId: value.expectedMemberId, recipientCode: value.recipientCode, targetMemberId: value.targetMemberId, requestId: value.requestId,
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

export const CIRCLE_RECIPIENT_CODE_LIFETIME_MS = 60 * 60 * 1000;
export const isCircleRecipientCode = (v: unknown): v is string => typeof v === 'string' && v.length <= 1000 && /^soe-cr1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(v);
export const isCircleApprovalCode = (v: unknown): v is string => typeof v === 'string' && v.length <= CIRCLE_INVITATION_MAX_LENGTH && /^soe-ci1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(v);
export type CircleAdmissionAccess = { memberId: string; circleId: string; title: string; revision: number; invitationRevision: number;
  admissionMode: 'open' | 'host_approval'; isHost: boolean; isMember: boolean; canIssue: boolean; canRevoke: boolean; canJoin: boolean };
export type CircleInvitationCheck = CircleAdmissionAccess & { approvalNonce: string; proofHash: string; expiresAt: string };
export type CircleInvitationRecovery = { expectedMemberId: string; requestId: string; expectedRevision: number; approvalNonce: string; proofHash: string };
export function parseCircleInvitationRecovery(v: unknown): CircleInvitationRecovery | null {
  return membershipRecord(v) && exactAdmissionKeys(v,['expectedMemberId','requestId','expectedRevision','approvalNonce','proofHash'])
    && canonicalAdmissionUuid(v.expectedMemberId) && canonicalAdmissionUuid(v.requestId) && canonicalAdmissionUuid(v.approvalNonce)
    && membershipInteger(v.expectedRevision) && typeof v.proofHash==='string' && /^[a-f0-9]{64}$/.test(v.proofHash)
    ? {expectedMemberId:v.expectedMemberId,requestId:v.requestId,expectedRevision:v.expectedRevision,approvalNonce:v.approvalNonce,proofHash:v.proofHash} : null;
}
export function parseCircleAdmissionAccess(v: unknown, memberId: string, circleId: string, check=false): CircleAdmissionAccess | CircleInvitationCheck | null {
  if(!membershipRecord(v) || !exactAdmissionKeys(v,['memberId','circleId','title','revision','invitationRevision','admissionMode','isHost','isMember','canIssue','canRevoke','canJoin',...(check?['approvalNonce','proofHash','expiresAt']:[])])
    || v.memberId!==memberId || v.circleId!==circleId || !canonicalAdmissionUuid(memberId) || !canonicalAdmissionUuid(circleId)
    || !membershipText(v.title,200) || !v.title.trim() || !membershipInteger(v.revision) || !membershipInteger(v.invitationRevision) || v.invitationRevision<1
    || !['open','host_approval'].includes(String(v.admissionMode)) || ['isHost','isMember','canIssue','canRevoke','canJoin'].some(k=>typeof v[k]!=='boolean')
    || v.canIssue && (!v.isHost || v.admissionMode!=='host_approval') || v.canRevoke && (!v.isHost || v.admissionMode!=='host_approval')
    || v.canJoin && (v.isMember || v.admissionMode!=='host_approval')) return null;
  if(check && (!canonicalAdmissionUuid(v.approvalNonce) || typeof v.proofHash!=='string' || !/^[a-f0-9]{64}$/.test(v.proofHash) || !admissionTime(v.expiresAt))) return null;
  return v as unknown as CircleAdmissionAccess | CircleInvitationCheck;
}
