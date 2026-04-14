import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const questionId = req.nextUrl.searchParams.get('questionId');
  if (!questionId) return NextResponse.json({ responses: [] });

  const { data } = await supabase.from('question_responses')
    .select('id, response_text, created_at, member_id')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true });

  // Enrich with display names
  const enriched = await Promise.all((data || []).map(async r => {
    const { data: m } = await supabase.from('members').select('display_name').eq('id', r.member_id).single();
    return { id: r.id, display_name: m?.display_name || 'Explorer', response_text: r.response_text, created_at: r.created_at };
  }));

  return NextResponse.json({ responses: enriched });
}
