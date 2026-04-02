import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const salonId = req.nextUrl.searchParams.get('salonId') || 'general';

  let query = supabaseAdmin
    .from('salon_messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(60);

  if (salonId !== 'general') {
    query = query.eq('salon_id', salonId);
  } else {
    query = query.or('salon_id.eq.general,salon_id.is.null');
  }

  const { data, error } = await query;

  if (error) {
    console.error('Load messages error:', error);
    return NextResponse.json({ messages: [], error: error.message });
  }

  return NextResponse.json({ messages: data || [] });
}
