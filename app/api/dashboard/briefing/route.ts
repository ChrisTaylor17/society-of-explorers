import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberId = auth.memberId;

  // Profile summary
  const { data: profile } = await supabase
    .from('user_profile_summary')
    .select('*')
    .eq('member_id', memberId)
    .single();

  // Pending triggers (delivered but not dismissed)
  const { data: triggers } = await supabase
    .from('proactive_triggers')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'delivered')
    .order('delivered_at', { ascending: false })
    .limit(5);

  // Recent sessions count
  const { count: sessionCount } = await supabase
    .from('user_episodes')
    .select('session_id', { count: 'exact', head: true })
    .eq('member_id', memberId);

  // Last session date
  const { data: lastEpisode } = await supabase
    .from('user_episodes')
    .select('created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Latest verdict
  const { data: latestVerdict } = await supabase
    .from('council_sessions')
    .select('question, public_url_slug, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    profile: profile || null,
    triggers: triggers || [],
    sessionCount: sessionCount || 0,
    lastSessionAt: lastEpisode?.created_at || null,
    latestVerdict: latestVerdict || null,
    memberName: auth.member.display_name,
  });
}
