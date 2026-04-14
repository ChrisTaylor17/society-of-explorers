import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data: todayQuestion } = await supabase
    .from('daily_questions')
    .select('id, question_text, thinker_id, date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: responses } = await supabase
    .from('question_responses')
    .select('id, response_text, created_at, member_id, question_id')
    .order('created_at', { ascending: false })
    .limit(20);

  const questionIds = Array.from(new Set((responses || []).map(r => r.question_id)));
  const memberIds = Array.from(new Set((responses || []).map(r => r.member_id)));

  const [qData, mData] = await Promise.all([
    questionIds.length > 0
      ? supabase.from('daily_questions').select('id, question_text, thinker_id').in('id', questionIds)
      : Promise.resolve({ data: [] as any[] }),
    memberIds.length > 0
      ? supabase.from('members').select('id, display_name').in('id', memberIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const questionsById: Record<string, any> = Object.fromEntries((qData.data || []).map((q: any) => [q.id, q]));
  const membersById: Record<string, any> = Object.fromEntries((mData.data || []).map((m: any) => [m.id, m]));

  const recentResponses = (responses || []).map(r => ({
    id: r.id,
    response_text: r.response_text,
    created_at: r.created_at,
    display_name: membersById[r.member_id]?.display_name || 'Explorer',
    thinker_id: questionsById[r.question_id]?.thinker_id || null,
    question_text: questionsById[r.question_id]?.question_text || null,
  }));

  const [totalMembersR, totalResponsesR, activeThinkersR, todayCountR] = await Promise.all([
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('question_responses').select('*', { count: 'exact', head: true }),
    supabase.from('members').select('*', { count: 'exact', head: true }).gte('current_streak', 3),
    todayQuestion
      ? supabase.from('question_responses').select('*', { count: 'exact', head: true }).eq('question_id', todayQuestion.id)
      : Promise.resolve({ count: 0 } as any),
  ]);

  const stats = {
    totalMembers: totalMembersR.count || 0,
    totalResponses: totalResponsesR.count || 0,
    activeThinkers: activeThinkersR.count || 0,
    todayCount: (todayCountR as any).count || 0,
  };

  const { data: leaders } = await supabase
    .from('members')
    .select('display_name, current_streak, total_responses')
    .gt('current_streak', 0)
    .order('current_streak', { ascending: false })
    .limit(5);

  return NextResponse.json({
    todayQuestion,
    recentResponses,
    stats,
    streakLeaders: leaders || [],
  });
}
