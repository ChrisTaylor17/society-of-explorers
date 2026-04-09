import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const communitySlug = req.nextUrl.searchParams.get('community') || 'society-of-explorers';
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '30');
  const before = req.nextUrl.searchParams.get('before');

  const { data: community } = await supabase.from('communities').select('id').eq('slug', communitySlug).single();

  let query = supabase.from('activity_feed').select('*')
    .eq('community_id', community?.id).eq('is_public', true)
    .order('created_at', { ascending: false }).limit(limit);

  if (before) query = query.lt('created_at', before);
  const { data } = await query;
  return NextResponse.json({ events: data || [] });
}
