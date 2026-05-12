import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getOrCreateTodayQuestion, DailyQuestion } from '@/lib/practice/todayQuestion';
import { fetchOtherExplorers, OtherResponse } from '@/lib/practice/others';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const question = await getOrCreateTodayQuestion();
  if (!question) {
    return NextResponse.json(
      {
        question: null,
        myResponse: null,
        myReflection: null,
        streak: null,
        others: [],
      },
      { status: 500 },
    );
  }

  const auth = await getAuthenticatedMember(req);
  const memberId = auth?.memberId || null;

  const todayCountPromise = supabase
    .from('question_responses')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', question.id);

  if (!memberId) {
    const [others, todayCountResult] = await Promise.all([
      fetchOtherExplorers({
        questionId: question.id,
        excludeMemberId: null,
        limit: 3,
      }),
      todayCountPromise,
    ]);
    return NextResponse.json({
      question,
      myResponse: null,
      myReflection: null,
      streak: null,
      others,
      todayCount: todayCountResult.count ?? 0,
    });
  }

  const [myResponseResult, streakResult, others, todayCountResult] = await Promise.all([
    supabase
      .from('question_responses')
      .select('id, response_text, created_at')
      .eq('member_id', memberId)
      .eq('question_id', question.id)
      .maybeSingle(),
    supabase
      .from('members')
      .select('current_streak, longest_streak, total_responses, last_practice_date')
      .eq('id', memberId)
      .single(),
    fetchOtherExplorers({
      questionId: question.id,
      excludeMemberId: memberId,
      limit: 3,
    }),
    todayCountPromise,
  ]);

  const myResponseRow = myResponseResult.data;
  let myReflection: string | null = null;
  if (myResponseRow) {
    const { data: refl } = await supabase
      .from('practice_reflections')
      .select('reflection_text')
      .eq('response_id', myResponseRow.id)
      .maybeSingle();
    myReflection = refl?.reflection_text || null;
  }

  const streak = streakResult.data || {
    current_streak: 0,
    longest_streak: 0,
    total_responses: 0,
    last_practice_date: null,
  };

  const payload: {
    question: DailyQuestion;
    myResponse: { id: string; response_text: string; created_at: string } | null;
    myReflection: string | null;
    streak: {
      current_streak: number;
      longest_streak: number;
      total_responses: number;
      last_practice_date: string | null;
    };
    others: OtherResponse[];
    todayCount: number;
  } = {
    question,
    myResponse: myResponseRow
      ? {
          id: myResponseRow.id,
          response_text: myResponseRow.response_text,
          created_at: myResponseRow.created_at,
        }
      : null,
    myReflection,
    streak: {
      current_streak: streak.current_streak || 0,
      longest_streak: streak.longest_streak || 0,
      total_responses: streak.total_responses || 0,
      last_practice_date: streak.last_practice_date || null,
    },
    others,
    todayCount: todayCountResult.count ?? 0,
  };

  return NextResponse.json(payload);
}
