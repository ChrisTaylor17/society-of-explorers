import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type PracticeRespondBody = {
  questionId?: unknown;
  responseText?: unknown;
};

function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function trimmedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(req: NextRequest) {
  let body: PracticeRespondBody;

  try {
    body = (await req.json()) as PracticeRespondBody;
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const questionId = trimmedText(body.questionId);
  const responseText = trimmedText(body.responseText);

  if (!questionId || !responseText) {
    return privateJson({ error: 'questionId and responseText required' }, { status: 400 });
  }

  if (responseText.length > 280) {
    return privateJson({ error: 'Response must be 280 characters or less' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existingResponse } = await supabase
    .from('question_responses')
    .select('id')
    .eq('member_id', auth.memberId)
    .eq('question_id', questionId)
    .maybeSingle();
  const isFirstResponseForQuestion = !existingResponse;

  const { data: upserted, error: responseError } = await supabase
    .from('question_responses')
    .upsert(
      {
        member_id: auth.memberId,
        question_id: questionId,
        response_text: responseText,
      },
      { onConflict: 'member_id,question_id' },
    )
    .select('id')
    .single();

  if (responseError) {
    return privateJson({ error: 'Failed to save response' }, { status: 500 });
  }

  const responseId = upserted?.id;
  const today = getTodayET();
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('current_streak, longest_streak, last_practice_date, total_responses')
    .eq('id', auth.memberId)
    .single();

  if (memberError || !member) {
    return privateJson({ error: 'Failed to load member streak' }, { status: 500 });
  }

  let streak = member.current_streak || 0;
  const lastDate = member.last_practice_date;

  if (lastDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    streak = lastDate === yesterdayStr ? streak + 1 : 1;
  }

  const longest = Math.max(streak, member.longest_streak || 0);
  const total = (member.total_responses || 0) + (isFirstResponseForQuestion ? 1 : 0);

  const { data: updated, error: updateError } = await supabase
    .from('members')
    .update({
      current_streak: streak,
      longest_streak: longest,
      last_practice_date: today,
      total_responses: total,
    })
    .eq('id', auth.memberId)
    .select('current_streak, longest_streak, total_responses, last_practice_date')
    .single();

  if (updateError) {
    return privateJson({ error: 'Failed to update streak' }, { status: 500 });
  }

  const { count } = await supabase
    .from('question_responses')
    .select('*', { count: 'exact', head: true })
    .eq('question_id', questionId);
  await supabase.from('daily_questions').update({ engagement_score: count || 0 }).eq('id', questionId);

  return privateJson({
    success: true,
    responseId,
    streak: updated?.current_streak ?? streak,
    longest: updated?.longest_streak ?? longest,
    total: updated?.total_responses ?? total,
  });
}
