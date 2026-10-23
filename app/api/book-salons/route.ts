import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type BookCohortListRow = {
  book_cohort_members?: Array<{ id: string }> | null;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeKey(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const key = value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
  return key || fallback;
}

function safeMaxMembers(value: unknown): number {
  const maxMembers = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 8;
  return Math.max(2, Math.min(12, maxMembers));
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('book_cohorts')
    .select('id,book_id,title,description,max_members,start_date,thinker_id,status,created_at,book_cohort_members(id)')
    .order('created_at', { ascending: false });

  if (error) return privateJson({ cohorts: [], error: 'Failed to load book salons' }, { status: 500 });

  const cohorts = ((data || []) as BookCohortListRow[]).map((c) => ({
    ...c,
    member_count: c.book_cohort_members?.length || 0,
    book_cohort_members: undefined,
  }));

  return privateJson({ cohorts });
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);
  if (!isRecord(body)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const bookId = safeKey(body.bookId, '');
  const title = boundedText(body.title, 160);
  if (!bookId || !title) return privateJson({ error: 'Missing fields' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: cohort, error } = await supabaseAdmin.from('book_cohorts').insert({
      book_id: bookId,
      title,
      description: boundedText(body.description, 1_000),
      max_members: safeMaxMembers(body.maxMembers),
      start_date: boundedText(body.startDate, 40) || new Date().toISOString(),
      thinker_id: safeKey(body.thinkerId, 'socrates'),
      status: 'forming',
      created_by: auth.memberId,
    }).select().single();

    if (error) return privateJson({ error: 'Failed to create book salon' }, { status: 500 });

    // Auto-add creator as first member
    await supabaseAdmin.from('book_cohort_members').insert({
      cohort_id: cohort.id,
      member_id: auth.memberId,
    });

    return privateJson({ cohort });
  } catch (err) {
    console.error('Book salon creation failed:', err);
    return privateJson({ error: 'Failed to create book salon' }, { status: 500 });
  }
}
