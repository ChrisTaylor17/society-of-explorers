import 'server-only';
import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { privateJson } from '@/lib/http/routeError';
import { rateLimit } from '@/lib/rateLimit';
import { circleWriteOrigin, readCircleReviewJson } from './moderation-server';
import { membershipInteger, membershipRecord } from './membership';
import { canonicalAdmissionUuid, exactAdmissionKeys, parseCircleInvitationReview,
  parseCircleInvitationReviewInput, parseCircleInvitationIssueInput, parseCircleInvitedJoinInput,
  parseCircleInvitedJoinReceipt, parseCircleInvitationRevokeInput, CIRCLE_INVITATION_LIFETIME_MS,
  type CircleInvitationReview } from './admission';
import { circleInvitationProofHash, signCircleInvitation, verifyCircleInvitation } from './admission-token-server';

type Result<T> = { ok: true; value: T } | { ok: false; response: Response };
const refuse = (error: string, status: number, outcome = 'not_attempted') => privateJson({ error, outcome }, { status });
const unavailable = (unknown = false) => refuse('Salon invitations are unavailable. Check current access before trying again.', 503, unknown ? 'unknown' : 'not_attempted');
function failure(error: unknown, mutation = false) {
  const code = membershipRecord(error) ? String(error.code) : '';
  const status = code === 'PT400' ? 400 : code === 'PT403' ? 403 : code === 'PT404' ? 404 : code === 'PT409' ? 409 : 503;
  if (status === 503) return unavailable(mutation && !['PT503', 'PGRST202', '42883', '42P01', '42501'].includes(code));
  return refuse(status === 409 ? 'The salon or invitation changed. Review current access again.'
    : status === 403 ? 'This invitation is not available to this account.' : status === 404 ? 'Salon invitation controls are unavailable.'
    : 'Use a valid reviewed invitation.', status);
}
async function input(req: NextRequest, circleId: string): Promise<Result<unknown>> {
  if (!canonicalAdmissionUuid(circleId)) return { ok: false, response: refuse('Use a valid salon identifier.', 400) };
  const origin = circleWriteOrigin(req);
  if (origin) return { ok: false, response: origin };
  const read = await readCircleReviewJson(req);
  return read.ok ? read : { ok: false, response: refuse('Use a small valid JSON invitation request.', read.response.status) };
}
async function actor(req: NextRequest, expectedMemberId: string): Promise<Result<string>> {
  const header = req.headers.get('x-soe-expected-member');
  if (header !== null && (!canonicalAdmissionUuid(header) || header !== expectedMemberId)) {
    return { ok: false, response: refuse('The reviewed account changed.', 409) };
  }
  const current = await getAuthenticatedMember(req);
  if (!current || !canonicalAdmissionUuid(current.memberId)) return { ok: false, response: refuse('Sign in to check this invitation.', 401) };
  return current.memberId === expectedMemberId ? { ok: true, value: current.memberId }
    : { ok: false, response: refuse('The account changed. Review this action with your current account.', 409) };
}
const budget = (id: string) => rateLimit('circle-invitations:' + id, 80, 60 * 60 * 1000).ok;
async function review(memberId: string, circleId: string, targetMemberId: string, expiresAt?: string): Promise<Result<CircleInvitationReview>> {
  const { data, error } = await getSupabaseAdmin().rpc('soe_circle_invitation_review', {
    p_actor: memberId, p_circle_id: circleId, p_target: targetMemberId,
  });
  if (error) return { ok: false, response: failure(error) };
  if (!membershipRecord(data) || !exactAdmissionKeys(data, ['memberId', 'circleId', 'circleRevision', 'invitationRevision', 'targetMemberId', 'targetLabel'])) {
    return { ok: false, response: unavailable() };
  }
  const parsed = parseCircleInvitationReview({ ...data,
    expiresAt: expiresAt ?? new Date(Date.now() + CIRCLE_INVITATION_LIFETIME_MS).toISOString() }, memberId, circleId, targetMemberId);
  return parsed ? { ok: true, value: parsed } : { ok: false, response: unavailable() };
}
export async function circleInvitationReview(req: NextRequest, circleId: string): Promise<Response> {
  try {
    const read = await input(req, circleId); if (!read.ok) return read.response;
    const body = parseCircleInvitationReviewInput(read.value);
    if (!body) return refuse('Use only the reviewed account and recipient member code.', 400);
    const current = await actor(req, body.expectedMemberId); if (!current.ok) return current.response;
    if (!budget(current.value)) return refuse('Too many invitation checks. Try again later.', 429);
    const result = await review(current.value, circleId, body.targetMemberId);
    if (!result.ok) return result.response;
    const fresh = await actor(req, body.expectedMemberId); if (!fresh.ok) return fresh.response;
    return privateJson(result.value);
  } catch { return unavailable(); }
}
export async function circleInvitationIssue(req: NextRequest, circleId: string): Promise<Response> {
  try {
    const read = await input(req, circleId); if (!read.ok) return read.response;
    const body = parseCircleInvitationIssueInput(read.value);
    if (!body) return refuse('Use a complete reviewed recipient, salon and expiry.', 400);
    const current = await actor(req, body.expectedMemberId); if (!current.ok) return current.response;
    if (!budget(current.value)) return refuse('Too many invitation requests. Try again later.', 429);
    const result = await review(current.value, circleId, body.targetMemberId, body.expiresAt);
    if (!result.ok) return result.response;
    const now = Date.now(), expires = Date.parse(body.expiresAt);
    if (result.value.circleRevision !== body.expectedRevision || result.value.invitationRevision !== body.expectedInvitationRevision
      || result.value.targetLabel !== body.expectedTargetLabel || expires <= now || expires > now + CIRCLE_INVITATION_LIFETIME_MS) {
      return refuse('The recipient, salon or expiry changed. Review the invitation again.', 409);
    }
    const fresh = await actor(req, body.expectedMemberId); if (!fresh.ok) return fresh.response;
    const invitationToken = signCircleInvitation({ circleId, memberId: body.targetMemberId, hostMemberId: fresh.value,
      invitationRevision: body.expectedInvitationRevision, nonce: body.requestId, issuedAt: new Date().toISOString(), expiresAt: body.expiresAt });
    return privateJson({ memberId: fresh.value, requestId: body.requestId, circleId, targetMemberId: body.targetMemberId,
      targetLabel: result.value.targetLabel, invitationRevision: body.expectedInvitationRevision, expiresAt: body.expiresAt, invitationToken });
  } catch { return unavailable(); }
}
export async function circleInvitedJoin(req: NextRequest, circleId: string): Promise<Response> {
  let sent = false;
  try {
    const read = await input(req, circleId); if (!read.ok) return read.response;
    const body = parseCircleInvitedJoinInput(read.value);
    if (!body) return refuse('Use the exact reviewed invitation and join request.', 400);
    const current = await actor(req, body.expectedMemberId); if (!current.ok) return current.response;
    const approval = verifyCircleInvitation(body.invitationToken, circleId, current.value);
    if (!approval) return refuse('This invitation is not signed for this account and salon.', 403);
    if (!budget(current.value)) return refuse('Too many invitation requests. Try again later.', 429);
    sent = true;
    const { data, error } = await getSupabaseAdmin().rpc('soe_circle_join_invited', {
      p_actor: current.value, p_circle_id: circleId, p_expected_revision: body.expectedRevision, p_request_id: body.requestId,
      p_host: approval.hostMemberId, p_invitation_revision: approval.invitationRevision, p_approval_nonce: approval.nonce,
      p_proof_hash: circleInvitationProofHash(body.invitationToken), p_expires_at: approval.expiresAt,
    });
    if (error) return failure(error, true);
    if (!membershipRecord(data) || !exactAdmissionKeys(data, ['requestId', 'circleId', 'receipt', 'state', 'replayed'])) return unavailable(true);
    const parsed = parseCircleInvitedJoinReceipt({ ...data, memberId: current.value }, body, circleId);
    if (!parsed) return unavailable(true);
    const fresh = await actor(req, body.expectedMemberId);
    if (!fresh.ok) return refuse('Your account changed while the join was being checked. The result needs an exact retry.', fresh.response.status, 'unknown');
    return privateJson(parsed);
  } catch { return unavailable(sent); }
}
export async function circleInvitationRevoke(req: NextRequest, circleId: string): Promise<Response> {
  let sent = false;
  try {
    const read = await input(req, circleId); if (!read.ok) return read.response;
    const body = parseCircleInvitationRevokeInput(read.value);
    if (!body) return refuse('Use the exact reviewed salon and invitation revisions.', 400);
    const current = await actor(req, body.expectedMemberId); if (!current.ok) return current.response;
    if (!budget(current.value)) return refuse('Too many invitation requests. Try again later.', 429);
    sent = true;
    const { data, error } = await getSupabaseAdmin().rpc('soe_circle_invitation_revoke', {
      p_actor: current.value, p_circle_id: circleId, p_expected_revision: body.expectedRevision,
      p_expected_invitation_revision: body.expectedInvitationRevision, p_request_id: body.requestId,
    });
    if (error) return failure(error, true);
    if (!membershipRecord(data) || !exactAdmissionKeys(data, ['requestId', 'circleId', 'receipt', 'state', 'replayed', 'invitationRevision'])
      || data.requestId !== body.requestId || data.circleId !== circleId || typeof data.replayed !== 'boolean'
      || !membershipInteger(data.invitationRevision) || data.invitationRevision <= body.expectedInvitationRevision
      || !membershipRecord(data.receipt) || !exactAdmissionKeys(data.receipt, ['action', 'invitationRevision'])
      || data.receipt.action !== 'revokeInvitations' || !membershipInteger(data.receipt.invitationRevision)
      || data.receipt.invitationRevision !== body.expectedInvitationRevision + 1 || data.receipt.invitationRevision > data.invitationRevision
      || !membershipRecord(data.state) || !exactAdmissionKeys(data.state, ['revision', 'isMember', 'isHost', 'hidden', 'completed', 'ended', 'canJoin', 'canLeave', 'canRsvp', 'canComplete', 'canReadConversation'])
      || !membershipInteger(data.state.revision) || data.state.revision <= body.expectedRevision || data.state.isHost !== true
      || Object.entries(data.state).some(([key, value]) => key !== 'revision' && typeof value !== 'boolean')
      || data.state.canJoin !== false || data.state.canLeave !== data.state.isMember
      || data.state.canReadConversation !== (data.state.isMember && !data.state.hidden)
      || data.state.canComplete !== !data.state.completed || (data.state.completed && !data.state.ended)
      || (data.state.canRsvp && (!data.state.isMember || data.state.hidden || data.state.ended))
      || (!data.replayed && data.state.revision !== body.expectedRevision + 1)) return unavailable(true);
    const fresh = await actor(req, body.expectedMemberId);
    if (!fresh.ok) return refuse('Your account changed while revocation was being checked. The result needs an exact retry.', fresh.response.status, 'unknown');
    return privateJson({ memberId: current.value, ...data });
  } catch { return unavailable(sent); }
}
