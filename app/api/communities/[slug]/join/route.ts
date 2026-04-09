import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { memberId } = await req.json();

  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

  const { data: community } = await supabase.from('communities').select('id').eq('slug', slug).eq('is_active', true).single();
  if (!community) return NextResponse.json({ error: 'Community not found' }, { status: 404 });

  const { data: existing } = await supabase.from('community_members')
    .select('id').eq('community_id', community.id).eq('member_id', memberId).single();
  if (existing) return NextResponse.json({ success: true, already_member: true });

  await supabase.from('community_members').insert({ community_id: community.id, member_id: memberId, role: 'member' });

  // Assign the member role
  const { data: memberRole } = await supabase.from('community_roles').select('id').eq('community_id', community.id).eq('role_key', 'member').single();
  if (memberRole) {
    await supabase.from('community_members').update({ role_id: memberRole.id }).eq('community_id', community.id).eq('member_id', memberId);
  }

  return NextResponse.json({ success: true });
}
