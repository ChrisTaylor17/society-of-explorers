import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rateLimit';
import { MESSAGE_SAFETY_LIMIT } from './message-moderation';

export type MessageSafetyRpcName = 'soe_circle_message_state' | 'soe_circle_message_action' | 'soe_circle_message_contributions'
  | 'soe_circle_message_review_queue' | 'soe_circle_message_review_detail' | 'soe_circle_message_review_decide' | 'soe_circle_message_ai_consent_state' | 'soe_circle_message_ai_consent_set';
type Result<T> = { ok: true; value: T } | { ok: false; response: Response };
type Args = Record<string, string | number | boolean | null>;
export function messageSafetyUnavailable(): Response {
  return privateJson({ error: 'Post safety is unavailable. Refresh before trying again.' }, { status: 503 });
}
function failure(error: unknown): Response {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  switch (code) {
    case 'PT400': return privateJson({ error: 'Use a valid post safety request.' }, { status: 400 });
    case 'PT403': return privateJson({ error: 'This post safety action is not available to you.' }, { status: 403 });
    case 'PT404': return privateJson({ error: 'Post unavailable.' }, { status: 404 });
    case 'PT409': return privateJson({ error: 'The post or request changed. Read its current state before deciding.' }, { status: 409 });
    default: return messageSafetyUnavailable();
  }
}
/** Every call binds only canonical server identity. Missing schema/grants fail closed. */
export async function messageSafetyRpc<T>(req: NextRequest, name: MessageSafetyRpcName, args: Args,
  parse: (value: unknown) => T | null, options: { report?: boolean } = {}): Promise<Result<T>> {
  try {
    const actor = await getAuthenticatedMember(req);
    if (!actor || !isUuid(actor.memberId)) return { ok: false, response: privateJson({ error: 'Sign in to use post safety controls.' }, { status: 401 }) };
    if (options.report) {
      const budget = rateLimit(`circle-message-report:${actor.memberId}`, 10, 60 * 60 * 1000);
      if (!budget.ok) return { ok: false, response: privateJson({ error: 'Reporting is temporarily limited. Try again later.' }, { status: 429, headers: { 'Retry-After': String(budget.retryAfterS) } }) };
    }
    const { data, error } = await getSupabaseAdmin().rpc(name, { ...args, p_actor: actor.memberId });
    if (error) return { ok: false, response: failure(error) };
    const value = parse(data);
    return value === null ? { ok: false, response: messageSafetyUnavailable() } : { ok: true, value };
  } catch { return { ok: false, response: messageSafetyUnavailable() }; }
}
export function messageSafetyPagination(req: NextRequest): Result<{ after: string | null; limit: number }> {
  const params = (req.nextUrl ?? new URL(req.url)).searchParams;
  const after = params.get('after');
  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? MESSAGE_SAFETY_LIMIT : Number(rawLimit);
  if (params.getAll('after').length > 1 || params.getAll('limit').length > 1 || (after !== null && !isUuid(after))
    || (rawLimit !== null && !/^\d+$/.test(rawLimit)) || !Number.isSafeInteger(limit) || limit < 1 || limit > MESSAGE_SAFETY_LIMIT) {
    return { ok: false, response: privateJson({ error: 'Use a valid post safety page.' }, { status: 400 }) };
  }
  return { ok: true, value: { after, limit } };
}
export const sameMessageId = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
