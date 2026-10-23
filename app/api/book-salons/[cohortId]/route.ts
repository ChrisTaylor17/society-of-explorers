import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { UUID_PATTERN as SHARED_UUID_PATTERN } from '@/lib/ids/uuid';

const UUID_RE = SHARED_UUID_PATTERN;

type SeminarMessageRow = {
  id: string;
  member_id: string | null;
  member_name: string | null;
  content: string;
  created_at: string;
};

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  const { cohortId } = await params;
  if (!UUID_RE.test(cohortId)) return privateJson({ error: 'Invalid cohort id' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  const supabaseAdmin = getSupabaseAdmin();

  const [cohortRes, membersRes, messagesRes] = await Promise.all([
    supabaseAdmin
      .from('book_cohorts')
      .select('id,book_id,title,description,max_members,start_date,thinker_id,status,created_at')
      .eq('id', cohortId)
      .single(),
    supabaseAdmin.from('book_cohort_members').select('id, members(display_name)').eq('cohort_id', cohortId),
    supabaseAdmin
      .from('seminar_messages')
      .select('id,member_id,member_name,content,created_at')
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: true })
      .limit(100),
  ]);

  if (!cohortRes.data) return privateJson({ error: 'Not found' }, { status: 404 });

  const messages = ((messagesRes.data || []) as SeminarMessageRow[]).map((message) => ({
    id: message.id,
    member_name: message.member_name || 'Explorer',
    content: message.content,
    created_at: message.created_at,
    is_mine: Boolean(auth?.memberId && message.member_id === auth.memberId),
  }));

  return privateJson({
    cohort: cohortRes.data,
    members: membersRes.data || [],
    messages,
  });
}

// Post a message to the cohort discussion
export async function POST(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  const { cohortId } = await params;
  if (!UUID_RE.test(cohortId)) return privateJson({ error: 'Invalid cohort id' }, { status: 400 });

  const parsed = await safeRequestJson(req);
  const content = isRecord(parsed) ? boundedText(parsed.content, 2_000) : null;
  if (!content) return privateJson({ error: 'Empty message' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: membership } = await supabaseAdmin
    .from('book_cohort_members')
    .select('id')
    .eq('cohort_id', cohortId)
    .eq('member_id', auth.memberId)
    .single();

  if (!membership) return privateJson({ error: 'Join this book salon before posting' }, { status: 403 });

  const { data, error } = await supabaseAdmin.from('seminar_messages').insert({
    cohort_id: cohortId,
    member_id: auth.memberId,
    member_name: auth.member.display_name || 'Explorer',
    content,
  }).select().single();

  if (error) return privateJson({ error: 'Failed to save book salon message' }, { status: 500 });
  return privateJson({
    message: {
      id: data.id,
      member_name: data.member_name || 'Explorer',
      content: data.content,
      created_at: data.created_at,
      is_mine: true,
    },
  });
}
