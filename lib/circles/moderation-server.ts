import { NextRequest } from 'next/server';
import { requestOrigin } from '@/lib/auth/request';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { hashKey } from './server';
import { CIRCLE_REVIEW_BODY_MAX_BYTES, CIRCLE_REVIEW_LIMIT } from './moderation';
import type { ReportReason } from './report';

type Result<T> = { ok: true; value: T } | { ok: false; response: Response };
type RpcName = 'soe_circle_review_queue' | 'soe_circle_review_detail' | 'soe_circle_review_decide' | 'soe_circle_host_review' | 'soe_circle_host_reviews';
type RpcArgs = Record<string, string | number | boolean | null>;

function unavailable(): Response { return privateJson({ error: 'Circle review is unavailable. Try again later.' }, { status: 503 }); }

function rpcFailure(error: unknown): Response {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  switch (code) {
    case 'PT400': return privateJson({ error: 'The request could not be accepted.' }, { status: 400 });
    case 'PT403': return privateJson({ error: 'This circle review is not available to you.' }, { status: 403 });
    case 'PT404': return privateJson({ error: 'Circle review not found.' }, { status: 404 });
    case 'PT409': return privateJson({ error: 'This review changed. Refresh before deciding.' }, { status: 409 });
    default: return unavailable();
  }
}

async function rpc<T>(name: string, args: RpcArgs, parse: (value: unknown) => T | null): Promise<Result<T>> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc(name, args);
    if (error) return { ok: false, response: rpcFailure(error) };
    const value = parse(data);
    return value === null ? { ok: false, response: unavailable() } : { ok: true, value };
  } catch { return { ok: false, response: unavailable() }; }
}

/** Only authenticated server identity reaches the service-only authorization RPC. */
export async function circleReviewRpc<T>(req: NextRequest, name: RpcName, args: RpcArgs, parse: (value: unknown) => T | null): Promise<Result<T>> {
  try {
    const actor = await getAuthenticatedMember(req);
    if (!actor || !isUuid(actor.memberId)) return { ok: false, response: privateJson({ error: 'Sign in to view this circle review.' }, { status: 401 }) };
    // Database functions check the narrow active grant and conflicts on each
    // call. Never trust request body actors, client roles or local admin paths.
    return await rpc(name, { ...args, p_actor: actor.memberId }, parse);
  } catch { return { ok: false, response: unavailable() }; }
}

/** Block browser-origin forgery before reading or applying a mutation. */
export function circleWriteOrigin(req: NextRequest, anonymous = false): Response | null {
  try {
    const ownOrigin = requestOrigin(req.nextUrl ?? new URL(req.url), req.headers);
    const origin = req.headers.get('origin');
    const site = req.headers.get('sec-fetch-site')?.toLowerCase();
    if ((origin !== null && origin !== ownOrigin) || (site && site !== 'same-origin' && site !== 'none')) {
      return privateJson({ error: 'Use this site to submit the request.' }, { status: 403 });
    }
    if (origin === ownOrigin || site === 'same-origin') return null;
    const hasCookies = Boolean(req.headers.get('cookie'));
    const bearerOnly = !hasCookies && /^Bearer \S+$/i.test(req.headers.get('authorization') || '');
    if (bearerOnly || (anonymous && !hasCookies && !req.headers.get('authorization'))) return null;
  } catch { /* An invalid origin is refused with the same generic response. */ }
  return privateJson({ error: 'Use this site to submit the request.' }, { status: 403 });
}

/** Bound bytes while reading, rather than parsing an unbounded JSON body first. */
export async function readCircleReviewJson(req: NextRequest, signal?: AbortSignal): Promise<Result<unknown>> {
  const tooLarge = () => ({ ok: false as const, response: privateJson({ error: 'Use a smaller request.' }, { status: 413 }) });
  const declared = req.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > CIRCLE_REVIEW_BODY_MAX_BYTES) return tooLarge();
  try {
    let text: string;
    if (req.body) {
      const reader = req.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => {}); };
      signal?.addEventListener('abort', cancel, { once: true });
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let bytes = 0;
      text = '';
      try {
        if (signal?.aborted) { cancel(); throw new Error('Request retired'); }
        while (true) {
          const chunk = await reader.read();
          if (signal?.aborted) throw new Error('Request retired');
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > CIRCLE_REVIEW_BODY_MAX_BYTES) { void reader.cancel().catch(() => {}); return tooLarge(); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
    } else {
      // Also supports the existing offline request double, which supplies text.
      text = await req.text();
      if (new TextEncoder().encode(text).byteLength > CIRCLE_REVIEW_BODY_MAX_BYTES) return tooLarge();
    }
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch { return { ok: false, response: privateJson({ error: 'Use a valid JSON request.' }, { status: 400 }) }; }
}

export function circleReviewPagination(req: NextRequest): Result<{ after: string | null; limit: number }> {
  const params = (req.nextUrl ?? new URL(req.url)).searchParams;
  const after = params.get('after');
  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? CIRCLE_REVIEW_LIMIT : Number(rawLimit);
  if ((after !== null && !isUuid(after)) || (rawLimit !== null && !/^\d+$/.test(rawLimit))
    || !Number.isInteger(limit) || limit < 1 || limit > CIRCLE_REVIEW_LIMIT) {
    return { ok: false, response: privateJson({ error: 'Use a valid review page.' }, { status: 400 }) };
  }
  return { ok: true, value: { after, limit } };
}

/** Public reporting stays anonymous-capable; identity and budget stay server-bound. */
export async function circleReportRpc(req: NextRequest, input: { circleId: string; requestId: string; reason: ReportReason; note: string | null }): Promise<Response> {
  try {
    const actor = await getAuthenticatedMember(req);
    if (actor && !isUuid(actor.memberId)) return unavailable();
    const reporterKey = actor ? null : hashKey(clientIp(req));
    const limit = rateLimit(`circles:report:${actor?.memberId || reporterKey}`, 5, 60 * 60 * 1000);
    if (!limit.ok) return privateJson({ error: 'Too many reports, try again later' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterS) } });
    const result = await rpc('soe_circle_report', {
      p_actor: actor?.memberId ?? null, p_reporter_key: reporterKey, p_circle_id: input.circleId,
      p_request_id: input.requestId, p_reason: input.reason, p_note: input.note,
    }, (value) => value && typeof value === 'object' && 'received' in value && value.received === true ? { received: true as const } : null);
    return result.ok ? privateJson(result.value) : result.response;
  } catch { return unavailable(); }
}
