import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const communitySlug = req.nextUrl.searchParams.get('community') || 'society-of-explorers';
  const { data: community } = await supabase.from('communities').select('id').eq('slug', communitySlug).single();

  const { data: members } = await supabase.from('community_members')
    .select('member_id, role, joined_at')
    .eq('community_id', community?.id)
    .order('joined_at', { ascending: false }).limit(50);

  const enriched: any[] = [];
  for (const m of members || []) {
    const { data: member } = await supabase.from('members')
      .select('id, display_name, bio, skills, exp_tokens, tier')
      .eq('id', m.member_id).single();
    if (member) enriched.push({ ...member, role: m.role, joined_at: m.joined_at });
  }

  return NextResponse.json({ members: enriched });
}
