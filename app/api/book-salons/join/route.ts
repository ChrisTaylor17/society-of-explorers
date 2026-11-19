import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { UUID_PATTERN as SHARED_UUID_PATTERN } from '@/lib/ids/uuid';
import { CIRCLE_BOOK_ID } from '@/lib/circles/path';
import { circleMutation } from '@/lib/circles/membership-server';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';

const UUID_RE = SHARED_UUID_PATTERN;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A private current-membership check, separate from public listing counts.
// A false result does not prove that an earlier in-flight join cannot commit.
export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams;
  const cohortId = query.get('cohortId')?.toLowerCase() ?? '';
  if (!UUID_RE.test(cohortId) || query.getAll('cohortId').length !== 1
    || [...query.keys()].some(key => key !== 'cohortId')) return privateJson({ error: 'Invalid salon' }, { status: 400 });
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Sign in to check membership' }, { status: 401 });
    const admin = getSupabaseAdmin();
    const cohort = await admin.from('book_cohorts').select('id,book_id').eq('id', cohortId).maybeSingle();
    if (cohort.error) return privateJson({ error: 'Membership unavailable' }, { status: 503 });
    if (!cohort.data) return privateJson({ error: 'Salon not found' }, { status: 404 });
    if (!isRecord(cohort.data) || cohort.data.id !== cohortId || typeof cohort.data.book_id !== 'string') return privateJson({ error: 'Membership unavailable' }, { status: 503 });
    if (cohort.data.book_id === CIRCLE_BOOK_ID) return privateJson({ error: 'Use the Circle membership flow' }, { status: 403 });
    const result = await admin.from('book_cohort_members').select('id,cohort_id,member_id')
      .eq('cohort_id', cohortId).eq('member_id', auth.memberId).maybeSingle();
    if (result.error || (result.data !== null && (!isRecord(result.data) || typeof result.data.id !== 'string'
      || !UUID_RE.test(result.data.id) || result.data.cohort_id !== cohortId || result.data.member_id !== auth.memberId))) {
      return privateJson({ error: 'Membership unavailable' }, { status: 503 });
    }
    return privateJson({ cohortId, memberId: auth.memberId.toLowerCase(), isMember: result.data !== null });
  } catch { return privateJson({ error: 'Membership unavailable' }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  const originError = circleWriteOrigin(req);
  if (originError) return originError;
  const read = await readCircleReviewJson(req);
  if (!read.ok) return read.response;
  const body = read.value;
  const cohortId = isRecord(body) && typeof body.cohortId === 'string' ? body.cohortId.toLowerCase() : '';
  if (!UUID_RE.test(cohortId)) return privateJson({ error: 'Missing fields' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    // Check cohort exists and has room
    const { data: cohort, error: lookupError } = await supabaseAdmin.from('book_cohorts').select('id, book_id, max_members, status').eq('id', cohortId).single();
    if (lookupError) return privateJson({ error: 'Cohort unavailable' }, { status: 503 });
    if (!cohort) return privateJson({ error: 'Cohort not found' }, { status: 404 });
    if (cohort.id !== cohortId || typeof cohort.book_id !== 'string') return privateJson({ error: 'Cohort unavailable' }, { status: 503 });
    // No unkeyed legacy Circle bypass remains. Ordinary salons keep their
    // existing joining behavior and do not require participation receipts.
    if (cohort.book_id === CIRCLE_BOOK_ID) return circleMutation(req, cohortId, 'join', body);
    // The service role no longer has raw membership INSERT permission after
    // admission cutover. The controlled legacy writer rechecks the cohort kind,
    // capacity and existing membership under one lock, and refuses every Circle.
    const { data, error } = await supabaseAdmin.rpc('soe_circle_legacy_salon_join', { p_actor: auth.memberId, p_cohort_id: cohortId });
    if (error) {
      const code = isRecord(error) ? error.code : null;
      return privateJson({ error: 'Book salon join unavailable' }, { status: code === 'PT404' ? 404 : code === 'PT403' ? 403 : code === 'PT409' ? 400 : 503 });
    }
    return isRecord(data) && Object.keys(data).length === 1 && data.joined === true
      ? privateJson({ joined: true }) : privateJson({ error: 'Book salon join unavailable' }, { status: 503 });
  } catch {
    return privateJson({ error: 'Failed to join book salon' }, { status: 500 });
  }
}
