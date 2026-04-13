import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

  const { data: community } = await supabase.from('communities').select('id').eq('slug', slug).single();
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: matches } = await supabase.from('community_matches')
    .select('*')
    .eq('community_id', community.id)
    .or(`member_a.eq.${memberId},member_b.eq.${memberId}`)
    .order('compatibility_score', { ascending: false });

  // Enrich with member names
  const enriched = await Promise.all((matches || []).map(async m => {
    const otherId = m.member_a === memberId ? m.member_b : m.member_a;
    const { data: member } = await supabase.from('members').select('display_name').eq('id', otherId).single();
    return { ...m, other_member_id: otherId, other_name: member?.display_name || 'Explorer' };
  }));

  return NextResponse.json({ matches: enriched });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { matchId, memberId, action } = await req.json();
  if (!matchId || !memberId) return NextResponse.json({ error: 'matchId and memberId required' }, { status: 400 });

  if (action === 'accept') {
    await supabase.from('community_matches').update({ status: 'accepted' }).eq('id', matchId);
    return NextResponse.json({ success: true });
  }
  if (action === 'decline') {
    await supabase.from('community_matches').update({ status: 'declined' }).eq('id', matchId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
