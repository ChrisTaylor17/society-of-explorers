import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getOrCreateTodayQuestion } from '@/lib/practice/todayQuestion';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const question = await getOrCreateTodayQuestion();
    if (!question) return unavailable();

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ question, memberId: null, myResponse: null, myReflection: null, streak: null });

    const memberId = auth.memberId;
    const db = getSupabaseAdmin();
    const [response, stats] = await Promise.all([
      db.from('question_responses')
        .select('id, response_text, created_at')
        .eq('member_id', memberId)
        .eq('question_id', question.id)
        .maybeSingle(),
      db.from('members')
        .select('current_streak, longest_streak, total_responses, last_practice_date')
        .eq('id', memberId)
        .single(),
    ]);
    if (response.error || stats.error || !stats.data) return unavailable();

    const entry = response.data;
    let myReflection: string | null = null;
    if (entry) {
      const reflection = await db.from('practice_reflections')
        .select('reflection_text')
        .eq('response_id', entry.id)
        .eq('question_id', question.id)
        .or('member_id.is.null,member_id.eq.' + memberId)
        .maybeSingle();
      if (reflection.error) return unavailable();
      myReflection = reflection.data?.reflection_text || null;
    }

    return privateJson({
      question,
      memberId,
      myResponse: entry ? { id: entry.id, response_text: entry.response_text, created_at: entry.created_at } : null,
      myReflection,
      streak: {
        current_streak: stats.data.current_streak || 0,
        longest_streak: stats.data.longest_streak || 0,
        total_responses: stats.data.total_responses || 0,
        last_practice_date: stats.data.last_practice_date || null,
      },
    });
  } catch {
    return unavailable();
  }
}

function unavailable() {
  return privateJson({ error: 'Practice is temporarily unavailable.' }, { status: 503 });
}
