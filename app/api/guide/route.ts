import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getSalonStats, getSpawningTree } from '@/lib/salons';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const member = auth.member as any;
  if (!member.is_guide) return NextResponse.json({ error: 'Not a guide' }, { status: 403 });

  const { data: salons } = await supabase.from('salons').select('*').eq('guide_member_id', auth.memberId).order('created_at', { ascending: false });

  const salonDetails = await Promise.all((salons || []).map(async (s: any) => {
    const stats = await getSalonStats(s.id);
    return { ...s, stats };
  }));

  let spawningTree = null;
  if (salons && salons.length > 0) {
    spawningTree = await getSpawningTree(salons[0].id);
  }

  return NextResponse.json({
    guide_level: member.guide_level || 0,
    guide_since: member.guide_since,
    salons_led: member.salons_led || 0,
    members_graduated: member.members_graduated || 0,
    guide_earnings_total: member.guide_earnings_total || 0,
    salons: salonDetails,
    spawning_tree: spawningTree,
  });
}
