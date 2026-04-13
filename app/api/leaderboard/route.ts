import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET() {
  const { data } = await supabase.from('members')
    .select('id, display_name, guide_level, salons_led, members_graduated, guide_earnings_total, guide_since')
    .eq('is_guide', true)
    .order('members_graduated', { ascending: false })
    .order('salons_led', { ascending: false })
    .limit(50);

  return NextResponse.json({ guides: data || [] });
}
