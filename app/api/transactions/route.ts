import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const communitySlug = searchParams.get('community') || 'society-of-explorers';
  const status = searchParams.get('status');
  const memberId = searchParams.get('member');

  const { data: community } = await supabase.from('communities').select('id').eq('slug', communitySlug).single();
  if (!community) return NextResponse.json({ transactions: [] });

  let query = supabase.from('agent_transactions').select('*')
    .eq('community_id', community.id).order('created_at', { ascending: false }).limit(50);

  if (status && status !== 'all') query = query.eq('status', status);
  if (memberId) query = query.eq('to_member_id', memberId);

  const { data } = await query;
  return NextResponse.json({ transactions: data || [] });
}
