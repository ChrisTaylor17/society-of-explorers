import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rateLimit';
import { formatPassageMessage } from '@/lib/books/passages';
import { PassageSourceError, resolvePassage } from '@/lib/books/passage-source';
import { circleWriteOrigin, readCircleReviewJson } from './moderation-server';
import {
  parsePassageAccess,
  parsePassagePreview,
  parsePassageReceipt,
  validatePassagePostInput,
  validatePassagePreviewInput,
  type PassagePreview,
  type PassagePreviewInput,
} from './passage';

type Actor = NonNullable<Awaited<ReturnType<typeof getAuthenticatedMember>>>;
type RpcName = 'soe_circle_passage_access' | 'soe_circle_passage_receipt' | 'soe_circle_passage_post';
type Args = Record<string, unknown>;
type Result = { data: unknown; error: unknown };
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const sha = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

function refused(message: string, status: number, headers?: HeadersInit): Response {
  return privateJson({ error: message, outcome: 'not_attempted' }, { status, headers });
}
async function notAttempted(response: Response): Promise<Response> {
  let message = 'The request could not be accepted.';
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') message = body.error;
  } catch { /* The response status remains authoritative. */ }
  return refused(message, response.status);
}
export function passageUnavailable(unknown = false): Response {
  return privateJson({ error: unknown ? 'The reply could not be verified. Check this request before deciding what to do next.' : 'Passage posting is unavailable. Read current access before trying again.',
    outcome: unknown ? 'unknown' : 'not_attempted' }, { status: 503 });
}
function codeOf(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : null;
}
function rpcFailure(error: unknown, writing = false): Response {
  switch (codeOf(error)) {
    case 'PT400': return refused('Use a valid passage request.', 400);
    case 'PT403': return refused('Current Circle membership is required.', 403);
    case 'PT404': return refused('Circle unavailable.', 404);
    case 'PT409': return refused('This request changed. Review the exact passage and comment again.', 409);
    // A rejected function or permission lookup has not entered the transaction.
    case '42883': case '42501': case 'PGRST202': case 'PGRST203': return passageUnavailable();
    default: return passageUnavailable(writing);
  }
}
async function rpc(name: RpcName, args: Args): Promise<Result> {
  return getSupabaseAdmin().rpc(name, args);
}
async function authenticate(req: NextRequest): Promise<Actor | Response> {
  const actor = await getAuthenticatedMember(req);
  return actor && isUuid(actor.memberId) ? actor : refused('Sign in to use Circle passage controls.', 401);
}
async function access(actor: Actor, circleId: string): Promise<Response | null> {
  const result = await rpc('soe_circle_passage_access', { p_actor: actor.memberId, p_circle_id: circleId });
  if (result.error) return rpcFailure(result.error);
  const value = parsePassageAccess(result.data);
  return value && same(value.circleId, circleId) ? null : passageUnavailable();
}
function budget(actor: Actor, operation: 'preview' | 'post'): Response | null {
  const limit = rateLimit(`circle-passage-${operation}:${actor.memberId}`, operation === 'preview' ? 60 : 12, operation === 'preview' ? 10 * 60_000 : 60_000);
  return limit.ok ? null : refused('Passage requests are temporarily limited. Try again later.', 429, { 'Retry-After': String(limit.retryAfterS) });
}
function validCircle(circleId: string): Response | null {
  return isUuid(circleId) ? null : refused('Use a valid Circle id.', 400);
}
function memberDisplayName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('@') || /[\u0000-\u001f\u007f]/.test(value)
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return 'Explorer';
  let result = '';
  for (const character of value.trim()) {
    if (result.length + character.length > 200) break;
    result += character;
  }
  return result || 'Explorer';
}
function sourceFailure(error: unknown): Response {
  if (error instanceof PassageSourceError) {
    if (error.status === 400) return refused('This quotation cannot be verified. Choose a supported excerpt or source-block link.', 400);
    if (error.status === 409) return refused('The source edition changed. Choose and review its exact edition again.', 409);
  }
  return passageUnavailable();
}

/** A consistency binding, never a substitute for canonical authentication or SQL authorization. */
async function preview(actor: Actor, circleId: string, input: PassagePreviewInput): Promise<PassagePreview | Response> {
  try {
    const source = await resolvePassage(input.reference);
    const content = formatPassageMessage(input.comment, source);
    if (!content) return refused('Shorten the comment so the complete source credits and link fit in one post.', 400);
    const contentHash = sha(content);
    const reviewKey = sha(JSON.stringify({ version: 1, actor: actor.memberId.toLowerCase(), circleId: circleId.toLowerCase(), requestId: input.requestId,
      contentHash, reference: input.reference }));
    const value = parsePassagePreview({ ...input, circleId, content, contentHash, reviewKey, source });
    return value ?? passageUnavailable();
  } catch (error) { return sourceFailure(error); }
}

export async function getCirclePassage(req: NextRequest, circleId: string): Promise<Response> {
  try {
    const invalid = validCircle(circleId);
    if (invalid) return notAttempted(invalid);
    const params = (req.nextUrl ?? new URL(req.url)).searchParams;
    const keys = [...params.keys()];
    const requestId = params.get('requestId');
    if (keys.some(key => key !== 'requestId') || params.getAll('requestId').length > 1 || (requestId !== null && !isUuid(requestId))) return refused('Use a valid passage receipt request.', 400);
    const actor = await authenticate(req);
    if (actor instanceof Response) return actor;
    if (requestId === null) {
      const denied = await access(actor, circleId);
      return denied ?? privateJson({ circleId: circleId.toLowerCase() });
    }
    const result = await rpc('soe_circle_passage_receipt', { p_actor: actor.memberId, p_circle_id: circleId, p_request_id: requestId });
    if (result.error) return rpcFailure(result.error);
    const receipt = result.data === null ? null : parsePassageReceipt(result.data);
    if (result.data !== null && (!receipt || !same(receipt.circleId, circleId) || !same(receipt.requestId, requestId) || !receipt.replayed)) return passageUnavailable();
    return privateJson({ circleId: circleId.toLowerCase(), requestId: requestId.toLowerCase(), receipt });
  } catch { return passageUnavailable(); }
}

export async function previewCirclePassage(req: NextRequest, circleId: string): Promise<Response> {
  try {
    const invalid = circleWriteOrigin(req) ?? validCircle(circleId);
    if (invalid) return notAttempted(invalid);
    const body = await readCircleReviewJson(req);
    if (!body.ok) return notAttempted(body.response);
    const parsed = validatePassagePreviewInput(body.value);
    if (!parsed.ok) return refused(parsed.error, 400);
    const actor = await authenticate(req);
    if (actor instanceof Response) return actor;
    const denied = budget(actor, 'preview') ?? await access(actor, circleId);
    if (denied) return denied;
    const value = await preview(actor, circleId, parsed.value);
    return value instanceof Response ? value : privateJson(value);
  } catch { return passageUnavailable(); }
}

export async function postCirclePassage(req: NextRequest, circleId: string): Promise<Response> {
  let dispatched = false;
  try {
    const invalid = circleWriteOrigin(req) ?? validCircle(circleId);
    if (invalid) return notAttempted(invalid);
    const body = await readCircleReviewJson(req);
    if (!body.ok) return notAttempted(body.response);
    const parsed = validatePassagePostInput(body.value);
    if (!parsed.ok) return refused(parsed.error, 400);
    const input = parsed.value;
    const actor = await authenticate(req);
    if (actor instanceof Response) return actor;
    const denied = budget(actor, 'post') ?? await access(actor, circleId);
    if (denied) return denied;
    const value = await preview(actor, circleId, input);
    if (value instanceof Response) return value;
    if (value.contentHash !== input.contentHash || value.reviewKey !== input.reviewKey) return refused('The passage review changed. Review it again before posting.', 409);
    const current = await authenticate(req);
    if (current instanceof Response) return current;
    if (!same(current.memberId, actor.memberId)) return refused('Your signed-in account changed. Review with the current account.', 409);
    const memberName = memberDisplayName(current.member.display_name);
    dispatched = true;
    const result = await rpc('soe_circle_passage_post', { p_actor: current.memberId, p_circle_id: circleId, p_request_id: input.requestId,
      p_content: value.content, p_reference: input.reference, p_member_name: memberName });
    if (result.error) return rpcFailure(result.error, true);
    const receipt = parsePassageReceipt(result.data);
    if (!receipt || !same(receipt.circleId, circleId) || !same(receipt.requestId, input.requestId)
      || (receipt.message.visibility === 'visible' && receipt.message.content !== value.content)) return passageUnavailable(true);
    return privateJson(receipt);
  } catch { return passageUnavailable(dispatched); }
}
