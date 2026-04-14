import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: explorer, error } = await supabase
    .from('members')
    .select('id, display_name, created_at, current_streak, longest_streak, total_responses, exp_tokens, tier, decision_archetype')
    .eq('id', id)
    .single();

  if (error || !explorer) {
    return NextResponse.json({ error: 'Explorer not found' }, { status: 404 });
  }

  const { data: responses } = await supabase
    .from('question_responses')
    .select('id, response_text, created_at, question_id')
    .eq('member_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  const recentIds = (responses || []).slice(0, 5).map(r => r.question_id);
  let questionsById: Record<string, any> = {};
  if (recentIds.length > 0) {
    const { data: questions } = await supabase
      .from('daily_questions')
      .select('id, question_text, thinker_id')
      .in('id', recentIds);
    questionsById = Object.fromEntries((questions || []).map(q => [q.id, q]));
  }

  const recentResponses = (responses || []).slice(0, 5).map(r => ({
    id: r.id,
    response_text: r.response_text,
    created_at: r.created_at,
    question: questionsById[r.question_id] || null,
  }));

  const responseDates = (responses || []).map(r => r.created_at);

  const { data: expRows } = await supabase
    .from('exp_events')
    .select('amount')
    .eq('member_id', id);

  const totalExp = (expRows || []).reduce((sum, row: any) => sum + (Number(row.amount) || 0), 0);
  const daysSinceJoined = Math.max(1, Math.floor((Date.now() - new Date(explorer.created_at).getTime()) / 86400000));

  return NextResponse.json({
    explorer,
    recentResponses,
    responseDates,
    stats: {
      totalExp,
      daysSinceJoined,
      responsesCount: (responses || []).length,
    },
  });
}
