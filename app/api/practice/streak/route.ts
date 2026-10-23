import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ current_streak: 0, longest_streak: 0, total_responses: 0 });

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('members')
    .select('current_streak, longest_streak, total_responses, last_practice_date')
    .eq('id', auth.memberId).single();

  return privateJson({
    current_streak: data?.current_streak || 0,
    longest_streak: data?.longest_streak || 0,
    total_responses: data?.total_responses || 0,
    last_practice_date: data?.last_practice_date,
  });
}
