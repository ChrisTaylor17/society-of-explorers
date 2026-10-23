import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type DailyQuestionRow = {
  id: string;
  question_text: string | null;
  thinker_id: string | null;
  date?: string | null;
};

type ResponseRow = {
  id: string;
  response_text: string | null;
  created_at: string | null;
  member_id: string | null;
  question_id: string | null;
};

type MemberRow = {
  id: string;
  display_name: string | null;
  current_streak: number | null;
  total_responses?: number | null;
};

type StreakLeaderRow = {
  display_name: string | null;
  current_streak: number | null;
  total_responses: number | null;
};

type ReflectionRow = {
  response_id: string;
  reflection_text: string | null;
  thinker_id: string | null;
  created_at: string | null;
};

type RecentResponse = {
  id: string;
  response_text: string | null;
  created_at: string | null;
  display_name: string;
  current_streak: number;
  thinker_id: string | null;
  question_text: string | null;
  reflection_text: string | null;
  reflection_created_at: string | null;
};

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: todayQuestion, error: todayQuestionError } = await supabase
    .from('daily_questions')
    .select('id, question_text, thinker_id, date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (todayQuestionError) return privateJson({ error: 'Failed to load community pulse' }, { status: 500 });
  const todayQuestionRow = todayQuestion as DailyQuestionRow | null;

  const { data: responses, error: responsesError } = await supabase
    .from('question_responses')
    .select('id, response_text, created_at, member_id, question_id')
    .order('created_at', { ascending: false })
    .limit(20);

  if (responsesError) return privateJson({ error: 'Failed to load community pulse' }, { status: 500 });

  const responseList = (responses || []) as ResponseRow[];
  const responseIds = responseList.map((response) => response.id);
  const questionIds = Array.from(
    new Set(responseList.map((response) => response.question_id).filter((id): id is string => Boolean(id))),
  );
  const memberIds = Array.from(
    new Set(responseList.map((response) => response.member_id).filter((id): id is string => Boolean(id))),
  );

  const [questionRows, memberRows, reflectionRows] = await Promise.all([
    questionIds.length > 0
      ? supabase.from('daily_questions').select('id, question_text, thinker_id').in('id', questionIds)
      : Promise.resolve({ data: [] as DailyQuestionRow[], error: null }),
    memberIds.length > 0
      ? supabase.from('members').select('id, display_name, current_streak').in('id', memberIds)
      : Promise.resolve({ data: [] as MemberRow[], error: null }),
    responseIds.length > 0
      ? supabase
          .from('practice_reflections')
          .select('response_id, reflection_text, thinker_id, created_at')
          .in('response_id', responseIds)
      : Promise.resolve({ data: [] as ReflectionRow[], error: null }),
  ]);

  if (questionRows.error || memberRows.error || reflectionRows.error) {
    return privateJson({ error: 'Failed to load community pulse' }, { status: 500 });
  }

  const questionsById = new Map(
    ((questionRows.data || []) as DailyQuestionRow[]).map((question) => [question.id, question]),
  );
  const membersById = new Map(((memberRows.data || []) as MemberRow[]).map((member) => [member.id, member]));
  const reflectionsById = new Map(
    ((reflectionRows.data || []) as ReflectionRow[]).map((reflection) => [reflection.response_id, reflection]),
  );

  const recentResponses: RecentResponse[] = responseList.map((response) => {
    const question = response.question_id ? questionsById.get(response.question_id) : null;
    const member = response.member_id ? membersById.get(response.member_id) : null;
    const refl = reflectionsById.get(response.id);
    return {
      id: response.id,
      response_text: response.response_text,
      created_at: response.created_at,
      display_name: member?.display_name || 'Explorer',
      current_streak: member?.current_streak || 0,
      thinker_id: question?.thinker_id || null,
      question_text: question?.question_text || null,
      reflection_text: refl?.reflection_text || null,
      reflection_created_at: refl?.created_at || null,
    };
  });

  // Wisdom moments: up to 3 most recent responses that have a reflection
  const wisdomMoments = recentResponses.filter((response) => Boolean(response.reflection_text)).slice(0, 3);

  const [totalMembersR, totalResponsesR, activeThinkersR, todayCountR] = await Promise.all([
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('question_responses').select('*', { count: 'exact', head: true }),
    supabase.from('members').select('*', { count: 'exact', head: true }).gte('current_streak', 3),
    todayQuestionRow
      ? supabase
          .from('question_responses')
          .select('*', { count: 'exact', head: true })
          .eq('question_id', todayQuestionRow.id)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  if (totalMembersR.error || totalResponsesR.error || activeThinkersR.error || todayCountR.error) {
    return privateJson({ error: 'Failed to load community pulse' }, { status: 500 });
  }

  const stats = {
    totalMembers: totalMembersR.count || 0,
    totalResponses: totalResponsesR.count || 0,
    activeThinkers: activeThinkersR.count || 0,
    todayCount: todayCountR.count || 0,
  };

  const { data: leaders, error: leadersError } = await supabase
    .from('members')
    .select('display_name, current_streak, total_responses')
    .gt('current_streak', 0)
    .order('current_streak', { ascending: false })
    .limit(5);

  if (leadersError) return privateJson({ error: 'Failed to load community pulse' }, { status: 500 });

  return privateJson({
    todayQuestion: todayQuestionRow,
    recentResponses,
    wisdomMoments,
    stats,
    streakLeaders: (leaders || []) as StreakLeaderRow[],
  });
}
