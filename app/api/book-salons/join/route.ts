import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);
  const cohortId = isRecord(body) && typeof body.cohortId === 'string' ? body.cohortId : '';
  if (!UUID_RE.test(cohortId)) return privateJson({ error: 'Missing fields' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    // Check cohort exists and has room
    const { data: cohort } = await supabaseAdmin.from('book_cohorts').select('id, max_members, status').eq('id', cohortId).single();
    if (!cohort) return privateJson({ error: 'Cohort not found' }, { status: 404 });
    if (cohort.status === 'completed') return privateJson({ error: 'Cohort is completed' }, { status: 400 });

    const { count } = await supabaseAdmin.from('book_cohort_members').select('id', { count: 'exact', head: true }).eq('cohort_id', cohortId);
    if ((count || 0) >= cohort.max_members) return privateJson({ error: 'Cohort is full' }, { status: 400 });

    // Check not already a member
    const { data: existing } = await supabaseAdmin.from('book_cohort_members').select('id').eq('cohort_id', cohortId).eq('member_id', auth.memberId).single();
    if (existing) return privateJson({ error: 'Already a member' }, { status: 400 });

    const { error } = await supabaseAdmin.from('book_cohort_members').insert({ cohort_id: cohortId, member_id: auth.memberId });
    if (error) return privateJson({ error: 'Failed to join book salon' }, { status: 500 });

    return privateJson({ joined: true });
  } catch (err) {
    console.error('Book salon join failed:', err);
    return privateJson({ error: 'Failed to join book salon' }, { status: 500 });
  }
}
