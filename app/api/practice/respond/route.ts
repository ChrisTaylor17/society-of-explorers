import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { questionId, responseText } = body;

  // Try standard auth first, then fall back to memberId in body (for wallet auth)
  let auth = await getAuthenticatedMember(req);
  if (!auth && body.memberId) {
    const { data: member } = await supabase.from('members').select('id, display_name, exp_tokens, current_streak, longest_streak, last_practice_date, total_responses')
      .eq('id', body.memberId).single();
    if (member) auth = { memberId: member.id, member: member as any };
  }
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!questionId || !responseText) return NextResponse.json({ error: 'questionId and responseText required' }, { status: 400 });
  if (responseText.length > 280) return NextResponse.json({ error: 'Response must be 280 characters or less' }, { status: 400 });

  // Detect if this is a first-time response for today (drives streak + total_responses)
  const { data: existingResponse } = await supabase.from('question_responses')
    .select('id')
    .eq('member_id', auth.memberId)
    .eq('question_id', questionId)
    .maybeSingle();
  const isFirstResponseToday = !existingResponse;

  // Upsert response and capture its id for downstream reflection generation
  const { data: upserted, error: respErr } = await supabase.from('question_responses').upsert({
    member_id: auth.memberId, question_id: questionId, response_text: responseText.trim(),
  }, { onConflict: 'member_id,question_id' })
    .select('id')
    .single();

  if (respErr) return NextResponse.json({ error: respErr.message }, { status: 500 });
  const responseId = upserted?.id;

  // Update streak
  const today = getTodayET();
  const { data: member, error: memberErr } = await supabase.from('members')
    .select('current_streak, longest_streak, last_practice_date, total_responses')
    .eq('id', auth.memberId).single();

  if (memberErr || !member) {
    return NextResponse.json({ error: `Member lookup failed: ${memberErr?.message || 'not found'}` }, { status: 500 });
  }

  let streak = member.current_streak || 0;
  const lastDate = member.last_practice_date;

  if (lastDate === today) {
    // Already practiced today — don't change streak
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    if (lastDate === yesterdayStr) {
      streak += 1; // Continue streak
    } else {
      streak = 1; // Reset streak (first response, or gap of 2+ days)
    }
  }

  const longest = Math.max(streak, member.longest_streak || 0);
  // Count this response if it's the member's first answer for this specific question
  const total = (member.total_responses || 0) + (isFirstResponseToday ? 1 : 0);

  const { data: updated, error: updErr } = await supabase.from('members').update({
    current_streak: streak,
    longest_streak: longest,
    last_practice_date: today,
    total_responses: total,
  }).eq('id', auth.memberId)
    .select('current_streak, longest_streak, total_responses, last_practice_date')
    .single();

  if (updErr) {
    return NextResponse.json({ error: `Streak update failed: ${updErr.message}` }, { status: 500 });
  }

  // Update engagement score (best-effort)
  const { count } = await supabase.from('question_responses').select('*', { count: 'exact', head: true }).eq('question_id', questionId);
  await supabase.from('daily_questions').update({ engagement_score: count || 0 }).eq('id', questionId);

  return NextResponse.json({
    success: true,
    responseId,
    streak: updated?.current_streak ?? streak,
    longest: updated?.longest_streak ?? longest,
    total: updated?.total_responses ?? total,
  });
}
