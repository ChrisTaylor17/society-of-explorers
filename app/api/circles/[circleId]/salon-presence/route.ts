import type { NextRequest } from 'next/server';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { rateLimit } from '@/lib/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unavailable = () => privateJson({ error: 'Shared salon is unavailable.' }, { status: 503 });
const inaccessible = () => privateJson({ error: 'Shared salon is unavailable for this Circle or account.' }, { status: 404 });
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function browserOriginMatchesHost(req: NextRequest) {
  // Next can build nextUrl from the listener's internal host. A browser's
  // same-origin metadata and matching HTTP Host also establish the boundary.
  if (req.headers.get('sec-fetch-site') !== 'same-origin') return false;
  const suppliedOrigin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!suppliedOrigin || !host) return false;
  try {
    const origin = new URL(suppliedOrigin);
    return (origin.protocol === 'https:' || origin.protocol === 'http:') &&
      origin.origin === suppliedOrigin && origin.host === host.toLowerCase();
  } catch { return false; }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ circleId: string }> }) {
  if (process.env.SOE_SHARED_SALON_ENABLED !== 'true') return unavailable();
  const badOrigin = browserOriginMatchesHost(req) ? null : circleWriteOrigin(req);
  if (badOrigin) return badOrigin;
  const { circleId } = await params;
  if (!isUuid(circleId)) return inaccessible();
  if (!/^Bearer \S+$/i.test(req.headers.get('authorization') ?? '')) {
    return privateJson({ error: 'Check your signed-in member account.' }, { status: 401 });
  }

  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(7_000)]);
    const body = await readCircleReviewJson(req, signal);
    if (!body.ok) return body.response;
    const input = body.value;
    if (!record(input) || Object.keys(input).length !== 2 || !isUuid(input.leaseId)
        || (input.action !== 'reserve' && input.action !== 'sync' && input.action !== 'leave')) {
      return privateJson({ error: 'Use a valid salon check-in.' }, { status: 400 });
    }
    const actor = await getAuthenticatedMember(req);
    if (!actor) return privateJson({ error: 'Check your signed-in member account.' }, { status: 401 });
    if (signal.aborted) return unavailable();
    const limit = rateLimit('circle-salon:' + actor.memberId, 30, 60_000);
    if (!limit.ok) return privateJson({ error: 'Wait before checking in again.' }, {
      status: 429, headers: { 'retry-after': String(limit.retryAfterS) },
    });

    const { data, error } = await getSupabaseAdmin().rpc('soe_circle_salon_presence', {
      p_actor: actor.memberId, p_circle_id: circleId, p_lease_id: input.leaseId, p_action: input.action,
    }).abortSignal(signal);
    if (signal.aborted) return unavailable();
    if (error?.code === 'PT404') return inaccessible();
    if (error?.code === 'PT409') return privateJson({ error: 'This account already has a salon seat.' }, { status: 409 });
    if (error?.code === 'PT410') return privateJson({ error: 'This salon seat expired.' }, { status: 410 });
    if (error || !record(data)) return unavailable();

    if (input.action === 'sync' && data.state === 'present' && typeof data.count === 'number'
        && Number.isSafeInteger(data.count) && data.count >= 1) {
      return privateJson({ state: 'present', count: data.count });
    }
    const state = input.action === 'reserve' ? 'reserved' : input.action === 'leave' ? 'left' : null;
    return state && data.state === state ? privateJson({ state }) : unavailable();
  } catch {
    return unavailable();
  }
}
