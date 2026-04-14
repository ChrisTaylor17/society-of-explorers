import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ current_streak: 0, longest_streak: 0, total_responses: 0 });

  const { data } = await supabase.from('members')
    .select('current_streak, longest_streak, total_responses, last_practice_date')
    .eq('id', auth.memberId).single();

  return NextResponse.json({
    current_streak: data?.current_streak || 0,
    longest_streak: data?.longest_streak || 0,
    total_responses: data?.total_responses || 0,
    last_practice_date: data?.last_practice_date,
  });
}
