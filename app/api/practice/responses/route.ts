import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type BasePracticeResponseRow = {
  id: string;
  response_text: string;
  created_at: string;
  member_id: string;
};

type PracticeResponseWithQuestionRow = BasePracticeResponseRow & {
  question_id: string;
};

type DailyQuestionRow = {
  id: string;
  question_text: string | null;
  thinker_id: string | null;
};

type MemberNameRow = {
  id: string;
  display_name: string | null;
};

function clampDays(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Math.max(1, Math.min(30, Number.isFinite(parsed) ? parsed : 7));
}

function memberMap(rows: MemberNameRow[] | null | undefined): Record<string, MemberNameRow> {
  return Object.fromEntries((rows || []).map((member) => [member.id, member])) as Record<string, MemberNameRow>;
}

export async function GET(req: NextRequest) {
  const questionId = req.nextUrl.searchParams.get('questionId')?.trim() || null;
  const daysParam = req.nextUrl.searchParams.get('days');

  if (!daysParam && !questionId) return privateJson({ responses: [] });

  const supabase = getSupabaseAdmin();

  // Multi-day feed
  if (daysParam) {
    const days = clampDays(daysParam);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const { data } = await supabase.from('question_responses')
      .select('id, response_text, created_at, member_id, question_id')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(20);

    const rows = data || [];
    const responseRows = rows as PracticeResponseWithQuestionRow[];
    const questionIds = Array.from(new Set(responseRows.map((r) => r.question_id)));
    const memberIds = Array.from(new Set(responseRows.map((r) => r.member_id)));

    const [qData, mData] = await Promise.all([
      questionIds.length > 0
        ? supabase.from('daily_questions').select('id, question_text, thinker_id').in('id', questionIds)
        : Promise.resolve({ data: [] as DailyQuestionRow[] }),
      memberIds.length > 0
        ? supabase.from('members').select('id, display_name').in('id', memberIds)
        : Promise.resolve({ data: [] as MemberNameRow[] }),
    ]);

    const questionsById = Object.fromEntries(
      ((qData.data || []) as DailyQuestionRow[]).map((q) => [q.id, q]),
    ) as Record<string, DailyQuestionRow>;
    const membersById = memberMap((mData.data || []) as MemberNameRow[]);

    const enriched = responseRows.map((r) => ({
      id: r.id,
      member_id: r.member_id,
      display_name: membersById[r.member_id]?.display_name || 'Explorer',
      response_text: r.response_text,
      created_at: r.created_at,
      question_text: questionsById[r.question_id]?.question_text || null,
      thinker_id: questionsById[r.question_id]?.thinker_id || null,
    }));

    return privateJson({ responses: enriched });
  }

  // Single-question feed (existing behavior)
  const { data } = await supabase.from('question_responses')
    .select('id, response_text, created_at, member_id')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true });

  const responseRows = (data || []) as BasePracticeResponseRow[];
  const memberIds = Array.from(new Set(responseRows.map((r) => r.member_id)));
  const { data: memberRows } =
    memberIds.length > 0
      ? await supabase.from('members').select('id, display_name').in('id', memberIds)
      : { data: [] as MemberNameRow[] };
  const membersById = memberMap(memberRows as MemberNameRow[]);

  const enriched = responseRows.map((r) => ({
    id: r.id,
    member_id: r.member_id,
    display_name: membersById[r.member_id]?.display_name || 'Explorer',
    response_text: r.response_text,
    created_at: r.created_at,
  }));

  return privateJson({ responses: enriched });
}
