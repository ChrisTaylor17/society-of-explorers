import { hasPublicProfileReference } from '@/lib/members/public-reference';
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rateLimit';
import { circleWriteOrigin, readCircleReviewJson } from './moderation-server';
import {
  discussionCommentLimit,
  formatDiscussionContent,
  parseDiscussionPage,
  parseDiscussionPreview,
  parseDiscussionQuery,
  parseDiscussionReceipt,
  parseDiscussionTarget,
  validateDiscussionPostInput,
  validateDiscussionPreviewInput,
  type DiscussionPostInput,
} from './thread';

type Actor = NonNullable<Awaited<ReturnType<typeof getAuthenticatedMember>>>;
type RpcName = 'soe_circle_discussion_read_profiles' | 'soe_circle_discussion_thread_profiles' | 'soe_circle_discussion_target'
  | 'soe_circle_discussion_receipt_profiles' | 'soe_circle_discussion_post';
type RpcResult = { data: unknown; error: unknown };
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const sha = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

function refused(error: string, status: number, headers?: HeadersInit): Response {
  return privateJson({ error, outcome: 'not_attempted' }, { status, headers });
}
async function notAttempted(response: Response): Promise<Response> {
  let error = 'The request could not be accepted.';
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') error = body.error;
  } catch { /* Preserve the safe status when no JSON body is available. */ }
  return refused(error, response.status);
}
export function discussionUnavailable(unknown = false): Response {
  return privateJson({ error: unknown ? 'The posting reply could not be verified. Check this request before deciding what to do next.'
    : 'The discussion is unavailable. Check current access before trying again.', outcome: unknown ? 'unknown' : 'not_attempted' }, { status: 503 });
}
function rpcFailure(error: unknown, writing = false): Response {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  switch (code) {
    case 'PT400': return refused('Use a valid discussion request.', 400);
    case 'PT403': return refused('Current Circle membership is required.', 403);
    case 'PT404': return refused('Circle or message unavailable.', 404);
    case 'PT409': return refused('This request or reply target changed. Review current context before a new operation.', 409);
    case '42883': case '42501': case 'PGRST202': case 'PGRST203': return discussionUnavailable();
    default: return discussionUnavailable(writing);
  }
}
async function rpc(name: RpcName, args: Record<string, unknown>): Promise<RpcResult> {
  return getSupabaseAdmin().rpc(name, args);
}
async function authenticate(req: NextRequest): Promise<Actor | Response> {
  const actor = await getAuthenticatedMember(req);
  return actor && isUuid(actor.memberId) ? actor : refused('Sign in to read or post in this Circle discussion.', 401);
}
function invalidCircle(circleId: string): Response | null {
  return isUuid(circleId) ? null : refused('Use a valid Circle id.', 400);
}
function budget(actor: Actor, operation: 'preview' | 'post'): Response | null {
  const result = rateLimit(`circle-discussion-${operation}:${actor.memberId}`, operation === 'preview' ? 60 : 12,
    operation === 'preview' ? 10 * 60_000 : 60_000);
  return result.ok ? null : refused('Discussion requests are temporarily limited. Try again later.', 429, { 'Retry-After': String(result.retryAfterS) });
}
function memberDisplayName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('@') || /[\u0000-\u001f\u007f]/u.test(value)
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return 'Explorer';
  let name = '';
  for (const character of value.trim()) {
    if (name.length + character.length > 200) break;
    name += character;
  }
  return name || 'Explorer';
}
/** This digest detects changed review context. Authentication and SQL remain
 * authoritative; the digest does not prove a human click or grant any access. */
function reviewKey(actor: Actor, circleId: string, input: Pick<DiscussionPostInput,
  'requestId' | 'contentHash' | 'parentMessageId' | 'expectedParentRevision' | 'expectedParentHash'>): string {
  return sha(JSON.stringify({ version: 1, actor: actor.memberId.toLowerCase(), circleId: circleId.toLowerCase(), requestId: input.requestId,
    contentHash: input.contentHash, parentMessageId: input.parentMessageId,
    expectedParentRevision: input.expectedParentRevision, expectedParentHash: input.expectedParentHash }));
}

export async function getCircleDiscussion(req: NextRequest, circleId: string): Promise<Response> {
  try {
    const invalid = invalidCircle(circleId);
    if (invalid) return invalid;
    const query = parseDiscussionQuery((req.nextUrl ?? new URL(req.url)).searchParams);
    if (!query) return refused('Use a valid discussion page or receipt query.', 400);
    const actor = await authenticate(req);
    if (actor instanceof Response) return actor;
    if (query.kind === 'receipt') {
      const result = await rpc('soe_circle_discussion_receipt_profiles', { p_actor: actor.memberId, p_circle_id: circleId, p_request_id: query.requestId });
      if (result.error) return rpcFailure(result.error);
      if (result.data !== null && (!result.data || typeof result.data !== 'object' || !('message' in result.data) || !hasPublicProfileReference(result.data.message))) return discussionUnavailable();
      const receipt = result.data === null ? null : parseDiscussionReceipt(result.data);
      if (result.data !== null && (!receipt || !same(receipt.circleId, circleId) || receipt.requestId !== query.requestId || !receipt.replayed)) return discussionUnavailable();
      return privateJson({ circleId: circleId.toLowerCase(), requestId: query.requestId, receipt });
    }
    const result = query.kind === 'archive'
      ? await rpc('soe_circle_discussion_read_profiles', { p_actor: actor.memberId, p_circle_id: circleId, p_before: query.before, p_limit: query.limit })
      : await rpc('soe_circle_discussion_thread_profiles', { p_actor: actor.memberId, p_circle_id: circleId,
        p_message_id: query.messageId, p_after: query.after, p_limit: query.limit });
    if (result.error) return rpcFailure(result.error);
    if (!result.data || typeof result.data !== 'object' || !('items' in result.data) || !Array.isArray(result.data.items) || !result.data.items.every(hasPublicProfileReference) ||
      (query.kind === 'thread' && (!('root' in result.data) || !hasPublicProfileReference(result.data.root) || !('focus' in result.data) || !hasPublicProfileReference(result.data.focus)))) return discussionUnavailable();
    const page = parseDiscussionPage(result.data, { ...query, circleId });
    return page ? privateJson(page) : discussionUnavailable();
  } catch { return discussionUnavailable(); }
}

export async function previewCircleDiscussion(req: NextRequest, circleId: string): Promise<Response> {
  try {
    const invalid = circleWriteOrigin(req) ?? invalidCircle(circleId);
    if (invalid) return notAttempted(invalid);
    const body = await readCircleReviewJson(req);
    if (!body.ok) return notAttempted(body.response);
    const parsed = validateDiscussionPreviewInput(body.value);
    if (!parsed.ok) return refused(parsed.error, 400);
    const actor = await authenticate(req);
    if (actor instanceof Response) return actor;
    const denied = budget(actor, 'preview');
    if (denied) return denied;
    const input = parsed.value;
    const result = await rpc('soe_circle_discussion_target', { p_actor: actor.memberId, p_circle_id: circleId, p_parent_message_id: input.parentMessageId });
    if (result.error) return rpcFailure(result.error);
    const current = parseDiscussionTarget(result.data);
    if (!current || !same(current.circleId, circleId) || (current.target?.message.id ?? null) !== input.parentMessageId) return discussionUnavailable();
    const content = formatDiscussionContent(circleId, input.comment, input.parentMessageId);
    if (!content) return refused('Shorten the comment so the complete reply link fits in one post.', 400);
    const contentHash = sha(content);
    const binding = { ...input, contentHash, expectedParentRevision: current.target?.revision ?? null,
      expectedParentHash: current.target?.contentHash ?? null };
    const value = parseDiscussionPreview({ ...input, circleId, content, contentHash, reviewKey: reviewKey(actor, circleId, binding),
      parent: current.target, commentLimit: discussionCommentLimit(circleId, input.parentMessageId) });
    return value ? privateJson(value) : discussionUnavailable();
  } catch { return discussionUnavailable(); }
}

export async function postCircleDiscussion(req: NextRequest, circleId: string): Promise<Response> {
  let dispatched = false;
  try {
    const invalid = circleWriteOrigin(req) ?? invalidCircle(circleId);
    if (invalid) return notAttempted(invalid);
    const body = await readCircleReviewJson(req);
    if (!body.ok) return notAttempted(body.response);
    const parsed = validateDiscussionPostInput(body.value);
    if (!parsed.ok) return refused(parsed.error, 400);
    const actor = await authenticate(req);
    if (actor instanceof Response) return actor;
    const denied = budget(actor, 'post');
    if (denied) return denied;
    const input = parsed.value;
    const content = formatDiscussionContent(circleId, input.comment, input.parentMessageId);
    if (!content) return refused('Shorten the comment so the complete reply link fits in one post.', 400);
    if (sha(content) !== input.contentHash || reviewKey(actor, circleId, input) !== input.reviewKey) return refused('The reviewed message changed. Review it again before a new operation.', 409);
    const current = await authenticate(req);
    if (current instanceof Response) return current;
    if (!same(current.memberId, actor.memberId)) return refused('Your signed-in account changed. Review with the current account.', 409);
    // Do not fetch the parent here. SQL checks current Circle access, then exact
    // receipts before parent freshness: a known save can be recovered after the
    // parent is withheld, without authorizing another post or returning its text.
    dispatched = true;
    const result = await rpc('soe_circle_discussion_post', { p_actor: current.memberId, p_circle_id: circleId, p_request_id: input.requestId,
      p_content: content, p_parent_message_id: input.parentMessageId, p_expected_parent_revision: input.expectedParentRevision,
      p_expected_parent_hash: input.expectedParentHash, p_member_name: memberDisplayName(current.member.display_name) });
    if (result.error) return rpcFailure(result.error, true);
    const receipt = parseDiscussionReceipt(result.data);
    if (!receipt || !same(receipt.circleId, circleId) || receipt.requestId !== input.requestId
      || receipt.message.parentMessageId !== input.parentMessageId || (receipt.message.visibility === 'visible' && receipt.message.content !== content)) return discussionUnavailable(true);
    return privateJson(receipt);
  } catch { return discussionUnavailable(dispatched); }
}
