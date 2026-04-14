import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { questionId, responseText } = await req.json();
  if (!questionId || !responseText) return NextResponse.json({ error: 'questionId and responseText required' }, { status: 400 });
  if (responseText.length > 280) return NextResponse.json({ error: 'Response must be 280 characters or less' }, { status: 400 });

  // Upsert response
  const { error: respErr } = await supabase.from('question_responses').upsert({
    member_id: auth.memberId, question_id: questionId, response_text: responseText.trim(),
  }, { onConflict: 'member_id,question_id' });

  if (respErr) return NextResponse.json({ error: respErr.message }, { status: 500 });

  // Update streak
  const today = getTodayET();
  const { data: member } = await supabase.from('members')
    .select('current_streak, longest_streak, last_practice_date, total_responses')
    .eq('id', auth.memberId).single();

  let streak = member?.current_streak || 0;
  const lastDate = member?.last_practice_date;

  if (lastDate === today) {
    // Already practiced today — don't change streak
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    if (lastDate === yesterdayStr) {
      streak += 1; // Continue streak
    } else {
      streak = 1; // Reset streak
    }
  }

  const longest = Math.max(streak, member?.longest_streak || 0);
  const total = (member?.total_responses || 0) + (lastDate === today ? 0 : 1);

  await supabase.from('members').update({
    current_streak: streak, longest_streak: longest,
    last_practice_date: today, total_responses: total,
  }).eq('id', auth.memberId);

  // Update engagement score
  const { count } = await supabase.from('question_responses').select('*', { count: 'exact', head: true }).eq('question_id', questionId);
  await supabase.from('daily_questions').update({ engagement_score: count || 0 }).eq('id', questionId);

  return NextResponse.json({ success: true, streak, longest, total });
}
