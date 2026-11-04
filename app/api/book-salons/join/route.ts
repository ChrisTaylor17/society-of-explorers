import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { UUID_PATTERN as SHARED_UUID_PATTERN } from '@/lib/ids/uuid';
import { CIRCLE_BOOK_ID } from '@/lib/circles/path';
import { circleMutation } from '@/lib/circles/membership-server';
import { readCircleReviewJson } from '@/lib/circles/moderation-server';

const UUID_RE = SHARED_UUID_PATTERN;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest) {
  return readCircleReviewJson(req);
}

export async function POST(req: NextRequest) {
  const read = await safeRequestJson(req);
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
    if (cohort.status === 'completed') return privateJson({ error: 'Cohort is completed' }, { status: 400 });

    const { count } = await supabaseAdmin.from('book_cohort_members').select('id', { count: 'exact', head: true }).eq('cohort_id', cohortId);
    if ((count || 0) >= cohort.max_members) return privateJson({ error: 'Cohort is full' }, { status: 400 });

    // Check not already a member
    const { data: existing } = await supabaseAdmin.from('book_cohort_members').select('id').eq('cohort_id', cohortId).eq('member_id', auth.memberId).single();
    if (existing) return privateJson({ error: 'Already a member' }, { status: 400 });

    const { error } = await supabaseAdmin.from('book_cohort_members').insert({ cohort_id: cohortId, member_id: auth.memberId });
    if (error) return privateJson({ error: 'Failed to join book salon' }, { status: 500 });

    return privateJson({ joined: true });
  } catch {
    return privateJson({ error: 'Failed to join book salon' }, { status: 500 });
  }
}
