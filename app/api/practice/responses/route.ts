import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const questionId = req.nextUrl.searchParams.get('questionId');
  const daysParam = req.nextUrl.searchParams.get('days');

  // Multi-day feed
  if (daysParam) {
    const days = Math.max(1, Math.min(30, parseInt(daysParam) || 7));
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const { data } = await supabase.from('question_responses')
      .select('id, response_text, created_at, member_id, question_id')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(20);

    const rows = data || [];
    const questionIds = Array.from(new Set(rows.map(r => r.question_id)));
    const memberIds = Array.from(new Set(rows.map(r => r.member_id)));

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

    const enriched = rows.map(r => ({
      id: r.id,
      member_id: r.member_id,
      display_name: membersById[r.member_id]?.display_name || 'Explorer',
      response_text: r.response_text,
      created_at: r.created_at,
      question_text: questionsById[r.question_id]?.question_text || null,
      thinker_id: questionsById[r.question_id]?.thinker_id || null,
    }));

    return NextResponse.json({ responses: enriched });
  }

  // Single-question feed (existing behavior)
  if (!questionId) return NextResponse.json({ responses: [] });

  const { data } = await supabase.from('question_responses')
    .select('id, response_text, created_at, member_id')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true });

  const enriched = await Promise.all((data || []).map(async r => {
    const { data: m } = await supabase.from('members').select('display_name').eq('id', r.member_id).single();
    return {
      id: r.id,
      member_id: r.member_id,
      display_name: m?.display_name || 'Explorer',
      response_text: r.response_text,
      created_at: r.created_at,
    };
  }));

  return NextResponse.json({ responses: enriched });
}
