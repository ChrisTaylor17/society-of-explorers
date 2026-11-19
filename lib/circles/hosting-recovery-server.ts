import 'server-only';
import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { privateJson } from '@/lib/http/routeError';
import { rateLimit } from '@/lib/rateLimit';
import { canonicalHostingId } from './hosting-recovery';
import { membershipRecord, parseCircleManagement } from './membership';

const refuse = (error: string, status: number) => privateJson({ error }, { status });
const unavailable = () => refuse('The earlier creation could not be verified. It may still complete. Check again with the same account.', 503);
async function actor(req: NextRequest, memberId: string): Promise<Response | null> {
  const current = await getAuthenticatedMember(req);
  if (!current || !canonicalHostingId(current.memberId)) return refuse('Sign in to check the earlier Circle creation.', 401);
  return current.memberId === memberId ? null : refuse('The account changed. Check the earlier creation with its original account.', 409);
}

/** Read only: a missing receipt never proves that an in-flight create failed. */
export async function circleCreationReceipt(req: NextRequest): Promise<Response> {
  const params = (req.nextUrl ?? new URL(req.url)).searchParams;
  const requestId = params.get('requestId'), memberId = req.headers.get('x-soe-expected-member');
  if (params.size !== 1 || !canonicalHostingId(requestId) || !canonicalHostingId(memberId)) return refuse('Use the exact creation reference and reviewed account.', 400);
  try {
    const denied = await actor(req, memberId); if (denied) return denied;
    if (!rateLimit(`circle-creation-receipt:${memberId}`, 120, 60 * 60 * 1000).ok) return refuse('Try checking again later.', 429);
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('circle_participation_receipts').select('actor_member_id,request_id,cohort_id,receipt')
      .eq('actor_member_id', memberId).eq('request_id', requestId).maybeSingle();
    if (error) return unavailable();
    let circleId: string | null = null;
    if (data !== null) {
      if (!membershipRecord(data) || data.actor_member_id !== memberId || data.request_id !== requestId || !canonicalHostingId(data.cohort_id)
        || !membershipRecord(data.receipt) || Object.keys(data.receipt).length !== 5 || data.receipt.action !== 'create'
        || data.receipt.joined !== true || data.receipt.completed !== false || data.receipt.date !== null || data.receipt.status !== null) return unavailable();
      const current = await db.rpc('soe_circle_membership_state', { p_actor: memberId, p_circle_id: data.cohort_id });
      const access = current.error ? null : parseCircleManagement(current.data, data.cohort_id);
      if (!access || !access.viewer.is_host) return unavailable();
      circleId = data.cohort_id;
    }
    const changed = await actor(req, memberId); if (changed) return changed;
    return privateJson({ memberId, requestId, circleId });
  } catch { return unavailable(); }
}
